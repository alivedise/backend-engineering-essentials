---
id: 30027
title: AI Workflow Orchestration
state: draft
slug: ai-workflow-orchestration
---

# [BEE-529] AI Workflow Orchestration

:::info
AI workflow orchestration turns a sequence of LLM calls into a durable, resumable process — the key engineering decisions are how to model the control flow (state machine, DAG, or event-driven graph), where to persist state so the workflow survives failures, and how to instrument each step for latency and cost accountability.
:::

## Context

A single LLM call is a function call with a retry policy. A multi-step AI workflow — one that reasons, calls tools, waits for human approval, spawns parallel sub-agents, and synthesizes results — is a distributed system. It inherits all distributed systems problems: partial failures, state recovery, exactly-once side effects, and observability across asynchronous steps.

The ReAct framework (Yao et al., arXiv:2210.03629, 2022) formalized the reasoning-action loop that most agent architectures follow: the model reasons about what to do, takes an action (tool call or sub-task), observes the result, and reasons again. This cycle is inherently stateful: each observation conditions subsequent reasoning. Naive implementations collapse this into a single blocking call; production implementations treat each step as a discrete unit of work with its own retry policy, timeout, and checkpointed output.

Two frameworks have emerged as dominant infrastructure choices. LangGraph (LangChain, 2024) models workflows as directed graphs where nodes are Python functions and edges are state transitions; it provides automatic checkpointing at each node boundary. Temporal (Maxim Fateev and Samar Abbas, originally built AWS SWF in 2012, open-sourced in 2019) provides durable execution at the process level: the entire workflow function is replayed from event history when a worker restarts, ensuring that completed activities are never re-executed. The two approaches solve different granularities of the same problem.

## Design Thinking

Three control flow shapes cover most AI workflow patterns:

**Sequential pipelines** — retrieve, augment, generate, validate — map naturally to a function chain. Each step receives the previous step's output as input. This is the simplest shape and handles most RAG workloads. The failure mode is that any step failure discards all prior work unless intermediate results are checkpointed.

**Cyclic reasoning loops** — the ReAct loop — require a graph with a conditional back-edge. The model decides after each action whether to loop (another tool call) or terminate. This cannot be expressed as a static DAG; Apache Airflow's DAG model is a poor fit for cyclic agent workflows. LangGraph's `StateGraph` with `add_conditional_edges` handles this natively.

**Parallel fan-out/fan-in** — processing multiple documents, querying multiple APIs simultaneously, running specialized sub-agents in parallel — requires a map step followed by an aggregation step. LangGraph's `Send` API dispatches work to parallel worker nodes; Temporal's `workflow.execute_activity` calls can be gathered concurrently with `asyncio.gather`.

## Best Practices

### Model the Workflow as a State Machine

**SHOULD** define the agent's state explicitly before writing any LLM calls. The state is the set of variables that must persist across steps and be available after a restart. In LangGraph, state is a typed dictionary attached to the graph:

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # add_messages reducer appends new messages rather than replacing the list
    messages: Annotated[list, add_messages]
    tool_calls_made: int
    final_answer: str | None

def reasoning_node(state: AgentState) -> dict:
    """Call the LLM and return the next message."""
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def tool_node(state: AgentState) -> dict:
    """Execute the tool call from the last message."""
    last_message = state["messages"][-1]
    result = execute_tool(last_message.tool_calls[0])
    return {
        "messages": [result],
        "tool_calls_made": state["tool_calls_made"] + 1,
    }

def should_continue(state: AgentState) -> str:
    """Conditional edge: loop or finish."""
    last = state["messages"][-1]
    if last.tool_calls and state["tool_calls_made"] < 10:
        return "call_tool"
    return "finish"

builder = StateGraph(AgentState)
builder.add_node("reason", reasoning_node)
builder.add_node("act", tool_node)
builder.add_edge(START, "reason")
builder.add_conditional_edges("reason", should_continue, {"call_tool": "act", "finish": END})
builder.add_edge("act", "reason")  # Back-edge: the cyclic ReAct loop
```

**MUST** enforce a maximum iteration limit in the conditional edge function. Without it, a model that repeatedly invokes tools without converging runs indefinitely at linearly increasing cost.

### Persist State at Every Step

**MUST** attach a checkpointer to the compiled graph in any environment where the process can be interrupted (which is all production environments). LangGraph checkpointers serialize the full state after every node execution:

```python
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg

