---
id: 6010
title: Durability, fsync, and the Crash Safety Contract
state: draft
slug: durability-fsync-and-the-crash-safety-contract
---

# [BEE-6010] Durability, fsync, and the Crash Safety Contract

:::info
Durability is the contract that a transaction confirmed to a client survives a crash. The contract has three layers: the kernel `fsync()` system call, the database's WAL and recovery logic, and the storage hardware's flush behavior. The fsyncgate incident of 2018 (LWN 2018) and the USENIX ATC paper by Rebello et al. (2020) showed that the boundary between layers leaks: a successful `fsync()` on Linux has historically not meant what databases assumed it meant. This article walks the boundary from the man-page contract down to operator-tunable knobs in PostgreSQL and MySQL, and names the failure modes that a database operator MUST plan for.
:::

## Context

The Linux man page for `fsync(2)` describes the call as flushing all modified buffer-cache pages of the file referred to by `fd` to non-volatile storage "so that all changed information can be retrieved even if the system crashes or is rebooted" (Linux man-pages project). That sentence is what every database that uses buffered I/O on Linux relies on for durability.

In April 2018, the PostgreSQL community discovered that the contract had been quietly broken for years. Jonathan Corbet's writeup at LWN ("PostgreSQL's fsync() surprise," LWN 2018) summarized the assumption that broke: "PostgreSQL assumes that a successful call to fsync() indicates that all data written since the last successful call made it safely to persistent storage." The Linux page-cache implementation did not deliver that. When a buffered write failed at the hardware layer, the filesystem would mark the affected pages clean and discard the dirty data; a checkpointer process that had not been holding the file open through the failure window would call `fsync()`, see success, and move on. The episode is preserved verbatim in Dan Luu's archive of the mailing-list thread (Luu 2018), which captured the consensus that any database using buffered I/O on Linux had a silent corruption mode it could not observe from userspace: "The write never made it to disk, but we completed the checkpoint, and merrily carried on our way. Whoops, data loss."

In 2020, Rebello, Patel, Alagappan, and the Arpaci-Dusseaus published "Can Applications Recover from fsync Failures?" at USENIX ATC (Rebello et al. 2020). They tested ext4, XFS, and Btrfs against five major databases and reported that "although applications use many failure-handling strategies, none are sufficient: fsync failures can cause catastrophic outcomes such as data loss and corruption." The userspace-invisible failure mode was systemic.

The trust boundary is the spine of the rest of this article: kernel contract → filesystem behavior → userland database → operator-owned hardware stack.

## Visual

Cloud block-storage providers publish durability numbers using different formats. The table below normalizes the public claims for the two largest providers. Durability here describes annualized media survival. The failure mode this article is about is crash-time write ordering on the guest OS.

| Provider | Volume type | Published durability | Annual failure rate | SLA-backed? |
|---|---|---|---|---|
| AWS EBS | gp3 | 99.8% – 99.9% | 0.1% – 0.2% | Per AWS EC2 User Guide (current) |
| AWS EBS | io2 Block Express | 99.999% | 0.001% | Per AWS EC2 User Guide (current) |
| Google Persistent Disk | Zonal SSD | Better than 99.999% | Design target | No (design target only) |
| Google Persistent Disk | Regional SSD | Better than 99.9999% | Design target | No (design target only) |

Sources: AWS EC2 User Guide on EBS volume types (current); Google Cloud Compute Engine Persistent Disk documentation (current). Google explicitly publishes its numbers as design targets, which is a different commitment shape from the AWS published-durability number.

## Example

PostgreSQL ships with a parameter called `full_page_writes`. The PostgreSQL documentation explains why it exists: "When this parameter is on, the PostgreSQL server writes the entire content of each disk page to WAL during the first modification of that page after a checkpoint. This is needed because a page write that is in process during an operating system crash might be only partially completed, leading to an on-disk page that contains a mix of old and new data" (PostgreSQL Documentation, "Write Ahead Log — Server Configuration").

Walk through the failure scenario the parameter defends against. Assume a PostgreSQL data page is 8 KiB and the underlying storage atom is 4 KiB:

