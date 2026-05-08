# Findings: VACUUM, Bloat, and Transaction-ID Wraparound

**Generated:** 2026-05-08
**Target article:** BEE-6011 — vacuum-bloat-and-transaction-id-wraparound
**Subagent mode:** PER-ARTICLE

## Topic-specific section confirmation

**Confirmed heading:** `## Wraparound Incident Playbook`

The spec's suggested heading is the right one. The Sentry 2015 postmortem provides a real-world incident anatomy (single-user mode, table truncation as last resort) that anchors the section concretely. A second topic-specific section may also be warranted: `## Bloat Remediation: VACUUM FULL vs. pg_repack` since the choice between online vs. offline reorg is a distinct operator decision from wraparound emergency response. Recommend both.

## Claims

### Claim 1
- **Text:** PostgreSQL's MVCC means `UPDATE` and `DELETE` do not immediately remove old row versions; the space they occupy must be reclaimed by VACUUM to avoid unbounded disk growth.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/routine-vacuuming.html
- **Pulled quote:** "In PostgreSQL, an `UPDATE` or `DELETE` of a row does not immediately remove the old version of the row... The space it occupies must then be reclaimed for reuse by new rows, to avoid unbounded growth of disk space requirements. This is done by running `VACUUM`."

### Claim 2
- **Text:** Standard VACUUM marks dead-row space for reuse but does not return space to the operating system except in narrow end-of-table cases.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/sql-vacuum.html
- **Pulled quote:** "Plain `VACUUM` (without `FULL`) simply reclaims space and makes it available for re-use... However, extra space is not returned to the operating system (in most cases); it's just kept available for re-use within the same table."

### Claim 3
- **Text:** Transaction IDs are 32-bit; without periodic freezing a cluster running more than ~4 billion transactions suffers wraparound where past transactions appear to be in the future, causing rows to become invisible.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/routine-vacuuming.html
- **Pulled quote:** "since transaction IDs have limited size (32 bits) a cluster that runs for a long time (more than 4 billion transactions) would suffer _transaction ID wraparound_: the XID counter wraps around to zero, and all of a sudden transactions that were in the past appear to be in the future — which means their output become invisible. In short, catastrophic data loss."

### Claim 4
- **Text:** Every table in every database must be vacuumed at least once every two billion transactions to keep wraparound at bay.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/routine-vacuuming.html
- **Pulled quote:** "To avoid this, it is necessary to vacuum every table in every database at least once every two billion transactions."

### Claim 5
- **Text:** When the oldest XIDs reach 40 million transactions from wraparound, PostgreSQL emits warnings; when fewer than 3 million remain, it refuses to assign new XIDs and only read-only transactions can start.
- **Target section:** Wraparound Incident Playbook
- **Source URL:** https://www.postgresql.org/docs/current/routine-vacuuming.html
- **Pulled quote:** "the system will refuse to assign new XIDs once there are fewer than three million transactions left until wraparound: `ERROR: database is not accepting commands that assign new XIDs to avoid wraparound data loss in database \"mydb\"`... In this condition any transactions already in progress can continue, but only read-only transactions can be started. Operations that modify database records or truncate relations will fail."

### Claim 6
- **Text:** The visibility map lets VACUUM skip pages whose tuples are visible to all transactions, and lets the planner answer index-only scans without heap fetches.
- **Target section:** Visual
- **Source URL:** https://www.postgresql.org/docs/current/routine-vacuuming.html
- **Pulled quote:** "Vacuum maintains a visibility map for each table to keep track of which pages contain only tuples that are known to be visible to all active transactions... vacuum itself can skip such pages on the next run, since there is nothing to clean up."

### Claim 7
- **Text:** Autovacuum's default `autovacuum_vacuum_scale_factor` of 0.2 means a table only triggers vacuum after 20% of its rows are dead, which is wildly too lazy on large tables.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-autovacuum.html
- **Pulled quote:** "Specifies a fraction of the table size to add to `autovacuum_vacuum_threshold` when deciding whether to trigger a `VACUUM`. The default is `0.2` (20% of table size)."

