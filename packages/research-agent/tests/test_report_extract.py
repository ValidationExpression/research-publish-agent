import unittest

from research_agent.server import _as_text, _extract_report_from_result, _extract_title_and_markdown


class TestReportExtract(unittest.TestCase):
    def test_as_text_unwraps_file_dict(self) -> None:
        self.assertEqual(_as_text({"content": "# 标题\n\n正文"}), "# 标题\n\n正文")

    def test_extract_accepts_dict_content(self) -> None:
        title, md = _extract_title_and_markdown({"content": "# 2026 Agent\n\n对比"}, "fallback")
        self.assertEqual(title, "2026 Agent")
        self.assertIn("对比", md)

    def test_extract_empty_dict_uses_fallback(self) -> None:
        title, md = _extract_title_and_markdown({}, "主题")
        self.assertEqual(title, "主题")
        self.assertIn("内容为空", md)

    def test_extract_report_from_files_dict(self) -> None:
        result = {
            "files": {
                "/final_report.md": {
                    "content": "# 2026 Agent\n\n正文内容",
                    "encoding": "utf-8",
                }
            },
            "messages": [],
        }
        text = _extract_report_from_result(result)
        self.assertIn("2026 Agent", text)


if __name__ == "__main__":
    unittest.main()
