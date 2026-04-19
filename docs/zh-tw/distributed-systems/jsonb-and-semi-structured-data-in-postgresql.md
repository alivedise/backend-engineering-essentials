---
id: 19057
title: JSONB 與 PostgreSQL 半結構化資料
state: draft
slug: jsonb-and-semi-structured-data-in-postgresql
---

# [BEE-19057] JSONB 與 PostgreSQL 半結構化資料

:::info
PostgreSQL 的 `jsonb` 型別以解析後的二進制結構儲存 JSON — 支援基於 GIN 索引的包含查詢與鍵值存在性檢查，無須另建文件資料庫，同時保有 ACID 保證及與正規化資料表的 JOIN 能力。
:::

## 情境

應用程式經常遇到不符合固定綱要的資料：使用者定義的中繼資料、每個租戶不同的設定物件、第三方 webhook 承載，以及稀疏屬性集（大多數列對大多數欄位沒有值）。傳統 SQL 的回應——每個屬性增加一欄——在屬性由使用者定義或可能有數百個欄位時便告失效。

PostgreSQL 在 9.2（2012 年）引入 `json` 型別，作為具備語法驗證的文字欄位。`jsonb` 型別在 9.4（2014 年）推出，採用二進制編碼：寫入時，JSON 會被解析、去除空白、去重複鍵值（保留最後一個值），並對鍵值排序。讀取時不需重新解析。二進制表示比等效文字更大，但在索引和運算子評估上快得多。

實際結論：`jsonb` 可以在許多使用場景取代獨立的文件資料庫——含可選欄位的使用者個人資料、每分類屬性不同的商品目錄、稽核日誌承載——同時保有對關聯式資料表的 JOIN 能力、對提取欄位強制外鍵，以及參與 ACID 交易的能力。

取捨是真實存在的：JSONB 欄位不是免費的。每次寫入都會重寫整個 JSON 文件，即使只更新單一鍵值。深層巢狀文件難以索引。在 `WHERE` 子句頻繁使用、`ORDER BY` 或 JOIN 的欄位，從提升為正式欄位可獲得更好效益。

## 設計思維

### JSONB vs 正規化欄位

決策不是 JSONB vs SQL——而是哪些欄位屬於哪一邊：

| 特性 | 使用 JSONB | 使用欄位 |
|---|---|---|
| 屬性存在性 | 稀疏（大多數列為空） | 密集（大多數列有值） |
| 綱要擁有者 | 使用者定義，部署時未知 | 開發者定義，穩定 |
| 查詢模式 | 包含 / 鍵值存在性 | 等值、範圍、彙總、JOIN |
| 索引需求 | 整個文件或子集的 GIN | 欄位上的 B-tree |
| 更新模式 | 替換整個物件 | 更新單一欄位 |

常見模式：對可變部分使用 JSONB（`metadata`、`extra_attributes`、`raw_payload`），對可查詢的業務欄位使用正規化欄位。webhook 事件資料表將 `payload jsonb` 用於原始內容，但將 `event_type`、`resource_id` 和 `occurred_at` 提升為真實欄位以供查詢。

### GIN vs 函數索引

兩種索引策略涵蓋 JSONB 使用場景：

**GIN 索引**（`CREATE INDEX ON t USING GIN (col)`）——涵蓋 `@>`（包含）、`?`（鍵值存在）、`?|`、`?&` 和 JSONPath 運算子。當查詢是跨多個可能鍵值的臨時包含搜尋時使用。兩種運算子類別：
- `jsonb_ops`（預設）：支援所有運算子，包括巢狀值的 `@>`
- `jsonb_path_ops`：索引較小，`@>` 查詢更快，不支援 `?` 或 `?|`

**函數索引**（`CREATE INDEX ON t ((col->>'key'))`）——對單一提取文字值的一般 B-tree。當特定鍵值頻繁以等值或範圍條件查詢時使用。對於單一鍵值點查詢比 GIN 快得多，且支援排序。

**生成欄位**（PG 12+）：`col_extracted TEXT GENERATED ALWAYS AS (col->>'key') STORED`——資料庫自動維護提取的值。在生成欄位上加 B-tree 索引，可在不更改應用程式的情況下獲得最佳單鍵查詢效能。

### 部分更新

JSONB 欄位在儲存層面不支援原地欄位更新。任何 `UPDATE` 都會替換整個儲存的二進制資料。對於小型文件這是可接受的。對於頻繁更新的大型文件，考慮：

- `jsonb_set(target, path[], new_value)`——傳回更改了一個路徑的新文件；與 `UPDATE SET col = jsonb_set(col, ...)` 結合，無需先取得文件即可更新單一鍵值。
- `||` 串聯運算子——淺層合併兩個物件；用於套用 patch 物件。
- 提升：若某欄位頻繁單獨更新，它應該是真實欄位。

## 最佳實踐

**MUST（必須）在以任何非微型資料表大小使用 `@>` 或 `?` 查詢前建立 GIN 索引。** 沒有 GIN 索引，每個 `@>` 查詢都會對資料表中的每個 JSONB 文件進行順序掃描和反序列化。在建立資料表時加入索引，而非事後才加。

