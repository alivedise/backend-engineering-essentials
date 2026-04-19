---
id: 2013
title: 跨站請求偽造（CSRF）與防禦模式
state: draft
slug: cross-site-request-forgery-csrf-and-defense-patterns
---

# [BEE-2013] 跨站請求偽造（CSRF）與防禦模式

:::info
CSRF 利用瀏覽器自動將 session cookie 附加到發往某網域的每個請求這一機制——防禦措施的運作原理是要求跨域攻擊者無法偽造的同源意圖證明。
:::

## 背景

跨站請求偽造早在 2000 年就已被非正式描述，但 Peter Watkins 於 2001 年在 BugTraq 的一篇文章中為 Web 安全正式命名和記錄了這類攻擊。這個名稱精確捕捉了機制：攻擊者構造一個跨越站點來源的請求，而瀏覽器透過自動附加受害者的 session cookie 來「偽造」受害者的已認證意圖。

早期的事件展示了損害的範疇。2006 年，Netflix 被發現存在漏洞：任何被已登入使用者訪問的頁面，都可以更改使用者的送貨地址、修改帳號憑證或向其租賃列表添加 DVD——全部透過瀏覽器自動提交的隱藏表單完成。2007 年，Gmail 的 CSRF 漏洞允許攻擊者建立將受害者所有郵件轉發到攻擊者控制地址的郵件過濾器；與 Google 日曆中的同頁 XSS 鏈接後，它實現了靜默帳號接管。2008 年，普林斯頓大學的研究人員證明，YouTube 上幾乎所有使用者操作——添加收藏、發送消息、修改好友清單——都可以透過 CSRF 以任何已登入使用者的名義執行。同年，約翰斯·霍普金斯大學的研究人員發現 ING Direct 存在 CSRF 漏洞，可能使攻擊者從受害者帳戶開設新的銀行帳戶並發起資金轉移。

在所有這些情況下，攻擊都因為相同的結構性原因而成功：伺服器無法區分由合法應用程式發起的請求與由不同來源的頁面發起的請求，因為兩者都攜帶相同的 session cookie，而 session cookie 是被驗證的唯一憑證。

現代應用程式透過採用 `SameSite` cookie 屬性以及使用帶有 JWT 令牌的 `Authorization` 標頭而非 cookie，部分緩解了 CSRF 問題。但依賴 `httpOnly` session cookie（session 安全的推薦配置）的應用程式，如果不應用明確的來源驗證，仍然容易受到 CSRF 攻擊。

## CSRF 的工作原理

CSRF 攻擊成功需要同時滿足三個條件：

1. **session 憑證自動傳輸** — 伺服器基於 session cookie 而非應用程式 JavaScript 明確設置的標頭來驗證請求
2. **存在可達的狀態變更操作** — 攻擊需要修改資料的端點（轉帳、密碼更改、權限授予）；純唯讀端點不造成危害
3. **所有請求參數可預測** — 攻擊者必須能夠在不知道受害者持有但未公開的任何值的情況下，構造完整有效的請求

控制受害者訪問的頁面的攻擊者，可以使用 HTML 觸發對任何來源的請求。對於 GET 請求，一個 `<img>` 標籤就夠了：

```html
<!-- 受害者訪問攻擊者的頁面。瀏覽器向目標發送帶有 session cookie 的 GET 請求。 -->
<img src="https://bank.example.com/transfer?to=attacker&amount=5000" width="0" height="0">
```

對於 POST 請求，一個隱藏的自動提交表單有效：

```html
<form id="f" method="POST" action="https://bank.example.com/transfer">
  <input name="to"     value="attacker">
  <input name="amount" value="5000">
</form>
<script>document.getElementById('f').submit();</script>
```

這兩者在 CORS 意義上都是**簡單請求**——它們不觸發 CORS 預檢。瀏覽器立即發送它們並附加 session cookie。伺服器收到一個本質上無法與合法請求區分的請求。

## 防禦模式

### 同步器令牌模式（Synchronizer Token Pattern）

伺服器生成一個密碼學隨機令牌並將其儲存在使用者的伺服器端 session 中。令牌作為隱藏欄位嵌入每個 HTML 表單。在每個狀態變更提交時，伺服器從請求體中提取令牌並與 session 儲存的值進行比較。

