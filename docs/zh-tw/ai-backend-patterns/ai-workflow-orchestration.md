---
id: 30027
title: AI 工作流協作編排
state: draft
slug: ai-workflow-orchestration
---

# [BEE-529] AI 工作流協作編排

:::info
AI 工作流編排將一連串 LLM 呼叫轉化為持久且可恢復的流程——關鍵的工程決策是如何建模控制流（狀態機、DAG 或事件驅動圖）、在哪裡持久化狀態以使工作流能從失敗中恢復，以及如何對每個步驟進行延遲和成本問責的儀器化。
:::

## 背景

單個 LLM 呼叫是帶有重試策略的函數呼叫。多步驟 AI 工作流——一個推理、呼叫工具、等待人工核准、生成並行子代理，並綜合結果的工作流——是一個分散式系統。它繼承了所有分散式系統問題：部分失敗、狀態恢復、精確一次的副作用，以及跨非同步步驟的可觀察性。

ReAct 框架（Yao 等人，arXiv:2210.03629，2022）形式化了大多數代理架構遵循的推理-行動循環：模型推理要做什麼，採取行動（工具呼叫或子任務），觀察結果，然後再次推理。這個循環本質上是有狀態的：每次觀察都以條件方式影響後續推理。原始實現將這壓縮為單一阻塞呼叫；生產實現將每個步驟視為具有自己重試策略、超時和已檢查點輸出的離散工作單元。

兩個框架已成為主流基礎設施選擇。LangGraph（LangChain，2024 年）將工作流建模為有向圖，其中節點是 Python 函數，邊是狀態轉換；它在每個節點邊界提供自動檢查點。Temporal（Maxim Fateev 和 Samar Abbas，最初於 2012 年構建 AWS SWF，2019 年開源）在流程層面提供持久執行：當工作進程重新啟動時，整個工作流函數從事件歷史中重播，確保已完成的活動永遠不會重新執行。這兩種方法解決了相同問題的不同粒度。

## 設計思維

三種控制流形式涵蓋了大多數 AI 工作流模式：

**順序管道**——檢索、增強、生成、驗證——自然地映射到函數鏈。每個步驟將前一個步驟的輸出作為輸入接收。這是最簡單的形式，可以處理大多數 RAG 工作負載。失敗模式是，除非對中間結果進行檢查點，否則任何步驟失敗都會丟棄所有先前的工作。

**循環推理循環**——ReAct 循環——需要帶有條件回邊的圖。模型在每次行動後決定是否循環（另一個工具呼叫）或終止。這無法表示為靜態 DAG；Apache Airflow 的 DAG 模型不適合循環代理工作流。LangGraph 的 `StateGraph` 與 `add_conditional_edges` 原生處理這一點。

**並行扇出/扇入**——並行處理多個文件、同時查詢多個 API、並行運行專業子代理——需要映射步驟後跟聚合步驟。LangGraph 的 `Send` API 將工作分配給並行工作者節點；Temporal 的 `workflow.execute_activity` 呼叫可以使用 `asyncio.gather` 並發收集。

## 最佳實踐

### 將工作流建模為狀態機

**SHOULD**（應該）在編寫任何 LLM 呼叫之前明確定義代理的狀態。狀態是必須跨步驟持久化並在重啟後可用的變量集。在 LangGraph 中，狀態是附加到圖的型別字典：

```python
from typing import Annotated, TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # add_messages 歸納器追加新訊息而非替換列表
    messages: Annotated[list, add_messages]
    tool_calls_made: int
    final_answer: str | None

def reasoning_node(state: AgentState) -> dict:
    """呼叫 LLM 並返回下一條訊息。"""
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def tool_node(state: AgentState) -> dict:
    """執行最後一條訊息中的工具呼叫。"""
    last_message = state["messages"][-1]
    result = execute_tool(last_message.tool_calls[0])
    return {
        "messages": [result],
        "tool_calls_made": state["tool_calls_made"] + 1,
    }

def should_continue(state: AgentState) -> str:
    """條件邊：循環或結束。"""
    last = state["messages"][-1]
    if last.tool_calls and state["tool_calls_made"] < 10:
        return "call_tool"
    return "finish"

builder = StateGraph(AgentState)
builder.add_node("reason", reasoning_node)
builder.add_node("act", tool_node)
builder.add_edge(START, "reason")
builder.add_conditional_edges("reason", should_continue, {"call_tool": "act", "finish": END})
builder.add_edge("act", "reason")  # 回邊：循環 ReAct 循環
```

