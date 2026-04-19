---
id: 2012
title: SQL 注入與預備語句
state: draft
slug: sql-injection-and-prepared-statements
---

# [BEE-492] SQL 注入與預備語句

:::info
SQL 注入利用查詢邏輯與使用者提供資料之間缺乏結構性邊界的問題——預備語句透過完全獨立的協定通道傳輸查詢結構和參數值，從根本上解決了這個問題。
:::

## 背景

SQL 注入最早於 1998 年 12 月 25 日由 Jeff Forristal（化名「rain.forest.puppy」）在 Phrack 第 54 期公開記錄，目標是 Microsoft SQL Server。超過十年間，它一直是最常見的關鍵 Web 漏洞。OWASP 從 2013 年到 2017 年將其列為第一名。2021 年版本中，它被合併到更廣泛的「A03: 注入」類別——但 OWASP 指出，在那段分析期間測試的 94% 應用程式中都發現了注入缺陷。

這類漏洞導致的攻擊在規模上具有歷史性意義。Albert Gonzalez 及其團隊從 2006 年到 2008 年對 Heartland 支付系統使用 SQL 注入，安裝了捕獲 1.34 億張信用卡號碼的網路封包嗅探器——當時史上最大的支付卡資料外洩事件。Gonzalez 被判處 20 年聯邦刑期。同一團體此前曾透過 SQL 注入在 TJX 系統中潛伏 18 個月，外洩了超過 4000 萬個帳戶資料。

最近的大規模事件是 2023 年 5 月的 MOVEit Transfer 資料外洩。Cl0p 勒索軟體組織利用 CVE-2023-34362——Progress Software 的受管理檔案傳輸應用程式中的 SQL 注入零日漏洞——安裝 Web shell 並從約 2,000 個組織竊取資料，包括 BBC、英國航空和多個美國聯邦機構。這起事件促使 CISA 和 FBI 於 2024 年 3 月聯合發布「安全設計警示」，明確呼籲軟體製造商將 SQL 注入作為一類缺陷加以消除，並將參數化查詢列為主要必要防禦措施。

儘管是最古老的已記錄漏洞類別之一，SQL 注入仍繼續出現在生產軟體中，因為其根本原因是 SQL 引擎工作方式的結構性屬性，而非一種可以透過代碼審查或測試單獨捕獲的失敗模式。

## 根本原因：無控制/資料邊界

SQL 不區分結構性控制平面（查詢邏輯）和資料平面（被查詢的值）。當應用程式透過將使用者輸入連接到 SQL 字串來構建查詢時，使用者提供的資料進入了被解析為 SQL 的結構通道：

```sql
-- 應用程式代碼
query = "SELECT * FROM users WHERE username = '" + username + "'"

-- 攻擊者提供：' OR '1'='1
-- 結果查詢：
SELECT * FROM users WHERE username = '' OR '1'='1'
-- 返回所有行。身份驗證被繞過。

-- 攻擊者提供：'; DROP TABLE users; --
-- 結果查詢：
SELECT * FROM users WHERE username = ''; DROP TABLE users; --'
-- 執行兩條語句。資料被銷毀。
```

攻擊者輸入中的單引號從資料通道越界進入控制平面，因為字串連接操作將兩者視為無差別的文字。

## 攻擊分類

**經典（帶內）注入**使用相同通道傳遞酬載並接收結果。基於 UNION 的注入透過匹配原始查詢的列數和類型，附加 `UNION SELECT` 從其他表中檢索資料。基於錯誤的注入故意觸發資料庫錯誤消息，在錯誤文字中暴露 schema 名稱、表名或資料值。

**盲注**適用於應用程式不產生直接資料庫輸出的情況。基於布林的盲注透過觀察應用程式行為是否因注入謂詞中的真/假條件而改變來推斷資料（例如，登入成功或失敗）。基於時間的盲注使用資料庫延遲函式（`WAITFOR DELAY`、`pg_sleep()`、`SLEEP()`）將真/假問題的答案編碼為回應延遲——即使回應完全相同也可測量。