**MUST（必須）當查詢只使用 `@>` 且索引較大時使用 `jsonb_path_ops`。** `jsonb_path_ops` 透過雜湊鍵路徑而非索引個別鍵值，產生更小、更快的包含查詢索引。只有在也需要 `?`（鍵值存在）查詢時才使用 `jsonb_ops`。

**MUST（必須）將頻繁查詢的欄位提升為真實欄位或生成欄位。** 出現在大多數查詢的 `WHERE`、`ORDER BY` 或 `JOIN` 條件中的欄位是提升候選。生成欄位是阻力最小的路徑：它自動更新，且可在不改變查詢模式的情況下建立索引。

**SHOULD（應該）對單鍵等值和範圍查詢使用函數索引。** `CREATE INDEX ON events ((payload->>'status'))` 對於 `WHERE payload->>'status' = 'failed'` 比 GIN 更快，因為它是 B-tree 點查詢而非點陣圖掃描。

**SHOULD（應該）避免深層巢狀。** 深層巢狀路徑的查詢（`col #>> '{a,b,c,d}'`）難以索引、評估較慢且難以維護。盡可能扁平化結構。若巢狀是必要的，對查詢使用的路徑表達式建立索引。

**SHOULD（應該）使用 `jsonb_set()` 進行目標欄位更新以避免來回傳輸。** 與其 SELECT → 在應用程式修改 → UPDATE，使用 `UPDATE t SET col = jsonb_set(col, '{key}', '"new_value"') WHERE id = $1` 以單一陳述式更新。

**MAY（可以）將原始第三方承載儲存為 JSONB 並逐步提升欄位。** 儲存原始承載使重新處理無需重新取得資料。當查詢模式明確後將欄位提升為欄位——若使用生成欄位完成，比之後的綱要遷移成本更低。

## 視覺化

```mermaid
flowchart TD
    APP["應用程式\nINSERT / UPDATE / SELECT"]:::app

    subgraph "PostgreSQL 資料表：events"
        COL_NORM["正規化欄位\nevent_type, resource_id, occurred_at\n（B-tree 索引，支援 JOIN）"]:::normal
        COL_JSONB["payload jsonb\n（原始 webhook 內容）"]:::jsonb
    end

    subgraph "索引層"
        GIN["GIN 索引（jsonb_path_ops）\n快速 @> 包含\npayload @> '{\"status\": \"failed\"}'"]:::index
        FUNC["函數索引\n((payload->>''tenant_id''))\n快速等值 / 範圍"]:::index
        GEN["生成欄位\ntenant_id TEXT GENERATED ALWAYS AS\n(payload->>''tenant_id'') STORED"]:::gen
    end

    APP --> COL_NORM
    APP --> COL_JSONB
    COL_JSONB --> GIN
    COL_JSONB --> FUNC
    COL_JSONB --> GEN

    QUERY["查詢規劃器使用：\nGIN 用於包含查詢\n函數/生成 B-tree 用於等值查詢"]:::note

    GIN --> QUERY
    FUNC --> QUERY

    style APP fill:#3498db,color:#fff
    style COL_NORM fill:#2980b9,color:#fff
    style COL_JSONB fill:#8e44ad,color:#fff
    style GIN fill:#c0392b,color:#fff
    style FUNC fill:#e67e22,color:#fff
    style GEN fill:#e67e22,color:#fff
    style QUERY fill:#27ae60,color:#fff
```

## 範例

**含 JSONB 和索引策略的綱要：**

```sql
-- Webhook 事件：正規化欄位用於查詢，JSONB 用於原始承載
CREATE TABLE webhook_events (
    id          BIGSERIAL PRIMARY KEY,
    event_type  TEXT        NOT NULL,          -- 已提升：頻繁的 WHERE 子句
    resource_id TEXT        NOT NULL,          -- 已提升：頻繁的 JOIN 目標
    occurred_at TIMESTAMPTZ NOT NULL,          -- 已提升：範圍查詢、ORDER BY
    payload     JSONB       NOT NULL,          -- 儲存完整原始內容
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GIN 索引：跨任何承載鍵值的臨時包含查詢
CREATE INDEX ON webhook_events USING GIN (payload jsonb_path_ops);

-- 函數索引：頻繁過濾欄位的單鍵等值查詢
CREATE INDEX ON webhook_events ((payload->>'tenant_id'));

-- 生成欄位 + 索引：零應用程式變更，最佳 B-tree 效能
ALTER TABLE webhook_events
    ADD COLUMN tenant_id TEXT
    GENERATED ALWAYS AS (payload->>'tenant_id') STORED;

CREATE INDEX ON webhook_events (tenant_id);
```

**查詢模式及其索引使用：**

