"""Research Agent graph factory."""

from datetime import datetime
import os

from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

from research_agent.prompts import RESEARCH_WORKFLOW_INSTRUCTIONS
from research_agent.tools import tavily_search


def _chat_model() -> ChatOpenAI:
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com/v1")
    kwargs: dict = {
        "model": os.getenv("OPENAI_MODEL", "deepseek-chat"),
        "base_url": base_url,
        "api_key": os.getenv("OPENAI_API_KEY", ""),
        "temperature": 0.0,
        "timeout": float(os.getenv("RESEARCH_LLM_TIMEOUT", "600")),
        "max_retries": int(os.getenv("RESEARCH_LLM_RETRIES", "1")),
    }
    disable_thinking = os.getenv("RESEARCH_DISABLE_THINKING", "1") != "0"
    if disable_thinking and ("volces.com" in base_url or "ark.cn" in base_url):
        kwargs["extra_body"] = {"thinking": {"type": "disabled"}}
    return ChatOpenAI(**kwargs)


def create_research_agent():
    current_date = datetime.now().strftime("%Y-%m-%d")
    return create_deep_agent(
        model=_chat_model(),
        tools=[tavily_search],
        system_prompt=RESEARCH_WORKFLOW_INSTRUCTIONS.format(date=current_date),
    )
