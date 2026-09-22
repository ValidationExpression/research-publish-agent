# API Contracts

All services bind to `127.0.0.1` only.

## Auth

- Publish: `?token=` or `Authorization: Bearer <token>`
- Research: `?token=` or `Authorization: Bearer <token>`

Default dev tokens: `wechatsync-local` (publish), `research-local` (research).

## Publish API (`127.0.0.1:8787`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Plugin connection + cookie domains |
| GET | `/platforms` | Platform list + `loggedIn` |
| GET | `/trends?platforms=csdn,weixin` | Trend items (v1: empty array) |
| POST | `/sync` | Start publish job |
| GET | `/sync/:id` | Sync job status |

### POST /sync

```json
{
  "platforms": ["csdn", "weixin"],
  "article": {
    "title": "required",
    "html": "<p>...</p>",
    "markdown": "# optional",
    "cover": "https://..."
  },
  "draftOnly": true
}
```

## Research API (`127.0.0.1:8765`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/research` | `{ "topic": "...", "history"?: [{ "role": "user" \| "assistant", "content": "..." }] }` → `{ "jobId" }` |
| GET | `/research/:jobId/events` | SSE progress for one research turn |
| GET | `/research/:jobId/report` | `{ "title", "markdown" }` |
| POST | `/research/:jobId/cancel` | Cancel job |

`history` is prior turns only. The assistant entries are finished report Markdown, without thinking or search logs. Each request still creates one job and one report.

### SSE events

Durable events are replayed when a client connects. `thinking` and `report` are live only and are not stored on the job.

```json
{ "type": "planning", "message": "正在理解问题并规划检索…" }
{ "type": "thinking", "message": "<reasoning chunk>" }
{ "type": "search", "id": "s1", "query": "...", "status": "running" | "done" | "error", "message": "...", "sources": [{ "title": "...", "url": "https://..." }] }
{ "type": "phase", "message": "writing" }
{ "type": "report", "message": "<markdown chunk>" }
{ "type": "heartbeat", "message": "已用时 15 秒", "elapsed": 15 }
{ "type": "done", "message": "研究报告已生成" }
{ "type": "error", "message": "..." }
```

`phase: writing` means search is finished and the report is starting. Report chunks before that phase are not part of the document.

## Trends response (placeholder)

```json
{
  "items": [
    {
      "platform": "csdn",
      "title": "example",
      "url": "https://...",
      "heat": 100,
      "capturedAt": "2026-09-11T00:00:00.000Z"
    }
  ]
}
```
