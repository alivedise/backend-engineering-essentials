---
id: 4009
title: OpenAPI 規範與 API 優先設計
state: draft
slug: openapi-specification-and-api-first-design
---

# [BEE-4009] OpenAPI 規範與 API 優先設計

:::info
OpenAPI 是一種供應商中立、語言無關的 REST API 描述格式。API 優先設計意味著在撰寫程式碼之前先撰寫 OpenAPI 文件——讓契約成為交付物，而非副產品。
:::

## 背景

Tony Tam 於 2010–2011 年在 Wordnik 建立了 Swagger，以解決每個 API 團隊最終都會遇到的問題：文件與實作脫節。Swagger 2.0（2014 年）透過定義一種機器可讀的格式來解決這個問題，這種格式可以同時描述、記錄、模擬、驗證和為 REST API 生成程式碼。該格式的實用性推動了快速採用——在兩年內成為 REST API 描述事實上的標準。

SmartBear 於 2015 年收購了 Swagger，然後立即將規範捐贈給新成立的 OpenAPI Initiative（OAI），一個 Linux 基金會專案。2016 年 1 月 1 日，Swagger 規範更名為 OpenAPI 規範（OAS）。治理轉變很重要：OAI 包含來自 Google、Microsoft、IBM、PayPal 和 Capital One 的成員，將一個單一公司的工具轉變為供應商中立的標準。OpenAPI 3.0.0 於 2017 年 7 月發布，採用重組後的文件格式，並首次支援 Webhook 和回調。OpenAPI 3.1.0（2021 年 2 月）解決了一個長期存在的矛盾：它將 3.0 中使用的自製 JSON Schema 子集替換為完整的 JSON Schema 2020-12 對齊，使驗證器、生成器和文件工具可以共享單一的 Schema 方言。

此標準化的實際結果：Stripe、GitHub 和 Twilio 都以 OpenAPI 文件形式公開發布其完整 API 介面。Stripe 的 OpenAPI 規範驅動七種語言的 SDK 生成。GitHub 的 600+ 個操作以 3.0 和 3.1 兩種格式描述。模擬伺服器、Linter、程式碼生成器、文件渲染器等工具可以統一處理任何這些 API，因為格式是穩定的標準。

## 設計思考

API 團隊必須回答的核心問題是何時撰寫規範：在程式碼之前（API 優先／設計優先）還是之後（程式碼優先）。

**程式碼優先**從程式碼生成規範——Spring Boot 中的注解、FastAPI 從 Python 類型提示自動派生的 Schema，或事後產生的 Swagger 文件。這是阻力最小的預設路徑。規範反映程式碼的行為，從定義上來說這是準確的——但它只反映程式碼已經做的事情，這意味著設計決策在實作期間隱式做出，而非在審查期間明確做出。

**API 優先**在撰寫任何生產程式碼之前先撰寫 OpenAPI 文件。規範以 Pull Request 的形式提交，由消費者、前端工程師和 API 治理團隊審查，並在實作開始之前鎖定。這有兩個後果。第一，處理消費者（行動應用、其他微服務）的團隊可以在規範合併後立即基於模擬伺服器開始工作，與伺服器實作並行。第二，設計錯誤——缺少的欄位、不一致的命名慣例、無法模擬可選與遺失的響應形狀——在 10 分鐘的審查中被發現，而非在客戶端整合後的多天重構中。

取捨是前期成本：為新服務撰寫完整的 OpenAPI 文件需要熟悉格式，並且在實作揭示邊界情況時需要紀律來維護它。對於面向公開或合作夥伴的 API，或具有多個消費者的服務，這項投資會有回報。對於一個團隊使用的快速內部端點，程式碼優先通常是合理的。

## OpenAPI 3.x 文件結構

OpenAPI 3.1 文件是一個具有以下頂層欄位的 JSON 或 YAML 檔案：

