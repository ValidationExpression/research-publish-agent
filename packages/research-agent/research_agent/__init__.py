"""Research Publish Agent sidecar.

This module demonstrates building a research agent using the deepagents package
with custom tools for web search and strategic thinking.
"""

from research_agent.prompts import RESEARCH_WORKFLOW_INSTRUCTIONS
from research_agent.tools import tavily_search

__all__ = [
    "tavily_search",
    "RESEARCH_WORKFLOW_INSTRUCTIONS",
]