```sql
-- 包含查詢：使用 GIN 索引（jsonb_path_ops）
-- 「找出 payload 包含 status = failed 的所有事件」
SELECT id, event_type, occurred_at
FROM webhook_events
WHERE payload @> '{"status": "failed"}';

-- 鍵值存在性檢查：使用 GIN 索引（僅 jsonb_ops — 非 jsonb_path_ops）
SELECT id FROM webhook_events WHERE payload ? 'retry_count';

-- 單鍵等值：使用 (payload->>'tenant_id') 的函數索引
SELECT id, event_type
FROM webhook_events
WHERE payload->>'tenant_id' = 'acme-corp'
ORDER BY occurred_at DESC
LIMIT 50;

-- 路徑提取：以文字提取巢狀值
SELECT payload #>> '{metadata,source,ip}' AS source_ip
FROM webhook_events
WHERE event_type = 'payment.failed';
```

**使用 `jsonb_set()` 進行部分更新：**

```sql
-- 無需取得文件即可更新單一鍵值
-- jsonb_set(target, path_array, new_value, create_missing)
UPDATE webhook_events
SET payload = jsonb_set(payload, '{retry_count}', '3', true)
WHERE id = 42;

-- 合併 patch 物件（使用 || 運算子進行淺層合併）
UPDATE webhook_events
SET payload = payload || '{"processed": true, "processed_at": "2026-04-14T00:00:00Z"}'::jsonb
WHERE id = 42;
```

**巢狀路徑的函數索引（PG 12+）：**

```sql
-- 對兩層深的路徑建立索引
CREATE INDEX ON webhook_events ((payload #>> '{metadata,region}'));

-- 查詢使用索引
SELECT count(*) FROM webhook_events
WHERE payload #>> '{metadata,region}' = 'us-east-1';
```

## 實作注意事項

**更新成本**：對 JSONB 欄位的任何 `UPDATE` 都會重寫完整的二進制文件。對於大型文件在高頻率更新的情況，這會產生顯著的寫入放大。使用 `pg_stat_user_tables` 進行分析（查看 `n_dead_tup` 和 autovacuum 頻率）。若寫入放大是瓶頸，將熱欄位提升為欄位。

**EXPLAIN 輸出**：使用 `EXPLAIN (ANALYZE, BUFFERS)` 驗證索引使用情況。GIN 掃描顯示為 `Bitmap Index Scan on <index>`。若看到帶有 `Filter: (payload @> ...)` 的 `Seq Scan`，表示 GIN 索引遺失或未被選取（檢查運算子類別是否符合查詢運算子）。

**`jsonb_ops` vs `jsonb_path_ops`**：預設的 `jsonb_ops` 類別獨立索引每個鍵值和值，支援 `?`、`?|`、`?&` 和 `@>`。`jsonb_path_ops` 類別以雜湊形式索引值的路徑——不支援 `?`，但索引較小且 `@>` 查找更快。當查詢完全是包含查詢時選擇 `jsonb_path_ops`；需要鍵值存在性檢查時選擇 `jsonb_ops`。

**去重複**：插入時，PostgreSQL 只保留重複鍵值的最後一個出現。`INSERT ... '{"a":1,"a":2}'::jsonb` 儲存 `{"a": 2}`。這在從產生重複鍵值的來源反序列化時（某些 XML 轉 JSON 轉換器）很重要。

**Null 語義**：SQL `NULL` 和 JSON `null` 是不同的。`payload IS NULL` 檢查 SQL null。`payload->>'key' IS NULL` 對缺失的鍵值和值為 JSON null 的鍵值都為真。使用 `payload ? 'key'` 來區分兩者。

**Supabase / PostgREST**：PostgREST 透過 REST API 以包含過濾語法（`?col=cs.{"key":"value"}`）公開 JSONB 欄位，無需自訂 SQL 即可進行客戶端包含查詢。這使得 JSONB 成為使用者定義屬性的實用 API 設計工具。

## 相關 BEE

- [BEE-6001](../data-storage/sql-vs-nosql-tradeoffs.md) -- SQL vs NoSQL 權衡：JSONB 縮小了與文件儲存之間的許多差距而不脫離關聯式模型；了解何時專用文件資料庫仍是正確選擇
- [BEE-6002](../data-storage/indexing-deep-dive.md) -- 索引深入探討：GIN 是 PostgreSQL 的專業索引型別之一；了解它與 B-tree 的差異以及各自適用的時機
- [BEE-18002](../multi-tenancy/tenant-isolation-strategies.md) -- 租戶隔離策略：JSONB `metadata` 欄位通常用於租戶特定屬性；生成欄位和函數索引使 tenant_id 可查詢而不需要綱要更改

## 參考資料

- [JSON 型別 — PostgreSQL 文件](https://www.postgresql.org/docs/current/datatype-json.html)
- [GIN 索引 — PostgreSQL 文件](https://www.postgresql.org/docs/current/gin.html)
- [jsonb 函數與運算子 — PostgreSQL 文件](https://www.postgresql.org/docs/current/functions-json.html)
- [PostgreSQL 9.4 版本說明 — JSONB 引入](https://www.postgresql.org/docs/9.4/release-9-4.html)
