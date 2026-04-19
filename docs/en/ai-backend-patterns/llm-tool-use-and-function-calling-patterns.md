---
id: 30018
title: LLM Tool Use and Function Calling Patterns
state: draft
slug: llm-tool-use-and-function-calling-patterns
---

# [BEE-520] LLM Tool Use and Function Calling Patterns

:::info
Tool use transforms an LLM from a text generator into an agent that can act on the world. Understanding the protocol mechanics — how tool calls are encoded, how results flow back, how errors are handled, and how parallel execution works — is prerequisite to building reliable AI features on top of any provider's API.
:::

## Context

LLMs are stateless text predictors. They cannot query a database, call an API, check the current time, or take any action that requires I/O. The tool use protocol solves this by defining a structured turn-taking contract: the model signals a desired action as a structured call, the host executes it, and the result returns as another message. The model then reasons over the result and either calls more tools or produces a final answer.

This pattern, introduced as the ReAct (Reason + Act) framework by Yao et al. (arXiv:2210.03629, ICLR 2023), showed that interleaving reasoning traces with concrete actions outperformed chain-of-thought alone by grounding reasoning in real-world feedback rather than pure language continuation.

The protocol has since been standardized at the API level. OpenAI introduced function calling in 2023 and has iterated toward a `strict` mode that guarantees schema compliance through constrained decoding. Anthropic ships a parallel `tool_use` content block system with native support for streaming tool calls. The Berkeley Function Calling Leaderboard (BFCL) now benchmarks over a hundred models on two thousand real-world function signatures across serial, parallel, and multi-turn scenarios.

## Design Thinking

Tool use introduces a new class of failure modes that pure text generation does not have:

**Schema compliance failures**: The model outputs a tool call with invalid parameters — wrong types, missing required fields, values outside enum sets. Constrained decoding eliminates this at the output layer; schema validation catches it before execution when constrained decoding is unavailable.

**Tool selection failures**: The model calls the wrong tool, fails to call when it should, or calls tools unnecessarily. These are prompt engineering and schema design problems — the quality of tool descriptions determines selection accuracy more than model size in most cases.

**Execution failures**: The tool runs but returns an error. The model must decide whether to retry, fall back to a different tool, or surface a degraded response. Error propagation through tool results is a first-class concern.

**Security failures**: Tool parameters derived from user-controlled content can redirect agent behavior. Parameter validation must happen at the execution layer, not in the prompt.

## Best Practices

### Structure Tool Schemas for Precision

**MUST** define `description` at both the tool level and for each parameter. The model reads descriptions at inference time to decide which tool to call and how to populate parameters:

```python
# OpenAI / Anthropic shared schema structure
search_tool = {
    "name": "search_documents",
    "description": (
        "Search the knowledge base for documents relevant to a query. "
        "Use this when the user asks a factual question that may be answered "
        "by internal documentation. Do NOT use for real-time data."
    ),
    "input_schema": {          # Anthropic; OpenAI uses "parameters"
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query in natural language, 5-100 words."
            },
            "max_results": {
                "type": "integer",
                "description": "Number of results to return. Default 5, max 20.",
                "default": 5
            },
            "date_filter": {
                "type": "string",
                "enum": ["last_7_days", "last_30_days", "last_year", "all_time"],
                "description": "Restrict results to documents published within this window."
            }
        },
        "required": ["query"]
    }
}
```

**MUST** use enums for parameters with a fixed value set. An enum on `date_filter` prevents the model from hallucinating `"last_week"` or `"recent"`:

**SHOULD** keep schemas flat. Deeply nested objects create more parsing surface area and inflate argument token counts. If you need nested data, accept a JSON string and parse it in the tool implementation rather than encoding the nesting in the schema.

**SHOULD** enable strict mode (OpenAI) when available. Strict mode uses constrained decoding to guarantee that every generated argument conforms to the schema — no additional properties, correct types, required fields present:

```python
client.chat.completions.create(
    model="gpt-4o",
    tools=[{
        "type": "function",
        "function": {
            **tool_definition,
            "strict": True,  # Guarantees schema compliance via constrained decoding
        }
    }],
    messages=messages,
)
```

### Execute Tool Calls in Parallel Where Possible

**SHOULD** execute independent tool calls in parallel when the model returns multiple tool calls in a single response. Sequential execution for independent calls multiplies latency unnecessarily:

