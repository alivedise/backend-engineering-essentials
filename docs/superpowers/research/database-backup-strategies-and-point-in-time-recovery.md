# Findings: Database Backup Strategies and Point-in-Time Recovery

**Generated:** 2026-05-08
**Target article:** BEE-6009 — database-backup-strategies-and-point-in-time-recovery
**Subagent mode:** PER-ARTICLE

## Claims

### Claim 1

- **Text:** PostgreSQL's WAL captures every change made to data files, which is the foundation that lets a base backup plus archived WAL streams replay forward to a target time.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/continuous-archiving.html
- **Pulled quote:** "At all times, PostgreSQL maintains a write ahead log (WAL) in the pg_wal/ subdirectory of the cluster's data directory. The log records every change made to the database's data files."

### Claim 2

- **Text:** Backend operators choose among three PostgreSQL backup approaches — SQL dump, file-system level backup, and continuous archiving — each with distinct restore semantics.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/backup.html
- **Pulled quote:** "There are three fundamentally different approaches to backing up PostgreSQL data: SQL dump; File system level backup; Continuous archiving. Each has its own strengths and weaknesses; each is discussed in turn in the following sections."

### Claim 3

- **Text:** Logical dumps via `pg_dump` produce a snapshot SQL file that is portable across PostgreSQL versions and architectures, but cannot be played forward to an arbitrary point in time.
- **Target section:** Context
- **Source URL:** https://www.postgresql.org/docs/current/backup-dump.html
- **Pulled quote:** "An important advantage of pg_dump over the other backup methods described later is that pg_dump's output can generally be re-loaded into newer versions of PostgreSQL, whereas file-level backups and continuous archiving are both extremely server-version-specific. pg_dump is also the only method that will work when transferring a database to a different machine architecture, such as going from a 32-bit to a 64-bit server."

### Claim 4

- **Text:** A naive `tar` of `$PGDATA` while the server is running produces an unusable backup; only stopping the server or taking a consistent file-system snapshot yields a recoverable copy.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/backup-file.html
- **Pulled quote:** "The database server must be shut down in order to get a usable backup. Half-way measures such as disallowing all connections will not work (in part because tar and similar tools do not take an atomic snapshot of the state of the file system, but also because of internal buffering within the server)."

### Claim 5

- **Text:** PITR works by stopping WAL replay at an operator-chosen target — a timestamp, named restore point, or transaction ID — making "right before the bad statement" the practical recovery target after operator error.
- **Target section:** Example
- **Source URL:** https://www.postgresql.org/docs/current/continuous-archiving.html
- **Pulled quote:** "If you want to recover to some previous point in time (say, right before the junior DBA dropped your main transaction table), just specify the required stopping point. You can specify the stop point, known as the 'recovery target', either by date/time, named restore point or by completion of a specific transaction ID."

### Claim 6

- **Text:** Recovery requires a continuous WAL chain from at least the start of the base backup; gaps in the archive break PITR even when the base backup is intact.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/continuous-archiving.html
- **Pulled quote:** "To recover successfully using continuous archiving (also called 'online backup' by many database vendors), you need a continuous sequence of archived WAL files that extends back at least as far as the start time of your backup."

### Claim 7

- **Text:** A wrong return code from `archive_command` causes silent data loss because PostgreSQL only recycles WAL on a zero exit; teams must wire archiving exit codes correctly and monitor archiver lag.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/continuous-archiving.html
- **Pulled quote:** "It is important that the archive command return zero exit status if and only if it succeeds. Upon getting a zero result, PostgreSQL will assume that the file has been successfully archived, and will remove or recycle it. However, a nonzero status tells PostgreSQL that the file was not archived; it will try again periodically until it succeeds."

### Claim 8

- **Text:** `pg_basebackup` takes an online base backup of a running cluster and, by default, streams WAL alongside so the resulting directory is a self-contained recovery starting point.
- **Target section:** Example
- **Source URL:** https://www.postgresql.org/docs/current/app-pgbasebackup.html
- **Pulled quote:** "pg_basebackup is used to take a base backup of a running PostgreSQL database cluster. The backup is taken without affecting other clients of the database, and can be used both for point-in-time recovery (see Section 25.3) and as the starting point for a log-shipping or streaming-replication standby server (see Section 26.2)."

### Claim 9

