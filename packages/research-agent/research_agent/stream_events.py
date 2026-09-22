"""Pure helpers for research SSE events and two-phase streaming."""

from __future__ import annotations

import asyncio
from typing import Any, Callable


def normalize_history(history: list[Any] | None) -> list[dict[str, str]]:
    turns: list[dict[str, str]] = []
    for item in history or []:
        if isinstance(item, dict):
            role = item.get("role")
            content = item.get("content")
        else:
            role = getattr(item, "role", None)
            content = getattr(item, "content", None)
        if role not in ("user", "assistant"):
            continue
        text = str(content or "").strip()
        if not text:
            continue
        turns.append({"role": role, "content": text})
    return turns[-12:]


def agent_messages(topic: str, history: list[dict[str, str]]) -> list[dict[str, str]]:
    messages = [{"role": turn["role"], "content": turn["content"]} for turn in history]
    messages.append({"role": "user", "content": topic})
    return messages


def live_after_replay(replay: list[dict[str, Any]], queued: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen = {id(event) for event in replay}
    live: list[dict[str, Any]] = []
    for event in queued:
        if id(event) in seen:
            continue
        seen.add(id(event))
        live.append(event)
    return live


def _text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return ""


def chunk_parts(chunk: Any) -> tuple[str, str]:
    if isinstance(chunk, dict):
        additional = chunk.get("additional_kwargs") or {}
        content = chunk.get("content")
        tool_chunks = chunk.get("tool_call_chunks") or chunk.get("tool_calls")
    else:
        additional = getattr(chunk, "additional_kwargs", None) or {}
        content = getattr(chunk, "content", None)
        tool_chunks = getattr(chunk, "tool_call_chunks", None) or getattr(chunk, "tool_calls", None)
    if not isinstance(additional, dict):
        additional = {}

    thinking = _text(additional.get("reasoning_content") or additional.get("reasoning") or "")
    text_parts: list[str] = []
    if isinstance(content, str):
        text_parts.append(content)
    elif isinstance(content, list):
        for block in content:
            if isinstance(block, str):
                text_parts.append(block)
                continue
            if not isinstance(block, dict):
                continue
            kind = block.get("type")
            if kind in ("reasoning", "thinking"):
                thinking += _text(block.get("reasoning") or block.get("thinking") or block.get("text") or "")
            else:
                text_parts.append(_text(block.get("text") or ""))
    text = "" if tool_chunks else "".join(text_parts)
    return thinking, text


def search_sources(results: Any) -> list[dict[str, str]]:
    if not isinstance(results, dict):
        return []
    sources: list[dict[str, str]] = []
    for result in results.get("results") or []:
        if not isinstance(result, dict):
            continue
        title = str(result.get("title") or "").strip()
        url = str(result.get("url") or "").strip()
        if not title and not url:
            continue
        sources.append({"title": title or url, "url": url})
    return sources


def _message_role(message: Any) -> str:
    role = getattr(message, "type", None) or getattr(message, "role", None)
    if role is None and isinstance(message, dict):
        role = message.get("role") or message.get("type")
    if role in ("ai", "assistant"):
        return "assistant"
    return str(role or "")


def _message_text(message: Any) -> str:
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") not in ("reasoning", "thinking"):
                parts.append(_text(block.get("text") or ""))
        return "\n".join(part for part in parts if part).strip()
    return ""


def notes_from_output(result: Any) -> str:
    if not isinstance(result, dict):
        return ""
    for message in reversed(result.get("messages") or []):
        if _message_role(message) != "assistant":
            continue
        text = _message_text(message)
        if text:
            return text
    return ""


class TokenCoalescer:
    def __init__(self, emit: Callable[[str, str], None], interval: float = 0.05) -> None:
        self.interval = interval
        self._emit = emit
        self._kind: str | None = None
        self._parts: list[str] = []

    def add(self, kind: str, text: str) -> None:
        if not text:
            return
        if self._kind and self._kind != kind:
            self.flush()
        self._kind = kind
        self._parts.append(text)

    def flush(self) -> None:
        if not self._kind or not self._parts:
            self._kind = None
            self._parts = []
            return
        kind = self._kind
        text = "".join(self._parts)
        self._kind = None
        self._parts = []
        self._emit(kind, text)

    async def loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self.interval)
                self.flush()
        except asyncio.CancelledError:
            self.flush()
            raise
