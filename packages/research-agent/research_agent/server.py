"""FastAPI research sidecar with SSE progress."""

from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


def _find_repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "pnpm-workspace.yaml").exists():
            return candidate
    return Path(__file__).resolve().parents[3]


load_dotenv(_find_repo_root() / ".env")

DATA_DIR = Path(os.getenv("RESEARCH_DATA_DIR", Path(__file__).resolve().parent.parent / "data" / "jobs"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

RESEARCH_TOKEN = os.getenv("RESEARCH_TOKEN", "research-local")
PORT = int(os.getenv("RESEARCH_HTTP_PORT", "8765"))
JOB_TIMEOUT_SECONDS = int(os.getenv("RESEARCH_JOB_TIMEOUT", "0"))
SEARCH_BUDGET = int(os.getenv("RESEARCH_SEARCH_BUDGET", "4"))


class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = ""


class ResearchRequest(BaseModel):
    topic: str
    history: list[HistoryTurn] = Field(default_factory=list)


EPHEMERAL_EVENT_TYPES = {"thinking", "report"}


@dataclass
class JobState:
    job_id: str
    topic: str
    history: list[dict[str, str]] = field(default_factory=list)
    status: str = "running"
    events: list[dict[str, Any]] = field(default_factory=list)
    report_path: Path | None = None
    title: str = ""
    markdown: str = ""
    error: str | None = None
    subscribers: list[asyncio.Queue] = field(default_factory=list)
    cancel_flag: bool = False


jobs: dict[str, JobState] = {}
app = FastAPI(title="Research Sidecar")


def _auth_ok(request: Request) -> bool:
    if not RESEARCH_TOKEN:
        return True
    auth = request.headers.get("authorization", "")
    token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else request.query_params.get("token", "")
    return token == RESEARCH_TOKEN


def _emit(job: JobState, event_type: str, message: str = "", *, durable: bool | None = None, **extra: Any) -> None:
    payload: dict[str, Any] = {"type": event_type, "message": message, **extra}
    if durable is None:
        durable = event_type not in EPHEMERAL_EVENT_TYPES
    if event_type in EPHEMERAL_EVENT_TYPES:
        durable = False
    if durable:
        job.events.append(payload)
    for subscriber in list(job.subscribers):
        subscriber.put_nowait(payload)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        for key in ("content", "text", "markdown", "data"):
            inner = value.get(key)
            if inner is None:
                continue
            if isinstance(inner, str):
                return inner
            nested = _as_text(inner)
            if nested:
                return nested
        return ""
    if isinstance(value, list):
        parts = [_as_text(item) for item in value]
        return "\n".join(part for part in parts if part)
    return str(value)


def _extract_title_and_markdown(text: Any, fallback_topic: str) -> tuple[str, str]:
    md = _as_text(text).strip()
    if not md:
        return fallback_topic, f"# {fallback_topic}\n\n（研究生成失败，内容为空）"
    m = re.search(r"^#\s+(.+)$", md, re.MULTILINE)
    title = m.group(1).strip() if m else fallback_topic
    return title, md


def _extract_report_from_result(result: Any) -> str:
    if not isinstance(result, dict):
        return _as_text(result).strip()

    files = result.get("files")
    if isinstance(files, dict):
        for key in ("/final_report.md", "final_report.md"):
            text = _as_text(files.get(key)).strip()
            if text:
                return text
        for path, value in files.items():
            if "final_report" in str(path).lower() or str(path).endswith(".md"):
                text = _as_text(value).strip()
                if len(text) > 200:
                    return text

    messages = result.get("messages") or []
    for msg in reversed(messages):
        content = getattr(msg, "content", None)
        if content is None and isinstance(msg, dict):
            content = msg.get("content")
        text = _as_text(content).strip()
        if text and ("#" in text or len(text) > 300):
            return text
    return ""


_JOB_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$")


def _saved_report_paths(job_id: str, data_dir: Path) -> tuple[Path, Path]:
    if not _JOB_ID.fullmatch(job_id):
        raise HTTPException(400, "invalid job id")
    root = data_dir.resolve()
    meta_path = (root / f"{job_id}.json").resolve()
    report_path = (root / f"{job_id}.md").resolve()
    if meta_path.parent != root or report_path.parent != root:
        raise HTTPException(400, "invalid job id")
    return meta_path, report_path


def list_saved_reports(data_dir: Path | None = None) -> list[dict[str, str]]:
    root = (data_dir or DATA_DIR).resolve()
    items: list[dict[str, str]] = []
    if not root.is_dir():
        return items
    for meta_path in root.glob("*.json"):
        job_id = meta_path.stem
        if not _JOB_ID.fullmatch(job_id):
            continue
        if not (root / f"{job_id}.md").is_file():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(meta, dict):
            continue
        items.append(
            {
                "jobId": job_id,
                "title": str(meta.get("title") or meta.get("topic") or job_id),
                "topic": str(meta.get("topic") or ""),
                "completedAt": str(meta.get("completedAt") or ""),
            }
        )
    items.sort(key=lambda item: item["completedAt"], reverse=True)
    return items


def read_saved_report(job_id: str, data_dir: Path | None = None) -> dict[str, str]:
    meta_path, report_path = _saved_report_paths(job_id, data_dir or DATA_DIR)
    if not meta_path.is_file() or not report_path.is_file():
        raise HTTPException(404, "not found")
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        meta = {}
    if not isinstance(meta, dict):
        meta = {}
    return {
        "jobId": job_id,
        "title": str(meta.get("title") or meta.get("topic") or job_id),
        "topic": str(meta.get("topic") or ""),
        "completedAt": str(meta.get("completedAt") or ""),
        "markdown": report_path.read_text(encoding="utf-8"),
    }


def delete_saved_report(job_id: str, data_dir: Path | None = None) -> None:
    meta_path, report_path = _saved_report_paths(job_id, data_dir or DATA_DIR)
    if not meta_path.is_file() and not report_path.is_file():
        raise HTTPException(404, "not found")
    if meta_path.is_file():
        meta_path.unlink()
    if report_path.is_file():
        report_path.unlink()


def _save_report(job: JobState, title: str, markdown: str) -> None:
    job.title = title
    job.markdown = markdown
    report_path = DATA_DIR / f"{job.job_id}.md"
    report_path.write_text(markdown, encoding="utf-8")
    job.report_path = report_path
    meta_path = DATA_DIR / f"{job.job_id}.json"
    meta_path.write_text(
        json.dumps(
            {
                "jobId": job.job_id,
                "topic": job.topic,
                "title": title,
                "reportPath": str(report_path),
                "completedAt": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _research_inputs(job: JobState) -> dict[str, Any]:
    from research_agent.stream_events import agent_messages

    return {"messages": agent_messages(job.topic, job.history)}


async def _stream_research(agent: Any, job: JobState, coalescer: Any) -> str:
    from research_agent.stream_events import chunk_parts, notes_from_output

    notes = ""
    async for event in agent.astream_events(
        _research_inputs(job),
        version="v2",
        config={"recursion_limit": 40},
    ):
        if job.cancel_flag:
            break
        name = event.get("event")
        data = event.get("data") or {}
        if name == "on_chat_model_stream":
            thinking, text = chunk_parts(data.get("chunk"))
            if thinking:
                coalescer.add("thinking", thinking)
            if text:
                coalescer.add("thinking", text)
        elif name == "on_chain_end":
            extracted = notes_from_output(data.get("output"))
            if extracted:
                notes = extracted
    coalescer.flush()
    return notes


async def _write_report(job: JobState, notes: str, coalescer: Any) -> str:
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    from research_agent.graph import chat_model_kwargs
    from research_agent.prompts import REPORT_WRITER_INSTRUCTIONS
    from research_agent.stream_events import chunk_parts

    messages: list[Any] = [SystemMessage(content=REPORT_WRITER_INSTRUCTIONS)]
    for turn in job.history:
        content = turn["content"]
        if turn["role"] == "assistant":
            messages.append(AIMessage(content=content))
        else:
            messages.append(HumanMessage(content=content))
    messages.append(HumanMessage(content=(
        f"研究主题：{job.topic}\n\n"
        f"研究笔记：\n{notes or '（没有检索到可用笔记）'}\n\n"
        "请输出完整的 Markdown 研究报告。"
    )))
    _emit(job, "phase", "writing")
    model = ChatOpenAI(**chat_model_kwargs())
    parts: list[str] = []
    try:
        async for chunk in model.astream(messages):
            if job.cancel_flag:
                break
            thinking, text = chunk_parts(chunk)
            if thinking:
                coalescer.add("thinking", thinking)
            if text:
                parts.append(text)
                coalescer.add("report", text)
        coalescer.flush()
    except Exception:
        coalescer.flush()
        if not parts:
            result = await asyncio.to_thread(model.invoke, messages)
            text = _as_text(getattr(result, "content", result)).strip()
            if text:
                parts.append(text)
                _emit(job, "report", text)
    return "".join(parts).strip()


async def _research_then_write(job: JobState, coalescer: Any) -> None:
    from research_agent.graph import create_research_agent
    from research_agent.stream_events import notes_from_output

    agent = create_research_agent()
    inputs = _research_inputs(job)
    try:
        notes = await _stream_research(agent, job, coalescer)
    except Exception:
        coalescer.flush()
        result = await asyncio.to_thread(agent.invoke, inputs, {"recursion_limit": 40})
        notes = notes_from_output(result)
    if job.cancel_flag:
        job.status = "cancelled"
        _emit(job, "error", "任务已取消")
        return
    markdown = await _write_report(job, notes, coalescer)
    if job.cancel_flag:
        job.status = "cancelled"
        _emit(job, "error", "任务已取消")
        return
    if not markdown.strip():
        raise RuntimeError("研究报告为空")
    title, report = _extract_title_and_markdown(markdown, job.topic)
    _save_report(job, title, report)
    job.status = "completed"
    _emit(job, "done", "研究报告已生成")


async def _run_job(job: JobState) -> None:
    from research_agent.progress import bind_job, unbind_job
    from research_agent.stream_events import TokenCoalescer

    heartbeat: asyncio.Task | None = None
    flush_loop: asyncio.Task | None = None
    hooks = None
    try:
        _emit(job, "planning", "正在理解问题并规划检索…")
        coalescer = TokenCoalescer(lambda kind, text: _emit(job, kind, text))
        flush_loop = asyncio.create_task(coalescer.loop())
        hooks = bind_job(
            lambda event_type, message: _emit(job, event_type, message),
            lambda: job.cancel_flag,
            budget=SEARCH_BUDGET,
            payload=lambda payload: _emit(
                job,
                str(payload.get("type") or "progress"),
                str(payload.get("message") or ""),
                **{key: value for key, value in payload.items() if key not in ("type", "message")},
            ),
        )

        async def _heartbeat() -> None:
            elapsed = 0
            while True:
                await asyncio.sleep(15)
                elapsed += 15
                if job.status != "running" or job.cancel_flag:
                    return
                _emit(job, "heartbeat", f"已用时 {elapsed} 秒", durable=False, elapsed=elapsed)

        heartbeat = asyncio.create_task(_heartbeat())
        if job.cancel_flag:
            job.status = "cancelled"
            _emit(job, "error", "任务已取消")
            return
        work = _research_then_write(job, coalescer)
        if JOB_TIMEOUT_SECONDS > 0:
            await asyncio.wait_for(work, timeout=JOB_TIMEOUT_SECONDS)
        else:
            await work
    except TimeoutError:
        job.error = f"研究超时（超过 {JOB_TIMEOUT_SECONDS} 秒）。请缩小主题后重试。"
        _emit(job, "error", job.error)
        job.cancel_flag = True
        job.status = "failed"
    except Exception as e:
        from research_agent.tools import public_job_error

        job.error = public_job_error(e)
        _emit(job, "error", job.error)
        job.status = "failed"
    finally:
        for task in (heartbeat, flush_loop):
            if task is None:
                continue
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if hooks is not None:
            unbind_job(hooks)


@app.get("/research/reports")
async def research_reports(request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    return {"reports": list_saved_reports()}


@app.get("/research/reports/{job_id}")
async def research_saved_report(job_id: str, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    return read_saved_report(job_id)


@app.delete("/research/reports/{job_id}")
async def remove_saved_report(job_id: str, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    delete_saved_report(job_id)
    return {"ok": True}


@app.post("/research")
async def create_research(body: ResearchRequest, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    if not body.topic.strip():
        raise HTTPException(400, "topic required")

    from research_agent.stream_events import normalize_history

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    job = JobState(job_id=job_id, topic=body.topic.strip(), history=normalize_history(body.history))
    jobs[job_id] = job
    asyncio.create_task(_run_job(job))
    return {"jobId": job_id}


@app.get("/research/{job_id}/events")
async def research_events(job_id: str, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not found")

    async def event_stream() -> AsyncIterator[str]:
        queue: asyncio.Queue = asyncio.Queue()
        job.subscribers.append(queue)
        seen: set[int] = set()

        def encode(event: dict[str, Any]) -> str:
            return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

        try:
            for event in list(job.events):
                if id(event) in seen:
                    continue
                seen.add(id(event))
                yield encode(event)
            while True:
                terminal = job.status in ("completed", "failed", "cancelled")
                if terminal and queue.empty():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    if job.status in ("completed", "failed", "cancelled") and queue.empty():
                        break
                    yield ": keepalive\n\n"
                    continue
                if id(event) in seen:
                    continue
                seen.add(id(event))
                yield encode(event)
        finally:
            if queue in job.subscribers:
                job.subscribers.remove(queue)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/research/{job_id}/status")
async def research_status(job_id: str, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not found")
    return {
        "status": job.status,
        "error": job.error,
        "hasReport": bool(job.markdown.strip()),
    }


@app.get("/research/{job_id}/report")
async def research_report(job_id: str, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not found")
    if job.status not in ("completed", "running") and not job.markdown:
        raise HTTPException(400, job.error or "report not ready")
    return {"title": job.title or job.topic, "markdown": job.markdown}


@app.post("/research/{job_id}/cancel")
async def cancel_research(job_id: str, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not found")
    job.cancel_flag = True
    return {"ok": True}


@app.get("/health")
async def health():
    return {"ok": True}


def main():
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