### Claim 8
- **Text:** For a 1 TB table, the 20% scale factor allows up to 200 GB of dead rows to accumulate before cleanup, producing a single huge vacuum job; lowering to 0.01 or using a flat threshold of 10000 is recommended for large tables.
- **Target section:** Best Practices
- **Source URL:** https://www.enterprisedb.com/blog/autovacuum-tuning-basics
- **Pulled quote:** "for a 1TB table this means we can accumulate up to 200GB of dead rows, and then when the cleanup finally happens it will have to do a lot of work at once... The proper solution is to trigger the cleanup more often. This can be done by significantly decreasing the scale factor, perhaps like this: `autovacuum_vacuum_scale_factor = 0.01`"

### Claim 9
- **Text:** Autovacuum launches with a default `autovacuum_naptime` of one minute and distributes work across databases, launching one worker per database every naptime/N seconds.
- **Target section:** Visual
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-autovacuum.html
- **Pulled quote:** "Specifies the minimum delay between autovacuum runs on any given database... The default is one minute (`1min`)."

### Claim 10
- **Text:** Autovacuum forces a wraparound-prevention vacuum once a table's `relfrozenxid` exceeds `autovacuum_freeze_max_age` (default 200 million), and these runs are not auto-cancelled even if autovacuum is otherwise disabled.
- **Target section:** Wraparound Incident Playbook
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-autovacuum.html
- **Pulled quote:** "Specifies the maximum age (in transactions) that a table's `pg_class`.`relfrozenxid` field can attain before a `VACUUM` operation is forced to prevent transaction ID wraparound within the table. Note that the system will launch autovacuum processes to prevent wraparound even when autovacuum is otherwise disabled."

### Claim 11
- **Text:** A wraparound-prevention autovacuum is not interrupted by lock conflicts the way a normal autovacuum would be.
- **Target section:** Wraparound Incident Playbook
- **Source URL:** https://www.postgresql.org/docs/current/routine-vacuuming.html
- **Pulled quote:** "if the autovacuum is running to prevent transaction ID wraparound (i.e., the autovacuum query name in the `pg_stat_activity` view ends with `(to prevent wraparound)`), the autovacuum is not automatically interrupted."

### Claim 12
- **Text:** `VACUUM FULL` rewrites the entire table to a new file and returns space to the OS, but takes an `ACCESS EXCLUSIVE` lock and requires extra disk space for the rewrite.
- **Target section:** Bloat Remediation: VACUUM FULL vs. pg_repack
- **Source URL:** https://www.postgresql.org/docs/current/sql-vacuum.html
- **Pulled quote:** "Selects \"full\" vacuum, which can reclaim more space, but takes much longer and exclusively locks the table. This method also requires extra disk space, since it writes a new copy of the table and doesn't release the old copy until the operation is complete."

### Claim 13
- **Text:** `pg_repack` removes bloat online without holding an exclusive lock for the duration of processing — the operational alternative to `VACUUM FULL` for production tables.
- **Target section:** Bloat Remediation: VACUUM FULL vs. pg_repack
- **Source URL:** https://github.com/reorg/pg_repack
- **Pulled quote:** "pg_repack is a PostgreSQL extension which lets you remove bloat from tables and indexes... Unlike CLUSTER and VACUUM FULL it works online, without holding an exclusive lock on the processed tables during processing."

### Claim 14
- **Text:** Sentry's July 2015 outage was triggered by autovacuum failing to keep up on one massive event-rollup table while writes continued, eventually forcing a single-user-mode recovery and a table truncation.
- **Target section:** Example
- **Source URL:** https://blog.sentry.io/transaction-id-wraparound-in-postgres/
- **Pulled quote:** "By querying Postgres' internal statistics we identified that the autovacuums actually had finished on all of the relations except one... Our only choice at this point was to shut down the database and restart in single-user mode... we made the call to truncate the table. Five minutes later, the system was fully restored."

