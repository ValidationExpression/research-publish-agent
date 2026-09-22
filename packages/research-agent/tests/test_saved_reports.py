import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from research_agent.server import delete_saved_report, list_saved_reports, read_saved_report


def _write_pair(root: Path, job_id: str, title: str, topic: str, completed_at: str, markdown: str) -> None:
    (root / f"{job_id}.md").write_text(markdown, encoding="utf-8")
    (root / f"{job_id}.json").write_text(
        json.dumps(
            {"jobId": job_id, "topic": topic, "title": title, "completedAt": completed_at},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


class TestSavedReports(unittest.TestCase):
    def test_lists_newest_first_and_skips_metadata_without_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_pair(root, "job_old", "旧报告", "旧主题", "2026-09-01T00:00:00+00:00", "# 旧报告\n")
            _write_pair(root, "job_new", "新报告", "新主题", "2026-09-22T00:00:00+00:00", "# 新报告\n")
            (root / "job_partial.json").write_text("{}", encoding="utf-8")

            reports = list_saved_reports(root)

            self.assertEqual([item["jobId"] for item in reports], ["job_new", "job_old"])
            self.assertEqual(reports[0]["title"], "新报告")
            self.assertEqual(reports[0]["topic"], "新主题")

    def test_reads_markdown_and_deletes_both_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_pair(root, "job_one", "标题", "主题", "2026-09-22T01:00:00+00:00", "# 标题\n\n正文")

            report = read_saved_report("job_one", root)
            self.assertEqual(report["markdown"], "# 标题\n\n正文")
            self.assertEqual(report["completedAt"], "2026-09-22T01:00:00+00:00")

            delete_saved_report("job_one", root)
            self.assertEqual(list_saved_reports(root), [])
            self.assertFalse((root / "job_one.md").exists())
            self.assertFalse((root / "job_one.json").exists())

    def test_missing_report_is_not_found(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(HTTPException) as caught:
                read_saved_report("job_missing", Path(tmp))
            self.assertEqual(caught.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