1. PostgreSQL begins writing an 8 KiB page to disk as two 4 KiB sector writes. The first sector is written, the second is not.
2. The host loses power before the second 4 KiB write completes.
3. After reboot, the on-disk 8 KiB page is half-new and half-old. The page header may be inconsistent. A naive recovery cannot trust the page contents.
4. PostgreSQL replays its WAL. The first WAL record that touches this page after the most recent checkpoint contains a full-page image — the entire 8 KiB content of the page at the time of that first modification.
5. Recovery overwrites the torn on-disk page with the full-page image, then replays subsequent WAL records to reconstruct the committed state.

The full-page image is the only way recovery can repair a torn page. Disabling `full_page_writes` is only safe on storage that guarantees atomic writes at the page size the database uses, and the operator owns proof of that property.

## Best Practices

- **MUST** call `fsync()` on the directory file descriptor after creating, renaming, or deleting a file inside it. The Linux man page is explicit: "Calling fsync() does not necessarily ensure that the entry in the directory containing the file has also reached disk. For that an explicit fsync() on a file descriptor for the directory is also needed" (Linux man-pages project).
- **MUST** treat the storage hardware stack as the operator's responsibility, not the kernel's. PostgreSQL's reliability documentation states the boundary directly: "When the operating system sends a write request to the storage hardware, there is little it can do to make sure the data has arrived at a truly non-volatile storage area. Rather, it is the administrator's responsibility to make certain that all storage components ensure integrity for both data and file-system metadata" (PostgreSQL Documentation, "Reliability").
- **MUST** keep PostgreSQL's `fsync` parameter on in any configuration that holds data the business cannot reproduce. The documentation warns: "While turning off fsync is often a performance benefit, this can result in unrecoverable data corruption in the event of a power failure or system crash" (PostgreSQL Documentation, "Write Ahead Log — Server Configuration").
- **SHOULD** verify that any disk controller or SSD with a write-back cache in the storage stack has its cache backed by a battery, supercapacitor, or equivalent. The PostgreSQL documentation flags the hazard: "Such caches can be a reliability hazard because the memory in the disk controller cache is volatile, and will lose its contents in a power failure" (PostgreSQL Documentation, "Reliability").

## What fsync Does Not Guarantee

The contract has gaps. An operator MUST plan recovery procedures around each of the following failure modes.

1. **`fsync()` does not retry failed writes.** The 2018 LWN writeup describes the mechanic: "When a buffered I/O write fails due to a hardware-level error, filesystems will respond differently, but that behavior usually includes discarding the data in the affected pages and marking them as being clean" (LWN 2018). Once the page is clean, the kernel has nothing left to flush.
2. **A process that opens the file after the failure cannot see that the failure happened.** LWN: "If something bad happens before the checkpointer's open() call, the subsequent fsync() call will return successfully" (LWN 2018). This is the exact corner that produced the fsyncgate corruption mode.
3. **Marking-pages-clean-on-failure is a property of every major Linux filesystem.** Rebello et al. (2020) report: "We find commonalities across file systems (pages are always marked clean, certain block writes always lead to unavailability), as well as differences (page content and failure reporting is varied)." ext4, XFS, and Btrfs all exhibit the property; switching filesystems does not buy escape.
4. **`fsync()` does not flush volatile caches inside the storage device.** The PostgreSQL reliability documentation calls out the volatile write-back cache common to disk controllers and SSDs (PostgreSQL Documentation, "Reliability"). The kernel can issue a flush command; whether the device honors it is hardware-dependent and operator-verifiable.
5. **The database cannot detect when the OS lies about flush.** SQLite documents the assumption: "SQLite assumes that the flush or fsync will not return until all pending write operations for the file that is being flushed have completed. We are told that the flush and fsync primitives are broken on some versions of Windows and Linux" (SQLite Documentation, "Atomic Commit In SQLite"). Every database with WAL recovery makes the same assumption; none can validate it from userspace.

## Configuring Durability in PostgreSQL and MySQL

The kernel contract is one half. The other half is what each database does with that contract. The two systems below expose the durability/throughput trade-off through different knobs with different blast radii.

### PostgreSQL

