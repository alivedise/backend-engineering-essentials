---
id: 3
title: Glossary
state: draft
slug: glossary
---

# [BEE-5] 術語表

:::info
BEE 文件中使用的常見術語。
:::

## 認證與安全

| 術語 | 定義 |
|------|------|
| **Authentication (AuthN)** | 驗證使用者或系統的身份 |
| **Authorization (AuthZ)** | 決定已認證的實體被允許做什麼 |
| **JWT** | JSON Web Token -- 用於傳輸聲明的緊湊、自包含令牌 |
| **OAuth 2.0** | 委派存取的授權框架 |
| **RBAC** | 基於角色的存取控制 -- 權限指派給角色，角色指派給使用者 |
| **ABAC** | 基於屬性的存取控制 -- 基於使用者、資源和環境屬性的權限 |

## 網路與 API

| 術語 | 定義 |
|------|------|
| **REST** | 表述性狀態轉移 -- 網路應用的架構風格 |
| **gRPC** | 使用 Protocol Buffers 的高效能 RPC 框架 |
| **Idempotency** | 操作無論執行多少次都產生相同結果的特性 |
| **Load Balancer** | 將傳入請求分散到多個後端伺服器的元件 |
| **Reverse Proxy** | 將客戶端請求轉發到後端伺服器的伺服器 |

## 架構

| 術語 | 定義 |
|------|------|
| **Microservices** | 應用由小型、可獨立部署的服務組成的架構 |
| **Monolith** | 整個應用作為單一單元部署的架構 |
| **Modular Monolith** | 具有良好定義的內部模組邊界的單體 |
| **CQRS** | 命令查詢職責分離 -- 讀取和寫入使用分開的模型 |
| **DDD** | 領域驅動設計 -- 圍繞業務領域建模軟體 |
| **Bounded Context** | DDD 概念，定義特定領域模型適用的邊界 |

## 資料與儲存

| 術語 | 定義 |
|------|------|
| **ACID** | 原子性、一致性、隔離性、持久性 -- 交易特性 |
| **CAP Theorem** | 分散式系統最多只能保證三者中的兩者：一致性、可用性、分區容錯 |
| **Eventual Consistency** | 副本隨時間收斂到相同狀態的一致性模型 |
| **Sharding** | 基於分區鍵將資料分散到多個資料庫 |
| **Replication** | 跨多個資料庫實例複製資料 |

## 執行時期與可靠性

| 術語 | 定義 |
|------|------|
| **Circuit Breaker** | 透過停止對失敗服務的請求來防止級聯失敗的模式 |
| **Backpressure** | 消費者向生產者發出減速信號的機制 |
| **SLO** | 服務等級目標 -- 服務等級指標的目標值 |
| **Error Budget** | SLO 期間內允許的不可靠量 |
| **Dead Letter Queue** | 用於無法成功處理的訊息的佇列 |

## 相關 BEE

- [BEE-1](bee-overview.md) BEE 總覽
- [BEE-2](how-to-read-bee.md) 如何閱讀 BEE
