---
id: 30018
title: LLM 工具使用與函式呼叫模式
state: draft
slug: llm-tool-use-and-function-calling-patterns
---

# [BEE-520] LLM 工具使用與函式呼叫模式

:::info
工具使用將 LLM 從文字生成器轉變為能夠對現實世界採取行動的代理。理解協定機制——工具呼叫如何編碼、結果如何回傳、錯誤如何處理，以及平行執行如何運作——是在任何供應商 API 之上構建可靠 AI 功能的前提。
:::

## 背景

LLM 是無狀態的文字預測器。它們無法查詢資料庫、呼叫 API、檢查當前時間，或執行任何需要 I/O 的動作。工具使用協定通過定義結構化的輪流對話合約來解決這個問題：模型以結構化呼叫的形式發出期望的動作訊號，主機執行它，結果作為另一條訊息返回。模型接著對結果進行推理，然後呼叫更多工具或產生最終答案。

這個模式由 Yao 等人（arXiv:2210.03629，ICLR 2023）以 ReAct（推理 + 行動）框架引入，顯示將推理軌跡與具體行動交錯，通過在真實世界反饋中錨定推理（而非純語言延續），優於單獨的思維鏈方式。

該協定此後已在 API 層面標準化。OpenAI 於 2023 年引入函式呼叫，並不斷迭代至通過受約束解碼保證模式合規的 `strict` 模式。Anthropic 推出了並行的 `tool_use` 內容區塊系統，原生支援串流工具呼叫。Berkeley 函式呼叫排行榜（BFCL）現已在兩千個真實世界函式簽名上對一百多個模型進行基準測試，涵蓋序列、平行和多輪場景。

## 設計思維

工具使用引入了一類純文字生成所沒有的新故障模式：

**模式合規失敗**：模型輸出帶有無效參數的工具呼叫——類型錯誤、缺少必填欄位、超出列舉集的值。受約束解碼在輸出層消除了這個問題；當受約束解碼不可用時，模式驗證在執行前捕獲它。

**工具選擇失敗**：模型呼叫了錯誤的工具、在應該呼叫時沒有呼叫，或不必要地呼叫工具。這些是提示工程和模式設計問題——工具描述的品質決定了選擇準確性，在大多數情況下比模型大小更重要。

**執行失敗**：工具運行但返回錯誤。模型必須決定是否重試、回退到其他工具，或呈現降級回應。通過工具結果的錯誤傳播是首要關注點。

**安全失敗**：從用戶控制的內容中衍生的工具參數可以重定向代理行為。參數驗證必須在執行層發生，而非在提示中。

## 最佳實踐

### 為精確性構建工具模式

**MUST**（必須）在工具層級和每個參數上定義 `description`。模型在推理時讀取描述來決定呼叫哪個工具以及如何填充參數：

```python
# OpenAI / Anthropic 共享模式結構
search_tool = {
    "name": "search_documents",
    "description": (
        "在知識庫中搜索與查詢相關的文件。"
        "當用戶提出可能由內部文件回答的事實性問題時使用此工具。"
        "不要用於實時資料。"
    ),
    "input_schema": {          # Anthropic 用法；OpenAI 使用 "parameters"
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "自然語言的搜索查詢，5-100 個詞。"
            },
            "max_results": {
                "type": "integer",
                "description": "返回的結果數量。預設 5，最大 20。",
                "default": 5
            },
            "date_filter": {
                "type": "string",
                "enum": ["last_7_days", "last_30_days", "last_year", "all_time"],
                "description": "將結果限制在此時間窗口內發布的文件。"
            }
        },
        "required": ["query"]
    }
}
```

**MUST** 對具有固定值集的參數使用列舉。`date_filter` 上的列舉可防止模型產生幻覺值如 `"last_week"` 或 `"recent"`。

**SHOULD**（應該）保持模式扁平。深度嵌套的物件會增加解析表面積並增加參數 Token 數量。如果需要嵌套資料，接受 JSON 字串並在工具實現中解析它，而非在模式中編碼嵌套。

**SHOULD** 在可用時啟用嚴格模式（OpenAI）。嚴格模式使用受約束解碼來保證每個生成的參數都符合模式——無額外屬性、正確類型、必填欄位存在：

```python
client.chat.completions.create(
    model="gpt-4o",
    tools=[{
        "type": "function",
        "function": {
            **tool_definition,
            "strict": True,  # 通過受約束解碼保證模式合規
        }
    }],
    messages=messages,
)
```

