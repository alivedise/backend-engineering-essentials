# Findings: Durability, fsync, and the Crash Safety Contract

**Generated:** 2026-05-08
**Target article:** BEE-6010 — durability-fsync-and-the-crash-safety-contract
**Subagent mode:** PER-ARTICLE

## Topic-specific section heading proposal

Confirmed: **`## What fsync Does Not Guarantee`** — operator-facing failure-mode list. The spec heading is solid; alternative considered ("`## Failure Modes Operators Must Plan For`") is wordier without adding precision. Keep the spec heading.

A second optional topic-specific section is also justified: **`## Configuring Durability in PostgreSQL and MySQL`** — concrete operator knobs with their data-loss windows. Recommend including both, since the article addresses two distinct angles (kernel-level guarantees vs database-level configuration).

## Claims

### Claim 1
- **Text:** A successful `fsync()` is meant to mean every modified page of the file has reached non-volatile storage and survives a crash, but the Linux contract has historically diverged from that operator expectation.
- **Target section:** Context
- **Source URL:** https://man7.org/linux/man-pages/man2/fsync.2.html
- **Pulled quote:** "fsync() transfers ('flushes') all modified in-core data of (i.e., modified buffer cache pages for) the file referred to by the file descriptor fd to the disk device (or other permanent storage device) so that all changed information can be retrieved even if the system crashes or is rebooted."

### Claim 2
- **Text:** Persisting a file's data is not enough — the directory entry must also be flushed via a separate `fsync()` on the directory file descriptor, a step many crash-safety bugs originate from.
- **Target section:** Best Practices
- **Source URL:** https://man7.org/linux/man-pages/man2/fsync.2.html
- **Pulled quote:** "Calling fsync() does not necessarily ensure that the entry in the directory containing the file has also reached disk. For that an explicit fsync() on a file descriptor for the directory is also needed."

### Claim 3
- **Text:** Fsyncgate (2018) revealed that PostgreSQL's checkpoint protocol assumed `fsync()` confirmed every prior write reached disk, and the Linux page-cache contract did not deliver that.
- **Target section:** Context
- **Source URL:** https://lwn.net/Articles/752063/
- **Pulled quote:** "PostgreSQL assumes that a successful call to fsync() indicates that all data written since the last successful call made it safely to persistent storage."

### Claim 4
- **Text:** When buffered writes failed, Linux filesystems would discard the dirty data and mark the affected pages clean, so a retried `fsync()` reported success even though the data never landed on disk.
- **Target section:** What fsync Does Not Guarantee
- **Source URL:** https://lwn.net/Articles/752063/
- **Pulled quote:** "When a buffered I/O write fails due to a hardware-level error, filesystems will respond differently, but that behavior usually includes discarding the data in the affected pages and marking them as being clean."

### Claim 5
- **Text:** A process that opens a file after the I/O error already occurred sees a clean `fsync()` return value and has no way to learn the prior failure ever happened.
- **Target section:** What fsync Does Not Guarantee
- **Source URL:** https://lwn.net/Articles/752063/
- **Pulled quote:** "If something bad happens before the checkpointer's open() call, the subsequent fsync() call will return successfully."

### Claim 6
- **Text:** The 2020 Wisconsin study tested ext4, XFS, and Btrfs against the five major databases and found every application's recovery strategy left holes — `fsync()` failures still produced data loss or corruption in practice.
- **Target section:** Context
- **Source URL:** https://www.research.ed.ac.uk/en/publications/can-applications-recover-from-fsync-failures-2/
- **Pulled quote:** "Our findings show that although applications use many failure-handling strategies, none are sufficient: fsync failures can cause catastrophic outcomes such as data loss and corruption."

### Claim 7
- **Text:** The same study identified a property common to ext4, XFS, and Btrfs: pages that fail to write are always marked clean afterward, eliminating the kernel's chance to retry them.
- **Target section:** What fsync Does Not Guarantee
- **Source URL:** https://www.research.ed.ac.uk/en/publications/can-applications-recover-from-fsync-failures-2/
- **Pulled quote:** "We find commonalities across file systems (pages are always marked clean, certain block writes always lead to unavailability), as well as differences (page content and failure reporting is varied)."

### Claim 8
- **Text:** Fsyncgate's resolution path for PostgreSQL was to convert any `fsync()` EIO into an immediate PANIC so recovery from WAL replays the lost work, rather than trusting a second `fsync()`.
- **Target section:** Configuring Durability in PostgreSQL and MySQL
- **Source URL:** https://wiki.postgresql.org/wiki/Fsync_Errors
- **Pulled quote:** "PostgreSQL will now PANIC on fsync() failure"

