# Findings: Hot Standby, Failover, and Switchover Operations

**Generated:** 2026-05-08
**Target article:** BEE-6012 — hot-standby-failover-and-switchover-operations
**Subagent mode:** PER-ARTICLE

## Topic-specific section heading proposal

Confirm the spec-suggested heading: **"Switchover vs Failover Decision Matrix"**. The PostgreSQL, Patroni, and GitLab sources all draw the same operational distinction (planned/healthy-cluster vs unplanned/unhealthy-cluster), and Patroni even encodes it as two separate REST endpoints with different preconditions, so a decision matrix is well-supported.

A second viable topic-specific section is **"Re-attaching a Former Primary with pg_rewind"** (the operational complement of failover that is independently load-bearing). Recommend including both since they are non-overlapping operator concerns.

## Claims

### Claim 1
- **Text:** Hot standby denotes the ability to connect to a PostgreSQL server and run read-only queries while it is in archive recovery or standby mode, supporting both replication and point-in-time-restore use cases.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/hot-standby.html
- **Pulled quote:** "Hot standby is the term used to describe the ability to connect to the server and run read-only queries while the server is in archive recovery or standby mode. This is useful both for replication purposes and for restoring a backup to a desired state with great precision."

### Claim 2
- **Text:** A standby exits recovery and accepts read-write transactions when an operator runs `pg_ctl promote` or calls `pg_promote()`; this is the mechanical core of every failover or switchover operation.
- **Target section:** Example
- **Source URL:** https://www.postgresql.org/docs/current/warm-standby.html
- **Pulled quote:** "Standby mode is exited and the server switches to normal operation when `pg_ctl promote` is run, or `pg_promote()` is called."

### Claim 3
- **Text:** Failover is the response to primary failure: the standby begins failover procedures and the cluster enters a degenerate single-server state until a new standby is rebuilt.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/warm-standby-failover.html
- **Pulled quote:** "Once failover to the standby occurs, there is only a single server in operation. This is known as a degenerate state. The former standby is now the primary, but the former primary is down and might stay down."

### Claim 4
- **Text:** Operators MUST have a mechanism (commonly STONITH — Shoot The Other Node In The Head) to inform a returning former primary that it is no longer primary, otherwise both nodes accept writes and data loss follows.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/warm-standby-failover.html
- **Pulled quote:** "If the primary server fails and the standby server becomes the new primary, and then the old primary restarts, you must have a mechanism for informing the old primary that it is no longer the primary. This is sometimes known as STONITH (Shoot The Other Node In The Head), which is necessary to avoid situations where both systems think they are the primary, which will lead to confusion and ultimately data loss."

### Claim 5
- **Text:** `pg_rewind` synchronizes a server with another copy of the same cluster after their timelines diverge, typically to bring an old primary back online as a standby of the new primary without taking a full base backup.
- **Target section:** Re-attaching a Former Primary with pg_rewind
- **Source URL:** https://www.postgresql.org/docs/current/app-pgrewind.html
- **Pulled quote:** "pg_rewind is a tool for synchronizing a PostgreSQL cluster with another copy of the same cluster, after the clusters' timelines have diverged… A typical scenario is to bring an old primary server back online after failover as a standby that follows the new primary."

### Claim 6
- **Text:** `pg_rewind` requires either `wal_log_hints` enabled in `postgresql.conf` or data checksums enabled at `initdb` time; without one of these the rewind will fail.
- **Target section:** Re-attaching a Former Primary with pg_rewind
- **Source URL:** https://www.postgresql.org/docs/current/app-pgrewind.html
- **Pulled quote:** "pg_rewind requires that the target server either has the wal_log_hints option enabled in postgresql.conf or data checksums enabled when the cluster was initialized with initdb (the default)."

### Claim 7
- **Text:** Patroni's `/switchover` endpoint only works on a healthy cluster with a current leader and may be scheduled for a future time, while `/failover` is for emergencies on unhealthy clusters and requires an explicit candidate.
- **Target section:** Switchover vs Failover Decision Matrix
- **Source URL:** https://patroni.readthedocs.io/en/latest/rest_api.html
- **Pulled quote:** "/switchover endpoint only works when the cluster is healthy (there is a leader)." / "/failover endpoint can be used to perform a manual failover when there are no healthy nodes."

### Claim 8
- **Text:** Patroni stores cluster state and elects a leader through a distributed consensus store (etcd, Consul, ZooKeeper, or Kubernetes), so leader election is a property of the DCS, not of PostgreSQL itself.
- **Target section:** Visual
- **Source URL:** https://docs.gitlab.com/administration/postgresql/replication_and_failover/
- **Pulled quote:** "Patroni heavily relies on Consul to store the state of the cluster and elect a leader."

### Claim 9
- **Text:** To prevent split-brain when DCS access is lost, Patroni uses a watchdog device that resets the entire host if Patroni cannot keep the leader key alive in the DCS — a software fencing layer below the cluster level.
- **Target section:** Best Practices
- **Source URL:** https://patroni.readthedocs.io/en/latest/watchdog.html
- **Pulled quote:** "To avoid split-brain Patroni needs to ensure PostgreSQL will not accept any transaction commits after leader key expires in the DCS." / "Watchdog devices are software or hardware mechanisms that will reset the whole system when they do not get a keepalive heartbeat within a specified timeframe."

### Claim 10
- **Text:** repmgr provides a planned switchover command (`repmgr standby switchover`) for executing a controlled role swap during maintenance windows, separate from the unplanned-failure path handled by repmgrd.
- **Target section:** Switchover vs Failover Decision Matrix
- **Source URL:** https://repmgr.org/docs/current/performing-switchover.html
- **Pulled quote:** "In some cases however it's desirable to promote the standby in a planned way, e.g. so maintenance can be performed on the primary; this kind of switchover is supported by the repmgr standby switchover command."

