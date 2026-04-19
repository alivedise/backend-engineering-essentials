---
id: 6002
title: Indexing Deep Dive
state: draft
slug: indexing-deep-dive
---

# [BEE-121] Indexing Deep Dive

:::info
B-tree, hash, full-text, composite, covering, partial, and full-text indexes — what they are, when to use them, and when not to.
:::

:::tip Deep Dive
For database-level indexing internals and storage engine details, see [DEE Indexing and Storage series](https://alivedise.github.io/database-engineering-essentials/145).
:::

## Context

Indexes are the single most impactful performance tool available to a backend engineer. A missing index on a large table can turn a 1ms query into a 30-second full table scan. But indexes are not free: every index you add increases write latency and consumes disk space. The goal is to index deliberately, verify with EXPLAIN, and remove indexes that are not pulling their weight.

**Further reading:**
- [Use The Index, Luke — Anatomy of an SQL Index](https://use-the-index-luke.com/sql/anatomy) — the canonical practical guide
- [PostgreSQL Documentation: Index Types](https://www.postgresql.org/docs/current/indexes-types.html) — official reference
- [DDIA Chapter 3 — Storage and Retrieval (O'Reilly)](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781491903063/ch03.html) — theoretical underpinning

## Principle

**Trade write speed and storage space for read speed — but only where the trade is worth it.**

An index is a separate data structure that the database maintains in parallel with your table. Every INSERT, UPDATE, and DELETE must also update every applicable index. In return, qualifying reads can skip the full table scan and jump directly to the relevant rows.

## What Is an Index?

At the most fundamental level, an index maps search key values to row locations (heap pointers). Without an index, finding all users with `email = 'alice@example.com'` requires scanning every row in the table — O(n). With an index on `email`, the database traverses a B-tree — O(log n) — and fetches only the matching pages.

The trade-off in one sentence: **space + write overhead → faster reads**.

## B-Tree Indexes (The Default)

B-tree (Balanced Tree) is the default index type in PostgreSQL, MySQL, and most relational databases. It is the right choice for the vast majority of use cases.

### Structure

```
                    [Root Node]
                   /     |      \
         [Internal]  [Internal]  [Internal]
         /      \       |        /       \
     [Leaf]  [Leaf] [Leaf]  [Leaf]   [Leaf]
        |       |      |       |        |
     [Data]  [Data] [Data]  [Data]   [Data]
      Pages   Pages  Pages   Pages    Pages
```

A B-tree lookup works as follows:

1. Start at the root node.
2. At each internal node, follow the branch whose key range contains the search value.
3. Arrive at a leaf node that holds the actual heap pointer (row location).
4. Fetch the data page.

The tree is kept balanced — all leaf nodes are at the same depth — so every lookup is O(log n) regardless of which value you look for. Each node typically holds hundreds of entries, keeping the tree shallow even for hundreds of millions of rows.

Leaf nodes are also connected via a doubly linked list, which makes range scans efficient: once the start of a range is found, the database walks the linked list forward without re-traversing the tree.

### Supported Operations

| Operation | Supported |
|---|---|
| Equality (`=`) | Yes |
| Range (`<`, `>`, `BETWEEN`) | Yes |
| `ORDER BY` (sorted output) | Yes |
| `LIKE 'prefix%'` | Yes |
| `LIKE '%suffix'` | No |
| `IS NULL` | Yes (PostgreSQL) |

### When to Use B-Tree

- Primary keys and unique constraints (created automatically)
- Columns used in `WHERE`, `JOIN ON`, or `ORDER BY`
- Range queries and prefix `LIKE` patterns

## Hash Indexes

A hash index stores a 32-bit hash of each indexed value and maps it directly to the row location. Lookups are O(1) average case.

**Limitation:** Hash indexes only support equality comparisons (`=`). They cannot serve range queries, sorting, or `LIKE` patterns.

**PostgreSQL note:** Hash indexes in PostgreSQL are WAL-logged since version 10 and are safe to use, but B-tree almost always wins because B-tree handles both equality and range queries. Reserve hash indexes for specific workloads where equality-only O(1) lookup is the bottleneck and you have measured the difference.

```sql
CREATE INDEX idx_users_session_token ON users USING HASH (session_token);
```

## Composite (Compound) Indexes

A composite index covers multiple columns. The column order in the definition is critical.

```sql
-- Correct order for the query pattern below
CREATE INDEX idx_users_lastname_created ON users (last_name, created_at);
```

### The Leftmost Prefix Rule

A composite index `(A, B, C)` can serve queries that filter on:
- `A` alone
- `A` and `B`
- `A`, `B`, and `C`

It **cannot** efficiently serve queries that filter only on `B`, only on `C`, or `B` and `C` without `A`. The database cannot use the index without the leftmost column.

```sql
-- Uses the index (last_name is the leftmost column)
SELECT * FROM users WHERE last_name = 'Smith' AND created_at > '2024-01-01';

-- Uses the index partially (last_name only, created_at filter applied after)
SELECT * FROM users WHERE last_name = 'Smith';

-- Cannot use the index efficiently
SELECT * FROM users WHERE created_at > '2024-01-01';
```

**Rule of thumb:** Put the most selective column (the one that eliminates the most rows) first, unless the query pattern dictates otherwise.

## Covering Indexes (Index-Only Scans)

A covering index includes all columns required by a query — both the filter columns and the selected columns. The database can satisfy the entire query from the index without touching the main table at all (an "index-only scan").

```sql
-- Query: get email and created_at for active users in a date range
SELECT email, created_at FROM users
WHERE status = 'active' AND created_at BETWEEN '2024-01-01' AND '2024-12-31';

-- Covering index: include all columns the query touches
CREATE INDEX idx_users_status_created_email
    ON users (status, created_at)
    INCLUDE (email);   -- PostgreSQL 11+ INCLUDE syntax
```

Covering indexes can eliminate the most expensive part of a query — heap fetches — but they cost more storage and write overhead. Use them when a query is extremely hot and heap fetches are the measured bottleneck.

## Full-Text Indexes

For searching text content (documents, descriptions, comments), neither B-tree nor hash is appropriate. Full-text indexes tokenize, stem, and store an inverted index that maps each word to the rows containing it.

```sql
-- PostgreSQL: GIN index on a tsvector column
ALTER TABLE articles ADD COLUMN search_vector tsvector;
CREATE INDEX idx_articles_fts ON articles USING GIN (search_vector);

-- Query
SELECT title FROM articles
WHERE search_vector @@ to_tsquery('english', 'database & indexing');
```

For dedicated full-text search at scale, consider Elasticsearch or OpenSearch rather than putting that load on the relational database.

## Partial Indexes

A partial index only indexes rows that satisfy a WHERE condition. It is smaller, faster to scan, and cheaper to maintain than a full-column index.

```sql
-- Index only active users (assuming most users are inactive)
CREATE INDEX idx_users_active_email ON users (email)
WHERE status = 'active';

-- Index only unprocessed jobs
CREATE INDEX idx_jobs_pending ON jobs (created_at)
WHERE processed_at IS NULL;
```

Partial indexes are underused. They are ideal for tables where queries consistently target a small, well-defined subset of rows.

## Index Overhead: The Real Cost

Every index you create has ongoing costs:

| Cost | Description |
|---|---|
| **Write amplification** | Every INSERT/UPDATE/DELETE must update all applicable indexes. A table with 8 indexes requires up to 9 write operations per row change. |
| **Storage** | A B-tree index on a large table can be gigabytes. Total index size often exceeds table size. |
| **Vacuum/maintenance** | Bloated indexes from dead tuples must be cleaned. Frequent writes cause index fragmentation. |
| **Query planner overhead** | More indexes means the planner evaluates more paths. Rarely a problem, but worth knowing. |

## When NOT to Index

| Scenario | Reason |
|---|---|
| Low-cardinality columns (`boolean`, `status` with 3 values, `gender`) | The index is almost never selective enough to be used. A full scan is often faster than fetching 30% of the table via index lookups. |
| Small tables (< ~1,000 rows) | The planner will choose a sequential scan anyway; it is cheaper than a B-tree traversal. |
| Write-heavy workloads (bulk import, event streams) | Write amplification dominates. Drop indexes before bulk loads, rebuild after. |
| Columns never used in WHERE, JOIN, or ORDER BY | A read-never index is pure overhead. |
| Columns already covered by a composite index | If `(A, B)` exists, a separate index on `A` alone is usually redundant. |

## EXPLAIN Basics

Never guess whether an index is being used. Run EXPLAIN (or EXPLAIN ANALYZE) and read the output.

```sql
EXPLAIN ANALYZE
SELECT id, email FROM users
WHERE last_name = 'Smith' AND created_at > '2024-01-01';
```

Key nodes to look for:

| Node | Meaning |
|---|---|
| `Seq Scan` | Full table scan. No index used (or planner chose not to). |
| `Index Scan` | Index used, then heap fetched for full row. |
| `Index Only Scan` | Covering index — no heap access. Fast. |
| `Bitmap Heap Scan` | Index used to collect row locations, then heap fetched in bulk. Efficient for moderate result sets. |

Look at `rows=` (estimated) vs actual rows. A large discrepancy means stale statistics — run `ANALYZE` to refresh them.

## Worked Example: Users Table

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

### Query 1: Email Lookup

```sql
SELECT * FROM users WHERE email = 'alice@example.com';
```

Single-column unique index on `email`:

```sql
CREATE UNIQUE INDEX idx_users_email ON users (email);
```

EXPLAIN output (good):

```
Index Scan using idx_users_email on users
  (cost=0.43..8.45 rows=1 width=120)
  Index Cond: (email = 'alice@example.com')
```

### Query 2: Last Name + Date Range

```sql
SELECT id, email FROM users
WHERE last_name = 'Smith' AND created_at > '2024-01-01';
```

Composite index with correct column order (high-cardinality `last_name` first):

```sql
CREATE INDEX idx_users_lastname_created ON users (last_name, created_at);
```

EXPLAIN output (good):

```
Index Scan using idx_users_lastname_created on users
  (cost=0.56..12.34 rows=23 width=52)
  Index Cond: ((last_name = 'Smith') AND (created_at > '2024-01-01'))
```

Wrong column order — `(created_at, last_name)` — would require the planner to scan all rows after 2024-01-01 and filter on `last_name` afterward, wasting most of the index benefit.

### Query 3: Status (Low-Cardinality Anti-Pattern)

```sql
CREATE INDEX idx_users_status ON users (status);  -- Anti-pattern
```

With only 3 distinct values, this index is almost never used. The planner calculates that fetching 33% of the table via index lookups is more expensive than a single sequential scan. Use a **partial index** instead if you specifically query `status = 'active'`:

```sql
CREATE INDEX idx_users_active ON users (created_at)
WHERE status = 'active';
```

## Common Mistakes

1. **Indexing every column** — Write overhead and storage waste. Index only columns that appear in WHERE, JOIN, or ORDER BY clauses in hot queries.

2. **Wrong column order in a composite index** — The leftmost prefix rule is not obvious. Always check the query pattern before defining column order.

3. **Not using EXPLAIN to verify** — Indexes can be created successfully and never used. The planner makes its own decisions based on statistics and cost estimates. Always verify.

4. **Indexing low-cardinality columns** — A boolean or status column with a few values is almost always the wrong target. Use a partial index on the specific value you query, or skip indexing entirely.

5. **Missing indexes on foreign keys** — Joins on unindexed foreign keys cause sequential scans on the child table. Always index foreign key columns unless the child table is tiny.

## Related BEPs

- [BEE-120 — SQL vs NoSQL](./120.md): Choosing the right database affects what index types are available and relevant.
- [BEE-124 — Storage Engines](./124.md): How the storage engine (InnoDB, WiredTiger, etc.) interacts with indexes at the page level.
- [BEE-125 — Query Optimization](./125.md): EXPLAIN in depth, statistics, and query planner hints.
- [BEE-303 — Profiling](303.md): Measuring the actual impact of index changes in production.