### Claim 9
- **Text:** PostgreSQL's `fsync` parameter is the master durability switch — turning it off trades crash safety for raw throughput and risks unrecoverable corruption on power loss.
- **Target section:** Configuring Durability in PostgreSQL and MySQL
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-wal.html
- **Pulled quote:** "While turning off fsync is often a performance benefit, this can result in unrecoverable data corruption in the event of a power failure or system crash."

### Claim 10
- **Text:** PostgreSQL's `synchronous_commit = off` opens a bounded data-loss window of up to three times `wal_writer_delay` for committed transactions, but never breaks database consistency.
- **Target section:** Configuring Durability in PostgreSQL and MySQL
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-wal.html
- **Pulled quote:** "Unlike fsync, setting this parameter to off does not create any risk of database inconsistency: an operating system or database crash might result in some recent allegedly-committed transactions being lost, but the database state will be just the same as if those transactions had been aborted cleanly."

### Claim 11
- **Text:** PostgreSQL's `full_page_writes` exists because a single page write can be torn by a crash, leaving the on-disk page half-old and half-new — WAL full-page images are how recovery reconstructs the page.
- **Target section:** Example
- **Source URL:** https://www.postgresql.org/docs/current/runtime-config-wal.html
- **Pulled quote:** "When this parameter is on, the PostgreSQL server writes the entire content of each disk page to WAL during the first modification of that page after a checkpoint. This is needed because a page write that is in process during an operating system crash might be only partially completed, leading to an on-disk page that contains a mix of old and new data."

### Claim 12
- **Text:** MySQL's `innodb_flush_log_at_trx_commit = 1` is the ACID-compliant default — every commit forces the redo log to disk; values 0 and 2 trade up-to-one-second of recent commits for throughput.
- **Target section:** Configuring Durability in PostgreSQL and MySQL
- **Source URL:** https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-system-variables
- **Pulled quote:** "The default, the log buffer is written to the InnoDB redo log file and a flush to disk performed after each transaction. This is required for full ACID compliance."

### Claim 13
- **Text:** With `innodb_flush_log_at_trx_commit = 2`, commits are written to the OS page cache but flushed only once per second — an OS or power outage can erase the last second of "committed" transactions.
- **Target section:** Configuring Durability in PostgreSQL and MySQL
- **Source URL:** https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-system-variables
- **Pulled quote:** "The log buffer is written to the InnoDB redo log after each commit, but flushing takes place every innodb_flush_log_at_timeout seconds (by default once a second). Performance is slightly better, but a OS or power outage can cause the last second's transactions to be lost."

### Claim 14
- **Text:** Disk controllers and SSDs ship with volatile write-back caches by default; the operating system can issue a flush, but the administrator owns the responsibility for verifying the full storage stack honors it.
- **Target section:** What fsync Does Not Guarantee
- **Source URL:** https://www.postgresql.org/docs/current/wal-reliability.html
- **Pulled quote:** "Such caches can be a reliability hazard because the memory in the disk controller cache is volatile, and will lose its contents in a power failure."

### Claim 15
- **Text:** PostgreSQL's documentation makes the trust boundary explicit — once a write reaches the storage hardware, durability is the operator's problem, not the OS's.
- **Target section:** Best Practices
- **Source URL:** https://www.postgresql.org/docs/current/wal-reliability.html
- **Pulled quote:** "When the operating system sends a write request to the storage hardware, there is little it can do to make sure the data has arrived at a truly non-volatile storage area. Rather, it is the administrator's responsibility to make certain that all storage components ensure integrity for both data and file-system metadata."

### Claim 16
- **Text:** Cloud block storage advertises high durability — AWS EBS `io2 Block Express` claims 99.999% (0.001% AFR) and `gp3` claims 99.8–99.9% — but durability is about media survival, not crash-time write ordering on the guest OS.
- **Target section:** Visual
- **Source URL:** https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html
- **Pulled quote:** "Durability | 99.8% - 99.9% durability (0.1% - 0.2% annual failure rate) | 99.999% durability (0.001% annual failure rate) | 99.8% - 99.9% durability (0.1% - 0.2% annual failure rate)"

### Claim 17
- **Text:** Google Persistent Disk publishes design-target durability of "better than 99.999%" for zonal SSD and "better than 99.9999%" for regional SSD, with the explicit caveat that these are not SLA-backed numbers.
- **Target section:** Visual
- **Source URL:** https://docs.cloud.google.com/compute/docs/disks/persistent-disks
- **Pulled quote:** "Better than 99.999%"