**二階（儲存型）注入**是最常被忽視的變體。惡意酬載透過參數化 INSERT 安全地儲存在資料庫中——儲存步驟是安全的。注入發生在稍後，在不同的代碼路徑中，當儲存的值被檢索並插值到後續假設資料庫來源資料已安全的查詢中：

```sql
-- 安全的儲存步驟：username = admin'-- 作為字面字串儲存
INSERT INTO users (username) VALUES ($1)  -- 參數化，安全

-- 不安全的檢索步驟（不同代碼路徑，不同開發者）：
username = db.query_value("SELECT username FROM users WHERE id = " + userId)
report  = "SELECT * FROM orders WHERE customer = '" + username + "'"
db.execute(report)
-- username 現在是 admin'-- ，截斷了 WHERE 子句
-- 返回所有客戶的所有訂單
```

## 最佳實踐

### 對所有資料庫操作使用參數化查詢

**MUST（必須）對每個包含外部資料的 SQL 語句使用參數化查詢（預備語句）。**「外部資料」包括使用者輸入、URL 參數、HTTP 標頭、從檔案讀取的資料、從第三方 API 接收的資料，以及從資料庫本身讀取的資料（二階注入）。對於「看起來無害」的資料沒有任何安全例外。

參數化查詢不是轉義的語法糖。它們在協定層面運作：查詢模板在任何參數值存在之前就被傳輸到資料庫並進行解析。參數值作為類型化的二進制資料，透過不同的協定消息單獨傳輸。資料庫引擎從不將這些值重新解析為 SQL 文字。

```python
# Python（psycopg2）— 不安全
cursor.execute(f"SELECT * FROM accounts WHERE user_id = {user_id}")

# Python（psycopg2）— 安全：%s 佔位符，值作為元組
cursor.execute("SELECT * FROM accounts WHERE user_id = %s", (user_id,))

# Java（JDBC）— 不安全
stmt = conn.createStatement()
stmt.executeQuery("SELECT * FROM accounts WHERE user_id = " + userId)

# Java（JDBC）— 安全：? 佔位符，分別設置
PreparedStatement stmt = conn.prepareStatement(
    "SELECT balance FROM accounts WHERE user_id = ?"
)
stmt.setInt(1, userId)
ResultSet rs = stmt.executeQuery()

# Node.js（pg）— 安全：$1 佔位符，值陣列
await pool.query(
    "SELECT balance FROM accounts WHERE user_id = $1",
    [userId]
)
```

**MUST NOT（不得）在沒有參數化的情況下使用 ORM 的原生查詢逃生艙。** ORM 在使用其查詢建構器 API 時可防止注入，但在開發者使用原始查詢字串繞過 ORM 時則無法防止：

```python
# Django — 安全：QuerySet API
User.objects.filter(username=username)

# Django — 不安全：raw() 與 f-string
User.objects.raw(f"SELECT * FROM auth_user WHERE username = '{username}'")

# SQLAlchemy — 安全：text() 與 bindparams
session.execute(text("SELECT * FROM accounts WHERE id = :id"), {"id": user_id})

# SQLAlchemy — 不安全：text() 與字串格式化
session.execute(text(f"SELECT * FROM accounts WHERE id = {user_id}"))
```

CVE-2024-42005 是透過 Q 物件的 Django ORM SQL 注入。CVE-2020-25638 是 Hibernate 中透過 JPQL 字串連接的 HQL 注入。CVE-2023-22794 是 ActiveRecord 列名 SQL 注入。ORM 提供安全的 API；繞過它們的開發者引入了漏洞。

**SHOULD（應該）驗證資料庫驅動程式使用的是真正的伺服器端預備語句，而非模擬的預備語句。** 某些驅動程式（尤其是某些 PHP PDO 配置）透過在驅動層使用轉義來插值參數，然後將完整的 SQL 字串發送到伺服器，從而模擬預備語句。這種模擬比真正的伺服器端分離要弱。在 PHP PDO 中：

```php
// 停用模擬以使用真正的伺服器端預備語句
$pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
```

### 對動態識別符使用允許清單

參數化處理值——WHERE 謂詞、INSERT 值、UPDATE 賦值。它無法處理 SQL 識別符——表名、列名、ORDER BY 目標——因為這些是查詢模板的結構性部分，在參數綁定之前就被解析了。

