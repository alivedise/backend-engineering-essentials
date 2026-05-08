# Findings: Lock Contention and Deadlocks in Production

**Generated:** 2026-05-08
**Target article:** BEE-6013 — lock-contention-and-deadlocks-in-production
**Subagent mode:** PER-ARTICLE

## Topic-specific section heading proposal

**Confirmed:** `## Deadlock Forensics`

Both PostgreSQL (`log_lock_waits`, `deadlock_timeout`) and MySQL (`SHOW ENGINE INNODB STATUS`'s `LATEST DETECTED DEADLOCK` block, `innodb_print_all_deadlocks`) emit structured deadlock evidence that an on-call engineer must read field-by-field. This section reads those engine-emitted reports.

Optional secondary topic-specific section: `## Lock-Aware Migration Patterns` covering `SET lock_timeout` before DDL plus retry loops.

## Claims

### Claim 1
- **Text:** Both PostgreSQL and InnoDB resolve a deadlock by automatically aborting one transaction (the victim) so the others can proceed, which means application code MUST be prepared to retry on deadlock errors rather than treat them as permanent failures.
- **Target section:** Context
- **Source URL:** https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks.html
- **Pulled quote:** "When deadlock detection is enabled (the default) and a deadlock does occur, InnoDB detects the condition and rolls back one of the transactions (the victim). ... Thus, even if your application logic is correct, you must still handle the case where a transaction must be retried."

### Claim 2
- **Text:** Deadlocks are an expected operating condition rather than a system fault, and the canonical guidance from MySQL is that they only become a problem when their frequency makes specific transactions unrunnable.
- **Target section:** Context
- **Source URL:** https://dev.mysql.com/doc/refman/9.7/en/innodb-deadlocks-handling.html
- **Pulled quote:** "Deadlocks are not dangerous unless they are so frequent that you cannot run certain transactions at all. Normally, you must write your applications so that they are always prepared to re-issue a transaction if it gets rolled back because of a deadlock."

### Claim 3
- **Text:** The strongest preventive control against deadlocks is acquiring locks on multiple objects in a consistent order across every code path that touches them.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/explicit-locking.html
- **Pulled quote:** "The best defense against deadlocks is generally to avoid them by being certain that all applications using a database acquire locks on multiple objects in a consistent order."

### Claim 4
- **Text:** `SELECT ... FOR UPDATE SKIP LOCKED` is the canonical primitive for queue-style workers because it skips rows other workers are already processing instead of blocking on them, at the cost of a deliberately inconsistent view of the table.
- **Target section:** Example
- **Source URL:** https://www.postgresql.org/docs/current/sql-select.html
- **Pulled quote:** "With SKIP LOCKED, any selected rows that cannot be immediately locked are skipped. Skipping locked rows provides an inconsistent view of the data, so this is not suitable for general purpose work, but can be used to avoid lock contention with multiple consumers accessing a queue-like table."

### Claim 5
- **Text:** `NOWAIT` returns an immediate error when a row cannot be locked, giving the application explicit control over how long it is willing to wait for contended rows.
- **Target section:** Best Practices
- **Source URL:** https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html
- **Pulled quote:** "A locking read that uses NOWAIT never waits to acquire a row lock. The query executes immediately, failing with an error if a requested row is locked."

### Claim 6
- **Text:** PostgreSQL's `lock_timeout` aborts a statement that has been waiting too long for any lock — table, row, or other object — and the limit applies separately to each lock acquisition attempt rather than to the whole statement.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-client.html
- **Pulled quote:** "Abort any statement that waits longer than the specified amount of time while attempting to acquire a lock on a table, index, row, or other database object. The time limit applies separately to each lock acquisition attempt."

### Claim 7
- **Text:** `idle_in_transaction_session_timeout` exists specifically to keep idle sessions from holding locks indefinitely and from blocking vacuum from reclaiming dead tuples, and operators SHOULD set it on production systems.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-client.html
- **Pulled quote:** "This option can be used to ensure that idle sessions do not hold locks for an unreasonable amount of time. Even when no significant locks are held, an open transaction prevents vacuuming away recently-dead tuples that may be visible only to this transaction; so remaining idle for a long time can contribute to table bloat."

### Claim 8
- **Text:** During an incident, operators query `pg_locks` for `granted = false` rows and join against `pg_stat_activity` to identify which session is waiting and which one holds the conflicting lock.
- **Target section:** Example
- **Source URL:** https://wiki.postgresql.org/wiki/Lock_Monitoring
- **Pulled quote:** "Looking at pg_locks shows you what locks are granted and what processes are waiting for locks to be acquired. ... This query may be helpful to see what processes are blocking SQL statements (these only find row-level locks, not object-level locks)."

### Claim 9
- **Text:** `pg_blocking_pids(pid)` returns the array of PIDs blocking a given backend, which lets the operator walk the lock chain to the root holder rather than just the immediate blocker.
- **Target section:** Deadlock Forensics
- **Source URL:** https://pganalyze.com/blog/postgres-lock-monitoring
- **Pulled quote:** "pg_blocking_pids() ... returns 'the list of PIDs a particular query is waiting for (is blocked by).' ... follow the whole story, from queries that are waiting to the connection that is causing the lock waits in the first place."

### Claim 10
- **Text:** A high count of locks alone is not the operational signal; an ungranted lock that persists is what indicates trouble, because it means a backend is stuck waiting on a resource another session holds.
- **Target section:** Best Practices
- **Source URL:** https://www.crunchydata.com/blog/postgres-locking-when-is-it-concerning
- **Pulled quote:** "An ungranted lock for any significant length of time indicates an issue and is something that should be looked into."

### Claim 11
- **Text:** InnoDB's default deadlock detector picks the smallest transaction (by rows changed) as the victim, so a long-running write is statistically more likely to win against a small competing one.
- **Target section:** Deadlock Forensics
- **Source URL:** https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlock-detection.html
- **Pulled quote:** "InnoDB tries to pick small transactions to roll back, where the size of a transaction is determined by the number of rows inserted, updated, or deleted."

### Claim 12
- **Text:** The `LATEST DETECTED DEADLOCK` section in `SHOW ENGINE INNODB STATUS` shows each participant's `TRANSACTION`, `HOLDS THE LOCK(S)`, `WAITING FOR THIS LOCK TO BE GRANTED`, and a final `WE ROLL BACK TRANSACTION (N)` line that names the victim.
- **Target section:** Deadlock Forensics
- **Source URL:** https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlock-example.html
- **Pulled quote:** "*** (1) HOLDS THE LOCK(S): RECORD LOCKS space id 28 page no 4 ... lock mode S locks rec but not gap ... *** (1) WAITING FOR THIS LOCK TO BE GRANTED: RECORD LOCKS space id 27 page no 4 ... lock_mode X locks rec but not gap waiting ... *** WE ROLL BACK TRANSACTION (2)"

### Claim 13
- **Text:** `SHOW ENGINE INNODB STATUS` only retains the most recent deadlock, so production systems SHOULD enable `innodb_print_all_deadlocks` to log every deadlock to the MySQL error log for forensic analysis.
- **Target section:** Deadlock Forensics
- **Source URL:** https://dev.mysql.com/doc/refman/9.7/en/innodb-deadlocks-handling.html
- **Pulled quote:** "If frequent deadlock warnings cause concern, collect more extensive debugging information by enabling the innodb_print_all_deadlocks variable. Information about each deadlock, not just the latest one, is recorded in the MySQL error log."

### Claim 14
- **Text:** During a DDL migration, a session SHOULD `SET lock_timeout` to a small value before issuing the DDL, because PostgreSQL's lock queue is FIFO and a blocked DDL request will queue every conflicting read and write behind it until the original blocker clears.
- **Target section:** Lock-Aware Migration Patterns
- **Source URL:** https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries
- **Pulled quote:** "when DDL attempts to acquire locks, 'it starts blocking others' even while waiting for earlier transactions to complete. ... The solution avoids this by failing fast — timing out quickly allows other transactions to proceed unobstructed while retry loops handle the eventual lock acquisition."

### Claim 15
- **Text:** On very high-concurrency InnoDB workloads, the cost of running the deadlock detector itself becomes a bottleneck, and operators MAY disable it via `innodb_deadlock_detect` and instead rely on `innodb_lock_wait_timeout` to break deadlocks by timeout.
- **Target section:** Best Practices
- **Source URL:** https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlock-detection.html
- **Pulled quote:** "On high concurrency systems, deadlock detection can cause a slowdown when numerous threads wait for the same lock. At times, it may be more efficient to disable deadlock detection and rely on the innodb_lock_wait_timeout setting for transaction rollback when a deadlock occurs."

## Reference URLs (de-duplicated)

- https://www.postgresql.org/docs/current/explicit-locking.html — PostgreSQL Global Development Group, "Explicit Locking," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/sql-select.html — PostgreSQL Global Development Group, "SELECT," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/runtime-config-client.html — PostgreSQL Global Development Group, "Client Connection Defaults — Statement Behavior," PostgreSQL Documentation (current)
- https://wiki.postgresql.org/wiki/Lock_Monitoring — PostgreSQL Wiki, "Lock Monitoring" (current)
- https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks.html — Oracle Corporation, "Deadlocks in InnoDB," MySQL 8.4 Reference Manual (current)
- https://dev.mysql.com/doc/refman/9.7/en/innodb-deadlocks-handling.html — Oracle Corporation, "How to Minimize and Handle Deadlocks," MySQL 9.7 Reference Manual (current)
- https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlock-detection.html — Oracle Corporation, "Deadlock Detection," MySQL 8.4 Reference Manual (current)
- https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlock-example.html — Oracle Corporation, "An InnoDB Deadlock Example," MySQL 8.4 Reference Manual (current)
- https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html — Oracle Corporation, "Locking Reads," MySQL 8.4 Reference Manual (current)
- https://www.crunchydata.com/blog/postgres-locking-when-is-it-concerning — David Christensen, "Postgres Locking — When Is It Concerning?," Crunchy Data Blog (2022)
- https://pganalyze.com/blog/postgres-lock-monitoring — Keiko Oda, "Postgres Lock Monitoring," pganalyze blog (2022)
- https://postgres.ai/blog/20210923-zero-downtime-postgres-schema-migrations-lock-timeout-and-retries — Nikolay Samokhvalov, "Zero-Downtime Postgres Schema Migrations Need This: Lock Timeout and Retries," postgres.ai blog (2021)

## Rejected sources

- MySQL information-schema deadlock examples page — 404 Not Found.
- Medium and Dev.to community posts — tier rule rejects.

## Research notes

- The MySQL "How to Minimize and Handle Deadlocks" page exists at multiple version paths; the 9.7 URL was returned as canonical by current MySQL docs search.
- `SHOW ENGINE INNODB STATUS` block can render directly in the article's Visual or Example section.
- `lock_timeout` + DDL retry pattern is a strong second topic-specific angle.
- All claims are vendor-neutral in framing: PostgreSQL and MySQL/InnoDB receive parallel treatment.
