---
id: 19018
title: Change Data Capture
state: draft
slug: change-data-capture
---

# [BEE-19018] Change Data Capture

:::info
Change Data Capture (CDC) turns a database's own replication log into a real-time stream of changes — creates, updates, and deletes — that downstream systems can consume without polling, dual-writing, or touching application code, making it the standard primitive for keeping caches, search indexes, event buses, and data warehouses in sync with a system of record.
:::

## Context

Every relational database already maintains an ordered, append-only log of every change it accepts: MySQL has the binary log, PostgreSQL has the Write-Ahead Log with logical decoding, SQL Server has the transaction log with its CDC feature. These logs exist for crash recovery and replica synchronization. CDC repurposes them as a stream of change events for external consumers.

Jay Kreps articulated the broader significance of this in "The Log: What Every Software Engineer Should Know About Real-Time Data's Unifying Abstraction" (LinkedIn Engineering, December 2013): the database log is not an implementation detail — it is the authoritative, ordered record of what happened in the system. Any architecture that derives state from these events rather than polling the current state gains the properties of the log: ordering, completeness, and the ability to replay history. Martin Kleppmann developed this theme in "Designing Data-Intensive Applications" (O'Reilly, 2017), treating CDC as the mechanism by which the database's internal log becomes a public event stream — the bridge between the write-path and the many read-path systems (caches, search indexes, analytics pipelines) that need to stay consistent with it.

The practical problem CDC solves is the **dual-write problem**: if an application writes to a database and also to a message queue or cache, the two writes are not atomic. A process crash between them leaves the systems inconsistent. CDC eliminates the second write by reading it directly from the database's own log, which is written as part of the database's normal commit path. The application writes to the database; CDC exports the change. Consistency follows from the database's durability guarantee, not from the application's error handling.

The dominant open-source CDC framework is **Debezium** (Red Hat), which runs as Kafka Connect source connectors and supports MySQL, PostgreSQL, SQL Server, Oracle, MongoDB, Cassandra, and others. Netflix built **DBLog**, a watermark-based CDC framework for MySQL and PostgreSQL, to handle large-scale microservice event sourcing (described in their arXiv paper: arxiv.org/abs/2010.12597). Cloud providers offer managed CDC: AWS Database Migration Service, Google Datastream, Azure Database for PostgreSQL logical replication.

## Design Thinking

**CDC reads the log; it does not change how the database writes.** This is the core advantage: no schema changes, no application code changes, no triggers. The database continues operating normally. CDC consumers receive a stream of what the database already committed. The tradeoff is that CDC depends on the database exposing its replication log in a usable form, which varies by database and version (PostgreSQL requires `wal_level=logical`, MySQL requires ROW-format binlog, MongoDB requires a replica set for change streams).

**Log-based CDC is strictly better than polling or triggers for production use.** Query-based polling (`WHERE updated_at > last_seen`) misses hard deletes, requires a reliable `updated_at` column on every table, and imposes periodic database load. Trigger-based CDC writes change records synchronously in the write path, adding latency to every insert/update/delete and creating operational coupling. Log-based CDC reads changes asynchronously from the replication stream, imposes no write-path overhead, captures all operations including deletes, and preserves transaction ordering.

**The outbox pattern solves the application-to-event-bus consistency problem.** When an application needs to both update a database and emit an event, writing both atomically is the challenge. The outbox pattern writes the event as a row in an `outbox` table within the same database transaction as the business update. CDC then reads the outbox table and publishes the event to the message bus. Because the outbox write is part of the same transaction as the business write, the event is guaranteed to be published if and only if the business change committed. This avoids 2PC, distributed transactions, or relying on application-level retry logic.

**CDC delivers at-least-once; consumers MUST be idempotent.** Network failures and connector restarts cause CDC to re-deliver events from a saved offset. A consumer that processes the same event twice MUST produce the same result as processing it once. Design consumer operations around idempotency keys, upsert semantics, or conditional writes.

## Visual

```mermaid
flowchart LR
    subgraph "Source Database"
        DB["PostgreSQL\n(wal_level=logical)"]:::db
        WAL["WAL\n(replication log)"]:::log
        DB -->|commits write to| WAL
    end

    subgraph "CDC Layer"
        DEB["Debezium\nConnector"]:::cdc
        WAL -->|logical decoding\n(pgoutput)| DEB
    end

    subgraph "Event Bus"
        KF["Kafka\nTopics"]:::bus
        DEB -->|change events\n(c/u/d + before/after)| KF
    end

    subgraph "Consumers"
        CA["Cache Invalidation\n(Redis)"]:::consumer
        CB["Search Index\n(Elasticsearch)"]:::consumer
        CC["Analytics\n(BigQuery / Snowflake)"]:::consumer
        CD["Microservice\n(event-driven)"]:::consumer
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

**PostgreSQL CDC setup with Debezium (Kafka Connect):**

```json
// POST /connectors — register a Debezium PostgreSQL source connector
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

    // pgoutput is PostgreSQL's native logical decoding plugin (no extension needed)
    "plugin.name": "pgoutput",

    // Publication must be created in PostgreSQL first:
    // CREATE PUBLICATION debezium_pub FOR TABLE public.orders, public.users;
    "publication.name": "debezium_pub",

    // Snapshot: what to do on first start (existing rows)
    // "initial" = snapshot existing data, then stream ongoing changes
    "snapshot.mode": "initial",

    // Transforms: unwrap the nested Debezium envelope to a flat record
    "transforms": "unwrap",
    "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
    "transforms.unwrap.drop.tombstones": "false"
  }
}
```

```
// Debezium event for an UPDATE on public.orders (raw envelope format):
{
  "op": "u",                    // u=update, c=create, d=delete, r=read (snapshot)
  "before": {
    "order_id": 42, "status": "pending", "total": 99.00
  },
  "after": {
    "order_id": 42, "status": "shipped", "total": 99.00
  },
  "source": {
    "db": "mydb", "table": "orders",
    "lsn": 24432456,            // PostgreSQL LSN — used for offset tracking
    "txId": 1234,               // transaction ID
    "ts_ms": 1713100000000      // commit timestamp
  }
}
// Kafka topic: mydb.public.orders
// Kafka key: {"order_id": 42}   ← ensures partition affinity for the same row
```

**Outbox pattern for reliable event emission:**

```sql
-- Outbox table: same database as the business tables
CREATE TABLE outbox (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(255) NOT NULL,  -- e.g., "Order"
    aggregate_id   VARCHAR(255) NOT NULL,  -- e.g., "42"
    event_type     VARCHAR(255) NOT NULL,  -- e.g., "OrderShipped"
    payload        JSONB        NOT NULL,
    created_at     TIMESTAMPTZ  DEFAULT now()
);

