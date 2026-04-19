---
id: 19018
title: 變更數據捕獲
state: draft
slug: change-data-capture
---

# [BEE-19018] 變更數據捕獲

:::info
變更數據捕獲（CDC）將數據庫自身的複製日誌轉化為實時的變更流——創建、更新和刪除——下游系統可以在不進行輪詢、雙寫或修改應用程序代碼的情況下消費，使其成為保持緩存、搜索索引、事件總線和數據倉庫與記錄系統同步的標準基礎原語。
:::

## Context

每個關係型數據庫都已維護了一個有序的、僅追加的每次變更日誌：MySQL 有二進制日誌，PostgreSQL 有帶邏輯解碼的預寫日誌，SQL Server 有帶 CDC 功能的事務日誌。這些日誌用于崩潰恢復和副本同步。CDC 將其重新利用為外部消費者的變更事件流。

Jay Kreps 在「日誌：每個軟件工程師都應該了解的關于實時數據的統一抽象」（LinkedIn Engineering，2013 年 12 月）中闡明了這一更廣泛的意義：數據庫日誌不是實現細節——它是系統中發生事件的權威有序記錄。任何從這些事件中派生狀態而非輪詢當前狀態的架構都獲得了日誌的屬性：有序性、完整性和重放歷史的能力。Martin Kleppmann 在「設計數據密集型應用程序」（O'Reilly，2017 年）中發展了這一主題，將 CDC 視為數據庫內部日誌成為公共事件流的機制——寫路徑與需要與之保持一致的許多讀路徑系統（緩存、搜索索引、分析管道）之間的橋梁。

CDC 解決的實際問題是**雙寫問題**：如果應用程序同時寫入數據庫和消息隊列或緩存，兩次寫入並不是原子的。兩者之間的進程崩潰會使系統不一致。CDC 通過直接從數據庫自身的日誌讀取變更來消除第二次寫入，該日誌作為數據庫正常提交路徑的一部分被寫入。應用程序寫入數據庫；CDC 導出變更。一致性源于數據庫的持久性保證，而非應用程序的錯誤處理。

主要的開源 CDC 框架是 **Debezium**（Red Hat），它作為 Kafka Connect 源連接器運行，支持 MySQL、PostgreSQL、SQL Server、Oracle、MongoDB、Cassandra 等。Netflix 構建了 **DBLog**，一個基於水印的 CDC 框架，用于 MySQL 和 PostgreSQL 的大規模微服務事件溯源（在 arXiv 論文中有描述：arxiv.org/abs/2010.12597）。雲提供商提供托管 CDC：AWS Database Migration Service、Google Datastream、Azure Database for PostgreSQL 邏輯複製。

## Design Thinking

**CDC 讀取日誌；它不改變數據庫的寫入方式。** 這是核心優勢：無需架構更改、無需應用程序代碼更改、無需觸發器。數據庫繼續正常運行。CDC 消費者接收數據庫已提交的流。取捨是 CDC 依賴于數據庫以可用形式暴露其複製日誌，這因數據庫和版本而異（PostgreSQL 需要 `wal_level=logical`，MySQL 需要 ROW 格式 binlog，MongoDB 需要副本集來支持變更流）。

**基于日誌的 CDC 在生產使用上嚴格優于輪詢或觸發器。** 基于查詢的輪詢（`WHERE updated_at > last_seen`）會錯過硬刪除，要求每個表上都有可靠的 `updated_at` 列，並施加周期性數據庫負載。基于觸發器的 CDC 在寫路徑中同步寫入變更記錄，為每次 insert/update/delete 增加延遲，並創建運營耦合。基于日誌的 CDC 從複製流中異步讀取變更，不施加寫路徑開銷，捕獲所有操作包括刪除，並保留事務順序。

**發件箱模式解決了應用程序到事件總線的一致性問題。** 當應用程序需要同時更新數據庫和發出事件時，原子性地寫入兩者是挑戰。發件箱模式在同一數據庫事務中將事件作為 `outbox` 表中的一行與業務更新一起寫入。CDC 然後讀取發件箱表並將事件發布到消息總線。因為發件箱寫入是業務寫入的同一事務的一部分，所以事件被保證當且僅當業務變更提交時才被發布。這避免了 2PC、分散式事務或依賴應用程序級重試邏輯。