- `fsync` (boolean, master switch). On by default. The PostgreSQL documentation labels turning it off as a path to "unrecoverable data corruption in the event of a power failure or system crash" (PostgreSQL Documentation, "Write Ahead Log — Server Configuration"). MUST stay on for any production workload.
- `synchronous_commit` (boolean or replica mode). Off mode opens a bounded data-loss window but never breaks consistency: "Unlike fsync, setting this parameter to off does not create any risk of database inconsistency: an operating system or database crash might result in some recent allegedly-committed transactions being lost, but the database state will be just the same as if those transactions had been aborted cleanly" (PostgreSQL Documentation, "Write Ahead Log — Server Configuration"). The window is bounded at up to three times `wal_writer_delay`. Acceptable for workloads where lost-but-cleanly-aborted recent commits are recoverable from upstream.
- `full_page_writes` (boolean). On by default. Required for crash recovery on storage that does not guarantee atomic page writes (see Example).
- Post-fsyncgate behavior: PostgreSQL converts any `fsync()` EIO into an immediate PANIC. The PostgreSQL Wiki entry on fsync errors records the change: "PostgreSQL will now PANIC on fsync() failure" (PostgreSQL Wiki, "Fsync Errors"). The database restarts and replays WAL rather than trusting that a second `fsync()` call would learn about the lost write.

### MySQL / InnoDB

- `innodb_flush_log_at_trx_commit = 1` (default, ACID-compliant). The MariaDB manual mirrors the upstream MySQL behavior: "The default, the log buffer is written to the InnoDB redo log file and a flush to disk performed after each transaction. This is required for full ACID compliance" (MariaDB Foundation, "InnoDB System Variables"). Every commit forces a flush.
- `innodb_flush_log_at_trx_commit = 2`. Commits are written to the OS page cache on each commit but flushed to disk only once per `innodb_flush_log_at_timeout` seconds. The MariaDB manual: "The log buffer is written to the InnoDB redo log after each commit, but flushing takes place every innodb_flush_log_at_timeout seconds (by default once a second). Performance is slightly better, but a OS or power outage can cause the last second's transactions to be lost" (MariaDB Foundation, "InnoDB System Variables"). The data-loss window is up to one second of allegedly-committed transactions.
- `innodb_flush_log_at_trx_commit = 0`. Trades more recent transactions for higher throughput; same one-second-default flush cadence on the MariaDB manual's reading.

The shape of the trade-off is consistent across both databases: the operator chooses a bounded data-loss window in exchange for fewer fsync calls per commit. The sizes of those windows differ, and the consistency guarantees behind each window differ. PostgreSQL's `synchronous_commit = off` retains transactional consistency; PostgreSQL's `fsync = off` does not.

## Related Topics

- [Replication Strategies](/data-storage/replication-strategies)
- [Database Backup Strategies and Point-in-Time Recovery](/data-storage/database-backup-strategies-and-point-in-time-recovery)
- [Storage Engines](/data-storage/storage-engines)
- [Write-Ahead Logging](/distributed-systems/write-ahead-logging)
- [MVCC: Multi-Version Concurrency Control](/distributed-systems/mvcc-multi-version-concurrency-control)

## References

- Linux man-pages project, "fsync(2) — Linux manual page," (current). https://man7.org/linux/man-pages/man2/fsync.2.html
- Jonathan Corbet, "PostgreSQL's fsync() surprise," LWN.net (2018). https://lwn.net/Articles/752063/
- Anthony Rebello, Yuvraj Patel, Ramnatthan Alagappan, Andrea C. Arpaci-Dusseau, Remzi H. Arpaci-Dusseau, "Can Applications Recover from fsync Failures?," USENIX ATC (2020). https://www.research.ed.ac.uk/en/publications/can-applications-recover-from-fsync-failures-2/
- PostgreSQL Wiki, "Fsync Errors," (current). https://wiki.postgresql.org/wiki/Fsync_Errors
- PostgreSQL Global Development Group, "Write Ahead Log — Server Configuration," PostgreSQL Documentation (current). https://www.postgresql.org/docs/current/runtime-config-wal.html
- PostgreSQL Global Development Group, "Reliability," PostgreSQL Documentation (current). https://www.postgresql.org/docs/current/wal-reliability.html
- MariaDB Foundation, "InnoDB System Variables," (current). https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-system-variables
- D. Richard Hipp et al., "Atomic Commit In SQLite," SQLite Documentation (current). https://www.sqlite.org/atomiccommit.html
- Dan Luu (archivist), "PostgreSQL fsyncgate," (2018, archive of mailing-list thread). https://danluu.com/fsyncgate/
- Amazon Web Services, "Amazon EBS volume types," EC2 User Guide (current). https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html
- Google Cloud, "Persistent Disk," Compute Engine Documentation (current). https://docs.cloud.google.com/compute/docs/disks/persistent-disks