```python
import asyncio
import anthropic

client = anthropic.AsyncAnthropic()

async def run_tool(tool_use_block, tool_registry):
    fn = tool_registry[tool_use_block.name]
    try:
        result = await fn(**tool_use_block.input)
        return {"type": "tool_result", "tool_use_id": tool_use_block.id, "content": str(result)}
    except Exception as e:
        return {
            "type": "tool_result",
            "tool_use_id": tool_use_block.id,
            "content": f"Error: {e}",
            "is_error": True,
        }

async def run_agent_turn(messages, tools, tool_registry):
    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        tools=tools,
        messages=messages,
    )

    if response.stop_reason != "tool_use":
        return response  # Final answer

    tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

    # Execute all tool calls concurrently
    tool_results = await asyncio.gather(
        *[run_tool(b, tool_registry) for b in tool_use_blocks]
    )

    messages.append({"role": "assistant", "content": response.content})
    messages.append({"role": "user", "content": list(tool_results)})
    return await run_agent_turn(messages, tools, tool_registry)  # Next turn
```

**SHOULD** check for dependency ordering before parallelizing. If tool B requires the output of tool A, execute sequentially. Build a simple dependency graph if the agent plan is known ahead of time.

**MUST NOT** fire concurrent calls to rate-limited external APIs without a concurrency limiter. Four simultaneous calls to the same third-party API may hit per-second rate limits and all fail together. Use `asyncio.Semaphore` to cap concurrency:

```python
semaphore = asyncio.Semaphore(2)  # Max 2 concurrent external calls

async def rate_limited_tool(tool_block, tool_registry):
    async with semaphore:
        return await run_tool(tool_block, tool_registry)
```

### Classify and Handle Tool Errors Explicitly

**MUST** return structured error information in tool results rather than raising exceptions that abort the agent loop. The model can reason over an error and choose an alternative:

```python
async def safe_tool_executor(tool_block, tool_registry):
    if tool_block.name not in tool_registry:
        return {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": f"Unknown tool: {tool_block.name}. Available tools: {list(tool_registry)}",
            "is_error": True,
        }

    fn = tool_registry[tool_block.name]
    try:
        result = await asyncio.wait_for(fn(**tool_block.input), timeout=30.0)
        return {"type": "tool_result", "tool_use_id": tool_block.id, "content": str(result)}
    except asyncio.TimeoutError:
        return {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": "Tool timed out after 30 seconds.",
            "is_error": True,
        }
    except ValueError as e:
        # Client error — do not retry
        return {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": f"Invalid argument: {e}",
            "is_error": True,
        }
    except Exception as e:
        # Transient error — model may retry
        return {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": f"Tool failed: {e}. You may retry.",
            "is_error": True,
        }
```

**SHOULD** distinguish client errors (bad arguments — do not retry) from transient errors (network, timeout — may retry) in the error message text. The model uses this signal to decide its next action.

**SHOULD** set a maximum turn limit to prevent infinite retry loops:

```python
MAX_TURNS = 10

async def agent_loop(messages, tools, tool_registry):
    for _ in range(MAX_TURNS):
        response = await run_agent_turn(messages, tools, tool_registry)
        if response.stop_reason != "tool_use":
            return response
    raise RuntimeError("Agent exceeded maximum turn limit")
```

### Validate Tool Parameters Before Execution

**MUST** validate all parameters before passing them to tool implementations. Tool input arrives as a dict from the model and must be treated as untrusted data at the execution boundary:

```python
from pydantic import BaseModel, validator

class SearchInput(BaseModel):
    query: str
    max_results: int = 5
    date_filter: str = "all_time"

    @validator("query")
    def query_length(cls, v):
        if len(v) < 3:
            raise ValueError("query must be at least 3 characters")
        if len(v) > 500:
            raise ValueError("query must be at most 500 characters")
        return v

    @validator("max_results")
    def results_range(cls, v):
        if not 1 <= v <= 20:
            raise ValueError("max_results must be between 1 and 20")
        return v

    @validator("date_filter")
    def valid_filter(cls, v):
        allowed = {"last_7_days", "last_30_days", "last_year", "all_time"}
        if v not in allowed:
            raise ValueError(f"date_filter must be one of {allowed}")
        return v

async def search_documents(tool_input: dict) -> str:
    params = SearchInput(**tool_input)  # Raises ValueError on bad input
    return await _execute_search(params)
```

**MUST NOT** pass tool call arguments directly to shell commands, SQL queries, or file paths without sanitization. Tool parameter injection is the agent equivalent of SQL injection — a malicious value in a user-controlled field can redirect agent behavior across connected systems.

### Ensure Tool Idempotency for State-Changing Operations