**MUST**（必須）在條件邊函數中強制執行最大迭代限制。沒有它，一個反覆呼叫工具而沒有收斂的模型會以線性增加的成本無限期運行。

### 在每個步驟持久化狀態

**MUST** 在任何可能被中斷的環境（即所有生產環境）中，將檢查點附加到已編譯的圖。LangGraph 檢查點在每次節點執行後序列化完整狀態：

```python
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg

# 一次性設置：在資料庫中建立檢查點表
DB_URI = "postgresql://user:pass@host:5432/dbname"
with psycopg.connect(DB_URI) as conn:
    checkpointer = PostgresSaver(conn)
    checkpointer.setup()

# 使用持久檢查點編譯
graph = builder.compile(checkpointer=checkpointer)

# 每次呼叫使用 thread_id 來命名其檢查點
config = {"configurable": {"thread_id": "user-session-abc123"}}

# 第一次呼叫——從頭開始
result = graph.invoke({"messages": [("user", "分析這份合約")]}, config)

# 如果流程崩潰並重新啟動，此呼叫從最後一個檢查點恢復
result = graph.invoke({"messages": []}, config)  # 空輸入；從資料庫載入狀態
```

**SHOULD** 只在開發和測試中使用 `MemorySaver`。`SqliteSaver` 適用於單實例部署；`PostgresSaver` 是運行多個工作進程或需要持久跨會話狀態的應用程式的生產級選擇。

### 實作人工介入中斷

**SHOULD** 在任何不可逆副作用之前暫停工作流——發送電子郵件、執行資料庫變更、進行付款——並在繼續之前收集人工核准。LangGraph 的 `interrupt()` 暫停圖執行並持久化狀態：

```python
from langgraph.types import interrupt, Command

def action_node(state: AgentState) -> dict:
    proposed = build_action(state)

    # 在此暫停：將提議的行動返回給呼叫者
    human_response = interrupt({
        "proposed_action": proposed,
        "agent_reasoning": state["messages"][-1].content,
    })

    if human_response["approved"]:
        execute_action(proposed)
        return {"messages": [("tool", f"行動已執行：{proposed}")]}
    else:
        return {"messages": [("tool", "行動被審核員拒絕")]}

# 在呼叫應用程式中：使用審核員的決定恢復
graph.invoke(
    Command(resume={"approved": True}),
    config={"configurable": {"thread_id": "session-abc123"}},
)
```

**MUST NOT** 在沒有中斷進行核准或沒有補償交易的節點中實作不可逆行動。啟用檢查點的相同 `thread_id` 配置也啟用了從中斷點恢復。

### 對長期運行的多天工作流使用 Temporal

對於跨越小時或天數、涉及非 Python 服務或需要副作用保證精確一次語意的工作流，LangGraph 的進程內檢查點是不夠的。Temporal 在基礎設施層面提供持久性：

```python
import asyncio
from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker
from datetime import timedelta

@activity.defn
async def call_llm(prompt: str) -> str:
    """LLM 呼叫作為 Temporal 活動。在暫時性錯誤上自動重試。"""
    return await llm_client.generate(prompt)

@activity.defn
async def send_report(content: str, recipient: str) -> None:
    """副作用：因為 Temporal 追蹤活動完成，所以精確一次。"""
    await email_client.send(recipient, content)

@workflow.defn
class ResearchWorkflow:
    @workflow.run
    async def run(self, topic: str) -> str:
        # 每個 execute_activity 呼叫都被持久化；在重播時，已完成的活動
        # 返回其快取結果而不重新執行。
        plan = await workflow.execute_activity(
            call_llm,
            f"為以下主題建立研究計劃：{topic}",
            start_to_close_timeout=timedelta(minutes=2),
        )

        # 扇出：並行子任務
        results = await asyncio.gather(*[
            workflow.execute_activity(
                call_llm,
                f"研究子主題：{subtopic}",
                start_to_close_timeout=timedelta(minutes=5),
            )
            for subtopic in parse_plan(plan)
        ])

        # 綜合
        final = await workflow.execute_activity(
            call_llm,
            f"綜合：{results}",
            start_to_close_timeout=timedelta(minutes=2),
        )

        # 精確一次副作用：Temporal 確保這只運行一次
        await workflow.execute_activity(
            send_report,
            args=[final, "team@example.com"],
            start_to_close_timeout=timedelta(minutes=1),
        )
        return final
```

