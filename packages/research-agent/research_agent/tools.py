"""Research Tools.

This module provides search and content processing utilities for the research agent,
using Tavily for URL discovery and fetching full webpage content.
"""

from __future__ import annotations

import os
import socket
import ssl
import time
from typing import Any

import httpx
from langchain_core.tools import InjectedToolArg, tool
from markdownify import markdownify
from requests.exceptions import ChunkedEncodingError
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import SSLError, Timeout
from tavily import TavilyClient
from tavily.errors import TimeoutError as TavilyTimeoutError
from typing_extensions import Annotated, Literal

from research_agent.progress import consume_search, emit_progress, job_cancelled

SEARCH_RETRIES = 3
SEARCH_TIMEOUT = float(os.getenv("TAVILY_TIMEOUT", "20"))
LOCAL_PROXY_PORTS = (7890, 10809, 10808, 20171)


def detect_local_proxy() -> str | None:
    for port in LOCAL_PROXY_PORTS:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return f"http://127.0.0.1:{port}"
        except OSError:
            continue
    return None


def proxy_config() -> dict[str, str] | None:
    https = (
        os.getenv("TAVILY_HTTPS_PROXY")
        or os.getenv("HTTPS_PROXY")
        or os.getenv("https_proxy")
        or ""
    ).strip()
    http = (
        os.getenv("TAVILY_HTTP_PROXY")
        or os.getenv("HTTP_PROXY")
        or os.getenv("http_proxy")
        or ""
    ).strip()
    if not https and not http:
        detected = detect_local_proxy()
        if detected:
            https = detected
            http = detected
    proxies: dict[str, str] = {}
    if http:
        proxies["http"] = http
    if https:
        proxies["https"] = https
    elif http:
        proxies["https"] = http
    return proxies or None


def make_tavily_client() -> TavilyClient:
    return TavilyClient(proxies=proxy_config())


tavily_client = make_tavily_client()


def is_retryable_search_error(exc: BaseException) -> bool:
    tavily_types = (
        SSLError,
        RequestsConnectionError,
        Timeout,
        TavilyTimeoutError,
        ChunkedEncodingError,
        ssl.SSLError,
    )
    current: BaseException | None = exc
    for _ in range(6):
        if current is None:
            break
        if isinstance(current, tavily_types):
            return True
        text = str(current)
        if (
            "api.tavily.com" in text
            or "UNEXPECTED_EOF" in text
            or "Request timed out after" in text
        ):
            return True
        current = current.__cause__ or current.__context__
    return False


def friendly_search_error(exc: BaseException) -> str:
    return (
        "搜索失败：无法稳定连接到 Tavily（SSL 中断或请求超时）。"
        "请确认本地代理已开启，并在仓库根目录 .env 设置 "
        "TAVILY_HTTPS_PROXY=http://127.0.0.1:7890 后重启桌面端。"
    )


def public_job_error(exc: BaseException) -> str:
    if is_retryable_search_error(exc):
        return friendly_search_error(exc)
    text = str(exc).lower()
    if isinstance(exc, TimeoutError) or "timed out" in text or "timeout" in text:
        return "检索已完成，但模型在写报告时响应超时。请再试一次（无需改代理）。"
    return str(exc)


def search_with_retry(
    client: Any,
    query: str,
    max_results: int = 1,
    topic: str = "general",
    retries: int = SEARCH_RETRIES,
) -> dict[str, Any]:
    last_error: BaseException | None = None
    for attempt in range(retries):
        try:
            return client.search(
                query,
                max_results=max_results,
                topic=topic,
                timeout=SEARCH_TIMEOUT,
                include_raw_content="markdown",
            )
        except Exception as exc:
            last_error = exc
            if not is_retryable_search_error(exc) or attempt >= retries - 1:
                raise
            time.sleep(0.8 * (attempt + 1))
    assert last_error is not None
    raise last_error


def fetch_webpage_content(url: str, timeout: float = 10.0) -> str:
    """Fetch and convert webpage content to markdown.

    Args:
        url: URL to fetch
        timeout: Request timeout in seconds

    Returns:
        Webpage content as markdown
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    try:
        response = httpx.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
        return markdownify(response.text)
    except Exception as e:
        return f"Error fetching content from {url}: {str(e)}"


@tool(parse_docstring=True)
def tavily_search(
    query: str,
    max_results: Annotated[int, InjectedToolArg] = 5,
    topic: Annotated[
        Literal["general", "news", "finance"], InjectedToolArg
    ] = "general",
) -> str:
    """Search the web for information on a given query.

    Uses Tavily to discover relevant URLs, then fetches and returns full webpage content as markdown.

    Args:
        query: Search query to execute
        max_results: Maximum number of results to return (default: 1)
        topic: Topic filter - 'general', 'news', or 'finance' (default: 'general')

    Returns:
        Formatted search results with full webpage content
    """
    global tavily_client
    if job_cancelled():
        return "任务已取消，停止搜索。"
    if not consume_search():
        emit_progress("writing", "检索次数已达上限，开始整理报告…")
        return (
            "搜索额度已用完。请立即根据已有资料撰写完整最终报告，"
            "不要再调用 tavily_search。"
        )
    emit_progress("searching", f"正在检索：{query}")
    try:
        search_results = search_with_retry(
            tavily_client,
            query,
            max_results=max_results,
            topic=topic,
        )
    except Exception as exc:
        if is_retryable_search_error(exc):
            try:
                tavily_client.close()
            except Exception:
                pass
            tavily_client = make_tavily_client()
        return friendly_search_error(exc)

    # Fetch full content for each URL
    result_texts = []
    for result in search_results.get("results", []):
        url = result["url"]
        title = result["title"]

        content = result.get("raw_content") or result.get("content") or ""
        if not content:
            content = "（未获取到正文，仅有标题与链接）"

        result_text = f"""## {title}
**URL:** {url}

{content}

---
"""
        result_texts.append(result_text)

    # Format final response
    response = f"""🔍 Found {len(result_texts)} result(s) for '{query}':

{chr(10).join(result_texts)}"""

    return response


@tool(parse_docstring=True)
def think_tool(reflection: str) -> str:
    """Tool for strategic reflection on research progress and decision-making.

    Use this tool after each search to analyze results and plan next steps systematically.
    This creates a deliberate pause in the research workflow for quality decision-making.

    When to use:
    - After receiving search results: What key information did I find?
    - Before deciding next steps: Do I have enough to answer comprehensively?
    - When assessing research gaps: What specific information am I still missing?
    - Before concluding research: Can I provide a complete answer now?

    Reflection should address:
    1. Analysis of current findings - What concrete information have I gathered?
    2. Gap assessment - What crucial information is still missing?
    3. Quality evaluation - Do I have sufficient evidence/examples for a good answer?
    4. Strategic decision - Should I continue searching or provide my answer?

    Args:
        reflection: Your detailed reflection on research progress, findings, gaps, and next steps

    Returns:
        Confirmation that reflection was recorded for decision-making
    """
    if job_cancelled():
        return "任务已取消。"
    emit_progress("searching", "正在分析检索结果…")
    return f"Reflection recorded: {reflection}"