### Claim 11
- **Text:** Before a switchover, operators MUST quiesce the current primary — block or drain application access — and ensure WAL archiving is current, because PostgreSQL will not shut down while there is an archive backlog.
- **Target section:** Best Practices
- **Source URL:** https://repmgr.org/docs/current/performing-switchover.html
- **Pulled quote:** "You should be sure that the current primary can be shut down quickly and cleanly. In particular, access from applications should be minimalized or preferably blocked completely. Also be aware that if there is a backlog of files waiting to be archived, PostgreSQL will not shut down until archiving completes."

### Claim 12
- **Text:** Synchronous replication eliminates the failover-window data-loss risk that asynchronous streaming replication has, at the cost of every commit waiting for the standby's WAL durability.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/warm-standby.html
- **Pulled quote:** "PostgreSQL streaming replication is asynchronous by default. If the primary server crashes then some transactions that were committed may not have been replicated to the standby server, causing data loss." / "When requesting synchronous replication, each commit of a write transaction will wait until confirmation is received that the commit has been written to the write-ahead log on disk of both the primary and standby server."

### Claim 13
- **Text:** Replication slots prevent the primary from removing WAL that a standby still needs, but an abandoned slot will pin WAL indefinitely and can fill `pg_wal`; operators MUST drop slots that no longer have a consumer or set `max_slot_wal_keep_size`.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/warm-standby.html
- **Pulled quote:** "Beware that replication slots can cause the server to retain so many WAL segments that they fill up the space allocated for `pg_wal`. `max_slot_wal_keep_size` can be used to limit the size of WAL files retained by replication slots."

### Claim 14
- **Text:** An unused replication slot also blocks `VACUUM` and can in extreme cases force a shutdown to prevent transaction ID wraparound, so operators MUST treat dropped standbys as also requiring slot cleanup on the primary.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/logicaldecoding-explanation.html
- **Pulled quote:** "They will prevent removal of required resources even when there is no connection using them… In extreme cases this could cause the database to shut down to prevent transaction ID wraparound… So if a slot is no longer required it should be dropped."

### Claim 15
- **Text:** Client cutover is a separate problem from leader election: GitLab's reference architecture has Consul watch Patroni leader-key changes and rewrite PgBouncer's upstream configuration so connections follow the new primary automatically.
- **Target section:** Example
- **Source URL:** https://docs.gitlab.com/administration/postgresql/replication_and_failover/
- **Pulled quote:** "If that status changes, Consul runs a script which updates the PgBouncer configuration to point to the new PostgreSQL leader node and reloads the PgBouncer service."

### Claim 16
- **Text:** Hot standby query cancellation is governed by `max_standby_archive_delay` and `max_standby_streaming_delay`; conflicts that exceed these thresholds cause query cancellation so WAL replay can continue, which is the failure mode operators need to anticipate when offloading reads.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/hot-standby.html
- **Pulled quote:** "So the cancel mechanism has parameters, max_standby_archive_delay and max_standby_streaming_delay, that define the maximum allowed delay in WAL application. Conflicting queries will be canceled once it has taken longer than the relevant delay setting to apply any newly-received WAL data."

## Reference URLs (de-duplicated)

- https://www.postgresql.org/docs/current/hot-standby.html — PostgreSQL Global Development Group, "Hot Standby," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/warm-standby.html — PostgreSQL Global Development Group, "Log-Shipping Standby Servers," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/warm-standby-failover.html — PostgreSQL Global Development Group, "Failover," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/app-pgrewind.html — PostgreSQL Global Development Group, "pg_rewind," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/logicaldecoding-explanation.html — PostgreSQL Global Development Group, "Logical Decoding Concepts," PostgreSQL Documentation (current)
- https://patroni.readthedocs.io/en/latest/rest_api.html — Patroni Authors, "REST API," Patroni Documentation (current)
- https://patroni.readthedocs.io/en/latest/watchdog.html — Patroni Authors, "Watchdog support," Patroni Documentation (current)
- https://repmgr.org/docs/current/performing-switchover.html — 2ndQuadrant / EnterpriseDB, "Performing a Switchover with repmgr," repmgr Documentation (current)
- https://docs.gitlab.com/administration/postgresql/replication_and_failover/ — GitLab Inc., "Configure PostgreSQL replication and failover for Linux package installations," GitLab Documentation (current)

## Rejected sources

- repmgr index/TOC page — no substantive verbatim content; replaced with `performing-switchover.html`.
- repmgrd overview page — only headings and one definition sentence; insufficient depth.
- MySQL Group Replication page — fetched content was TOC/marketing-style framing; cross-vendor mention done in prose without direct citation.
- Patroni landing page — concrete claims live on `rest_api.html` and `watchdog.html`.
- Wikipedia, Medium, vendor marketing — not consulted per source-tier rule.

## Research notes

- The switchover/failover decision matrix topic-specific section is well-grounded by PostgreSQL docs, repmgr's separate switchover command, Patroni's two REST endpoints with different preconditions, and GitLab's same dichotomy as operator guidance.
- A second topic-specific section on `pg_rewind` is recommended because "what to do with the former primary" is independently load-bearing — it has its own prerequisites (`wal_log_hints` or data checksums), its own correctness model (timeline divergence), and is what makes failover practically reversible.
- Split-brain prevention has two layers worth distinguishing in Best Practices: (a) cluster-level fencing (STONITH, Patroni leader-key + watchdog) and (b) client-cutover (PgBouncer/Consul reload).
- Replication-slot hygiene is operator-relevant after every failover/switchover because the cluster topology changes.
- Cross-vendor coverage: MySQL Group Replication and Galera mentioned at prose level only; specific verbatim quote not captured.
