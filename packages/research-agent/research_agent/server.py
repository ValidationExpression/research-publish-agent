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
from typing import Any, AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


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


class ResearchRequest(BaseModel):
    topic: str


@dataclass
class JobState:
    job_id: str
    topic: str
    status: str = "running"
    events: list[dict[str, str]] = field(default_factory=list)
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


def _emit(job: JobState, event_type: str, message: str) -> None:
    payload = {"type": event_type, "message": message}
    job.events.append(payload)
    for q in list(job.subscribers):
        q.put_nowait(payload)


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


async def _run_job(job: JobState) -> None:
    from research_agent.graph import create_research_agent
    from research_agent.progress import bind_job, unbind_job

    heartbeat: asyncio.Task | None = None
    hooks = None
    try:
        _emit(job, "planning", "正在规划研究任务…")
        agent = create_research_agent()
        if job.cancel_flag:
            job.status = "cancelled"
            _emit(job, "error", "任务已取消")
            return

        hooks = bind_job(
            lambda event_type, message: _emit(job, event_type, message),
            lambda: job.cancel_flag,
            budget=SEARCH_BUDGET,
        )

        async def _heartbeat() -> None:
            elapsed = 0
            while True:
                await asyncio.sleep(15)
                elapsed += 15
                if job.status != "running" or job.cancel_flag:
                    return
                phase = job.events[-1]["type"] if job.events else "searching"
                if phase == "writing":
                    _emit(job, "writing", f"仍在整理报告… 已用时 {elapsed} 秒")
                else:
                    _emit(job, "searching", f"仍在研究中… 已用时 {elapsed} 秒")

        heartbeat = asyncio.create_task(_heartbeat())
        _emit(job, "searching", "正在搜索与收集资料…")
        invoke_coro = asyncio.to_thread(
            agent.invoke,
            {"messages": [{"role": "user", "content": job.topic}]},
            {"recursion_limit": 40},
        )
        if JOB_TIMEOUT_SECONDS > 0:
            result = await asyncio.wait_for(invoke_coro, timeout=JOB_TIMEOUT_SECONDS)
        else:
            result = await invoke_coro

        if job.cancel_flag:
            job.status = "cancelled"
            _emit(job, "error", "任务已取消")
            return

        if heartbeat is not None:
            heartbeat.cancel()
            heartbeat = None

        _emit(job, "writing", "正在整理研究报告…")
        final_text = _extract_report_from_result(result)
        title, markdown = _extract_title_and_markdown(final_text, job.topic)
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

        job.status = "completed"
        _emit(job, "done", "研究报告已生成")
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
        if heartbeat is not None:
            heartbeat.cancel()
        if hooks is not None:
            unbind_job(hooks)


@app.post("/research")
async def create_research(body: ResearchRequest, request: Request):
    if not _auth_ok(request):
        raise HTTPException(401, "unauthorized")
    if not body.topic.strip():
        raise HTTPException(400, "topic required")

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    job = JobState(job_id=job_id, topic=body.topic.strip())
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
        sent = 0
        try:
            while True:
                if sent < len(job.events):
                    for ev in job.events[sent:]:
                        yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                    sent = len(job.events)
                    continue
                if job.status in ("completed", "failed", "cancelled"):
                    break
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
                    sent = len(job.events)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
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
