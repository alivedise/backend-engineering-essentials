---
id: 6010
title: 永續性、fsync 與崩潰安全契約
state: draft
slug: durability-fsync-and-the-crash-safety-contract
---

# [BEE-6010] 永續性、fsync 與崩潰安全契約

:::info
永續性是一份契約：已向客戶端確認的交易必須能在崩潰後存活。這份契約由三層組成：核心的 `fsync()` 系統呼叫、資料庫的 WAL 與復原邏輯，以及儲存硬體的 flush 行為。2018 年的 fsyncgate 事件（LWN 2018）與 Rebello 等人於 USENIX ATC 發表的論文（2020）顯示出這幾層之間的邊界會漏：在 Linux 上一個成功的 `fsync()` 過去並不代表資料庫所假設的那種語意。本文沿著這條邊界從 man-page 契約一路走到 PostgreSQL 與 MySQL 中由維運人員可調整的旋鈕，並點名資料庫維運人員 MUST 規劃應對的失敗模式。
:::

## Context

Linux 對 `fsync(2)` 的 man page 描述此呼叫會把 `fd` 所指向檔案的所有已修改 buffer-cache page flush 到非揮發儲存，「使所有已變更的資訊在系統崩潰或重新啟動後仍可被取回」（Linux man-pages project）。這句話正是每一個在 Linux 上使用 buffered I/O 的資料庫用以保證永續性的依據。

2018 年 4 月，PostgreSQL 社群發現這份契約已經默默被打破多年。Jonathan Corbet 在 LWN 上的整理（〈PostgreSQL's fsync() surprise〉，LWN 2018）摘述了那個被打破的假設：「PostgreSQL 假設一次成功的 fsync() 呼叫代表自上一次成功呼叫以來寫入的所有資料皆已安全抵達永續儲存。」Linux 的 page-cache 實作沒有兌現這一點。當一筆 buffered write 在硬體層失敗時，檔案系統會把受影響的 page 標記為 clean 並丟棄這些 dirty 資料；一個在失敗發生時並未持續開啟該檔案的 checkpointer 行程隨後呼叫 `fsync()`，得到成功回應，就這樣繼續往前走。Dan Luu 對 mailing-list 討論串的存檔（Luu 2018）原汁原味保留了這段事件，捕捉到當時的共識：任何在 Linux 上使用 buffered I/O 的資料庫，都存在一種無法從 userspace 觀察到的靜默損毀模式：「The write never made it to disk, but we completed the checkpoint, and merrily carried on our way. Whoops, data loss.」

2020 年，Rebello、Patel、Alagappan 與 Arpaci-Dusseau 夫婦在 USENIX ATC 發表了〈Can Applications Recover from fsync Failures?〉（Rebello et al. 2020）。他們以 ext4、XFS 與 Btrfs 對五個主流資料庫進行測試，並回報「儘管應用程式採用了多種失敗處理策略，沒有一種足夠：fsync 失敗可能造成災難性結果，例如資料遺失與毀損。」這種對 userspace 不可見的失敗模式是系統層級的問題。

這條信任邊界是本文後續章節的主軸：核心契約 → 檔案系統行為 → userland 資料庫 → 維運人員所擁有的硬體堆疊。

## Visual

雲端 block-storage 服務商以不同格式公布永續性數字。下表將兩家最大服務商的公開宣稱予以正規化。此處的永續性描述的是年化媒介存活率。本文討論的失敗模式是 guest OS 上崩潰時的寫入順序保證。

| 服務商 | Volume 類型 | 公開永續性 | 年化失敗率 | 是否有 SLA 背書？ |
|---|---|---|---|---|
| AWS EBS | gp3 | 99.8% – 99.9% | 0.1% – 0.2% | 依 AWS EC2 User Guide（current） |
| AWS EBS | io2 Block Express | 99.999% | 0.001% | 依 AWS EC2 User Guide（current） |
| Google Persistent Disk | Zonal SSD | 優於 99.999% | 設計目標 | 否（僅為設計目標） |
| Google Persistent Disk | Regional SSD | 優於 99.9999% | 設計目標 | 否（僅為設計目標） |

來源：AWS EC2 User Guide on EBS volume types（current）；Google Cloud Compute Engine Persistent Disk documentation（current）。Google 明確將其數字以設計目標形式公布，這與 AWS 的「published-durability」承諾形式並不相同。

## Example

