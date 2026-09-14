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
| POST | `/research` | `{ "topic": "..." }` → `{ "jobId" }` |
| GET | `/research/:jobId/events` | SSE: planning, searching, writing, done, error |
| GET | `/research/:jobId/report` | `{ "title", "markdown" }` |
| POST | `/research/:jobId/cancel` | Cancel job |

### SSE events

```json
{ "type": "planning" | "searching" | "writing" | "done" | "error", "message": "..." }
```

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