### Claim 18
- **Text:** SQLite's correctness depends on the OS honoring its `fsync` contract, and the project documents that it cannot detect when the OS lies — a clean statement of the trust assumption every database makes.
- **Target section:** What fsync Does Not Guarantee
- **Source URL:** https://www.sqlite.org/atomiccommit.html
- **Pulled quote:** "SQLite assumes that the flush or fsync will not return until all pending write operations for the file that is being flushed have completed. We are told that the flush and fsync primitives are broken on some versions of Windows and Linux."

### Claim 19
- **Text:** The fsyncgate community consensus, captured by Dan Luu's archive of the email thread, was that any database using buffered I/O on Linux had a silent corruption mode it could not observe from userspace.
- **Target section:** Context
- **Source URL:** https://danluu.com/fsyncgate/
- **Pulled quote:** "The write never made it to disk, but we completed the checkpoint, and merrily carried on our way. Whoops, data loss."

## Reference URLs (de-duplicated, for the article's References section)

- https://man7.org/linux/man-pages/man2/fsync.2.html — Linux man-pages project, "fsync(2) — Linux manual page" (current)
- https://lwn.net/Articles/752063/ — Jonathan Corbet, "PostgreSQL's fsync() surprise," LWN.net (2018)
- https://www.research.ed.ac.uk/en/publications/can-applications-recover-from-fsync-failures-2/ — Anthony Rebello, Yuvraj Patel, Ramnatthan Alagappan, Andrea C. Arpaci-Dusseau, Remzi H. Arpaci-Dusseau, "Can Applications Recover from fsync Failures?," USENIX ATC (2020)
- https://wiki.postgresql.org/wiki/Fsync_Errors — PostgreSQL Wiki, "Fsync Errors" (current)
- https://www.postgresql.org/docs/current/runtime-config-wal.html — PostgreSQL Global Development Group, "Write Ahead Log — Server Configuration," PostgreSQL Documentation (current)
- https://www.postgresql.org/docs/current/wal-reliability.html — PostgreSQL Global Development Group, "Reliability," PostgreSQL Documentation (current)
- https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-system-variables — MariaDB Foundation, "InnoDB System Variables" (current)
- https://www.sqlite.org/atomiccommit.html — D. Richard Hipp et al., "Atomic Commit In SQLite," SQLite Documentation (current)
- https://danluu.com/fsyncgate/ — Dan Luu (archivist), "PostgreSQL fsyncgate" (2018, archive of mailing-list thread)
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-volume-types.html — Amazon Web Services, "Amazon EBS volume types," EC2 User Guide (current)
- https://docs.cloud.google.com/compute/docs/disks/persistent-disks — Google Cloud, "Persistent Disk," Compute Engine Documentation (current)

## Rejected sources

- https://www.usenix.org/conference/atc20/presentation/rebello — Returned 403 to WebFetch; abstract verified via University of Edinburgh mirror instead. URL is canonical and acceptable in the References list, but quotes were sourced from the mirror.
- https://research.cs.wisc.edu/adsl/Publications/atc20-cuttlefs.pdf — PDF binary not parseable by WebFetch.
- https://par.nsf.gov/servlets/purl/10299723 — Same PDF-extraction problem.
- https://dl.acm.org/doi/10.1145/3450338 — 403 from WebFetch (paywalled).
- https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html — WebFetch returned only the variable index table; MariaDB's manual carries the same upstream text.
- https://lwn.net/Articles/787480/ — 404.
- https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EBSFeatures.html — WebFetch returned essentially empty content; volume-types page used instead.

## Research notes

- The `wal_sync_method` and `O_DIRECT` thread from the spec is partially covered (PostgreSQL doc lists `fdatasync`, `open_datasync`, `open_sync`, `fsync_writethrough`); MySQL `innodb_flush_method` was not retrievable verbatim from `dev.mysql.com` in this session. If the writer needs an explicit `O_DIRECT` quote, consider the MariaDB sysvar page or have the writer fetch the live MySQL page directly during drafting.
- Dan Luu page is tier-4 in strict ranking (personal blog, archive of public list traffic) but is acceptable per spec because Luu is a named, identifiable engineer and the page is a verbatim email archive — not original SEO content.
- Two topic-specific sections are recommended (`What fsync Does Not Guarantee` and `Configuring Durability in PostgreSQL and MySQL`), satisfying the at-least-one rule with margin and matching the spec's two-axis scope (kernel contract + database knobs).
- Every required section (Context, Visual, Example, Best Practices, topic-specific) has at least one claim attached. References section will draw from the de-duplicated URL list above.