PostgreSQL 提供一個叫做 `full_page_writes` 的參數。PostgreSQL 文件解釋它存在的原因：「當此參數為 on，PostgreSQL 伺服器會在 checkpoint 之後第一次修改某個 disk page 時，把整個 page 的內容寫入 WAL。這是必要的，因為一次正在進行中的 page write 若遭遇作業系統崩潰，可能只完成一部分，導致 on-disk page 含有舊資料與新資料的混合」（PostgreSQL Documentation, "Write Ahead Log — Server Configuration"）。

我們走一遍這個參數所防禦的失敗情境。假設 PostgreSQL 的 data page 為 8 KiB，底層儲存單元為 4 KiB：

1. PostgreSQL 開始將一個 8 KiB 的 page 以兩次 4 KiB sector write 寫到磁碟。第一個 sector 寫完，第二個還沒。
2. 主機在第二個 4 KiB write 完成前斷電。
3. 重新啟動後，磁碟上的 8 KiB page 一半新、一半舊。Page header 可能不一致。一個天真的復原流程無法信任這個 page 的內容。
4. PostgreSQL 重放它的 WAL。在最近一次 checkpoint 之後，第一筆觸及這個 page 的 WAL record 包含一份 full-page image——也就是該 page 在那次首次修改時的整個 8 KiB 內容。
5. 復原流程以 full-page image 覆寫已撕裂的 on-disk page，然後重放後續的 WAL record，重建已 commit 的狀態。

Full-page image 是復原流程修補一個已撕裂 page 的唯一方式。只有在儲存裝置以資料庫使用的 page size 保證 atomic write，且維運人員手上握有此屬性的證據時，停用 `full_page_writes` 才安全。

## Best Practices

- **MUST** 在於某個目錄中建立、更名或刪除檔案後，對該目錄的 file descriptor 呼叫 `fsync()`。Linux man page 講得直接：「呼叫 fsync() 並不必然確保檔案所在目錄中的對應條目也已寫到磁碟。要做到這一點，還需要對該目錄的 file descriptor 另外執行一次 fsync()」（Linux man-pages project）。
- **MUST** 把儲存硬體堆疊視為維運人員的責任，而非核心的責任。PostgreSQL 的可靠性文件直接指出這條邊界：「當作業系統將一筆寫入請求送到儲存硬體後，它幾乎無能為力確保資料已抵達真正的非揮發儲存區。確保所有儲存元件對資料與檔案系統 metadata 的完整性負責，是管理者的責任」（PostgreSQL Documentation, "Reliability"）。
- **MUST** 在任何承載業務無法重建之資料的設定中，保持 PostgreSQL 的 `fsync` 參數為 on。文件警告：「雖然關閉 fsync 通常帶來效能上的好處，但這在斷電或系統崩潰時可能造成無法復原的資料毀損」（PostgreSQL Documentation, "Write Ahead Log — Server Configuration"）。
- **SHOULD** 驗證儲存堆疊中任何具備 write-back cache 的 disk controller 或 SSD，其 cache 都有電池、超級電容或等效機制提供後備。PostgreSQL 文件點名此風險：「這類 cache 可能成為可靠性危害，因為 disk controller cache 中的記憶體是揮發性的，斷電時會失去其內容」（PostgreSQL Documentation, "Reliability"）。

## fsync 不保證的事

這份契約有缺口。以下每一種失敗模式，維運人員 MUST 在復原程序中事先規劃應對。

1. **`fsync()` 不會重試失敗的寫入。** 2018 年 LWN 的整理描述了這個機制：「當一筆 buffered I/O write 因硬體層錯誤而失敗時，各檔案系統的反應不同，但這個行為通常包括丟棄受影響 page 中的資料，並把它們標記為 clean」（LWN 2018）。一旦該 page 變為 clean，核心就沒有任何東西可 flush。
2. **在失敗之後才開啟該檔案的行程，無法看見失敗曾經發生。** LWN：「若不好的事情發生在 checkpointer 的 open() 呼叫之前，後續的 fsync() 呼叫將回傳成功」（LWN 2018）。這正是 fsyncgate 損毀模式所利用的死角。
3. **在失敗時把 page 標記為 clean，是每一個主流 Linux 檔案系統共有的特性。** Rebello 等人（2020）回報：「我們在各檔案系統間發現共通點（page 永遠會被標記為 clean，某些 block 寫入永遠導致無法存取），同時也有差異（page 內容與失敗回報方式各有不同）。」ext4、XFS 與 Btrfs 都展現這項特性；切換檔案系統並不能脫身。
4. **`fsync()` 不會 flush 儲存裝置內部的揮發性 cache。** PostgreSQL 可靠性文件特別點出 disk controller 與 SSD 上常見的揮發性 write-back cache（PostgreSQL Documentation, "Reliability"）。核心可以發出一個 flush 指令；裝置是否照做則取決於硬體，並由維運人員自行驗證。
5. **資料庫無法察覺作業系統就 flush 撒謊。** SQLite 文件記載了這個假設：「SQLite 假設 flush 或 fsync 在所有對該檔案的 pending write 操作完成前不會回傳。我們得知 flush 與 fsync primitive 在某些版本的 Windows 與 Linux 上是壞的」（SQLite Documentation, "Atomic Commit In SQLite"）。每一個具備 WAL 復原機制的資料庫都做了相同假設；沒有一個能從 userspace 驗證它。

