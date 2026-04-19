---
id: 19011
title: 預寫日誌
state: draft
slug: write-ahead-logging
---

# [BEE-430] 預寫日誌

:::info
預寫日誌（WAL）是使數據庫持久性切實可行的協議：通過在寫入實際數據頁之前，先將每次更改的描述寫入僅追加的日誌，數據庫可以從崩潰中恢復而不丟失已提交的事務——並使用同一個日誌作為複製的事實來源。
:::

## Context

數據庫持久性的根本問題是：可靠地將數據寫入磁盤的速度很慢，但在將數據寫入內存後立即確認提交是不安全的。樸素的解決方案——在確認提交之前強制將每個修改的頁面刷入磁盤——代價過高：一個觸及二十個頁面的單個事務將需要二十次隨機磁盤寫入。

IBM Research 的 C. Mohan、Don Haderle、Bruce Lindsay、Hamid Pirahesh 和 Peter Schwarz 通過 ARIES 算法解決了這個問題（「ARIES：使用預寫日誌支持細粒度鎖定和部分回滾的事務恢復方法」，ACM TODS，1992 年 3 月）。ARIES 成為 IBM DB2、Microsoft SQL Server 恢復的基礎，並影響了 PostgreSQL、MySQL/InnoDB 和大多數生產關係型數據庫的設計。核心洞察稱為**竊取/無強制緩衝管理**：在提交之前可以將髒（已修改但未提交）頁面寫入磁盤（「竊取」），而已提交的頁面不需要立即強制刷入磁盤（「無強制」）——只要描述更改的日誌記錄先被寫入即可。

WAL 協議有三條規則：（1）在修改的數據頁可以寫入磁盤之前，描述該修改的日誌記錄必須先寫入持久存儲；（2）事務的所有日誌記錄必須在向客戶端發送提交確認之前到達持久存儲；（3）日誌是僅追加的，永不原地修改。每個日誌記錄攜帶一個**日誌序列號（LSN）**——WAL 流中單調遞增的 64 位字節偏移量。LSN 是協調原語：每個數據頁存儲修改它的最新日誌記錄的 LSN；恢復系統使用 LSN 決定什麼需要重做，什麼需要撤銷。

效率提升是顯著的。在提交時，數據庫只將日誌緩衝區刷入磁盤（通常幾千字節的順序寫入），而不是所有髒頁。髒頁由後台頁面寫入器批量異步寫出。由於避免了寫放大，順序日誌寫入比隨機頁面寫入快一個數量級，在 SSD 上也明顯更快。

WAL 的第二個主要作用是**複製**。因為日誌是所有有序更改的完整描述，任何能讀取和重放日誌的系統都可以維護副本。PostgreSQL 流式複製通過將 WAL 段從主節點傳輸到備用節點來工作。MySQL 複製使用 InnoDB 重做日誌（物理 WAL）加上二進制日誌（邏輯 WAL）。etcd 和其他 Raft 實現將其分散式日誌存儲在 WAL 之上——Raft 日誌*就是*在副本間共享的 WAL。Apache Kafka 的提交日誌在架構上是用於事件流的分散式 WAL。這個模式是普遍的：有序的僅追加 LSN 日誌是任何必須在節點故障中存活的系統的事實來源。

## Design Thinking

**WAL 用寫放大換取順序 I/O。** 每次寫入都生成兩個操作：一個到 WAL（順序），一個到數據頁（隨機，延遲）。在讀密集的工作負載上，這種開銷可以忽略不計。在具有小事務的寫密集工作負載上，WAL 成為瓶頸——這就是為什麼數據庫提供諸如 `synchronous_commit = off`（接受丟失最後幾個事務的風險）或組提交（將多個事務的日誌刷新批量為一個 `fsync`）等機制。

**日誌是您擁有的最重要的數據。** 數據頁可以從日誌重建。如果日誌損壞或丟失，恢復是不可能的。WAL 文件 MUST（必須）存儲在持久存儲上——不在臨時實例存儲上，不在沒有 fsync 保證的文件系統掛載上。這就是為什麼雲數據庫通常將 WAL 寫入網絡附加塊存儲（EBS、持久磁盤），即使數據頁放在更快的本地 NVMe 上。