# One-time setup: creates the checkpoint tables in the database
DB_URI = "postgresql://user:pass@host:5432/dbname"
with psycopg.connect(DB_URI) as conn:
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()

# Compile with persistent checkpointer
graph = builder.compile(checkpointer=checkpointer)

# Each invocation uses a thread_id to namespace its checkpoints
config = {"configurable": {"thread_id": "user-session-abc123"}}

# First call — starts from scratch
result = graph.invoke({"messages": [("user", "Analyze this contract")]}, config)

# If the process crashes and restarts, this call resumes from the last checkpoint
result = graph.invoke({"messages": []}, config)  # Empty input; state loaded from DB
```

**SHOULD** use `MemorySaver` only in development and testing. `SqliteSaver` works for single-instance deployments; `PostgresSaver` is the production-grade choice for applications that run multiple workers or require durable cross-session state.

### Implement Human-in-the-Loop Interrupts

**SHOULD** pause the workflow before any irreversible side effect — sending an email, executing a database mutation, making a payment — and collect human approval before proceeding. LangGraph's `interrupt()` suspends graph execution and persists state:

```python
from langgraph.types import interrupt, Command

def action_node(state: AgentState) -> dict:
    proposed = build_action(state)

    # Pause here: return proposed action to the caller
    human_response = interrupt({
        "proposed_action": proposed,
        "agent_reasoning": state["messages"][-1].content,
    })

    if human_response["approved"]:
        execute_action(proposed)
        return {"messages": [("tool", f"Action executed: {proposed}")]}
    else:
        return {"messages": [("tool", "Action rejected by reviewer")]}

# In the calling application: resume with the reviewer's decision
graph.invoke(
    Command(resume={"approved": True}),
    config={"configurable": {"thread_id": "session-abc123"}},
)
```

**MUST NOT** implement irreversible actions in nodes that do not interrupt for approval or that do not have a compensating transaction. The same `thread_id` config that enables checkpointing also enables resuming from the exact point of interruption.

### Use Temporal for Long-Running, Multi-Day Workflows

For workflows that span hours or days, involve non-Python services, or require guaranteed exactly-once semantics for side effects, LangGraph's in-process checkpointing is insufficient. Temporal provides durability at the infrastructure level:

```python
import asyncio
from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker
from datetime import timedelta

@activity.defn
async def call_llm(prompt: str) -> str:
    """LLM call as a Temporal activity. Automatic retry on transient errors."""
    return await llm_client.generate(prompt)

@activity.defn
async def send_report(content: str, recipient: str) -> None:
    """Side effect: exactly-once because Temporal tracks activity completion."""
    await email_client.send(recipient, content)

@workflow.defn
class ResearchWorkflow:
    @workflow.run
    async def run(self, topic: str) -> str:
        # Each execute_activity call is persisted; on replay, completed activities
        # return their cached result without re-executing.
        plan = await workflow.execute_activity(
            call_llm,
            f"Create a research plan for: {topic}",
            start_to_close_timeout=timedelta(minutes=2),
        )

        # Fan-out: parallel sub-tasks
        results = await asyncio.gather(*[
            workflow.execute_activity(
                call_llm,
                f"Research subtopic: {subtopic}",
                start_to_close_timeout=timedelta(minutes=5),
            )
            for subtopic in parse_plan(plan)
        ])

        # Synthesize
        final = await workflow.execute_activity(
            call_llm,
            f"Synthesize: {results}",
            start_to_close_timeout=timedelta(minutes=2),
        )

        # Exactly-once side effect: Temporal ensures this runs exactly once
        await workflow.execute_activity(
            send_report,
            args=[final, "team@example.com"],
            start_to_close_timeout=timedelta(minutes=1),
        )
        return final