## 在 PostgreSQL 與 MySQL 中設定永續性

核心契約只是一半。另一半是各個資料庫如何運用該契約。下面這兩個系統，都以不同的旋鈕、不同的影響範圍暴露出永續性與吞吐量之間的取捨。

### PostgreSQL

- `fsync`（boolean，主開關）。預設為 on。PostgreSQL 文件把關掉它列為通往「斷電或系統崩潰時無法復原之資料毀損」的路徑（PostgreSQL Documentation, "Write Ahead Log — Server Configuration"）。任何 production workload MUST 保持其為 on。
- `synchronous_commit`（boolean 或 replica 模式）。Off 模式打開了一個有界的資料遺失視窗，但永遠不會破壞一致性：「與 fsync 不同，將此參數設為 off 不會造成資料庫不一致的風險：作業系統或資料庫崩潰可能導致某些近期被宣告為已 commit 的交易遺失，但資料庫狀態會與這些交易被乾淨地中止後相同」（PostgreSQL Documentation, "Write Ahead Log — Server Configuration"）。此視窗以最多三倍 `wal_writer_delay` 為界。對於可從上游補回「遺失但乾淨地中止之近期 commit」的 workload 而言，這是可接受的。
- `full_page_writes`（boolean）。預設為 on。在不保證 atomic page write 的儲存裝置上，崩潰復原必須仰賴它（見 Example）。
- Fsyncgate 之後的行為：PostgreSQL 把任何 `fsync()` EIO 直接轉成立即 PANIC。PostgreSQL Wiki 上關於 fsync 錯誤的條目記錄了這個變更：「PostgreSQL will now PANIC on fsync() failure」（PostgreSQL Wiki, "Fsync Errors"）。資料庫會重新啟動並重放 WAL，比起信任「再呼叫一次 `fsync()` 會學到先前那筆遺失寫入」更穩妥。

### MySQL / InnoDB

- `innodb_flush_log_at_trx_commit = 1`（預設，符合 ACID）。MariaDB 手冊呼應上游 MySQL 的行為：「預設值下，log buffer 會寫入 InnoDB redo log 檔案，並在每筆交易後執行一次 flush 到磁碟。完整 ACID 合規需要這樣設定」（MariaDB Foundation, "InnoDB System Variables"）。每次 commit 都強制一次 flush。
- `innodb_flush_log_at_trx_commit = 2`。每次 commit 都把資料寫入 OS page cache，但 flush 到磁碟的動作只每 `innodb_flush_log_at_timeout` 秒進行一次。MariaDB 手冊：「log buffer 在每次 commit 後寫入 InnoDB redo log，但 flush 只每 innodb_flush_log_at_timeout 秒（預設每秒一次）發生一次。效能略佳，但 OS 或斷電可能導致最後一秒的交易遺失」（MariaDB Foundation, "InnoDB System Variables"）。資料遺失視窗最多為一秒鐘的「被宣告為已 commit」之交易。
- `innodb_flush_log_at_trx_commit = 0`。以更多近期交易換取更高的吞吐量；依 MariaDB 手冊的解讀，採用相同的「預設一秒一次」flush 節奏。

兩個資料庫所呈現的取捨形狀一致：維運人員以較少的每次 commit fsync 換取一個有界的資料遺失視窗。這些視窗的大小不同，每個視窗背後的一致性保證也不同。PostgreSQL 的 `synchronous_commit = off` 仍保有交易一致性；PostgreSQL 的 `fsync = off` 則沒有。

## Related Topics

- [Replication Strategies](/zh-tw/data-storage/replication-strategies)
- [Database Backup Strategies and Point-in-Time Recovery](/zh-tw/data-storage/database-backup-strategies-and-point-in-time-recovery)
- [Storage Engines](/zh-tw/data-storage/storage-engines)
- [Write-Ahead Logging](/zh-tw/distributed-systems/write-ahead-logging)
- [MVCC: Multi-Version Concurrency Control](/zh-tw/distributed-systems/mvcc-multi-version-concurrency-control)

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