**檢查點限制恢復時間，而不是正確性。** 沒有檢查點的恢復將從創世以來重放 WAL——速度太慢無法接受。檢查點記錄哪些數據頁已刷入磁盤（銳利檢查點）或在事務繼續進行時開始刷新（模糊檢查點）。檢查點之後，恢復只需從該檢查點的 LSN 重放 WAL。檢查點頻率在恢復時間和檢查點開銷之間做出取捨：更頻繁的檢查點意味著更快的恢復但更多的後台 I/O。

## Deep Dive

**ARIES 恢復：分析 → 重做 → 撤銷**

崩潰後，ARIES 分三個階段恢復：

1. **分析**：從最近的檢查點向前掃描到 WAL 末尾。重建髒頁表（哪些頁面已修改但尚未刷新）和事務表（崩潰時哪些事務處于活躍狀態）。識別「失敗事務」——那些在崩潰時處于活躍狀態但從未提交的事務。

2. **重做（「重演歷史」）**：從髒頁表中最舊的 LSN 向前掃描，重放每條日誌記錄——包括來自失敗事務的記錄。這將數據庫恢復到其確切的崩潰前狀態，包括進行中的工作。重新應用已刷新頁面是安全的，因為 ARIES 會檢查：如果頁面的磁盤 LSN 已經 ≥ 日誌記錄的 LSN，更改已經刷新，重做被跳過。

3. **撤銷**：向後掃描日誌，回滾每個失敗事務。對于每個撤銷的更改，ARIES 寫入一個**補償日誌記錄（CLR）**，記錄撤銷操作本身。CLR 防止如果系統在恢復過程中再次崩潰，撤銷被再次撤銷。當所有失敗事務都被完全回滾時，撤銷終止。

「重演歷史」原則是反直觀的但很關鍵：ARIES 甚至重做最終將被回滾的事務的工作。這是因為均勻重做所有更改然後選擇性撤銷，比在重做期間嘗試確定哪些更改應該應用更便宜且更安全。

**LSM 樹和 WAL**

日誌結構合並樹數據庫（RocksDB、LevelDB、Cassandra）使用 WAL 保護內存中的 MemTable。每次寫入同時進入 MemTable 和 WAL。當 MemTable 满時，它被刷新到磁盤上的不可變 SSTable，相應的 WAL 段可以被丟棄。如果進程在 MemTable 刷新之前崩潰，恢復通過重放 WAL 來重建它。LSM 存儲中的 WAL 通常比 B 樹數據庫中的 WAL 存活時間更短：它只覆蓋當前 MemTable 的數據，而不是整個數據庫歷史。

## Visual

```mermaid
sequenceDiagram
    participant C as 客戶端
    participant DB as 數據庫引擎
    participant L as WAL（磁盤）
    participant P as 數據頁（磁盤）

    C->>DB: BEGIN; UPDATE accounts SET bal=bal-100; COMMIT
    DB->>L: 寫日誌記錄：[LSN=42, txn=7, UPDATE accounts...]
    L-->>DB: fsync 確認
    DB->>C: COMMIT 已確認 ✓
    Note over P: 數據頁仍然是緩衝池中的髒頁
    DB->>P: 後台寫入器刷新髒頁（異步）
    Note over DB: 此處崩潰 → 重啟時從 LSN 42 重放
```

## Example

**PostgreSQL WAL 配置和複製：**