**CDC 提供至少一次交付；消費者MUST（必須）是冪等的。** 網絡故障和連接器重啟導致 CDC 從保存的偏移量重新交付事件。處理同一事件兩次的消費者MUST（必須）產生與處理一次相同的結果。圍繞冪等性鍵、更新插入語義或條件寫入來設計消費者操作。

## Visual

```mermaid
flowchart LR
    subgraph "源數據庫"
        DB["PostgreSQL\n(wal_level=logical)"]:::db
        WAL["WAL\n（複製日誌）"]:::log
        DB -->|將寫入提交到| WAL
    end

    subgraph "CDC 層"
        DEB["Debezium\n連接器"]:::cdc
        WAL -->|邏輯解碼\n(pgoutput)| DEB
    end

    subgraph "事件總線"
        KF["Kafka\n主題"]:::bus
        DEB -->|變更事件\n(c/u/d + before/after)| KF
    end

    subgraph "消費者"
        CA["緩存失效\n(Redis)"]:::consumer
        CB["搜索索引\n(Elasticsearch)"]:::consumer
        CC["分析\n(BigQuery / Snowflake)"]:::consumer
        CD["微服務\n（事件驅動）"]:::consumer
    end

    KF --> CA & CB & CC & CD

    style DB fill:#3498db,color:#fff
    style WAL fill:#95a5a6,color:#fff
    style DEB fill:#e67e22,color:#fff
    style KF fill:#27ae60,color:#fff
    style CA fill:#9b59b6,color:#fff
    style CB fill:#9b59b6,color:#fff
    style CC fill:#9b59b6,color:#fff
    style CD fill:#9b59b6,color:#fff
```

## Example

**使用 Debezium（Kafka Connect）設置 PostgreSQL CDC：**

```json
// POST /connectors — 注冊 Debezium PostgreSQL 源連接器
{
  "name": "pg-cdc-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "secret",
    "database.dbname": "mydb",
    "topic.prefix": "mydb",
    "table.include.list": "public.orders,public.users",

    // pgoutput 是 PostgreSQL 的原生邏輯解碼插件（不需要擴展）
    "plugin.name": "pgoutput",

    // MUST（必須）先在 PostgreSQL 中創建發布：
    // CREATE PUBLICATION debezium_pub FOR TABLE public.orders, public.users;
    "publication.name": "debezium_pub",

    // 快照：首次啟動時如何處理（現有行）
    // "initial" = 快照現有數據，然後流式傳輸正在進行的變更
    "snapshot.mode": "initial",

    // 轉換：將嵌套的 Debezium 信封解包為平面記錄
    "transforms": "unwrap",
    "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
    "transforms.unwrap.drop.tombstones": "false"
  }
}
```

```
// public.orders 的 UPDATE 的 Debezium 事件（原始信封格式）：
{
  "op": "u",                    // u=更新, c=創建, d=刪除, r=讀取（快照）
  "before": {
    "order_id": 42, "status": "pending", "total": 99.00
  },
  "after": {
    "order_id": 42, "status": "shipped", "total": 99.00
  },
  "source": {
    "db": "mydb", "table": "orders",
    "lsn": 24432456,            // PostgreSQL LSN——用于偏移量跟蹤
    "txId": 1234,               // 事務 ID
    "ts_ms": 1713100000000      // 提交時間戳
  }
}
// Kafka 主題: mydb.public.orders
// Kafka 鍵: {"order_id": 42}   ← 確保同一行的分區親和性
```

**用於可靠事件發射的發件箱模式：**

