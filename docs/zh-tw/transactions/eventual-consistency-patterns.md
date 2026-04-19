---
id: 8006
title: Eventual Consistency Patterns
state: draft
slug: eventual-consistency-patterns
---

# [BEE-8006] 最終一致性模式

:::info
最終一致性並非沒有一致性，而是一個明確定義的保證：在不再有新更新的情況下，所有副本最終會收斂到相同的狀態。理解一致性頻譜、衝突解決策略與 CRDT 資料結構，能讓你設計出正確且高可用的系統。
:::

## 背景

分散式系統將資料複製到多個節點以實現容錯與低延遲。一旦存在超過一個副本，就必須面對一個根本問題：你要如何保證每個副本在每個時刻都顯示相同的值？

強一致性的答案是「隨時」——代價是協調開銷和可用性的降低。最終一致性的答案是「最終」——接受暫時性的差異，換取更高的可用性與更低的寫入延遲。這個取捨並非理論上的。Amazon CTO Werner Vogels 在其 2008 年的論文中將其形式化：*Eventually Consistent*（[ACM Queue](https://queue.acm.org/detail.cfm?id=1466448)、[All Things Distributed](https://www.allthingsdistributed.com/2008/12/eventually_consistent.html)）。Amazon DynamoDB、Cassandra、Riak 和 CouchDB 都以這些概念為基礎。

核心洞察——在 Martin Kleppmann 的 *Designing Data-Intensive Applications*（[O'Reilly](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/)）中有深入探討——是「最終一致性」並非單一模型，而是橫跨一個頻譜的模型家族，每種模型有不同的保證與取捨。

## 原則

**設計以收斂為目標，而非完美同步。選擇應用程式能容忍的最弱一致性模型，明確實作衝突解決策略，且永遠不要假設陳舊的讀取不會到達終端使用者。**

## 一致性頻譜

一致性模型從最強（協調成本最高、可用性最低）到最弱（協調成本最低、可用性最高）排列：

```mermaid
graph LR
    A["強一致性<br/>(Linearizable)"]
    B["循序一致性<br/>Sequential"]
    C["因果一致性<br/>Causal"]
    D["讀自己的寫入 /<br/>單調讀取"]
    E["最終一致性<br/>Eventual"]

    A -->|更高延遲<br/>更低可用性| B
    B -->|更高延遲<br/>更低可用性| C
    C -->|更高延遲<br/>更低可用性| D
    D -->|更高延遲<br/>更低可用性| E

    style A fill:#d9534f,color:#fff
    style B fill:#e07b39,color:#fff
    style C fill:#f0ad4e,color:#000
    style D fill:#5bc0de,color:#000
    style E fill:#5cb85c,color:#fff
```

| 模型 | 保證 | 典型使用場景 |
|---|---|---|
| Linearizable | 每次讀取都能看到最新寫入；操作看起來是瞬間完成的 | 銀行餘額、Leader 選舉、分散式鎖 |
| Sequential Consistency | 所有節點以相同順序看到操作，但不一定是即時的 | 共享記憶體模型、部分佇列 |
| Causal Consistency | 有因果關係的寫入對所有節點而言都依序可見 | 協作編輯、留言串 |
| Read-Your-Writes | 客戶端永遠能看到自己的寫入 | 使用者資料更新、Session 資料 |
| Monotonic Reads | 客戶端一旦看到某個值，就不會再看到更舊的值 | 分頁、活動動態 |
| Eventual Consistency | 在沒有新寫入的情況下副本會收斂（無順序保證） | DNS、購物車、計數器、快取 |

向左移動會增加協調成本並降低分區時的可用性。向右移動會降低延遲並提高韌性，但需要應用程式自行處理差異。

## 「最終」實際保證了什麼

最終一致性有一個硬性保證：**如果沒有新的更新寫入某個資料項目，所有副本最終都會返回最後一次更新的值。** 它並未說明：

- 收斂需要多長時間（「一致性視窗」）
- 讀取者在差異期間會看到什麼值
- 當發生並行寫入衝突時哪個寫入勝出

這意味著你的應用程式程式碼必須負責處理那些在強一致性下會自動處理的情況。

## 衝突解決策略

當兩個副本接受了對同一個鍵的並行寫入時，必須進行協調。主要有三種方式：

### 最後寫入勝出（Last-Writer-Wins, LWW）

每次寫入都帶有時間戳記。合併時，時間戳記較大的寫入存活，另一個被捨棄。

```
節點 A 收到: { cart: ["shoes"] }    @ t=100
節點 B 收到: { cart: ["jacket"] }   @ t=101

同步結果: { cart: ["jacket"] }   ← "shoes" 永久遺失
```

LWW 簡單且廣泛使用（Cassandra 預設採用）。代價是**靜默的資料遺失**：失敗的寫入消失時不會有任何錯誤被拋出。這在最後一次寫入確實代表使用者意圖時是可接受的（例如更新顯示名稱），但在寫入是累加性的情況下則無法接受（例如將商品加入購物車）。

### 應用層合併

資料庫儲存所有並行版本（Riak 的 siblings、CouchDB 的 conflicts）。應用程式讀取所有版本，並依照領域邏輯合併。

```
版本 A: { cart: ["shoes"] }
版本 B: { cart: ["jacket"] }

應用層合併: { cart: ["shoes", "jacket"] }  ← 領域特定的聯集
```

這保留了所有寫入，但將複雜度推到應用程式。應用程式必須在每次讀取時處理可能存在多個衝突版本的情況。

### CRDT（無衝突複製資料型別）

CRDT 是在數學上設計為並行更新總是能確定性地合併而不產生衝突的資料結構。寫入時不需要協調；合併從設計上就保證是正確的。

Martin Kleppmann 的 CRDT 研究（[crdt.tech](https://crdt.tech/resources)、[CRDTs: The Hard Parts](https://martin.kleppmann.com/2020/07/06/crdt-hard-parts-hydra.html)）描述了三種基礎類型：

| CRDT 類型 | 說明 | 範例 |
|---|---|---|
| G-Counter | 只增計數器；每個副本遞增自己的槽位 | 瀏覽次數、按讚數 |
| G-Set | 只增集合；元素只能新增不能刪除 | 標籤、權限 |
| LWW-Register | 採用 LWW 語義的單一值（明確選擇） | 最後已知位置 |
| OR-Set | 支援新增和刪除並具有因果追蹤的集合 | 購物車 |
| PN-Counter | 正負計數器；支援遞增與遞減 | 庫存差量 |

關鍵屬性：CRDT 的合併函數是**交換律（commutative）、結合律（associative）且冪等（idempotent）** 的。這意味著以任何順序、任意次數合併副本，都能產生相同的結果。

## 購物車範例：LWW vs. CRDT

使用者有兩個裝置。他們在手機上加入了「shoes」，在筆電上加入了「jacket」，兩個裝置稍後同步。

**使用 Last-Writer-Wins：**

```
手機  @ t=100:  PUT cart = ["shoes"]
筆電  @ t=101:  PUT cart = ["jacket"]

同步結果: cart = ["jacket"]   ← shoes 遺失
```

手機的寫入發生在 t=100，筆電的在 t=101。LWW 完全捨棄了較早的寫入。使用者只看到「jacket」，永遠不明白為什麼「shoes」消失了。

**使用 G-Set CRDT：**

```
手機  新增 "shoes":   state_A = { "shoes" }
筆電  新增 "jacket":  state_B = { "jacket" }

Merge(state_A, state_B) = union({ "shoes" }, { "jacket" })
                        = { "shoes", "jacket" }   ← 兩個商品都保留
```

因為集合聯集具有交換律和結合律，無論哪個副本發起同步，合併結果都相同。不需要協調者、不需要比較時間戳記、沒有資料遺失。

對於需要支援刪除的真實購物車，可使用 OR-Set，它會為每次新增操作標記唯一識別碼，並使用因果追蹤來正確處理同一商品的並行新增和刪除。

## Session 層級一致性保證

即使底層儲存是最終一致性的，你也可以為使用者提供更強的 Per-Session 保證：

**讀自己的寫入（Read-Your-Writes）：** 客戶端寫入一個值後，後續來自同一客戶端的讀取永遠返回被寫入的值或更新的值。實作方式：將客戶端的讀取路由到接受其寫入的副本，或在請求中包含版本向量。

**單調讀取（Monotonic Reads）：** 一旦客戶端看到版本 V 的值，就不再看到版本 < V 的值。實作方式：副本的 Sticky Session，或在請求標頭中進行客戶端版本追蹤。

**因果一致性（Causal Consistency）：** 如果寫入 B 在因果上由觀察到寫入 A 所引起，則任何投遞 B 的副本必定已先投遞 A。實作方式：向量時鐘或隨每個請求傳播的邏輯時間戳記。

這些 Session 保證可以疊加在最終一致性的儲存之上，不需要全局協調。

## 為最終一致性設計應用程式

### 盡可能使用無衝突操作

優先選擇本質上具有交換律的操作：遞增、聯集、追加到日誌。避免跨副本的讀取-修改-寫入（read-modify-write）操作，因為並行的 RMW 循環是衝突的主要來源。

### 實作樂觀 UI

在面向使用者的應用程式中，在伺服器確認寫入之前先在本地（樂觀地）套用變更。如果伺服器返回衝突，則協調並刷新。這消除了等待跨副本一致性的感知延遲，同時保持 UI 的正確性。

### 傳達一致性視窗

寫入提交後到該寫入對所有副本可見之間的時間差稱為**一致性視窗**。監控複製延遲（參見 [BEE-6003](../data-storage/replication-strategies.md)）。如果視窗超過你的 SLA 則發出警報。在可觀測性儀表板中公開複製延遲。

### 用讀自己的寫入保護面向使用者的狀態

使用者期望立即看到自己的操作。對於使用者明確發起的任何操作（發表留言、更新個人資料、下訂單），始終提供讀自己的寫入一致性。從本地副本或強一致性路徑提供使用者自己的寫入。

### 記錄你的衝突解決策略

在資料模型文件中明確說明：「當兩個客戶端並行寫入這個欄位時會發生什麼？」如果答案是 LWW，記錄哪個欄位攜帶時間戳記，並承認並行更新將丟失較早的寫入。

## 常見錯誤

**1. 將最終一致性視為「沒有一致性」**

最終一致性有真實的保證：收斂。它並不意味著任意資料都可能出現。正確實作最終一致性的系統會收斂。僅僅是有缺陷的系統不會。要區分這兩者。

**2. 使用 LWW 卻不理解資料遺失的風險**

LWW 會靜默地捨棄失敗的寫入。對於某些使用場景這是可接受的（使用者意圖是替換的單值欄位），對於其他場景則是災難性的（累加操作、財務記錄）。始終審查你的 LWW 用法並問：「在這裡丟失較早的寫入是正確的嗎？」

**3. 沒有為面向使用者的功能提供讀自己的寫入**

使用者提交表單，被重定向到列表頁面，卻看不到自己新增的記錄。這就是一致性視窗在發揮作用。這是最終一致性系統中最常見的面向使用者的 bug。用 Sticky Session、回應中的版本令牌或對重定向目標的強一致性讀取來修復它。

**4. 在測試中忽略一致性視窗**

單元和整合測試通常在單一副本或同步複製的情況下執行，掩蓋了最終一致性的 bug。編寫明確引入複製延遲的測試，並驗證你的應用程式能正確處理陳舊讀取。

**5. 在強一致性負擔得起時選擇最終一致性**

最終一致性是一個工具，適用於強一致性確實過於昂貴的情況——因為地理分佈、高寫入吞吐量或可用性要求。對於一個寫入吞吐量適中的單區域服務，最終一致性的複雜性可能比強一致性的協調開銷代價更高。不要為了最終一致性本身而採用它。

## 相關 BEE

- [BEE-6003](../data-storage/replication-strategies.md) -- 複製延遲：測量和警報一致性視窗
- [BEE-8001](acid-properties.md) -- ACID 事務：何時改用強一致性
- [BEE-8003](distributed-transactions-and-two-phase-commit.md) -- 分散式事務：跨服務協調寫入
- [BEE-9004](../caching/distributed-caching.md) -- 分散式快取：快取失效與資料陳舊

## 參考資料

- Werner Vogels, *Eventually Consistent* -- [All Things Distributed (2008)](https://www.allthingsdistributed.com/2008/12/eventually_consistent.html) / [ACM Queue](https://queue.acm.org/detail.cfm?id=1466448)
- Martin Kleppmann, *Designing Data-Intensive Applications*, Chapter 9 -- [O'Reilly](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/)
- Martin Kleppmann, *CRDTs: The Hard Parts* -- [martin.kleppmann.com (2020)](https://martin.kleppmann.com/2020/07/06/crdt-hard-parts-hydra.html)
- crdt.tech -- [CRDT Resources](https://crdt.tech/resources)
