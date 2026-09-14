# Research Agent (Python Sidecar)

深度研究服务，基于 `deepagents` + Tavily。

## 启动

```bash
cd packages/research-agent
cp ../../.env.example .env   # 填写 OPENAI_API_KEY、TAVILY_API_KEY
uv sync
uv run python -m research_agent.server
```

默认 `http://127.0.0.1:8765`，Token 见 `RESEARCH_TOKEN`。

## API

见仓库根目录 `docs/contracts.md`。