**MUST（必須）使用至少 128 位元熵的 CSPRNG 生成令牌。** 可預測的令牌（循序數字、時間戳、使用者 ID）立即失效。

**MUST（必須）使用常數時間等值比較令牌**，以防止允許攻擊者逐步猜測有效令牌的時序預言機攻擊。

**MUST NOT（不得）在 cookie 中傳輸 CSRF 令牌。** 如果令牌存在於 cookie 中，跨域頁面可以使用 CSRF 提交帶有 cookie 值在欄位中迴響的請求——破壞保護。

```python
# 伺服器端：在 session 建立時生成令牌
import secrets
session['csrf_token'] = secrets.token_urlsafe(32)

# 模板：嵌入每個狀態變更表單
# <input type="hidden" name="csrf_token" value="{{ csrf_token }}">

# 伺服器端：在每個 POST/PUT/DELETE/PATCH 上驗證
import hmac
def validate_csrf(session, request_form):
    expected = session.get('csrf_token', '')
    received = request_form.get('csrf_token', '')
    # 常數時間比較防止時序攻擊
    if not hmac.compare_digest(expected, received):
        raise CSRFValidationError("Invalid CSRF token")
```

這個模式正是 Django 的 `{% csrf_token %}`、Rails 的 `protect_from_forgery` 以及 Spring Security 的 `CsrfTokenRepository` 所實現的。

### 簽名雙重提交 Cookie（無狀態 API）

對於無法維護伺服器端 session 狀態的服務，伺服器在 cookie 和自訂回應標頭中都發放 CSRF 令牌。在後續請求中，客戶端在請求標頭或請求體參數中迴響令牌值。伺服器驗證兩個值是否匹配。

樸素的變體容易受到**子網域 cookie 注入**攻擊：如果攻擊者可以為 `.example.com` 寫入 cookie（透過兄弟子網域上的 XSS），他們可以設置 cookie 和表單欄位為已知值。修復方法是**使用 HMAC 對令牌進行簽名**：

```
token = base64url( nonce || HMAC-SHA256(secret, sessionID || nonce) )
```

伺服器重新計算 HMAC 並驗證它。無法讀取 `secret` 的攻擊者無法偽造有效令牌——即使他們可以注入帶有已知 nonce 的 cookie，HMAC 也不會通過伺服器的 secret 驗證。

```python
import hmac, hashlib, secrets, base64

SECRET = b'server-side-secret-key'

def make_csrf_token(session_id: str) -> str:
    nonce = secrets.token_bytes(16)
    mac = hmac.new(SECRET, session_id.encode() + nonce, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + mac).decode()

def verify_csrf_token(session_id: str, token: str) -> bool:
    raw = base64.urlsafe_b64decode(token)
    nonce, received_mac = raw[:16], raw[16:]
    expected_mac = hmac.new(SECRET, session_id.encode() + nonce, hashlib.sha256).digest()
    return hmac.compare_digest(expected_mac, received_mac)
```

### SameSite Cookie 屬性（縱深防禦）

`SameSite` 屬性於 Chrome 51（2016 年）引入，所有主流瀏覽器均支援，控制瀏覽器是否將 cookie 附加到跨站點請求。它本身不是主要防禦，但它是關鍵的縱深層次。

```
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax
```

**`SameSite=Strict`**：Cookie 從所有跨站點請求中排除，包括來自外部連結的導航。最安全，但會破壞如點擊電子郵件連結到受保護頁面的流程——使用者必須重新認證。

**`SameSite=Lax`**（2020 年起 Chrome 的預設值）：Cookie 包含在跨站點 GET 頂層導航中（點擊連結），但從跨站點 POST、`<img>` 載入、iframe 和後台 `fetch()` 呼叫中排除。防禦大多數 CSRF 攻擊。

**`SameSite=None; Secure`**：無限制。跨站點嵌入用例（支付小工具、跨域 SSO、第三方分析）所需。

**SHOULD（應該）在所有 session cookie 上設置 `SameSite=Lax` 或 `SameSite=Strict`** 作為主要防禦的縱深層。

