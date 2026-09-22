"""Per-job progress hooks for the research sidecar."""

from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any, Callable

EmitFn = Callable[[str, str], None]
CancelFn = Callable[[], bool]
PayloadFn = Callable[[dict[str, Any]], None]

_emit_fn: ContextVar[EmitFn | None] = ContextVar("research_emit", default=None)
_payload_fn: ContextVar[PayloadFn | None] = ContextVar("research_payload", default=None)
_cancel_fn: ContextVar[CancelFn | None] = ContextVar("research_cancel", default=None)
_search_box: ContextVar[list[int] | None] = ContextVar("research_search_box", default=None)
_search_budget: ContextVar[int] = ContextVar("research_search_budget", default=4)


def bind_job(
    emit: EmitFn,
    cancelled: CancelFn,
    budget: int = 4,
    payload: PayloadFn | None = None,
) -> tuple[Token, Token, Token, Token, Token]:
    return (
        _emit_fn.set(emit),
        _cancel_fn.set(cancelled),
        _search_box.set([0]),
        _search_budget.set(budget),
        _payload_fn.set(payload),
    )


def unbind_job(tokens: tuple[Token, ...]) -> None:
    _emit_fn.reset(tokens[0])
    _cancel_fn.reset(tokens[1])
    _search_box.reset(tokens[2])
    _search_budget.reset(tokens[3])
    if len(tokens) > 4:
        _payload_fn.reset(tokens[4])


def emit_progress(event_type: str, message: str) -> None:
    fn = _emit_fn.get()
    if fn:
        fn(event_type, message)


def emit_event(payload: dict[str, Any]) -> None:
    fn = _payload_fn.get()
    if fn:
        fn(payload)


def job_cancelled() -> bool:
    fn = _cancel_fn.get()
    return bool(fn and fn())


def consume_search() -> bool:
    box = _search_box.get()
    if box is None:
        return True
    if box[0] >= _search_budget.get():
        return False
    box[0] += 1
    return True