```sql
-- 檢查當前 WAL 級別和配置
SHOW wal_level;          -- minimal | replica | logical
SHOW max_wal_size;       -- 強制檢查點之前的最大 WAL 大小（默認 1GB）
SHOW checkpoint_timeout; -- 自動檢查點之間的最長時間（默認 5 分鐘）
SHOW synchronous_commit; -- on | off | remote_apply | remote_write | local

-- CDC 的邏輯解碼：需要 wal_level = logical
-- 在 postgresql.conf 中：
--   wal_level = logical
--   max_replication_slots = 4

-- 創建邏輯複製槽（Debezium/pgoutput 風格）：
SELECT pg_create_logical_replication_slot('debezium_slot', 'pgoutput');

-- 從槽中查看 WAL 流（用於調試）：
SELECT * FROM pg_logical_slot_peek_changes('debezium_slot', NULL, 10,
  'proto_version', '1', 'publication_names', 'my_pub');

-- 當前 WAL LSN：
SELECT pg_current_wal_lsn();      -- 例如 0/3A9B4F8

-- 檢查複製滯後（主節點 vs 備用節點）：
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       sent_lsn - replay_lsn AS replication_lag_bytes
FROM pg_stat_replication;
```

**ARIES 恢復演練（偽代碼）：**

```
# 系統在 LSN=50 寫入後崩潰；LSN=51（txn 7 的 COMMIT）未寫入。
# 最後一個檢查點在 LSN=30。

# 分析（從 LSN=30 向前掃描）：
LSN=30: CHECKPOINT  → 建立初始狀態
LSN=42: UPDATE t7   → 將 txn 7 添加到事務表；將頁面 P1 添加到髒頁表
LSN=45: UPDATE t8   → 將 txn 8 添加到事務表；將頁面 P2 添加到髒頁表
LSN=48: COMMIT t8   → 從事務表中刪除 txn 8（已提交，不是失敗事務）
LSN=50: UPDATE t7   → 更新髒頁表中 P1 的 recLSN
# 日誌結束：txn 7 是失敗事務（從未提交）

# 重做（從最舊的 recLSN = 42 向前掃描）：
LSN=42: 重做 P1 上的 UPDATE（如果 P1.pageLSN < 42）
LSN=45: 重做 P2 上的 UPDATE（如果 P2.pageLSN < 45）
LSN=48: COMMIT t8 → 不需要重做（無數據更改）
LSN=50: 重做 P1 上的 UPDATE（如果 P1.pageLSN < 50）
# 數據庫現在完全匹配崩潰前的狀態

# 撤銷（向後掃描，只處理失敗事務）：
LSN=50: 撤銷 P1 上的 UPDATE → 在 LSN=55 寫入 CLR(50)
LSN=42: 撤銷 P1 上的 UPDATE → 在 LSN=56 寫入 CLR(42)
# txn 7 完全回滾；CLR 確保此撤銷在下次崩潰時不會被再次撤銷
```

## Related BEEs

- [BEE-8001](../transactions/acid-properties.md) -- ACID 屬性：WAL 是持久性（ACID 中的 D）的實現機制——在確認提交之前刷新日誌記錄，保證已提交事務在崩潰中存活
- [BEE-19002](consensus-algorithms-paxos-and-raft.md) -- 共識演算法：Raft 的分散式日誌在結構上是一個在集群中複製的 WAL；領導者追加條目，跟隨者重放它們，正如 WAL 用于崩潰恢復一樣
- [BEE-6003](../data-storage/replication-strategies.md) -- 複製策略：物理複製（PostgreSQL 流式複製、MySQL 複製）通過將 WAL 段傳輸到備用節點來工作；邏輯複製將 WAL 解碼為行級更改
- [BEE-6005](../data-storage/storage-engines.md) -- 存儲引擎：LSM 樹引擎（RocksDB、LevelDB）和 B 樹引擎都使用 WAL，但範圍不同——LSM WAL 只覆蓋當前 MemTable；B 樹 WAL 覆蓋所有未刷新的頁面

## References

- [ARIES：使用預寫日誌的事務恢復方法 -- Mohan 等人, ACM TODS, 1992 年 3 月](https://dl.acm.org/doi/10.1145/128765.128770)
- [預寫日誌 -- PostgreSQL 文檔](https://www.postgresql.org/docs/current/wal-intro.html)
- [WAL 內部原理 -- PostgreSQL 文檔](https://www.postgresql.org/docs/current/wal-internals.html)
- [InnoDB 重做日誌 -- MySQL 文檔](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)
- [預寫日誌（WAL）-- RocksDB Wiki](https://github.com/facebook/rocksdb/wiki/Write-Ahead-Log-(WAL))