```yaml
openapi: "3.1.0"
info:
  title: "Order Service API"
  version: "2.1.0"
  description: "管理電子商務平台的訂單生命週期"
  contact:
    name: "平台團隊"
    email: "platform@example.com"

servers:
  - url: "https://api.example.com/v2"
    description: "生產環境"
  - url: "https://api.staging.example.com/v2"
    description: "預備環境"

tags:
  - name: orders
    description: 訂單建立和生命週期
  - name: fulfillment
    description: 出貨和交付

paths:
  /orders:
    post:
      operationId: createOrder
      tags: [orders]
      summary: 建立新訂單
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateOrderRequest"
      responses:
        "201":
          description: 訂單已建立
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Order"
        "422":
          $ref: "#/components/responses/ValidationError"
      security:
        - bearerAuth: []

components:
  schemas:
    CreateOrderRequest:
      type: object
      required: [customerId, items]
      properties:
        customerId:
          type: string
          format: uuid
        items:
          type: array
          minItems: 1
          items:
            $ref: "#/components/schemas/OrderItem"
    OrderItem:
      type: object
      required: [productId, quantity]
      properties:
        productId:
          type: string
        quantity:
          type: integer
          minimum: 1
    Order:
      allOf:
        - $ref: "#/components/schemas/CreateOrderRequest"
        - type: object
          required: [id, status, createdAt]
          properties:
            id:
              type: string
              format: uuid
            status:
              type: string
              enum: [pending, confirmed, shipped, delivered, cancelled]
            createdAt:
              type: string
              format: date-time

  responses:
    ValidationError:
      description: 請求驗證失敗
      content:
        application/problem+json:
          schema:
            $ref: "#/components/schemas/ProblemDetail"

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

**`components`** 是可維護規範的關鍵。在那裡定義的 Schema、響應、參數和範例透過 `$ref` 在整個文件中引用。OpenAPI 規範中的重複是維護風險：在一個 `$ref` 中重命名的欄位會傳播到各處；在十個路徑定義中重複的相同欄位需要十次編輯，通常導致漂移。

### OpenAPI 3.0 vs 3.1：JSON Schema 對齊

OpenAPI 3.0 使用了帶有不相容擴展的 JSON Schema Draft 5 的修改子集。摩擦是顯著的：JSON Schema 驗證器無法在沒有 OAS 特定方言的情況下驗證 OpenAPI 3.0 Schema 物件，因為兩者已經分歧：

| 特性 | JSON Schema | OpenAPI 3.0 | OpenAPI 3.1 |
|------|-------------|-------------|-------------|
| 可為 null 的類型 | `"type": ["string", "null"]` | `nullable: true`（OAS 擴展） | `"type": ["string", "null"]` |
| 排他邊界 | 數值（`"exclusiveMinimum": 5`） | 布林值（`"exclusiveMinimum": true`） | 數值（已恢復） |
| `$ref` 帶兄弟節點 | 允許 | 兄弟節點被忽略 | 允許 |
| 多種類型 | `"type": ["string", "integer"]` | 不支援 | 支援 |

新專案應以 OpenAPI 3.1 為目標。現有的 OpenAPI 3.0 規範可以繼續工作——大多數工具支援兩者——但 3.1 打開了直接重用 JSON Schema 工具和 Schema 的大門。

## 最佳實踐

**MUST（必須）在版本控制中將 OpenAPI 文件與其描述的程式碼一起版本化。**規範和實作一旦分開維護就會漂移。典型模式：規範存在於服務儲存庫中，CI 驗證運行中服務的響應符合規範，規範變更需要在同一個 Pull Request 中進行程式碼變更。

**SHOULD（應該）在 `components/schemas` 中定義每個可重用的 Schema，並透過 `$ref` 引用，而非內聯。**內聯 Schema 無法從其他路徑引用，也無法在不重複的情況下用於程式碼生成。在五個不同路徑中內聯的 Schema 是需要保持同步的五個 Schema。

**MUST（必須）為每個操作分配 `operationId`。**程式碼生成器使用 `operationId` 作為生成的函數或方法名稱。沒有它，生成器會退回到基於路徑的名稱，如 `postOrdersOrderIdItems`，這些名稱冗長且不穩定。標準形式：小駝峰命名的動詞 + 名詞——`createOrder`、`listOrderItems`、`cancelOrder`。

**SHOULD（應該）對錯誤響應使用 `$ref`。**服務中所有 422 響應應使用從 `components/responses` 引用的相同 `ProblemDetail` Schema。這確保了一致性，使 Linting 成為可能，並避免了常見問題：不同端點對相同錯誤條件返回不同形狀。

**SHOULD（應該）使用 Spectral 在 CI 中 Lint 規範。**Spectral 對 OpenAPI 文件應用可設定的規則——強制命名慣例、要求所有操作有描述、驗證安全方案是否已應用、拒絕請求體中的 `any` 類型：

```yaml
# .spectral.yaml
extends: ["spectral:oas"]
rules:
  operation-description: error        # 所有操作必須有描述
  operation-operationId: error        # 所有操作必須有 operationId
  oas3-api-servers: error             # servers 陣列必須存在
  no-$ref-siblings: off               # 允許 $ref 兄弟節點（OpenAPI 3.1）