### 盡可能平行執行工具呼叫

**SHOULD** 當模型在單個回應中返回多個工具呼叫時，平行執行獨立的工具呼叫。獨立呼叫的序列執行會不必要地乘以延遲：

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
            "content": f"錯誤：{e}",
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
        return response  # 最終答案

    tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

    # 並發執行所有工具呼叫
    tool_results = await asyncio.gather(
        *[run_tool(b, tool_registry) for b in tool_use_blocks]
    )

    messages.append({"role": "assistant", "content": response.content})
    messages.append({"role": "user", "content": list(tool_results)})
    return await run_agent_turn(messages, tools, tool_registry)  # 下一輪
```

**SHOULD** 在平行化之前檢查依賴順序。如果工具 B 需要工具 A 的輸出，則序列執行。如果代理計劃事先已知，建立簡單的依賴圖。

**MUST NOT**（不得）在沒有並發限制器的情況下向有速率限制的外部 API 發出並發呼叫。對同一第三方 API 的四個同時呼叫可能觸發每秒速率限制並全部失敗。使用 `asyncio.Semaphore` 限制並發：

```python
semaphore = asyncio.Semaphore(2)  # 最多 2 個並發外部呼叫

async def rate_limited_tool(tool_block, tool_registry):
    async with semaphore:
        return await run_tool(tool_block, tool_registry)
```

### 明確分類和處理工具錯誤

**MUST** 在工具結果中返回結構化錯誤資訊，而非拋出中止代理循環的異常。模型可以對錯誤進行推理並選擇替代方案：

```python
async def safe_tool_executor(tool_block, tool_registry):
    if tool_block.name not in tool_registry:
        return {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": f"未知工具：{tool_block.name}。可用工具：{list(tool_registry)}",
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
            "content": "工具在 30 秒後超時。",
            "is_error": True,
        }
    except ValueError as e:
        # 客戶端錯誤——不重試
        return {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": f"無效參數：{e}",
            "is_error": True,
        }
    except Exception as e:
        # 暫時性錯誤——模型可以重試
        return {
            "type": "tool_result",
            "tool_use_id": tool_block.id,
            "content": f"工具失敗：{e}。您可以重試。",
            "is_error": True,
        }
```

**SHOULD** 在錯誤訊息文字中區分客戶端錯誤（參數錯誤——不重試）和暫時性錯誤（網路、超時——可重試）。模型使用此訊號來決定下一個動作。

**SHOULD** 設定最大輪次限制以防止無限重試循環：

```python
MAX_TURNS = 10

async def agent_loop(messages, tools, tool_registry):
    for _ in range(MAX_TURNS):
        response = await run_agent_turn(messages, tools, tool_registry)
        if response.stop_reason != "tool_use":
            return response
    raise RuntimeError("代理超過最大輪次限制")
```

### 執行前驗證工具參數

**MUST** 在將參數傳遞給工具實現之前驗證所有參數。工具輸入作為模型的字典到達，必須在執行邊界將其視為不可信資料：

```python
from pydantic import BaseModel, validator

class SearchInput(BaseModel):
    query: str
    max_results: int = 5
    date_filter: str = "all_time"

    @validator("query")
    def query_length(cls, v):
        if len(v) < 3:
            raise ValueError("查詢必須至少 3 個字元")
        if len(v) > 500:
            raise ValueError("查詢必須最多 500 個字元")
        return v

    @validator("max_results")
    def results_range(cls, v):
        if not 1 <= v <= 20:
            raise ValueError("max_results 必須在 1 到 20 之間")
        return v

    @validator("date_filter")
    def valid_filter(cls, v):
        allowed = {"last_7_days", "last_30_days", "last_year", "all_time"}
        if v not in allowed:
            raise ValueError(f"date_filter 必須是 {allowed} 之一")
        return v

async def search_documents(tool_input: dict) -> str:
    params = SearchInput(**tool_input)  # 輸入錯誤時拋出 ValueError
    return await _execute_search(params)
```

**MUST NOT** 在不進行清理的情況下將工具呼叫參數直接傳遞給 Shell 命令、SQL 查詢或文件路徑。工具參數注入是 SQL 注入的代理等價物——用戶控制欄位中的惡意值可以跨連接系統重定向代理行為。

### 確保狀態變更操作的工具冪等性

**MUST** 使狀態變更工具具有冪等性。代理循環可能在暫時性失敗後重試工具呼叫；非冪等工具（如"發送電子郵件"或"收取付款"）在重試時可能執行兩次動作：

```python
import hashlib