**SHOULD** 將每個 LLM API 呼叫和每個外部副作用建模為 Temporal 活動，而非在工作流函數中內聯。Temporal 中的工作流函數必須是確定性的，並在重啟時重播；任何非確定性操作（HTTP 呼叫、隨機數、當前時間）都屬於活動。

### 對每個步驟進行儀器化

**MUST** 為每個節點或活動執行發出追蹤跨度，包括：步驟名稱、持續時間、輸入 Token 計數、輸出 Token 計數、模型名稱以及任何錯誤。跨越整個工作流呼叫的單個追蹤 ID 能夠重建每個使用者會話的成本和延遲分解。

**SHOULD** 使用 OpenTelemetry（BEE-475）作為追蹤基底，LLM 特定屬性遵循 OpenTelemetry GenAI 語意慣例：

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

## 視覺圖

```mermaid
stateDiagram-v2
    [*] --> Reasoning
    Reasoning --> ToolCall : 模型請求工具
    Reasoning --> HumanApproval : 不可逆行動
    Reasoning --> Done : 已達到最終答案\n或最大迭代次數

    ToolCall --> Reasoning : 收到觀察結果
    ToolCall --> Error : 工具失敗

    HumanApproval --> Reasoning : 已核准
    HumanApproval --> Reasoning : 已拒絕（附反饋）

    Error --> Reasoning : 可重試（< 最大重試次數）
    Error --> Done : 不可重試

    Done --> [*]

    note right of Reasoning
        狀態在每個\n節點邊界持久化
    end note

    note right of HumanApproval
        interrupt() 暫停圖；\n使用 Command(resume=...)\n恢復
    end note
```

## 選擇編排層

| 標準 | LangGraph | Temporal | Prefect | Airflow |
|-----|----------|---------|---------|---------|
| 循環推理循環 | 原生（條件回邊） | 支援（while 循環） | 手動 | 困難（僅 DAG） |
| 檢查點粒度 | 每個圖節點 | 每個活動 | 每個任務 | 每個任務 |
| 持久性範圍 | 進程內 + 資料庫 | 跨進程、跨主機 | 進程內 + 資料庫 | 資料庫支援 |
| 工作流持續時間 | 分鐘到小時 | 分鐘到數月 | 分鐘到小時 | 分鐘到天 |
| 人工介入 | 內建 `interrupt()` | 信號/更新 | 手動 | 手動 |
| 運維複雜性 | 低 | 高（Temporal 叢集） | 中 | 高 |
| 最適合 | LLM 原生循環代理 | 長期、多系統 | ML 管道 | 資料管道 |

## 相關 BEE

- [BEE-30002](ai-agent-architecture-patterns.md) -- AI 代理架構模式：確立了此文章在編排層實作的架構原則（單代理、多代理、監督者）
- [BEE-30022](human-in-the-loop-ai-patterns.md) -- 人工介入 AI 模式：支援此處描述的中斷/恢復模式的審核佇列和 SLA 執行
- [BEE-19056](../distributed-systems/opentelemetry-instrumentation.md) -- OpenTelemetry 儀器化：工作流節點跨步驟可觀察性的追蹤基底
- [BEE-12002](../resilience/retry-strategies-and-exponential-backoff.md) -- 重試策略與指數退避：應用於工作流中單個 LLM 活動呼叫的重試策略

## 參考資料

- [Yao et al. ReAct：在語言模型中協同推理和行動 — arXiv:2210.03629, ICLR 2023](https://arxiv.org/abs/2210.03629)
- [LangGraph 文件 — langchain.com](https://www.langchain.com/langgraph)
- [LangGraph 持久性和檢查點 — docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph 中斷 — docs.langchain.com](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [Temporal. AI 代理的持久執行 — temporal.io](https://temporal.io/blog/durable-execution-meets-ai-why-temporal-is-the-perfect-foundation-for-ai)
- [Temporal. Python SDK — docs.temporal.io](https://docs.temporal.io/develop/python/)
- [Temporal. 重試策略 — docs.temporal.io](https://docs.temporal.io/encyclopedia/retry-policies)
- [Temporal. 多代理架構 — temporal.io](https://temporal.io/blog/using-multi-agent-architectures-with-temporal)