```sql
-- 發件箱表：與業務表在同一數據庫中
CREATE TABLE outbox (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(255) NOT NULL,  -- 例如 "Order"
    aggregate_id   VARCHAR(255) NOT NULL,  -- 例如 "42"
    event_type     VARCHAR(255) NOT NULL,  -- 例如 "OrderShipped"
    payload        JSONB        NOT NULL,
    created_at     TIMESTAMPTZ  DEFAULT now()
);

-- 應用程序在一個事務中寫入業務更新 + 發件箱條目
BEGIN;
  UPDATE orders SET status = 'shipped' WHERE order_id = 42;
  INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('Order', '42', 'OrderShipped', '{"order_id": 42, "shipped_at": "2026-04-14"}');
COMMIT;
-- 如果事務提交，訂單更新和發件箱條目都是持久的。
-- Debezium 讀取發件箱表並發布到 Kafka。
-- 如果事務回滾，兩者都不發生。不需要 2PC。
```

**冪等消費者（更新插入模式）：**

```sql
-- 消費者接收 OrderShipped 事件並更新讀取模型
-- MUST（必須）是冪等的：同一事件處理兩次 = 相同結果

-- 不好的做法：如果事件被重新交付，INSERT 在重複時失敗
-- INSERT INTO shipment_view (order_id, status) VALUES (42, 'shipped');

-- 好的做法：UPSERT 安全處理重新交付
INSERT INTO shipment_view (order_id, status, shipped_at)
VALUES (42, 'shipped', '2026-04-14')
ON CONFLICT (order_id)
DO UPDATE SET
  status = EXCLUDED.status,
  shipped_at = EXCLUDED.shipped_at
WHERE shipment_view.shipped_at < EXCLUDED.shipped_at;
-- WHERE 子句防止舊事件覆蓋新事件
-- （如果由於分區重放事件亂序到達）
```

## Related BEEs

- [BEE-19011](write-ahead-logging.md) -- 預寫日誌：CDC 從根本上是 WAL 的消費者——PostgreSQL 的邏輯解碼將二進制 WAL 轉換為行級變更事件；了解 WAL 結構（LSN、檢查點）對于推斷 CDC 延遲和偏移量管理至關重要
- [BEE-10004](../messaging/event-sourcing.md) -- 事件溯源：CDC 和事件溯源都將變更日誌視為真實來源；CDC 從現有數據庫的複製日誌中派生事件而不改變應用程序的寫入方式；事件溯源構造應用程序以首先寫入事件
- [BEE-8003](../transactions/distributed-transactions-and-two-phase-commit.md) -- 分散式事務與兩階段提交：發件箱模式是用於原子數據庫和消息總線更新的 2PC 替代方案；它通過單數據庫事務而非分散式協調者實現原子性
- [BEE-8005](../transactions/idempotency-and-exactly-once-semantics.md) -- 冪等性與恰好一次語義：CDC 提供至少一次交付；將 Kafka 事務性生產者與冪等消費者結合可實現端到端的恰好一次；發件箱行的 UUID 主鍵作為自然的冪等性鍵

## References

- [日誌：每個軟件工程師都應該了解的關于實時數據的統一抽象 -- Jay Kreps, LinkedIn Engineering, 2013](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
- [設計數據密集型應用程序 -- Martin Kleppmann, O'Reilly 2017](https://dataintensive.net/)
- [變更數據捕獲：我們遺忘的魔杖 -- Martin Kleppmann, Berlin Buzzwords 2015](https://martin.kleppmann.com/2015/06/02/change-capture-at-berlin-buzzwords.html)
- [Debezium 文檔 -- Red Hat](https://debezium.io/documentation/reference/stable/)
- [事務性發件箱模式 -- Chris Richardson, microservices.io](https://microservices.io/patterns/data/transactional-outbox.html)
- [DBLog：基于水印的變更數據捕獲框架 -- Netflix, arXiv 2020](https://arxiv.org/abs/2010.12597)
- [邏輯解碼 -- PostgreSQL 文檔](https://www.postgresql.org/docs/current/logicaldecoding-example.html)
- [二進制日誌格式 -- MySQL 8.0 文檔](https://dev.mysql.com/doc/refman/8.0/en/binary-log-formats.html)
- [變更流 -- MongoDB 文檔](https://www.mongodb.com/docs/manual/changestreams/)
