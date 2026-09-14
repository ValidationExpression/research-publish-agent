# Migration Notes

## Upstream sources

| Component | Source path | Notes |
|-----------|-------------|-------|
| core | `Wechatsync/packages/core` | Platform adapters |
| local-server | `Wechatsync/packages/local-server` | Publish runtime |
| cookie-provider | `Wechatsync/packages/cookie-provider` | Chrome extension |
| research-agent | `deepagents/examples/deep_research` | LangGraph agent (slimmed) |

Record upstream commit hashes when syncing fixes:

- Wechatsync: _pending_
- deep_research: _pending_

## Changes in this repo

- `local-server`: `startPublishRuntime()` for Electron in-process use
- `core`: `TrendProvider` + `trendRegistry` (Discovery domain)
- `GET /trends`: placeholder returns `{ items: [] }`
- `research-agent`: FastAPI + SSE server (no jupyter/langgraph-cli)