- **Text:** pgBackRest distinguishes full, differential, and incremental backups, where incrementals reference the last backup of any kind, while differentials always reference the last full — affecting both restore time and storage cost.
- **Target section:** Visual
- **Source URL:** https://pgbackrest.org/user-guide.html
- **Pulled quote:** "Full Backup: pgBackRest copies the entire contents of the database cluster to the backup. Differential Backup: pgBackRest copies only those database cluster files that have changed since the last full backup. Incremental Backup: pgBackRest copies only those database cluster files that have changed since the last backup."

### Claim 10

- **Text:** Backup repositories should be encrypted client-side rather than relying on the storage service alone, so a leaked S3 bucket does not equal a leaked database.
- **Target section:** Best Practices
- **Source URL:** https://pgbackrest.org/configuration.html
- **Pulled quote:** "The following cipher types are supported: none - The repository is not encrypted; aes-256-cbc - Advanced Encryption Standard with 256 bit key length. Note that encryption is always performed client-side even if the repository type (e.g. S3) supports encryption."

### Claim 11

- **Text:** MySQL PITR layers binary-log replay on top of a full backup to bring a restored server forward to a precise time, mirroring PostgreSQL's WAL+base-backup model.
- **Target section:** Context
- **Source URL:** https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery.html
- **Pulled quote:** "Point-in-time recovery refers to recovery of data changes up to a given point in time. Typically, this type of recovery is performed after restoring a full backup that brings the server to its state as of the time the backup was made... Point-in-time recovery then brings the server up to date incrementally from the time of the full backup to a more recent time."

### Claim 12

- **Text:** `mysqlbinlog --start-datetime` and `--stop-datetime` are the operator-facing knobs for replaying binlogs into a restored MySQL server up to a target wall-clock time.
- **Target section:** Example
- **Source URL:** https://dev.mysql.com/doc/refman/8.4/en/mysqlbinlog.html
- **Pulled quote:** "Start reading the binary log at the first event having a timestamp equal to or later than the datetime argument... mysqlbinlog --start-datetime=\"2005-12-25 11:25:56\" binlog.000003. This option is useful for point-in-time recovery."

### Claim 13

- **Text:** Percona XtraBackup is the canonical physical hot-backup tool for InnoDB-based MySQL, producing consistent backups without blocking writes — the operational counterpart to PostgreSQL's `pg_basebackup`.
- **Target section:** Context
- **Source URL:** https://docs.percona.com/percona-xtrabackup/2.4/intro.html
- **Pulled quote:** "Percona XtraBackup is the world's only open-source, free MySQL hot backup software that performs non-blocking backups for InnoDB and XtraDB databases."

### Claim 14

- **Text:** RPO and RTO are the two numbers a backup strategy must be designed against: RPO bounds how much data loss the business will tolerate, RTO bounds how long the business will wait for restore to complete.
- **Target section:** Context
- **Source URL:** https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/disaster-recovery-dr-objectives.html
- **Pulled quote:** "Recovery Time Objective (RTO) Defined by the organization. RTO is the maximum acceptable delay between the interruption of service and restoration of service... Recovery Point Objective (RPO) Defined by the organization. RPO is the maximum acceptable amount of time since the last data recovery point."

### Claim 15

- **Text:** Backup verification tools like `pg_verifybackup` catch storage corruption and missing files, but cannot replace a real test restore against a sandbox cluster.
- **Target section:** Topic-Specific:Restore Drill Playbook
- **Source URL:** https://www.postgresql.org/docs/current/app-pgverifybackup.html
- **Pulled quote:** "It is important to note that the validation which is performed by pg_verifybackup does not and cannot include every check which will be performed by a running server when attempting to make use of the backup. Even if you use this tool, you should still perform test restores and verify that the resulting databases work as expected and that they appear to contain the correct data."

### Claim 16

- **Text:** Base-backup interval is a storage trade-off, not a correctness one — longer intervals mean more retained WAL and longer replay times during PITR, so cadence is set by RTO budget.
- **Target section:** Topic-Specific:Restore Drill Playbook
- **Source URL:** https://www.postgresql.org/docs/current/continuous-archiving.html
- **Pulled quote:** "Since you have to keep around all the archived WAL files back to your last base backup, the interval between base backups should usually be chosen based on how much storage you want to expend on archived WAL files."

## Reference URLs (de-duplicated, for the article's References section)

