---
id: 6002
title: Indexing Deep Dive
state: draft
slug: indexing-deep-dive
---

# [BEE-6002] 索引深入探討

:::info
B-tree、雜湊、全文、複合、覆蓋、部分索引 — 它們是什麼、何時使用、何時不使用。
:::

:::tip Deep Dive
資料庫層級的索引內部機制與儲存引擎細節，請參閱 [DEE Indexing and Storage series](https://alivedise.github.io/database-engineering-essentials/145)。
:::

## 背景

索引是後端工程師能使用的最具影響力的效能工具。在大型資料表上缺少索引，可能讓一個 1ms 的查詢變成 30 秒的全表掃描。但索引並非免費：每增加一個索引都會提高寫入延遲並消耗磁碟空間。目標是有目的地建立索引、用 EXPLAIN 驗證，並移除沒有貢獻的索引。

**延伸閱讀：**
- [Use The Index, Luke — SQL 索引剖析](https://use-the-index-luke.com/sql/anatomy) — 最權威的實務指南
- [PostgreSQL 文件：索引類型](https://www.postgresql.org/docs/current/indexes-types.html) — 官方參考
- [DDIA 第三章 — 儲存與檢索（O'Reilly）](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/ch03.html) — 理論基礎

## 原則

**用寫入速度與儲存空間換取讀取速度 — 但只在值得的地方做。**

索引是資料庫與資料表平行維護的獨立資料結構。每一次 INSERT、UPDATE、DELETE 都必須同步更新所有相關索引。換來的是：符合條件的讀取可以跳過全表掃描，直接定位到相關資料列。

## 什麼是索引？

最基本的定義：索引將搜尋鍵值映射到資料列的位置（heap pointer）。沒有索引，查找 `email = 'alice@example.com'` 的所有使用者需要掃描資料表的每一列 — O(n)。有了 `email` 上的索引，資料庫只需遍歷 B-tree — O(log n) — 並取回符合的頁面。

一句話總結取捨：**空間 + 寫入開銷 → 更快的讀取**。

## B-Tree 索引（預設類型）

B-tree（平衡樹）是 PostgreSQL、MySQL 和多數關聯式資料庫的預設索引類型，也是絕大多數場景的正確選擇。

### 結構

```
                    [根節點 Root]
                   /     |      \
         [內部節點] [內部節點]  [內部節點]
         /      \       |        /       \
     [葉節點] [葉節點] [葉節點] [葉節點] [葉節點]
        |       |      |       |        |
     [資料]  [資料]  [資料]  [資料]   [資料]
      頁面    頁面    頁面    頁面     頁面
```

B-tree 查找流程：

1. 從根節點出發。
2. 在每個內部節點，沿著包含目標值的鍵值範圍分支前進。
3. 到達葉節點，取得實際的 heap pointer（資料列位置）。
4. 取回資料頁面。

樹保持平衡 — 所有葉節點深度相同 — 因此無論查找哪個值，都是 O(log n)。每個節點通常存放數百筆記錄，即使有數億列資料，樹也維持很淺的深度。

葉節點之間還以雙向鏈結串列連接，使得範圍掃描非常高效：找到範圍起點後，資料庫沿鏈結前進，不需重新遍歷樹。

### 支援的操作

| 操作 | 是否支援 |
|---|---|
| 等值查詢（`=`） | 是 |
| 範圍查詢（`<`、`>`、`BETWEEN`） | 是 |
| `ORDER BY`（排序輸出） | 是 |
| `LIKE 'prefix%'`（前綴比對） | 是 |
| `LIKE '%suffix'`（後綴比對） | 否 |
| `IS NULL` | 是（PostgreSQL） |

### 何時使用 B-Tree

- 主鍵與唯一約束（自動建立）
- `WHERE`、`JOIN ON`、`ORDER BY` 中使用的欄位
- 範圍查詢和前綴 `LIKE` 比對

## 雜湊索引（Hash Index）

雜湊索引儲存每個索引值的 32 位元雜湊值，並直接映射到資料列位置。查找平均複雜度 O(1)。

**限制：** 雜湊索引只支援等值比較（`=`），無法用於範圍查詢、排序或 `LIKE` 比對。

**PostgreSQL 注意事項：** PostgreSQL 10 起雜湊索引已納入 WAL 記錄，可安全使用。但由於 B-tree 同時支援等值與範圍查詢，在大多數情況下 B-tree 仍勝出。

```sql
CREATE INDEX idx_users_session_token ON users USING HASH (session_token);
```

## 複合索引（Composite Index）

複合索引涵蓋多個欄位。定義時的欄位順序至關重要。

```sql
-- 針對下方查詢模式的正確順序
CREATE INDEX idx_users_lastname_created ON users (last_name, created_at);
```

### 最左前綴規則（Leftmost Prefix Rule）

複合索引 `(A, B, C)` 可服務以下過濾條件的查詢：
- 只有 `A`
- `A` 和 `B`
- `A`、`B` 和 `C`

**無法**高效服務只過濾 `B`、只過濾 `C`，或 `B` 和 `C` 但不含 `A` 的查詢。缺少最左欄位，資料庫無法使用索引。

```sql
-- 使用索引（last_name 是最左欄位）
SELECT * FROM users WHERE last_name = 'Smith' AND created_at > '2024-01-01';

-- 部分使用索引（僅 last_name，created_at 過濾在取出後執行）
SELECT * FROM users WHERE last_name = 'Smith';

-- 無法有效使用索引
SELECT * FROM users WHERE created_at > '2024-01-01';
```

**經驗法則：** 將選擇性最高（能刪除最多列）的欄位放在最前面，除非查詢模式另有要求。

## 覆蓋索引（Covering Index）

覆蓋索引包含查詢所需的所有欄位 — 包括過濾欄位和 SELECT 欄位。資料庫可以完全從索引中滿足查詢，不需存取主資料表（即「index-only scan」）。

```sql
-- 查詢：取得活躍使用者在日期範圍內的 email 和 created_at
SELECT email, created_at FROM users
WHERE status = 'active' AND created_at BETWEEN '2024-01-01' AND '2024-12-31';

-- 覆蓋索引：包含查詢所有用到的欄位
CREATE INDEX idx_users_status_created_email
    ON users (status, created_at)
    INCLUDE (email);   -- PostgreSQL 11+ INCLUDE 語法
```

覆蓋索引可以消除查詢中最昂貴的部分 — heap 存取 — 但儲存與寫入開銷更大。僅在查詢極度頻繁且 heap fetch 是實測瓶頸時才使用。

## 全文索引（Full-Text Index）

對於搜尋文字內容（文章、描述、留言），B-tree 和雜湊索引都不適用。全文索引會對文字進行分詞、詞幹處理，並建立倒排索引（inverted index），將每個詞映射到包含它的資料列。

```sql
-- PostgreSQL：在 tsvector 欄位上建立 GIN 索引
ALTER TABLE articles ADD COLUMN search_vector tsvector;
CREATE INDEX idx_articles_fts ON articles USING GIN (search_vector);

-- 查詢
SELECT title FROM articles
WHERE search_vector @@ to_tsquery('english', 'database & indexing');
```

若需要大規模全文搜尋，建議使用 Elasticsearch 或 OpenSearch，而非讓關聯式資料庫承擔此負載。

## 部分索引（Partial Index）

部分索引只對滿足 WHERE 條件的資料列建立索引。它比全欄位索引更小、掃描更快、維護開銷更低。

```sql
-- 只對活躍使用者建立索引（假設大多數使用者已非活躍）
CREATE INDEX idx_users_active_email ON users (email)
WHERE status = 'active';

-- 只對未處理的任務建立索引
CREATE INDEX idx_jobs_pending ON jobs (created_at)
WHERE processed_at IS NULL;
```

部分索引使用率偏低。它們特別適合查詢固定針對小型且定義明確子集的資料表。

## 索引開銷：真實代價

每個建立的索引都有持續性成本：

| 成本 | 說明 |
|---|---|
| **寫入放大（Write Amplification）** | 每次 INSERT/UPDATE/DELETE 必須更新所有相關索引。一個有 8 個索引的資料表，每次列異動最多需要 9 次寫入操作。 |
| **儲存空間** | 大型資料表上的 B-tree 索引可達數 GB。索引總大小通常超過資料表本身。 |
| **Vacuum / 維護** | 死亡元組造成的索引膨脹需要清理。頻繁寫入會導致索引碎片化。 |
| **查詢規劃器開銷** | 索引越多，規劃器評估的路徑越多。通常不是問題，但值得知道。 |

## 何時不應建立索引

| 情境 | 原因 |
|---|---|
| 低基數欄位（`boolean`、只有 3 個值的 `status`、`gender`） | 索引幾乎沒有選擇性。透過索引取回 30% 的資料表通常比全表掃描更慢。 |
| 小型資料表（< 約 1,000 列） | 規劃器無論如何都會選擇 sequential scan，B-tree 遍歷反而更貴。 |
| 寫入密集的工作負載（批次匯入、事件串流） | 寫入放大佔主導地位。大批量載入前先刪除索引，載入後再重建。 |
| 從未出現在 WHERE、JOIN 或 ORDER BY 的欄位 | 從不被讀取的索引是純粹的開銷。 |
| 已被複合索引涵蓋的欄位 | 若已有 `(A, B)` 索引，單獨的 `A` 索引通常多餘。 |

## EXPLAIN 基礎

永遠不要猜測索引是否被使用。執行 EXPLAIN（或 EXPLAIN ANALYZE）並閱讀輸出結果。

```sql
EXPLAIN ANALYZE
SELECT id, email FROM users
WHERE last_name = 'Smith' AND created_at > '2024-01-01';
```

需要關注的關鍵節點：

| 節點 | 意義 |
|---|---|
| `Seq Scan` | 全表掃描。未使用索引（或規劃器選擇不用）。 |
| `Index Scan` | 使用索引，再取回 heap 以獲得完整資料列。 |
| `Index Only Scan` | 覆蓋索引 — 無需存取 heap。最快。 |
| `Bitmap Heap Scan` | 使用索引收集資料列位置，再批次取回 heap。適合中等大小的結果集。 |

注意 `rows=`（估計值）與實際列數的差異。差距過大表示統計資訊過時 — 執行 `ANALYZE` 更新。

## 實際案例：Users 資料表

```sql
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    first_name  TEXT,
    last_name   TEXT,
    status      TEXT,           -- 'active', 'inactive', 'banned'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 查詢 1：Email 查找

```sql
SELECT * FROM users WHERE email = 'alice@example.com';
```

在 `email` 上建立單欄唯一索引：

```sql
CREATE UNIQUE INDEX idx_users_email ON users (email);
```

EXPLAIN 輸出（良好）：

```
Index Scan using idx_users_email on users
  (cost=0.43..8.45 rows=1 width=120)
  Index Cond: (email = 'alice@example.com')
```

### 查詢 2：姓氏 + 日期範圍

```sql
SELECT id, email FROM users
WHERE last_name = 'Smith' AND created_at > '2024-01-01';
```

欄位順序正確的複合索引（高基數的 `last_name` 在前）：

```sql
CREATE INDEX idx_users_lastname_created ON users (last_name, created_at);
```

EXPLAIN 輸出（良好）：

```
Index Scan using idx_users_lastname_created on users
  (cost=0.56..12.34 rows=23 width=52)
  Index Cond: ((last_name = 'Smith') AND (created_at > '2024-01-01'))
```

錯誤的欄位順序 — `(created_at, last_name)` — 規劃器將需要掃描 2024-01-01 之後的所有列，再過濾 `last_name`，浪費了索引大部分的效益。

### 查詢 3：Status 欄位（低基數反模式）

```sql
CREATE INDEX idx_users_status ON users (status);  -- 反模式
```

只有 3 個不同值，此索引幾乎不會被使用。規劃器計算後發現，透過索引取回 33% 的資料表比單次 sequential scan 更貴。若確實需要查詢 `status = 'active'`，改用**部分索引**：

```sql
CREATE INDEX idx_users_active ON users (created_at)
WHERE status = 'active';
```

## 常見錯誤

1. **為每個欄位建立索引** — 寫入開銷與儲存浪費。只對熱門查詢中出現在 WHERE、JOIN 或 ORDER BY 的欄位建立索引。

2. **複合索引欄位順序錯誤** — 最左前綴規則不直觀。定義欄位順序前，務必先確認查詢模式。

3. **不用 EXPLAIN 驗證** — 索引可以建立成功但從未被使用。規劃器根據統計資訊和成本估計自行決定。務必驗證。

4. **對低基數欄位建立索引** — Boolean 或只有幾個值的 status 欄位幾乎永遠是錯誤的索引目標。針對特定值使用部分索引，或乾脆不索引。

5. **外鍵上缺少索引** — 未索引的外鍵上的 JOIN 會造成子表的 sequential scan。除非子表很小，否則務必對外鍵欄位建立索引。

## 相關 BEE

- [BEE-6001 — SQL vs NoSQL](./120.md)：選擇資料庫類型會影響可用的索引類型與相關性。
- [BEE-6005 — 儲存引擎](./124.md)：儲存引擎（InnoDB、WiredTiger 等）如何在頁面層級與索引互動。
- [BEE-6006 — 查詢優化](./125.md)：深入 EXPLAIN、統計資訊與查詢規劃器提示。
- [BEE-13004 — 效能分析](303.md)：在正式環境中測量索引變更的實際影響。