**SameSite 單獨使用不夠充分**，原因有三：
- `Lax` 允許基於 GET 的 CSRF（如果伺服器對 GET 端點處理狀態變更）
- Chrome 應用 120 秒寬限視窗：沒有明確 `SameSite` 聲明的 cookie 在簽發後 2 分鐘內允許跨站點 POST
- 兄弟子網域 XSS 破解 SameSite：`evil.example.com` 上的腳本與 `app.example.com` **同站點**，因此 Strict 和 Lax cookie 都會附加到它發出的請求

### Fetch Metadata 標頭（現代預設）

自 2019–2022 年起，瀏覽器在每個請求上附加唯讀的 `Sec-Fetch-*` 標頭，識別請求的來源及其使用方式。伺服器可以透過檢查這些標頭並阻止對受保護端點的跨域請求，來實施**資源隔離策略（RIP）**。

**SHOULD（應該）在所有狀態變更端點上實施資源隔離策略：**

```python
def resource_isolation_policy(req) -> bool:
    """如果應該允許請求則返回 True。"""
    site = req.headers.get('Sec-Fetch-Site')

    # 步驟 1：舊版瀏覽器不傳送 Sec-Fetch-*——退回到其他防禦
    if not site:
        return True

    # 步驟 2：同源和同站點請求始終允許
    if site in ('same-origin', 'same-site', 'none'):
        return True

    # 步驟 3：允許跨站點 GET 導航（連結點擊），但非 object/embed
    if (req.headers.get('Sec-Fetch-Mode') == 'navigate'
            and req.method == 'GET'
            and req.headers.get('Sec-Fetch-Dest') not in ('object', 'embed')):
        return True

    # 步驟 4：明確的選擇退出（公共 API 端點、webhook）
    if req.path in CROSS_ORIGIN_ALLOWED_PATHS:
        return True

    # 步驟 5：阻止其他所有請求
    return False
```

對於提供快取內容的 GET 端點，**MUST（必須）在回應中包含 `Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site`**，以防止 CDN 快取跨域回應並將其提供給同源請求。

截至 2024 年，Fetch Metadata 的瀏覽器覆蓋率約為 98%（Chrome 76+、Firefox 90+、Edge 79+、Safari 16.4+）。2% 的缺口需要退回到基於令牌的防禦。

### 自訂請求標頭（僅限 JavaScript API）

對於僅由 JavaScript 消費的 API，在狀態變更請求上要求任何自訂標頭就足夠了。瀏覽器對帶有非標準標頭（`X-Requested-With: XMLHttpRequest`、`X-CSRF-Token: <value>`）的請求強制執行 CORS 預檢，跨域頁面在沒有伺服器 CORS 配合的情況下無法觸發需要預檢的請求。

標頭值本身不需要攜帶令牌——其存在證明請求源自在具有對伺服器同源存取權的頁面中執行的 JavaScript 代碼。HTML 表單不能設置自訂標頭；只有 `fetch()` 和 `XMLHttpRequest` 可以，且它們受 CORS 約束。

Angular 自動實現了這一點：它讀取名為 `XSRF-TOKEN` 的 cookie，並在每個狀態變更請求上設置 `X-XSRF-TOKEN`。伺服器驗證標頭與 cookie 匹配。

**此防禦不適用於 HTML 表單提交路徑**——僅適用於只能透過 JavaScript API 呼叫訪問的端點。

## CSRF 不適用的情況

**使用 `Authorization: Bearer <token>` 標頭的 JSON API 不受 CSRF 攻擊。** 瀏覽器不會自動將 `Authorization` 標頭附加到跨站點請求。攻擊者可以觸發不帶 `Authorization` 標頭的未預檢請求，但伺服器會將其拒絕為未認證。這是推薦無狀態 JWT 型 API 而非基於 session cookie 的 API 的主要原因。

**純唯讀操作不可被利用。** CSRF 只有在偽造的請求修改伺服器狀態時才會造成危害。不帶副作用返回資料的端點不存在 CSRF 風險。

## 視覺化

