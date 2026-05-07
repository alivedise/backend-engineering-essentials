---
title: Expand data-storage (2026-05-08)
date: 2026-05-08
status: Approved for research/write
category: data-storage
locale: en + zh-tw
---

# Expand data-storage: Database Operations Material

## Scope

Add **five** articles to the `data-storage` category to fill the gap in database-operations material from a backend-engineer-as-operator perspective. Triggered by a brainstorm about whether DocumentDB warranted a BEE article (decided: no, DEE-401 owns document modeling). The brainstorm surfaced that `data-storage` (8 articles) is thin on operational topics: recovery, durability, MVCC maintenance, standby management, and lock contention.

Category boundary held: BEE = backend engineer as database user/operator. DEE (sister project) owns kernel-author internals; existing data-storage articles already cross-link to DEE for that depth. Topics that are pure-internals were rejected during gap discovery.

## Articles

| ID | Slug | Title (EN) |
|---|---|---|
| 6009 | `database-backup-strategies-and-point-in-time-recovery` | Database Backup Strategies and Point-in-Time Recovery |
| 6010 | `durability-fsync-and-the-crash-safety-contract` | Durability, fsync, and the Crash Safety Contract |
| 6011 | `vacuum-bloat-and-transaction-id-wraparound` | VACUUM, Bloat, and Transaction-ID Wraparound |
| 6012 | `hot-standby-failover-and-switchover-operations` | Hot Standby, Failover, and Switchover Operations |
| 6013 | `lock-contention-and-deadlocks-in-production` | Lock Contention and Deadlocks in Production |

All five: `state: draft`, EN + zh-TW parity, written from the operator perspective.

## Per-article scope

### BEE-6009 — Database Backup Strategies and Point-in-Time Recovery

Full vs incremental vs differential backups, WAL/binlog archiving, RPO/RTO targeting, retention windows, restore verification (the "untested backup is not a backup" rule), encryption at rest in backup pipelines. Covers logical (`pg_dump`, `mysqldump`) vs physical (file-system snapshot, `pg_basebackup`, Percona XtraBackup) trade-offs. PITR mechanics: replaying WAL/binlog forward from a base backup to a target timestamp or LSN.

Topic-specific section candidate: **"Restore Drill Playbook"** — what a backend team must rehearse, not just configure.

### BEE-6010 — Durability, fsync, and the Crash Safety Contract

What `fsync()` actually guarantees on Linux, the 2018 fsyncgate (silent error swallowing on retry), the Wisconsin USENIX ATC 2020 paper on filesystem crash consistency, and how PostgreSQL/MySQL changed `synchronous_commit` and `innodb_flush_log_at_trx_commit` semantics in response. Covers `wal_sync_method`, `O_DIRECT`, write-barriers, and cloud-block-storage durability claims (EBS, GCE PD).

Topic-specific section candidate: **"What fsync Does Not Guarantee"** — the operator-facing list of failure modes.

### BEE-6011 — VACUUM, Bloat, and Transaction-ID Wraparound

PostgreSQL MVCC garbage from a maintenance perspective: dead tuple accumulation, table/index bloat, autovacuum tuning (`autovacuum_vacuum_scale_factor`, `autovacuum_naptime`), `VACUUM FULL` vs `pg_repack`, freeze maps, and the XID wraparound shutdown. The maintenance-facing companion to the existing MVCC theory article (BEE-19026).

Topic-specific section candidate: **"Wraparound Incident Playbook"** — what to do when the database has stopped accepting writes because freeze ran out of headroom.

### BEE-6012 — Hot Standby, Failover, and Switchover Operations

The runbook layer that complements the conceptual replication-strategies.md (BEE-6003): promoting a standby (planned vs unplanned), Patroni/repmgr leader election, `pg_rewind` for re-attaching a former primary, replication slot management, post-failover catch-up, switchover for OS upgrades, and split-brain prevention via fencing/STONITH.

Topic-specific section candidate: **"Switchover vs Failover Decision Matrix"** — when each operation is appropriate.

### BEE-6013 — Lock Contention and Deadlocks in Production

The operator companion to existing theory articles (BEE-19021 Two-Phase Locking, BEE-11003 Locks/Mutexes/Semaphores, BEE-11006 Optimistic vs Pessimistic Concurrency). Covers `SELECT FOR UPDATE` / `SELECT FOR UPDATE SKIP LOCKED` patterns, reading deadlock logs (PostgreSQL `pg_stat_activity` + `pg_locks`, MySQL `INNODB STATUS`), `lock_timeout` / `statement_timeout` / `idle_in_transaction_session_timeout`, blocking-query investigation, and lock-aware migration patterns.

Topic-specific section candidate: **"Deadlock Forensics"** — how to read engine-emitted deadlock graphs and identify the offending transactions.

## Section structure (all 5 articles)

Per `~/.claude/skills/expanding-category-articles/templates/article.md` and CLAUDE.md:

1. `## Context` — landscape, history, key papers/RFCs/specs.
2. `## Visual` — one Mermaid diagram OR one structured table.
3. `## Example` — concrete walkthrough grounded in a finding.
4. `## Best Practices` — RFC 2119 keywords (MUST, SHOULD, MAY).
5. **At least one `## <Topic-Specific Section>`** — see candidate per article above.
6. `## Related Topics` — cross-links by slug.
7. `## References` — authoritative sources only, every URL traces to findings.

Optional: `## Design Thinking`, `## Deep Dive`, `## Changelog` when the topic warrants depth.

## Research targets

Common tier-1/tier-2 sources expected across the five articles:

- PostgreSQL official documentation (postgresql.org/docs)
- MySQL Reference Manual (dev.mysql.com/doc)
- USENIX ATC 2020: Rebello et al., "Can Applications Recover from fsync Failures?"
- Wisconsin ADSL filesystem crash-consistency papers
- LWN coverage of fsyncgate (lwn.net/Articles/752063/)
- pgBackRest user guide (pgbackrest.org/user-guide.html)
- Percona engineering blog (named-author entries only)
- AWS RDS / Aurora documentation (operational sections only, not marketing)
- Patroni documentation (patroni.readthedocs.io)
- pganalyze / EnterpriseDB engineering posts (named-author entries)
- DDIA Chapter 5 (Replication) and Chapter 7 (Transactions) — for theory grounding when needed

## Constraints

- Vendor-neutral framing where possible. Cloud-vendor docs are acceptable as sources but should not center an article around one vendor's product naming.
- All factual claims trace to a citation in the per-article findings doc. No invented URLs.
- Polish-documents skill MUST run on both EN and zh-TW before commit (Phase 4d).
- No "核心" / "the core insight" / "key takeaway" / "核心洞見" preambles (per global CLAUDE.md and feedback memory).
- No contrastive negation, no em-dash filler chains, no unanchored superlatives, no "可以 X 可以 Y 可以 Z" stacking in zh-TW.
- Each article includes at least one topic-specific `##` section per the canonical template.
- All five articles produced sequentially, each in its own commit. Single PR at the end.

## Phase 4 loop

For each article in 6009 → 6013 order:
1. Research (PER-ARTICLE mode) → persist to `docs/superpowers/research/<slug>.md`
2. Write EN from findings → `docs/en/data-storage/<slug>.md`
3. Translate to zh-TW → `docs/zh-tw/data-storage/<slug>.md`
4. Polish-documents skill on both locale files
5. Run validation gates (frontmatter, structure, references, findings coverage)
6. Commit: `docs(data-storage): add <title> (BEE-<id>)`

After all 5 land: batch ID-uniqueness scan (Phase 5), then handoff (Phase 6).