**MUST（必須）對任何使用者控制的 SQL 識別符使用允許清單映射。** 永遠不要將使用者輸入作為表名或列名插值，即使在轉義之後也不行：

```python
# 不安全：使用者控制 ORDER BY 中的列名
sort_column = request.args.get("sort", "created_at")
query = f"SELECT * FROM orders ORDER BY {sort_column}"  # 可注入

# 安全：允許列的允許清單
ALLOWED_SORT = {
    "date":   "created_at",
    "amount": "total_cents",
    "name":   "customer_name",
}
column = ALLOWED_SORT.get(request.args.get("sort"), "created_at")
query = text(f"SELECT * FROM orders ORDER BY {column}")
# column 始終是三個硬編碼字串之一——沒有使用者資料被插值
```

這同樣適用於多租戶架構中的動態表名、動態 schema 路由，或任何基於輸入改變 SQL 結構的情況。

### 對資料庫帳號套用最小權限

**MUST NOT（不得）以超級使用者、DBA 或 schema 所有者帳號連接應用程式到資料庫。** 預備語句從結構上防止了 SQL 注入，但它們不限制應用程式可以運行哪些合法查詢。找到其他漏洞（SSRF、RCE、路徑遍歷）的攻擊者，可能以應用程式現有連線的任何權限，透過該連線訪問資料庫。

正確的權限分配：
- 應用程式讀取 → 僅對特定表/視圖的 SELECT
- 應用程式寫入 → 僅對特定表的 INSERT、UPDATE、DELETE
- 生產環境中無 DROP、CREATE、ALTER、TRUNCATE 或 COPY 權限
- 除應用程式真正需要的之外，無法存取系統表（`information_schema`、`pg_catalog`）
- 讀取密集型 API 路徑和寫入密集型交易路徑使用獨立的資料庫使用者

**MUST NOT（不得）向客戶端暴露原始資料庫錯誤消息。** 到達客戶端的詳細錯誤消息，免費為攻擊者提供了表名、列名、schema 結構和查詢結構的枚舉資訊——這正是構建定向注入所需的資訊。在伺服器端記錄完整錯誤；向客戶端返回通用錯誤識別符。

### 正確使用儲存程序

如果儲存程序內部使用參數綁定，它們可以等同於預備語句。如果它們透過字串連接執行動態 SQL，則完全不等同：

```sql
-- 安全：帶參數綁定的儲存程序
CREATE PROCEDURE get_account(p_user_id INT)
AS BEGIN
    SELECT balance FROM accounts WHERE user_id = p_user_id
END

-- 不安全：帶內部動態 SQL 的儲存程序
CREATE PROCEDURE search_accounts(p_filter VARCHAR(100))
AS BEGIN
    EXEC('SELECT * FROM accounts WHERE ' + p_filter)
END
```

在 SQL Server 上，授予儲存程序的 `EXECUTE` 權限，如果程序訪問帳號無法直接訪問的物件，可能需要應用程式帳號以 `db_owner` 身份運行——這擴大而非縮小了爆炸半徑。在依賴儲存程序作為安全邊界之前，請驗證權限鏈。

## 深入探討：擴展查詢協定

為什麼預備語句在結構層面上能真正防止注入？答案在於資料庫的線路協定。

PostgreSQL 的擴展查詢協定（記錄於 PostgreSQL 官方手冊的協定流程章節）將查詢生命週期分為不同的消息類型：

1. **Parse 消息**：包含 SQL 模板——`SELECT balance FROM accounts WHERE user_id = $1`。伺服器將其解析為查詢計劃。此階段沒有使用者資料。

2. **Bind 消息**：包含類型化二進制資料形式的參數值。對於 `$1 = 42`，線路消息將整數 42 作為 4 位元組大端值攜帶，並帶有識別其類型的 OID。這透過與 Parse 消息完全獨立的協定通道到達。伺服器不會將這些位元組重新解析為 SQL 文字。

3. **Execute 消息**：觸發綁定入口的執行。

4. **Sync 消息**：標誌著交易邊界。