```

**SHOULD** model every LLM API call and every external side effect as a Temporal activity, not inline in the workflow function. Workflow functions in Temporal must be deterministic and are replayed on restart; any non-deterministic operation (HTTP call, random number, current time) belongs in an activity.

### Instrument Every Step

**MUST** emit a trace span for each node or activity execution, including: step name, duration, input token count, output token count, model name, and any error. A single trace ID that spans the full workflow invocation enables reconstructing cost and latency breakdowns per user session.

**SHOULD** use OpenTelemetry (BEE-475) as the tracing substrate, with LLM-specific attributes following the OpenTelemetry GenAI semantic conventions:

```python
from opentelemetry import trace

tracer = trace.get_tracer("ai-workflow")

def instrumented_llm_node(state: AgentState) -> dict:
    with tracer.start_as_current_span("llm.reasoning") as span:
        span.set_attribute("llm.model", "claude-sonnet-4-6")
        span.set_attribute("workflow.step", "reasoning")
        span.set_attribute("workflow.iteration", state["tool_calls_made"])

        response = llm.invoke(state["messages"])

        span.set_attribute("llm.input_tokens", response.usage_metadata["input_tokens"])
        span.set_attribute("llm.output_tokens", response.usage_metadata["output_tokens"])
        return {"messages": [response]}
```

## Visual

```mermaid
stateDiagram-v2
    [*] --> Reasoning
    Reasoning --> ToolCall : model requests tool
    Reasoning --> HumanApproval : irreversible action
    Reasoning --> Done : final answer reached\nor max iterations

    ToolCall --> Reasoning : observation received
    ToolCall --> Error : tool fails

    HumanApproval --> Reasoning : approved
    HumanApproval --> Reasoning : rejected (with feedback)

    Error --> Reasoning : retryable (< max retries)
    Error --> Done : non-retryable

    Done --> [*]

    note right of Reasoning
        State persisted at\nevery node boundary
    end note

    note right of HumanApproval
        interrupt() suspends\ngraph; resume with\nCommand(resume=...)
    end note
```

## Choosing an Orchestration Layer

| Criterion | LangGraph | Temporal | Prefect | Airflow |
|---|---|---|---|---|
| Cyclic reasoning loops | Native (conditional back-edges) | Supported (while loops) | Manual | Awkward (DAG-only) |
| Checkpoint granularity | Per graph node | Per activity | Per task | Per task |
| Durability scope | In-process + DB | Cross-process, cross-host | In-process + DB | DB-backed |
| Workflow duration | Minutes to hours | Minutes to months | Minutes to hours | Minutes to days |
| Human-in-the-loop | `interrupt()` built-in | Signals/Updates | Manual | Manual |
| Ops complexity | Low | High (Temporal cluster) | Medium | High |
| Best for | LLM-native cyclic agents | Long-running, multi-system | ML pipelines | Data pipelines |

## Related BEEs

- [BEE-30002](ai-agent-architecture-patterns.md) -- AI Agent Architecture Patterns: establishes the architectural principles (single-agent, multi-agent, supervisor) that this article implements at the orchestration layer
- [BEE-30022](human-in-the-loop-ai-patterns.md) -- Human-in-the-Loop AI Patterns: the review queue and SLA enforcement that backs the interrupt/resume pattern described here
- [BEE-19056](../distributed-systems/opentelemetry-instrumentation.md) -- OpenTelemetry Instrumentation: the tracing substrate for per-step observability across workflow nodes
- [BEE-12002](../resilience/retry-strategies-and-exponential-backoff.md) -- Retry Strategies and Exponential Backoff: the retry policies applied to individual LLM activity calls within a workflow

## References

- [Yao et al. ReAct: Synergizing Reasoning and Acting in Language Models — arXiv:2210.03629, ICLR 2023](https://arxiv.org/abs/2210.03629)
- [LangGraph Documentation — langchain.com](https://www.langchain.com/langgraph)
- [LangGraph Persistence and Checkpointers — docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph Interrupts — docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [Temporal. Durable Execution for AI Agents — temporal.io](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai)
- [Temporal. Python SDK — docs.temporal.io](https://docs.temporal.io/develop/python/)
- [Temporal. Retry Policies — docs.temporal.io](https://docs.temporal.io/encyclopedia/retry-policies)
- [Temporal. Multi-Agent Architectures — temporal.io](https://temporal.io/blog/using-multi-agent-architectures-with-temporal)