**MUST** make state-changing tools idempotent. The agent loop may retry a tool call after a transient failure; a non-idempotent tool (such as "send email" or "charge payment") can execute the action twice if retried:

```python
import hashlib

async def send_email(recipient: str, subject: str, body: str, idempotency_key: str = None) -> str:
    """Send an email. idempotency_key prevents duplicate sends on retry."""
    key = idempotency_key or hashlib.sha256(
        f"{recipient}:{subject}:{body}".encode()
    ).hexdigest()

    if await email_log.exists(key):
        return f"Email already sent (idempotency_key={key})"

    await _send(recipient, subject, body)
    await email_log.record(key)
    return f"Email sent to {recipient}"
```

**SHOULD** generate idempotency keys from the content of the action (recipient + subject + body), not from a random UUID generated at call time. Content-addressed keys survive agent restarts and allow the model to safely retry after a crash.

### Audit Every Tool Call

**MUST** log every tool invocation with enough context to reconstruct what happened and who triggered it:

```python
import time

async def audited_tool(tool_block, tool_registry, user_id: str, agent_run_id: str):
    start = time.monotonic()
    result = await safe_tool_executor(tool_block, tool_registry)
    elapsed_ms = (time.monotonic() - start) * 1000

    await audit_log.record(
        timestamp=time.time(),
        user_id=user_id,
        agent_run_id=agent_run_id,
        tool_name=tool_block.name,
        tool_input=tool_block.input,   # Log the actual args, not just the name
        is_error=result.get("is_error", False),
        duration_ms=elapsed_ms,
    )
    return result
```

Audit logs serve two purposes: security forensics (which tool was called with which arguments by which user) and cost attribution (which agent run consumed which external API quota).

## Visual

```mermaid
sequenceDiagram
    participant U as User
    participant A as Application
    participant M as LLM
    participant T as Tool Executor

    U->>A: User message
    A->>M: Messages + tool schemas
    M-->>A: stop_reason="tool_use"\n[tool_use blocks]
    A->>T: Execute tools (parallel if independent)
    Note over T: Validate params → execute → catch errors
    T-->>A: tool_result blocks
    A->>M: Append assistant + tool results
    M-->>A: stop_reason="end_turn"\nFinal text response
    A-->>U: Response

    style U fill:#1d3557,color:#fff
    style A fill:#457b9d,color:#fff
    style M fill:#2d6a4f,color:#fff
    style T fill:#e67e22,color:#fff
```

## Related BEEs

- [BEE-30002](ai-agent-architecture-patterns.md) -- AI Agent Architecture Patterns: tool use is the mechanism through which agents act; this BEE covers protocol mechanics while BEE-504 covers orchestration, planning, and multi-agent topologies
- [BEE-30006](structured-output-and-constrained-decoding.md) -- Structured Output and Constrained Decoding: strict mode and guided decoding for tool arguments use the same constrained decoding infrastructure as structured JSON output
- [BEE-30008](llm-security-and-prompt-injection.md) -- LLM Security and Prompt Injection: tool parameter injection is a specific attack vector enabled by tool use; indirect prompt injection via tool results is a first-class threat
- [BEE-30016](llm-streaming-patterns.md) -- LLM Streaming Patterns: tool call arguments stream incrementally and must be accumulated before parsing; stop_reason signals are the same in streaming and batch modes
- [BEE-30017](ai-memory-systems-for-long-running-agents.md) -- AI Memory Systems for Long-Running Agents: memory retrieval and storage are typically implemented as tools in a tool-use framework

## References

- [Shunyu Yao et al. ReAct: Synergizing Reasoning and Acting in Language Models — arXiv:2210.03629, ICLR 2023](https://arxiv.org/abs/2210.03629)
- [Shishir G. Patil et al. Gorilla: Large Language Model Connected with Massive APIs — Berkeley Function Calling Leaderboard, ICML 2025](https://openreview.net/forum?id=2GmDdhBdDk)
- [Berkeley Function Calling Leaderboard — gorilla.cs.berkeley.edu](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [OpenAI. Function Calling — platform.openai.com](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic. Tool Use Overview — docs.anthropic.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Anthropic. Building Effective Agents — anthropic.com](https://www.anthropic.com/research/building-effective-agents)
- [Lilian Weng. LLM Powered Autonomous Agents — lilianweng.github.io](https://lilianweng.github.io/posts/2023-06-23-agent/)
- [Martin Fowler. Function Calling Using LLMs — martinfowler.com](https://martinfowler.com/articles/function-call-LLM.html)
- [OWASP. Top 10 for Agentic Applications 2026 — genai.owasp.org](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