提供 `'; DROP TABLE accounts; --` 作為 `$1` 值的使用者，在 Bind 消息中傳遞這些位元組。PostgreSQL 解析器看不到它們——它們作為類型化的字串字面值直接發送到執行器。透過此通道的結構性注入在物理上是不可能的。

```mermaid
sequenceDiagram
    participant App as 應用程式
    participant Driver as DB 驅動
    participant DB as PostgreSQL

    App->>Driver: prepare("SELECT balance FROM accounts WHERE user_id = $1")
    Driver->>DB: Parse 消息 — 僅 SQL 模板，無使用者資料
    DB-->>Driver: ParseComplete（查詢已計劃）

    App->>Driver: bind(userId)
    Driver->>DB: Bind 消息 — 透過獨立通道的類型化二進制值
    DB-->>Driver: BindComplete

    Driver->>DB: Execute 消息
    DB-->>Driver: DataRow(balance)
    Driver-->>App: 結果

    style DB fill:#27ae60,color:#fff
    style Driver fill:#2980b9,color:#fff
    style App fill:#8e44ad,color:#fff
```

MySQL 透過預備語句的二進制協定與普通查詢的文字協定實現了等效的分離。文字協定將所有內容連接成一個字串發送到伺服器；二進制協定將語句準備與參數綁定分離。

## 常見錯誤

**用清理代替參數化。** 剝離或轉義引號是一場軍備競賽——URL 編碼、多位元組字符攻擊、Unicode 正規化、資料庫特定轉義序列以及二階場景，歷史上都繞過了清理。OWASP 明確將轉義列為已棄用的防禦措施，不應作為主要控制手段。

**信任資料庫來源的資料。** 存放在資料庫中的資料，在某個時間點是由某人放入的。如果儲存的值包含 SQL 元字符，並且隨後被插值到另一個查詢中（二階注入），「它來自資料庫」這一事實提供了零安全保障。對使用外部輸入的每個查詢進行參數化，無論該輸入來自何處。

**ORDER BY 和動態識別符。** 開發者通常正確地對 WHERE 子句的值進行參數化，但忘記了 ORDER BY 列名和類似的結構性組件無法被參數化。這些必須針對明確的允許清單進行驗證。

**生產環境中的詳細錯誤消息。** 直接到達客戶端的資料庫錯誤消息，免費為攻擊者提供 schema 枚舉。所有資料庫異常必須在應用程式邊界被捕獲並轉換為通用回應。

**過度授權的應用程式帳號。** 即使有完美的參數化，以 `postgres` 或 `root` 身份連接的應用程式也可以透過合法查詢讀取、寫入和刪除資料庫中的任何內容。最小權限限制了每個其他漏洞類別（除注入之外）造成的損害。

## 相關 BEE

- [BEE-2001](owasp-top-10-for-backend.md) -- 後端的 OWASP Top 10：A03:2021 注入是傘形類別；本文涵蓋 SQL 特定的實作機制
- [BEE-2002](input-validation-and-sanitization.md) -- 輸入驗證與清理：處理不受信任輸入的更廣泛原則；參數化是資料庫邊界的決定性防禦
- [BEE-2008](owasp-api-security-top-10.md) -- OWASP API 安全 Top 10：SQL 注入在 API 情境中作為風險出現（API10：處理第三方資料時的不安全消費）

## 參考資料

- [OWASP SQL Injection Prevention Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Query Parameterization Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html)
- [SQL Injection — OWASP Community](https://owasp.org/www-community/attacks/SQL_Injection)
- [SQL Injection — PortSwigger Web Security Academy](https://portswigger.net/web-security/sql-injection)
- [PostgreSQL Extended Query Protocol — postgresql.org](https://www.postgresql.org/docs/current/protocol-flow.html)
- [Secure by Design Alert: Eliminating SQL Injection Vulnerabilities — CISA/FBI (March 2024)](https://www.cisa.gov/resources-tools/resources/secure-design-alert-eliminating-sql-injection-vulnerabilities-software)
- [SQL Injection — Wikipedia](https://en.wikipedia.org/wiki/SQL_injection)
- [SQL Injection — NIST CSRC Glossary (NISTIR 7682)](https://csrc.nist.gov/glossary/term/sql_injection)
