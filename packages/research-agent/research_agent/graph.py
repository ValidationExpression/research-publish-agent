"""Research Agent graph factory."""

from datetime import datetime
import os

from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

from research_agent.prompts import (
    RESEARCHER_INSTRUCTIONS,
    RESEARCH_WORKFLOW_INSTRUCTIONS,
    SUBAGENT_DELEGATION_INSTRUCTIONS,
)
from research_agent.tools import tavily_search, think_tool

max_concurrent_research_units = 3
max_researcher_iterations = 3


def create_research_agent():
    current_date = datetime.now().strftime("%Y-%m-%d")

    instructions = (
        RESEARCH_WORKFLOW_INSTRUCTIONS
        + "\n\n"
        + "=" * 80
        + "\n\n"
        + SUBAGENT_DELEGATION_INSTRUCTIONS.format(
            max_concurrent_research_units=max_concurrent_research_units,
            max_researcher_iterations=max_researcher_iterations,
        )
    )

    research_sub_agent = {
        "name": "research-agent",
        "description": "Delegate research to the sub-agent researcher. Only give this researcher one topic at a time.",
        "system_prompt": RESEARCHER_INSTRUCTIONS.format(date=current_date),
        "tools": [tavily_search, think_tool],
    }

    model = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "deepseek-chat"),
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.deepseek.com/v1"),
        api_key=os.getenv("OPENAI_API_KEY", ""),
        temperature=0.0,
    )

    return create_deep_agent(
        model=model,
        tools=[tavily_search, think_tool],
        system_prompt=instructions,
        subagents=[research_sub_agent],
    )