### Claim 15
- **Text:** Operators should monitor `pg_stat_user_tables.n_dead_tup` and `last_autovacuum` per table to catch tables where autovacuum is falling behind before bloat or wraparound becomes critical.
- **Target section:** Best Practices
- **Source URL:** https://docs.aws.amazon.com/prescriptive-guidance/latest/postgresql-maintenance-rds-aurora/autovacuum.html
- **Pulled quote:** "Monitoring the number of dead tuples in each table, especially in frequently updated tables, helps you determine if the autovacuum processes are periodically removing the dead tuples so their disk space can be reused for better performance. You can use the following query to check the number of dead tuples and when the last autovacuum ran on the tables: `SELECT relname AS TableName, n_live_tup AS LiveTuples, n_dead_tup AS DeadTuples, last_autovacuum AS Autovacuum, last_autoanalyze AS Autoanalyze FROM pg_stat_user_tables;`"

### Claim 16
- **Text:** Live autovacuum activity can be inspected by filtering `pg_stat_activity` for `autovacuum:` query strings; rapid back-to-back vacuums on the same table indicate the table cannot keep up.
- **Target section:** Best Practices
- **Source URL:** https://pganalyze.com/blog/visualizing-and-tuning-postgres-autovacuum
- **Pulled quote:** "SELECT pid, query FROM pg_stat_activity WHERE query LIKE 'autovacuum: %';"

## Reference URLs (de-duplicated)

- https://www.postgresql.org/docs/current/routine-vacuuming.html — PostgreSQL Global Development Group, "Routine Vacuuming," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/runtime-config-autovacuum.html — PostgreSQL Global Development Group, "Automatic Vacuuming," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/sql-vacuum.html — PostgreSQL Global Development Group, "VACUUM," PostgreSQL Documentation (current)
- https://github.com/reorg/pg_repack — Daniele Varrazzo et al., "pg_repack — Reorganize tables in PostgreSQL databases with minimal locks," GitHub project README
- https://www.enterprisedb.com/blog/autovacuum-tuning-basics — Tomas Vondra, "Autovacuum Tuning Basics," EnterpriseDB blog (2024)
- https://pganalyze.com/blog/visualizing-and-tuning-postgres-autovacuum — Lukas Fittl, "Visualizing and tuning Postgres autovacuum," pganalyze blog
- https://docs.aws.amazon.com/prescriptive-guidance/latest/postgresql-maintenance-rds-aurora/autovacuum.html — AWS Prescriptive Guidance, "Vacuuming and analyzing tables automatically," AWS Documentation
- https://blog.sentry.io/transaction-id-wraparound-in-postgres/ — David Cramer, "Transaction ID Wraparound in Postgres," Sentry Engineering Blog (2015)

## Rejected sources

- Wikipedia entries on MVCC / VACUUM — disallowed by tier rule.
- BattleMetrics knowledge-base wraparound article — vendor support knowledge base, no named author.
- malisper.me transaction-ID-wraparound post — personal blog, redundant with Sentry postmortem.
- SQLServerCentral "Downtime Caused by..." article — unverified author profile.

## Research notes

- The Sentry postmortem is the canonical first-party wraparound incident write-up. Recovery sequence (single-user mode, then truncate) is the textbook last-ditch playbook.
- Default `autovacuum_freeze_max_age` is 200 million, far below the 2-billion theoretical limit. The gap exists to give autovacuum runway; it is not the wraparound point itself.
- AWS RDS/Aurora defaults differ: `autovacuum_vacuum_scale_factor` is 0.1 on RDS/Aurora vs. 0.2 upstream. Worth a callout.
- `vacuum_freeze_table_age` (default 150 million) triggers an aggressive scan, distinct from the wraparound-prevention autovacuum trigger at `autovacuum_freeze_max_age` (200 million). Both should appear in the Visual to avoid muddling them.
- Sister article BEE-19026 (mvcc-multi-version-concurrency-control) covers MVCC theory; this article should link to it and refer back rather than re-explaining MVCC fundamentals.
- Recommended Mermaid diagrams: (1) MVCC dead-tuple lifecycle, (2) XID space with wraparound horizon, freeze threshold, warning threshold, and write-refusal threshold marked.
