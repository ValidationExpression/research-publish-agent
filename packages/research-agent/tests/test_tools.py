import ssl
import unittest
from unittest.mock import MagicMock, patch

from requests.exceptions import SSLError


class TestTavilySearchResilience(unittest.TestCase):
    def test_ssl_eof_is_retryable(self) -> None:
        from research_agent.tools import is_retryable_search_error

        err = SSLError("HTTPSConnectionPool(host='api.tavily.com', port=443): Max retries exceeded")
        err.__cause__ = ssl.SSLEOFError(8, "UNEXPECTED_EOF_WHILE_READING")
        self.assertTrue(is_retryable_search_error(err))

    def test_retries_ssl_then_succeeds(self) -> None:
        from research_agent.tools import search_with_retry

        client = MagicMock()
        client.search.side_effect = [
            SSLError("EOF"),
            {"results": [{"url": "https://example.com", "title": "ok"}]},
        ]
        with patch("research_agent.tools.time.sleep"):
            result = search_with_retry(client, "2026 ai", max_results=1, topic="general")
        self.assertEqual(result["results"][0]["title"], "ok")
        self.assertEqual(client.search.call_count, 2)

    def test_ssl_failure_returns_proxy_hint_instead_of_raising(self) -> None:
        from research_agent.tools import tavily_search

        with patch("research_agent.tools.search_with_retry", side_effect=SSLError("EOF")):
            message = tavily_search.func("2026 ai")
        self.assertIn("Tavily", message)
        self.assertIn("TAVILY_HTTPS_PROXY", message)
        self.assertNotIn("Traceback", message)

    def test_proxy_config_falls_back_to_https_proxy(self) -> None:
        from research_agent.tools import proxy_config

        with patch.dict(
            "os.environ",
            {"HTTPS_PROXY": "http://127.0.0.1:7890", "TAVILY_HTTPS_PROXY": ""},
            clear=False,
        ):
            proxies = proxy_config()
        self.assertEqual(proxies["https"], "http://127.0.0.1:7890")

    def test_non_retryable_error_is_not_retried(self) -> None:
        from research_agent.tools import search_with_retry

        client = MagicMock()
        client.search.side_effect = ValueError("bad key")
        with self.assertRaises(ValueError):
            search_with_retry(client, "q", max_results=1, topic="general")
        self.assertEqual(client.search.call_count, 1)

    def test_tavily_timeout_is_retryable(self) -> None:
        from tavily.errors import TimeoutError as TavilyTimeoutError
        from research_agent.tools import is_retryable_search_error

        self.assertTrue(is_retryable_search_error(TavilyTimeoutError(60)))
        self.assertTrue(is_retryable_search_error(RuntimeError("Request timed out after 60 seconds.")))
        self.assertTrue(is_retryable_search_error(SSLError("HTTPSConnectionPool(host='api.tavily.com', port=443)")))

    def test_llm_timeout_is_not_classified_as_tavily(self) -> None:
        from research_agent.tools import is_retryable_search_error, public_job_error

        err = TimeoutError("Request timed out.")
        self.assertFalse(is_retryable_search_error(err))
        message = public_job_error(err)
        self.assertNotIn("TAVILY_HTTPS_PROXY", message)
        self.assertIn("模型", message)

    def test_retries_timeout_then_succeeds(self) -> None:
        from tavily.errors import TimeoutError as TavilyTimeoutError
        from research_agent.tools import search_with_retry

        client = MagicMock()
        client.search.side_effect = [TavilyTimeoutError(20), {"results": []}]
        with patch("research_agent.tools.time.sleep"):
            result = search_with_retry(client, "q", max_results=1, topic="general")
        self.assertEqual(result, {"results": []})
        self.assertEqual(client.search.call_count, 2)
        self.assertLessEqual(client.search.call_args.kwargs["timeout"], 30)

    def test_timeout_returns_hint_instead_of_raising(self) -> None:
        from tavily.errors import TimeoutError as TavilyTimeoutError
        from research_agent.tools import tavily_search

        with patch(
            "research_agent.tools.search_with_retry",
            side_effect=TavilyTimeoutError(60),
        ):
            message = tavily_search.func("2026 ai")
        self.assertIn("TAVILY_HTTPS_PROXY", message)

    def test_progress_emit_is_safe_without_job(self) -> None:
        from research_agent.progress import emit_progress, job_cancelled

        emit_progress("searching", "noop")
        self.assertFalse(job_cancelled())

    def test_search_budget_blocks_extra_calls(self) -> None:
        from research_agent.progress import bind_job, consume_search, unbind_job

        tokens = bind_job(lambda *_: None, lambda: False, budget=2)
        try:
            self.assertTrue(consume_search())
            self.assertTrue(consume_search())
            self.assertFalse(consume_search())
        finally:
            unbind_job(tokens)

    def test_tavily_returns_budget_message_without_calling_api(self) -> None:
        from research_agent.progress import bind_job, unbind_job
        from research_agent.tools import tavily_search

        tokens = bind_job(lambda *_: None, lambda: False, budget=0)
        try:
            with patch("research_agent.tools.search_with_retry") as search:
                message = tavily_search.func("2026 ai")
            search.assert_not_called()
            self.assertIn("额度已用完", message)
        finally:
            unbind_job(tokens)


if __name__ == "__main__":
    unittest.main()
