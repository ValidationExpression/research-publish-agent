import os
import unittest
from unittest.mock import patch

from research_agent.server import JobState, _emit
from research_agent.stream_events import (
    chunk_parts,
    live_after_replay,
    normalize_history,
    notes_from_output,
    search_sources,
)
from research_agent.stream_events import TokenCoalescer


class TestHistory(unittest.TestCase):
    def test_keeps_user_and_assistant_turns(self) -> None:
        history = normalize_history([
            {"role": "user", "content": " 主题 "},
            {"role": "assistant", "content": "# 报告"},
            {"role": "system", "content": "忽略"},
            {"role": "user", "content": "   "},
        ])
        self.assertEqual(history, [
            {"role": "user", "content": "主题"},
            {"role": "assistant", "content": "# 报告"},
        ])


class TestEmit(unittest.TestCase):
    def test_thinking_and_report_are_not_stored(self) -> None:
        job = JobState(job_id="job_emit", topic="主题")
        queue: list[dict] = []
        job.subscribers.append(queue)  # type: ignore[arg-type]

        class ListQueue(list):
            def put_nowait(self, item):
                self.append(item)

        job.subscribers.clear()
        sink = ListQueue()
        job.subscribers.append(sink)
        _emit(job, "thinking", "先检索", durable=False)
        _emit(job, "report", "# 报告", durable=False)
        _emit(job, "search", "LangGraph", durable=True, id="s1", query="LangGraph", status="running")
        self.assertEqual([event["type"] for event in job.events], ["search"])
        self.assertEqual([event["type"] for event in sink], ["thinking", "report", "search"])

    def test_replay_does_not_duplicate_queued_durable_events(self) -> None:
        payload = {"type": "search", "message": "q", "id": "s1"}
        replay = [payload]
        queued = [payload, {"type": "thinking", "message": "想"}]
        self.assertEqual(
            [event["type"] for event in live_after_replay(replay, queued)],
            ["thinking"],
        )


class TestChunkParts(unittest.TestCase):
    def test_splits_reasoning_from_visible_text(self) -> None:
        class Chunk:
            content = "可见规划"
            additional_kwargs = {"reasoning_content": "深度思考"}
            tool_call_chunks = []

        thinking, text = chunk_parts(Chunk())
        self.assertEqual(thinking, "深度思考")
        self.assertEqual(text, "可见规划")

    def test_reads_reasoning_blocks_and_ignores_tool_arguments(self) -> None:
        class Chunk:
            content = [{"type": "reasoning", "reasoning": "先搜"}, {"type": "text", "text": "下一步"}]
            additional_kwargs = {}
            tool_call_chunks = [{"name": "tavily_search", "args": "{\"query\":\"x\"}"}]

        thinking, text = chunk_parts(Chunk())
        self.assertEqual(thinking, "先搜")
        self.assertEqual(text, "")


class TestSearchSources(unittest.TestCase):
    def test_keeps_title_and_url_only(self) -> None:
        sources = search_sources({
            "results": [
                {"title": "LangGraph", "url": "https://example.com/lg", "content": "很长的正文"},
                {"title": "", "url": "", "content": "丢弃"},
            ]
        })
        self.assertEqual(sources, [{"title": "LangGraph", "url": "https://example.com/lg"}])


class TestNotes(unittest.TestCase):
    def test_uses_last_assistant_message_not_tool_dump(self) -> None:
        notes = notes_from_output({
            "messages": [
                {"role": "tool", "content": "x" * 500},
                {"role": "assistant", "content": "笔记：LangGraph 适合有状态流程。"},
            ]
        })
        self.assertEqual(notes, "笔记：LangGraph 适合有状态流程。")


class TestCoalescer(unittest.TestCase):
    def test_flushes_previous_kind_before_switching(self) -> None:
        out: list[tuple[str, str]] = []
        coalescer = TokenCoalescer(lambda kind, text: out.append((kind, text)))
        coalescer.add("thinking", "你")
        coalescer.add("thinking", "好")
        coalescer.add("report", "# ")
        coalescer.flush()
        self.assertEqual(out, [("thinking", "你好"), ("report", "# ")])


class TestThinkingDefault(unittest.TestCase):
    def test_volces_thinking_is_on_unless_disabled(self) -> None:
        from research_agent.graph import chat_model_kwargs

        env = {
            "OPENAI_BASE_URL": "https://ark.cn-beijing.volces.com/api/v3",
            "OPENAI_API_KEY": "test",
            "OPENAI_MODEL": "doubao-test",
        }
        with patch.dict(os.environ, {**env, "RESEARCH_DISABLE_THINKING": "0"}, clear=False):
            enabled = chat_model_kwargs()
        with patch.dict(os.environ, {**env, "RESEARCH_DISABLE_THINKING": "1"}, clear=False):
            disabled = chat_model_kwargs()
        self.assertTrue(enabled["streaming"])
        self.assertEqual(enabled["extra_body"]["thinking"]["type"], "enabled")
        self.assertEqual(disabled["extra_body"]["thinking"]["type"], "disabled")


if __name__ == "__main__":
    unittest.main()