```

```bash
# 在 CI 中運行
npx @stoplight/spectral-cli lint openapi.yaml --ruleset .spectral.yaml
```

**MUST（必須）在合併影響消費者的規範更新之前偵測重大變更。**重大變更是任何導致根據上一版規範構建的客戶端收到無法解析的響應，或發送新伺服器拒絕的請求的修改。常見重大變更：從響應中移除必填欄位、向請求體添加必填欄位、更改欄位類型、移除枚舉值。

`oasdiff` 比較兩個規範版本並報告重大變更：

```bash
oasdiff breaking openapi-main.yaml openapi-branch.yaml
# 輸出：
# error: deleted response property 'trackingId' [response-property-removed]
# error: new required request property 'shippingMethod' [request-property-became-required]
```

在 CI 中集成 `oasdiff` 作為檢查，當引入重大變更而未進行版本升級時使 PR 失敗。

**SHOULD（應該）在開發期間使用模擬伺服器。**Prism 將 OpenAPI 規範轉換為返回範例響應的工作 HTTP 模擬伺服器：

```bash
npx @stoplight/prism-cli mock openapi.yaml
# 在 http://localhost:4010 上啟動模擬伺服器
# POST /orders → 201 帶有範例 Order 響應
```

前端和整合測試團隊可以在規範 PR 合併後立即基於模擬開發，無需等待伺服器實作完成。

## 工具參考

| 用途 | 工具 | 備註 |
|------|------|------|
| 文件 UI | Swagger UI | 內嵌在大多數框架中 |
| 文件 UI | Redoc | 三欄佈局；適合大型規範 |
| 視覺設計 | Stoplight Studio | 帶即時預覽的 GUI 編輯器 |
| 模擬伺服器 | Prism | `npx @stoplight/prism-cli mock spec.yaml` |
| 程式碼生成 | openapi-generator | 50+ 客戶端語言，40+ 伺服器存根 |
| Linting | Spectral | 可設定規則集；CI 整合 |
| 重大變更偵測 | oasdiff | 300+ 類別；GitHub Action 可用 |

**openapi-generator** 從規範生成伺服器存根和客戶端 SDK：

```bash
# 生成 Python 客戶端
openapi-generator-cli generate \
  -i openapi.yaml \
  -g python \
  -o ./sdk/python \
  --additional-properties=packageName=order_client

# 生成 Spring Boot 伺服器存根
openapi-generator-cli generate \
  -i openapi.yaml \
  -g spring \
  -o ./server-stub \
  --additional-properties=interfaceOnly=true
```

`interfaceOnly=true` 旗標僅生成介面層，將實作留給你。這避免了生成後手動編輯伺服器程式碼的常見反模式——生成的介面在每次 CI 運行時從規範重新生成，保持其最新狀態。

## 相關 BEE

- [BEE-4001](rest-api-design-principles.md) -- REST API 設計原則：OpenAPI 規範應強制執行的 REST 慣例（資源命名、狀態碼、HTTP 方法）
- [BEE-4002](api-versioning-strategies.md) -- API 版本化策略：如何在 OpenAPI `info.version` 欄位和 servers 陣列中表達版本變更
- [BEE-4006](api-error-handling-and-problem-details.md) -- API 錯誤處理和問題詳情：`components/responses` 中使用的 `application/problem+json` Schema
- [BEE-15003](../testing/contract-testing.md) -- 契約測試：基於 Prism 和 openapi-generator 的客戶端提供 Pact 風格消費者驅動契約的替代方案
- [BEE-16001](../cicd-devops/continuous-integration-principles.md) -- 持續整合原則：Spectral Linting 和 oasdiff 重大變更檢查屬於 CI 管線

## 參考資料

- [OpenAPI Initiative. OpenAPI 規範 — openapis.org](https://www.openapis.org/)
- [OpenAPI Initiative. 學習 OpenAPI — learn.openapis.org](https://learn.openapis.org/specification/)
- [OpenAPI Initiative. OpenAPI 規範 3.1.0 — spec.openapis.org](https://spec.openapis.org/oas/v3.1.0.html)
- [OpenAPI Initiative. 從 OpenAPI 3.0 升級到 3.1 — learn.openapis.org](https://learn.openapis.org/upgrading/v3.0-to-v3.1.html)
- [Swagger.io. 程式碼優先 vs. 設計優先 API 開發 — swagger.io](https://swagger.io/blog/code-first-vs-design-first-api/)
- [Stoplight. Spectral — stoplight.io](https://stoplight.io/open-source/spectral)
- [Stoplight. Prism — stoplight.io](https://stoplight.io/open-source/prism)
- [OpenAPI Generator — openapi-generator.tech](https://openapi-generator.tech/)
- [oasdiff. OpenAPI diff 和重大變更 — oasdiff.com](https://www.oasdiff.com/)
- [GitHub. 介紹 GitHub 的 OpenAPI 描述 — github.blog](https://github.blog/news-insights/product-news/introducing-githubs-openapi-description/)
- [Stripe. OpenAPI 規範 — github.com/stripe/openapi](https://github.com/stripe/openapi)
- [Twilio. OpenAPI 規範 — github.com/twilio/twilio-oai](https://github.com/twilio/twilio-oai)
