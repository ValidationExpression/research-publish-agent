# Research Agent (Python Sidecar)

深度研究服务，基于 `deepagents` + Tavily。

## 启动

```bash
# 在仓库根目录配置 .env（见 ../../.env.example）
uv sync
uv run python -m research_agent.server
```

默认 `http://127.0.0.1:8765`，Token 见 `RESEARCH_TOKEN`。

若搜索阶段出现 `SSL: UNEXPECTED_EOF_WHILE_READING` / `api.tavily.com`，多半是到 Tavily 的 TLS 被中断。可稍后重试，或在仓库根目录 `.env` 增加：

```
TAVILY_HTTPS_PROXY=http://127.0.0.1:7890
```

然后重启研究服务。

## API

见仓库根目录 `docs/contracts.md`。
