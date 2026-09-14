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

load_dotenv()

DATA_DIR = Path(os.getenv("RESEARCH_DATA_DIR", Path(__file__).resolve().parent.parent / "data" / "jobs"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

RESEARCH_TOKEN = os.getenv("RESEARCH_TOKEN", "research-local")
PORT = int(os.getenv("RESEARCH_HTTP_PORT", "8765"))


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


def _extract_title_and_markdown(text: str, fallback_topic: str) -> tuple[str, str]:
    md = text.strip()
    if not md:
        return fallback_topic, f"# {fallback_topic}\n\n（研究生成失败，内容为空）"
    m = re.search(r"^#\s+(.+)$", md, re.MULTILINE)
    title = m.group(1).strip() if m else fallback_topic
    return title, md


async def _run_job(job: JobState) -> None:
    from research_agent.graph import create_research_agent

    try:
        _emit(job, "planning", "正在规划研究任务…")
        agent = create_research_agent()
        if job.cancel_flag:
            job.status = "cancelled"
            _emit(job, "error", "任务已取消")
            return

        _emit(job, "searching", "正在搜索与收集资料…")
        result = await asyncio.to_thread(
            agent.invoke,
            {"messages": [{"role": "user", "content": job.topic}]},
        )

        if job.cancel_flag:
            job.status = "cancelled"
            _emit(job, "error", "任务已取消")
            return

        _emit(job, "writing", "正在整理研究报告…")
        messages = result.get("messages", [])
        final_text = ""
        if messages:
            last = messages[-1]
            content = getattr(last, "content", None) or (last.get("content") if isinstance(last, dict) else "")
            if isinstance(content, str):
                final_text = content
            elif isinstance(content, list):
                final_text = "\n".join(
                    block.get("text", "") if isinstance(block, dict) else str(block) for block in content
                )

        # Try virtual FS final report from agent state if present
        files = result.get("files") or {}
        if isinstance(files, dict) and "/final_report.md" in files:
            final_text = files["/final_report.md"] or final_text

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
    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        _emit(job, "error", str(e))


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
