---
id: 1
title: BEE Overview
state: draft
overview: true
slug: bee-overview
---

# [BEE-1] BEE 總覽

:::info
BEE（Backend Engineering Essentials，後端工程精要）是一組與廠商和語言無關的後端工程指引與最佳實踐。
:::

## 背景

後端工程涵蓋廣泛的範圍：認證、網路、資料、分散式系統、可觀測性，以及日益增加的機器學習工作負載。工程師零散地學習這些主題，透過部落格文章、口耳相傳的知識和生產事故。BEE 將它們收錄為一份編號的、廠商中立的目錄，分為兩個深度層級：基礎主題的精要短文，以及主題值得延伸處理時的長篇深入系列（GraphQL HTTP 層快取、AI 後端模式）。

文章 ID 依類別聚集成 1000 個 ID 為一組的區塊（auth = 1xxx、security = 2xxx，依此類推），URL 採用語意化的 slug（`/auth/oauth-openid-connect`，而非 `/1003`）。舊的數字 URL 透過重新導向 stub 繼續解析。

## 目的

- 建立後端工程討論的共同詞彙
- 提供可操作的、廠商中立的指引，處理常見的後端決策
- 作為進入後端開發的工程師的入門資源
- 填補「我會寫語法」和「我理解系統」之間的落差

## 如何閱讀 BEE

每篇 BEE 遵循一致的結構：

- **背景** -- 為什麼這個原則重要
- **原則** -- 核心指引（使用 RFC 2119 關鍵字：MUST、SHOULD、MAY）
- **圖解** -- 有助理解的圖表
- **範例** -- 具體的、廠商中立的範例
- **常見錯誤** -- 應避免的反模式
- **相關 BEE** -- 其他原則的交叉引用
- **參考資料** -- 外部資源的深入學習

## 類別

> 每個類別佔用一個 1000-id 區塊；`1xxx` 代表 BEE-1001 到 BEE-1999。「BEE 總覽」是例外（1-99），因為早於區塊機制。「AI Backend Patterns」是有意的例外（30001-39999，寬 10000）。

### 基礎層 (1xxx-4xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 1-99   | BEE 總覽 | `/bee-overall` | 目的、術語表、後設 |
| 1xxx   | 認證與授權 | `/auth` | 身份、存取控制、令牌、會話 |
| 2xxx   | 安全基礎 | `/security-fundamentals` | OWASP、輸入驗證、密鑰、密碼學 |
| 3xxx   | 網路基礎 | `/networking-fundamentals` | TCP/IP、DNS、HTTP、TLS、負載平衡 |
| 4xxx   | API 設計與通訊協定 | `/api-design` | REST、gRPC、GraphQL、版本控制、分頁 |

### 架構與資料層 (5xxx-8xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 5xxx   | 架構模式 | `/architecture-patterns` | 單體、微服務、DDD、CQRS、六角形 |
| 6xxx   | 資料儲存與資料庫基礎 | `/data-storage` | SQL vs NoSQL、索引、複製、分片 |
| 7xxx   | 資料建模與結構設計 | `/data-modeling` | ER 建模、正規化、序列化 |
| 8xxx   | 交易與資料完整性 | `/transactions` | ACID、隔離等級、saga、冪等性 |

### 執行時期層 (9xxx-12xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 9xxx   | 快取 | `/caching` | 失效、淘汰、分散式快取、HTTP 快取 |
| 10xxx  | 訊息與事件驅動 | `/messaging` | 佇列、發布/訂閱、交付保證、事件溯源 |
| 11xxx  | 並行與非同步 | `/concurrency` | 執行緒、鎖、非同步 I/O、工作池 |
| 12xxx  | 韌性與可靠性 | `/resilience` | 斷路器、重試、逾時、限流 |

### 工程實踐層 (13xxx-16xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 13xxx  | 效能與可擴展性 | `/performance-scalability` | 估算、擴展、剖析、CDN |
| 14xxx  | 可觀測性 | `/observability` | 日誌、指標、追蹤、SLO、告警 |
| 15xxx  | 測試策略 | `/testing` | 測試金字塔、整合、契約、負載測試 |
| 16xxx  | CI/CD 與 DevOps | `/cicd-devops` | CI、部署策略、IaC、功能旗標 |

### 專門領域 (17xxx+)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 17xxx  | 搜尋 | `/search` | 倒排索引、排序、查詢解析、向量搜尋 |
| 18xxx  | 多租戶 | `/multi-tenancy` | 租戶隔離、吵鬧鄰居、每租戶限制 |
| 19xxx  | 分散式系統 | `/distributed-systems` | 共識、複製、分區容錯、時間 |
| 30xxx  | AI 後端模式 | `/ai-backend-patterns` | LLM 服務、嵌入、RAG、ML 管線、MLOps |

> **為什麼 AI 後端模式在 30xxx 區塊？** 它是唯一分配 10000 寬區塊（30001-39999）而非 1000 寬的類別。此區塊反映 AI 系統模式的有意深入涵蓋，並為主題成長保留空間，避免與未來的基礎類別衝突。

## 相關資源

- [ADE](https://alivedise.github.io/api-design-essentials/) -- API 設計精要（API 設計的深入探討）
- [DEE](https://alivedise.github.io/database-engineering-essentials/) -- 資料庫工程精要（資料庫設計的深入探討）

## 維護者

Alive Kuo -- [alegnadise@gmail.com](mailto:alegnadise@gmail.com)

## 相關 BEE

- [BEE-2](how-to-read-bee.md) 如何閱讀 BEE
- [BEE-3](glossary.md) 術語表