async def send_email(recipient: str, subject: str, body: str, idempotency_key: str = None) -> str:
    """發送電子郵件。idempotency_key 防止重試時重複發送。"""
    key = idempotency_key or hashlib.sha256(
        f"{recipient}:{subject}:{body}".encode()
    ).hexdigest()

    if await email_log.exists(key):
        return f"電子郵件已發送（idempotency_key={key}）"

    await _send(recipient, subject, body)
    await email_log.record(key)
    return f"電子郵件已發送至 {recipient}"
```

**SHOULD** 從動作內容（收件人 + 主題 + 正文）生成冪等性金鑰，而非從呼叫時生成的隨機 UUID。基於內容的金鑰在代理重啟後仍有效，並允許模型在崩潰後安全重試。

### 稽核每個工具呼叫

**MUST** 記錄每個工具調用，並包含足夠的上下文以重建發生了什麼以及誰觸發了它：

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
        tool_input=tool_block.input,   # 記錄實際參數，而非僅記錄名稱
        is_error=result.get("is_error", False),
        duration_ms=elapsed_ms,
    )
    return result
```

稽核日誌有兩個目的：安全取證（哪個用戶對哪個工具使用了哪些參數呼叫）和成本歸因（哪個代理運行消耗了哪些外部 API 配額）。

## 視覺圖

```mermaid
sequenceDiagram
    participant U as 用戶
    participant A as 應用程式
    participant M as LLM
    participant T as 工具執行器

    U->>A: 用戶訊息
    A->>M: 訊息 + 工具模式
    M-->>A: stop_reason="tool_use"\n[tool_use 區塊]
    A->>T: 執行工具（獨立時平行執行）
    Note over T: 驗證參數 → 執行 → 捕獲錯誤
    T-->>A: tool_result 區塊
    A->>M: 附加助手訊息 + 工具結果
    M-->>A: stop_reason="end_turn"\n最終文字回應
    A-->>U: 回應

    style U fill:#1d3557,color:#fff
    style A fill:#457b9d,color:#fff
    style M fill:#2d6a4f,color:#fff
    style T fill:#e67e22,color:#fff
```

## 相關 BEE

- [BEE-30002](ai-agent-architecture-patterns.md) -- AI 代理架構模式：工具使用是代理採取行動的機制；本 BEE 涵蓋協定機制，而 BEE-504 涵蓋協調、規劃和多代理拓撲
- [BEE-30006](structured-output-and-constrained-decoding.md) -- 結構化輸出與受約束解碼：工具參數的嚴格模式和引導解碼使用與結構化 JSON 輸出相同的受約束解碼基礎設施
- [BEE-30008](llm-security-and-prompt-injection.md) -- LLM 安全性與提示注入：工具參數注入是工具使用所啟用的特定攻擊向量；通過工具結果的間接提示注入是首要威脅
- [BEE-30016](llm-streaming-patterns.md) -- LLM 串流模式：工具呼叫參數以增量方式串流，必須在解析前積累；stop_reason 訊號在串流和批次模式中相同
- [BEE-30017](ai-memory-systems-for-long-running-agents.md) -- 長運行代理的 AI 記憶體系統：記憶體檢索和存儲通常在工具使用框架中作為工具實現

## 參考資料

- [Shunyu Yao et al. ReAct: 在語言模型中協同推理和行動 — arXiv:2210.03629, ICLR 2023](https://arxiv.org/abs/2210.03629)
- [Shishir G. Patil et al. Gorilla: 連接大量 API 的大型語言模型 — Berkeley 函式呼叫排行榜, ICML 2025](https://openreview.net/forum?id=2GmDdhBdDk)
- [Berkeley 函式呼叫排行榜 — gorilla.cs.berkeley.edu](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [OpenAI. 函式呼叫 — platform.openai.com](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic. 工具使用概述 — docs.anthropic.com](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Anthropic. 構建有效代理 — anthropic.com](https://www.anthropic.com/research/building-effective-agents)
- [Lilian Weng. LLM 驅動的自主代理 — lilianweng.github.io](https://lilianweng.github.io/posts/2023-06-23-agent/)
- [Martin Fowler. 使用 LLM 進行函式呼叫 — martinfowler.com](https://martinfowler.com/articles/function-call-LLM.html)
- [OWASP. 2026 年代理應用程式十大安全風險 — genai.owasp.org](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
