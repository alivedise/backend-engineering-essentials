---
id: 19011
title: Write-Ahead Logging
state: draft
slug: write-ahead-logging
---

# [BEE-19011] Write-Ahead Logging

:::info
Write-Ahead Logging (WAL) is the protocol that makes database durability practical: by writing a description of every change to an append-only log before writing the actual data pages, a database can recover from crashes without losing committed transactions — and use that same log as the source of truth for replication.
:::

## Context

The fundamental problem of database durability is that writing data reliably to disk is slow, but acknowledging a commit immediately after writing to memory is unsafe. The naive solution — force every modified page to disk before acknowledging a commit — is prohibitively expensive: a single transaction touching twenty pages would require twenty random disk writes.

C. Mohan, Don Haderle, Bruce Lindsay, Hamid Pirahesh, and Peter Schwarz solved this at IBM Research with the ARIES algorithm ("ARIES: A Transaction Recovery Method Supporting Fine-Granularity Locking and Partial Rollbacks Using Write-Ahead Logging," ACM TODS, March 1992). ARIES became the basis for recovery in IBM DB2, Microsoft SQL Server, and influenced the design of PostgreSQL, MySQL/InnoDB, and most production relational databases. The core insight is called **steal/no-force buffer management**: dirty (modified but uncommitted) pages may be written to disk before commit ("steal"), and committed pages need not be immediately forced to disk ("no-force") — as long as the log record describing the change is written first.

The WAL protocol has three rules: (1) a log record must be written to durable storage before the data page it modifies can be written to disk; (2) all log records for a transaction must reach durable storage before the commit acknowledgement is sent to the client; (3) the log is append-only and never modified in place. Every log record carries a **Log Sequence Number (LSN)** — a monotonically increasing 64-bit byte offset in the WAL stream. LSNs are the coordination primitive: each data page stores the LSN of the most recent log record that modified it; the recovery system uses LSNs to decide what to redo and what to undo.

The efficiency gain is significant. On a commit, the database flushes only the log buffer to disk (a sequential write of typically a few kilobytes), not all dirty pages. Dirty pages are written out in bulk, asynchronously, by a background page writer. Sequential log writes are an order of magnitude faster than random page writes on spinning disks, and still significantly faster on SSDs due to write amplification avoidance.

WAL's second major role is **replication**. Because the log is a complete description of all changes in order, any system that can read and replay the log can maintain a replica. PostgreSQL streaming replication works by shipping WAL segments from primary to standbys. MySQL replication uses the InnoDB redo log (physical WAL) plus the binary log (logical WAL). etcd and other Raft implementations store their distributed log on top of WAL — the Raft log *is* a WAL shared across replicas. Apache Kafka's commit log is architecturally a distributed WAL for event streams. The pattern is universal: an append-only, LSN-ordered log is the source of truth for anything that must survive node failures.

## Design Thinking