-- Application writes business update + outbox entry in ONE transaction
BEGIN;
  UPDATE orders SET status = 'shipped' WHERE order_id = 42;
  INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('Order', '42', 'OrderShipped', '{"order_id": 42, "shipped_at": "2026-04-14"}');
COMMIT;
-- If the transaction commits, BOTH the order update and the outbox entry are durable.
-- Debezium reads the outbox table and publishes to Kafka.
-- If the transaction rolls back, neither happens. No 2PC needed.
```

**Idempotent consumer (upsert pattern):**

```sql
-- Consumer receives an OrderShipped event and updates a read model
-- Must be idempotent: same event processed twice = same result

-- Bad: INSERT fails on duplicate if event is redelivered
-- INSERT INTO shipment_view (order_id, status) VALUES (42, 'shipped');

-- Good: UPSERT handles redelivery safely
INSERT INTO shipment_view (order_id, status, shipped_at)
VALUES (42, 'shipped', '2026-04-14')
ON CONFLICT (order_id)
DO UPDATE SET
  status = EXCLUDED.status,
  shipped_at = EXCLUDED.shipped_at
WHERE shipment_view.shipped_at < EXCLUDED.shipped_at;
-- The WHERE clause prevents an older event from overwriting a newer one
-- (if events arrive out of order due to partition replay)
```

## Related BEEs

- [BEE-19011](write-ahead-logging.md) -- Write-Ahead Logging: CDC is fundamentally a consumer of the WAL — PostgreSQL's logical decoding translates the binary WAL into row-level change events; understanding WAL structure (LSN, checkpoints) is essential for reasoning about CDC lag and offset management
- [BEE-10004](../messaging/event-sourcing.md) -- Event Sourcing: CDC and event sourcing both treat a log of changes as the source of truth; CDC derives events from an existing database's replication log without changing how the application writes; event sourcing structures the application to write events first
- [BEE-8003](../transactions/distributed-transactions-and-two-phase-commit.md) -- Distributed Transactions and Two-Phase Commit: the outbox pattern is an alternative to 2PC for atomic database-and-message-bus updates; it achieves atomicity through a single-database transaction rather than a distributed coordinator
- [BEE-8005](../transactions/idempotency-and-exactly-once-semantics.md) -- Idempotency and Exactly-Once Semantics: CDC delivers at-least-once; combining Kafka transactional producers with idempotent consumers achieves exactly-once end-to-end; the outbox row's UUID primary key serves as a natural idempotency key

## References

- [The Log: What Every Software Engineer Should Know About Real-Time Data's Unifying Abstraction -- Jay Kreps, LinkedIn Engineering, 2013](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
- [Designing Data-Intensive Applications -- Martin Kleppmann, O'Reilly 2017](https://dataintensive.net/)
- [Change Data Capture: The Magic Wand We Forgot -- Martin Kleppmann, Berlin Buzzwords 2015](https://martin.kleppmann.com/2015/06/02/change-capture-at-berlin-buzzwords.html)
- [Debezium Documentation -- Red Hat](https://debezium.io/documentation/reference/stable/)
- [Transactional Outbox Pattern -- Chris Richardson, microservices.io](https://microservices.io/patterns/data/transactional-outbox.html)
- [DBLog: A Watermark Based Change-Data-Capture Framework -- Netflix, arXiv 2020](https://arxiv.org/abs/2010.12597)
- [Logical Decoding -- PostgreSQL Documentation](https://www.postgresql.org/docs/current/logicaldecoding-example.html)
- [Binary Logging Formats -- MySQL 8.0 Documentation](https://dev.mysql.com/doc/refman/8.0/en/binary-log-formats.html)
- [Change Streams -- MongoDB Documentation](https://www.mongodb.com/docs/manual/changestreams/)