```mermaid
sequenceDiagram
    participant Victim as 受害者的瀏覽器
    participant Attacker as 攻擊者的頁面
    participant Server as 合法伺服器

    Note over Attacker,Victim: 攻擊（無 CSRF 防禦）
    Attacker->>Victim: 提供包含目標伺服器隱藏表單的頁面
    Victim->>Server: POST /transfer（瀏覽器自動附加 session cookie）
    Server-->>Victim: 200 OK — 轉帳已執行

    Note over Attacker,Victim: 防禦（同步器令牌）
    Victim->>Server: GET /transfer-form
    Server-->>Victim: 表單 + 嵌入的 CSRF 令牌
    Victim->>Server: POST /transfer + 請求體中的 CSRF 令牌
    Server->>Server: 與 session store 比較令牌 — 匹配
    Server-->>Victim: 200 OK — 轉帳已執行

    Note over Attacker,Victim: 攻擊 vs. 防禦
    Attacker->>Victim: 提供隱藏表單（攻擊者不知道受害者的 CSRF 令牌）
    Victim->>Server: POST /transfer（請求體中無 CSRF 令牌——攻擊者無法包含它）
    Server->>Server: 與 session store 比較令牌 — 缺失/不匹配
    Server-->>Victim: 403 Forbidden

    style Server fill:#27ae60,color:#fff
    style Victim fill:#2980b9,color:#fff
    style Attacker fill:#c0392b,color:#fff
```

## 常見錯誤

**對狀態變更操作使用 GET 請求。** 最直接的 CSRF 向量是觸發修改資料的 GET 的 `<img>` 或 `<a href>`。HTTP 語義將 GET 保留給安全的、冪等的操作。資金轉移、帳號更改和權限授予 MUST（必須）使用 POST/PUT/PATCH/DELETE。

**依賴 `Referer` 標頭。** `Referer` 標頭可以被瀏覽器隱私設置、企業代理和 Referrer-Policy 標頭剝離——這些都是合法的配置。要求 `Referer` 存在的伺服器會拒絕來自注重隱私的使用者的合法請求。接受任何 `Referer` 或缺少 `Referer` 的伺服器不提供 CSRF 保護。

**使用沒有 HMAC 綁定的樸素（未簽名）雙重提交 cookie。** 可以透過兄弟子網域上的 XSS 在 `.example.com` 上植入 cookie 的攻擊者，可以將 cookie 和表單欄位都設置為已知值，破壞保護。始終透過 HMAC 將令牌綁定到 session 識別符。

**將 SameSite 視為完整的解決方案。** `SameSite=Lax` 防止大多數 CSRF 攻擊，但並非全部——特別是基於 GET 的狀態變更仍然容易受攻擊，兄弟子網域 XSS 是同站點的。SameSite 應與基於令牌的防禦一起部署，而非替代它。

**忘記登入 CSRF。** 攻擊者可以偽造將受害者以攻擊者帳號進行認證的登入請求。然後受害者執行的操作（上傳文件、輸入支付詳情）會記錄在攻擊者的帳號下。即使應用程式本身沒有 XSS 漏洞，這也是可以被利用的。認證前的頁面需要在登入表單上實施 CSRF 保護。

## 相關 BEE

- [BEE-1004](../auth/session-management.md) -- Session 管理：session cookie 是 CSRF 的攻擊面；`httpOnly` 和 `Secure` 旗標是 cookie 安全的前提條件
- [BEE-2004](cors-and-same-origin-policy.md) -- CORS 與同源策略：CORS 預檢是使自訂標頭防禦有效的機制；同源策略是 CSRF 需要 cookie 向量的原因
- [BEE-2009](http-security-headers.md) -- HTTP 安全標頭：`SameSite` 存在於 `Set-Cookie` 中；CSRF / CSP 的交互（XSS 破壞所有 CSRF 防禦）
- [BEE-2008](owasp-api-security-top-10.md) -- OWASP API 安全 Top 10：當 API 認證依賴 cookie 而非明確令牌時，CSRF 會浮現

## 參考資料

- [OWASP CSRF Prevention Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Cross-Site Request Forgery (CSRF) — PortSwigger Web Security Academy](https://portswigger.net/web-security/csrf)
- [Bypassing SameSite Restrictions — PortSwigger Web Security Academy](https://portswigger.net/web-security/csrf/bypassing-samesite-restrictions)
- [Cross-Site Request Forgery (CSRF) — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [Protect your resources from web attacks with Fetch Metadata — web.dev](https://web.dev/articles/fetch-metadata)
- [Cross-site request forgery — OWASP Community](https://owasp.org/www-community/attacks/csrf)
- [Cross-site request forgery — Wikipedia](https://en.wikipedia.org/wiki/Cross-site_request_forgery)