**WAL trades write amplification for sequential I/O.** Every write generates two operations: one to the WAL (sequential) and one to the data pages (random, deferred). On a read-heavy workload, this overhead is negligible. On a write-heavy workload with tiny transactions, WAL becomes the bottleneck — which is why databases provide mechanisms like `synchronous_commit = off` (accepting risk of losing the last few transactions) or group commit (batching multiple transactions' log flushes into one `fsync`).

**The log is the most important data you have.** Data pages can be reconstructed from the log. If the log is corrupted or lost, recovery is impossible. WAL files MUST reside on durable storage — not on ephemeral instance storage, not on a filesystem mounted without fsync guarantees. This is why cloud databases typically write WAL to network-attached block storage (EBS, persistent disks) even when data pages go to faster local NVMe.

**Checkpoints bound recovery time, not correctness.** Recovery without checkpoints would replay the WAL from the beginning of time — prohibitively slow. A checkpoint records which data pages have been flushed to disk (sharp checkpoint) or begins flushing them while transactions continue (fuzzy checkpoint). After a checkpoint, recovery only needs to replay WAL from that checkpoint's LSN. Checkpoint frequency trades recovery time against checkpoint overhead: more frequent checkpoints mean faster recovery but more background I/O.

## Deep Dive

**ARIES Recovery: Analysis → Redo → Undo**

After a crash, ARIES recovers in three phases:

1. **Analysis**: Scan forward from the most recent checkpoint to the end of the WAL. Reconstruct the Dirty Page Table (which pages were modified but not yet flushed) and the Transaction Table (which transactions were active at crash time). Identify "loser transactions" — those that were active at crash but never committed.

2. **Redo ("Repeating History")**: Scan forward from the oldest LSN in the Dirty Page Table, replaying every log record — including those from loser transactions. This restores the database to its exact pre-crash state, including in-progress work. Reapplying an already-flushed page is safe because ARIES checks: if the page's on-disk LSN is already ≥ the log record's LSN, the change was already flushed and the redo is skipped.

3. **Undo**: Scan backward through the log, rolling back each loser transaction. For each undone change, ARIES writes a **Compensation Log Record (CLR)** that records the undo operation itself. CLRs prevent undo from being undone again if the system crashes during recovery. Undo terminates when all loser transactions are fully rolled back.

The "Repeating History" principle is unintuitive but critical: ARIES redoes even the work of transactions that will eventually be rolled back. This is because it is cheaper and safer to redo all changes uniformly and then selectively undo, than to try to determine during redo which changes should be applied.

**LSM Trees and WAL**

Log-Structured Merge Tree databases (RocksDB, LevelDB, Cassandra) use a WAL to protect the in-memory MemTable. Every write goes to both the MemTable and the WAL. When the MemTable is full, it is flushed to an immutable SSTable on disk, and the corresponding WAL segment can be discarded. If the process crashes before the MemTable is flushed, recovery replays the WAL to rebuild it. The WAL in an LSM store is typically shorter-lived than in a B-tree database: it covers only the current MemTable's worth of data, not the entire database history.

## Visual

```mermaid
sequenceDiagram
    participant C as Client
    participant DB as Database Engine
    participant L as WAL (disk)
    participant P as Data Pages (disk)

    C->>DB: BEGIN; UPDATE accounts SET bal=bal-100; COMMIT
    DB->>L: Write log record: [LSN=42, txn=7, UPDATE accounts...]
    L-->>DB: fsync confirmed
    DB->>C: COMMIT acknowledged ✓
    Note over P: Data page still dirty in buffer pool
    DB->>P: Background writer flushes dirty pages (async)
    Note over DB: Crash here → replay from LSN 42 on restart
```

## Example

**PostgreSQL WAL configuration and replication:**

```sql
-- Check current WAL level and configuration
SHOW wal_level;          -- minimal | replica | logical
SHOW max_wal_size;       -- maximum WAL size before checkpoint is forced (default 1GB)
SHOW checkpoint_timeout; -- max time between automatic checkpoints (default 5min)
SHOW synchronous_commit; -- on | off | remote_apply | remote_write | local

-- Logical decoding for CDC: requires wal_level = logical
-- In postgresql.conf:
--   wal_level = logical
--   max_replication_slots = 4

-- Create a logical replication slot (Debezium/pgoutput style):
SELECT pg_create_logical_replication_slot('debezium_slot', 'pgoutput');

-- Peek at the WAL stream from a slot (for debugging):
SELECT * FROM pg_logical_slot_peek_changes('debezium_slot', NULL, 10,
  'proto_version', '1', 'publication_names', 'my_pub');

-- Current WAL LSN:
SELECT pg_current_wal_lsn();      -- e.g., 0/3A9B4F8

-- Check replication lag (primary vs standby):
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       sent_lsn - replay_lsn AS replication_lag_bytes
FROM pg_stat_replication;
```

**ARIES recovery walkthrough (pseudocode):**

```
# System crashes after LSN=50 is written; LSN=51 (COMMIT for txn 7) not written.
# Last checkpoint at LSN=30.

# ANALYSIS (scan forward from LSN=30):
LSN=30: CHECKPOINT  → establish starting state
LSN=42: UPDATE t7   → add txn 7 to Transaction Table; add page P1 to Dirty Page Table
LSN=45: UPDATE t8   → add txn 8 to Transaction Table; add page P2 to Dirty Page Table
LSN=48: COMMIT t8   → remove txn 8 from Transaction Table (committed, not a loser)
LSN=50: UPDATE t7   → update P1's recLSN in Dirty Page Table
# End of log: txn 7 is a loser (never committed)

# REDO (scan forward from oldest recLSN = 42):
LSN=42: redo UPDATE on P1 (if P1.pageLSN < 42)
LSN=45: redo UPDATE on P2 (if P2.pageLSN < 45)
LSN=48: COMMIT t8 → no redo needed (no data change)
LSN=50: redo UPDATE on P1 (if P1.pageLSN < 50)
# Database now exactly matches pre-crash state

# UNDO (scan backward, only loser transactions):
LSN=50: undo UPDATE on P1 → write CLR(50) at LSN=55
LSN=42: undo UPDATE on P1 → write CLR(42) at LSN=56
# txn 7 fully rolled back; CLRs ensure this undo is never redone on next crash
```

## Related BEEs

- [BEE-8001](../transactions/acid-properties.md) -- ACID Properties: WAL is the implementation mechanism for Durability (the D in ACID) — the guarantee that committed transactions survive crashes is delivered by flushing log records before acknowledging commits
- [BEE-19002](consensus-algorithms-paxos-and-raft.md) -- Consensus Algorithms: Raft's distributed log is structurally a WAL replicated across a cluster; the leader appends entries and followers replay them, exactly as WAL works for crash recovery
- [BEE-6003](../data-storage/replication-strategies.md) -- Replication Strategies: physical replication (PostgreSQL streaming replication, MySQL replication) works by shipping WAL segments to standbys; logical replication decodes WAL into row-level changes
- [BEE-6005](../data-storage/storage-engines.md) -- Storage Engines: LSM-tree engines (RocksDB, LevelDB) and B-tree engines both use WAL, but for different scopes — LSM WAL covers only the current MemTable; B-tree WAL covers all unflushed pages

## References

- [ARIES: A Transaction Recovery Method -- Mohan et al., ACM TODS, March 1992](https://dl.acm.org/doi/10.1145/128765.128770)
- [Write-Ahead Logging -- PostgreSQL Documentation](https://www.postgresql.org/docs/current/wal-intro.html)
- [WAL Internals -- PostgreSQL Documentation](https://www.postgresql.org/docs/current/wal-internals.html)
- [InnoDB Redo Log -- MySQL Documentation](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)
- [Write-Ahead Log (WAL) -- RocksDB Wiki](https://github.com/facebook/rocksdb/wiki/Write-Ahead-Log-(WAL))