- https://www.postgresql.org/docs/current/backup.html — PostgreSQL Global Development Group, "Chapter 25. Backup and Restore," PostgreSQL 18 Documentation (2026)
- https://www.postgresql.org/docs/current/backup-dump.html — PostgreSQL Global Development Group, "25.1. SQL Dump," PostgreSQL 18 Documentation (2026)
- https://www.postgresql.org/docs/current/backup-file.html — PostgreSQL Global Development Group, "25.2. File System Level Backup," PostgreSQL 18 Documentation (2026)
- https://www.postgresql.org/docs/current/continuous-archiving.html — PostgreSQL Global Development Group, "25.3. Continuous Archiving and Point-in-Time Recovery (PITR)," PostgreSQL 18 Documentation (2026)
- https://www.postgresql.org/docs/current/app-pgbasebackup.html — PostgreSQL Global Development Group, "pg_basebackup," PostgreSQL 18 Documentation (2026)
- https://www.postgresql.org/docs/current/app-pgverifybackup.html — PostgreSQL Global Development Group, "pg_verifybackup," PostgreSQL 18 Documentation (2026)
- https://pgbackrest.org/user-guide.html — Crunchy Data / pgBackRest project, "pgBackRest User Guide" (2026)
- https://pgbackrest.org/configuration.html — Crunchy Data / pgBackRest project, "pgBackRest Configuration Reference" (2026)
- https://dev.mysql.com/doc/refman/8.4/en/point-in-time-recovery.html — Oracle Corporation, "9.5 Point-in-Time (Incremental) Recovery," MySQL 8.4 Reference Manual (2026)
- https://dev.mysql.com/doc/refman/8.4/en/mysqlbinlog.html — Oracle Corporation, "6.6.9 mysqlbinlog — Utility for Processing Binary Log Files," MySQL 8.4 Reference Manual (2026)
- https://docs.percona.com/percona-xtrabackup/2.4/intro.html — Percona LLC, "About Percona XtraBackup," Percona XtraBackup Documentation (2026)
- https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/disaster-recovery-dr-objectives.html — Amazon Web Services, "Disaster Recovery (DR) objectives," AWS Well-Architected Framework — Reliability Pillar (2026)

## Rejected sources

- https://docs.percona.com/percona-xtrabackup/8.0/intro.html — 404 at fetch time. Replaced with the canonical 2.4 intro page on the same maintainer-run domain, whose architectural description (non-blocking hot backup for InnoDB) applies equally to 8.0.
- https://docs.percona.com/percona-xtrabackup/8.0/intro-introduction.html — 404 at fetch time. Same rationale; 2.4 page used as authoritative replacement.
- https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/recovery-time-objective-rto-and-recovery-point-objective-rpo.html — Page returned a body without RTO/RPO definitions in the WebFetch render. Replaced with the parent disaster-recovery-dr-objectives.html page on the same domain, which contains canonical AWS definitions of both terms.
- Wikipedia, Medium, and Dev.to entries surfaced by search — excluded by the source-tier rule (no maintainer-run domain, no identifiable authoritative author at the relevant project).
- oneuptime.com and cubepath.com restore-testing posts — excluded as third-party SEO blogs without identifiable authors at relevant standards or vendor orgs.

## Research notes

- The topic-specific section heading "Restore Drill Playbook" holds up: pg_verifybackup explicitly disclaims its own sufficiency, and the WAL-retention/RTO trade-off in the PostgreSQL continuous-archiving docs feeds directly into how often you must rehearse. Both anchor that section with primary-source evidence.
- The article should make the symmetry explicit: PostgreSQL `pg_basebackup` + WAL maps directly to MySQL XtraBackup + binlog. Claims 8, 11, 12, 13 cover both sides so the writer can build a side-by-side example without leaning on either vendor.
- For the Visual section, Claim 9 (pgBackRest's full/diff/incremental definitions) is the cleanest source for a Mermaid diagram showing the chain dependencies — incrementals form a chain back to the last backup of any kind, while differentials always point at the last full. That has direct restore-time consequences worth diagramming.
- Encryption-at-rest evidence (Claim 10) is intentionally drawn from a real configuration option rather than a marketing page; the "client-side even when S3 supports encryption" detail is the load-bearing operator nuance.
- No ACM/USENIX/VLDB tier-1 paper made the cut — backup operations is a domain where standards bodies and project documentation are the authoritative sources, and going further would mean adding lower-tier blogs. Twelve tier-2/tier-3 sources from four independent maintainer domains (postgresql.org, pgbackrest.org, dev.mysql.com, docs.percona.com) plus AWS Well-Architected give the writer enough cross-vendor coverage.
