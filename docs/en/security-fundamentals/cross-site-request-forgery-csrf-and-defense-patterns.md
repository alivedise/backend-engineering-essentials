---
id: 2013
title: Cross-Site Request Forgery (CSRF) and Defense Patterns
state: draft
slug: cross-site-request-forgery-csrf-and-defense-patterns
---

# [BEE-2013] Cross-Site Request Forgery (CSRF) and Defense Patterns

:::info
CSRF exploits the browser's automatic inclusion of session cookies in every request to a domain — defenses work by requiring proof of same-origin intent that a cross-origin attacker cannot forge.
:::

## Context

Cross-site request forgery was described informally as early as 2000, but the attack class was named and documented for the web by Peter Watkins in a BugTraq post in 2001. The name captures the mechanism precisely: the attacker crafts a request that crosses site origins, and the browser forges the victim's authenticated intent by automatically attaching their session cookie.

The early incidents demonstrated the scope of damage. In 2006, Netflix was shown to be vulnerable: any page visited by a logged-in user could change the user's shipping address, alter account credentials, or add DVDs to their rental queue — all via hidden forms that the browser would submit automatically. In 2007, a CSRF vulnerability in Gmail allowed attackers to create email filters forwarding all of a victim's mail to an attacker-controlled address; chained with a same-page XSS in Google Calendar, it enabled silent account takeover. In 2008, researchers from Princeton demonstrated that nearly every user action on YouTube — adding favorites, sending messages, modifying friend lists — could be performed on behalf of any logged-in user via CSRF. The same year, researchers from Johns Hopkins showed that ING Direct was vulnerable to CSRF attacks that could open new bank accounts and initiate fund transfers from victim accounts.

The attack succeeded in all these cases for the same structural reason: the server could not distinguish a request initiated by the legitimate application from a request initiated by a page on a different origin, because both carried the same session cookie, and the session cookie was the only credential being verified.

Modern applications have partially mitigated CSRF by adopting the `SameSite` cookie attribute and by using `Authorization` headers with JWT tokens rather than cookies. But applications that rely on `httpOnly` session cookies — the recommended configuration for session security — remain vulnerable to CSRF if they do not apply explicit origin validation. The attack surface has not disappeared; it has narrowed to precisely the applications most concerned with session security.

## How CSRF Works

Three conditions must hold simultaneously for a CSRF attack to succeed:

1. **Session credentials travel automatically** — the server authenticates the request based on a session cookie, not on a header the application's JavaScript explicitly sets
2. **A state-changing operation is reachable** — the attack requires an endpoint that modifies data (a transfer, a password change, a permission grant); purely read-only endpoints cause no harm
3. **All request parameters are predictable** — the attacker must be able to construct the complete valid request without knowing any value the victim holds but has not published

An attacker who controls a page the victim visits can use HTML to trigger requests to any origin. For GET requests, an `<img>` tag suffices:

```html
<!-- Victim visits attacker's page. Browser fires a GET to the target with session cookie. -->
<img src="https://bank.example.com/transfer?to=attacker&amount=5000" width="0" height="0">
```

For POST requests, a hidden auto-submitting form works:

```html
<form id="f" method="POST" action="https://bank.example.com/transfer">
  <input name="to"     value="attacker">
  <input name="amount" value="5000">
</form>
<script>document.getElementById('f').submit();</script>
```

Both of these are **simple requests** in the CORS sense — they do not trigger a CORS preflight. The browser sends them immediately with the session cookie attached. The server receives a request it cannot intrinsically distinguish from a legitimate one.

## Defense Patterns

### Synchronizer Token Pattern

The server generates a cryptographically random token and stores it in the user's server-side session. The token is embedded in every HTML form as a hidden field. On each state-changing submission, the server extracts the token from the request body and compares it to the session-stored value.

**MUST generate tokens with a CSPRNG of at least 128 bits of entropy.** Predictable tokens (sequential numbers, timestamps, user IDs) fail immediately.

**MUST compare tokens using constant-time equality** to prevent timing oracle attacks that allow an attacker to incrementally guess valid tokens.

**MUST NOT transmit the CSRF token in a cookie.** If the token lives in a cookie, a cross-origin page can use CSRF to submit a request with the cookie value echoed in a field — defeating the protection.

```python
# Server-side: generate token on session creation
import secrets
session['csrf_token'] = secrets.token_urlsafe(32)

# Template: embed in every state-changing form
# <input type="hidden" name="csrf_token" value="{{ csrf_token }}">

# Server-side: validate on every POST/PUT/DELETE/PATCH
import hmac
def validate_csrf(session, request_form):
    expected = session.get('csrf_token', '')
    received = request_form.get('csrf_token', '')
    # constant-time comparison prevents timing attacks
    if not hmac.compare_digest(expected, received):
        raise CSRFValidationError("Invalid CSRF token")
```

This pattern is what Django's `{% csrf_token %}`, Rails' `protect_from_forgery`, and Spring Security's `CsrfTokenRepository` implement.

### Signed Double-Submit Cookie (Stateless APIs)

For services that cannot maintain server-side session state, the server issues a CSRF token in both a cookie and a custom response header. On subsequent requests, the client echoes the token value back in a request header or body parameter. The server validates that the values match.

The naive variant is vulnerable to **subdomain cookie injection**: if an attacker can write a cookie for `.example.com` (via XSS on a sibling subdomain), they can set both the cookie and match it in the form field. The fix is to **sign the token with HMAC**:

```
token = base64url( nonce || HMAC-SHA256(secret, sessionID || nonce) )
```

The server recomputes the HMAC and verifies it. An attacker who cannot read the `secret` cannot forge a valid token — even if they can inject a cookie with a known nonce, the HMAC will not verify against the server's secret.

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

### SameSite Cookie Attribute (Defense-in-Depth)

The `SameSite` attribute, introduced in Chrome 51 (2016) and supported by all major browsers, controls whether the browser attaches a cookie to cross-site requests. It is not a primary defense on its own, but it is a critical depth layer.

```
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax
```

**`SameSite=Strict`**: Cookie excluded from all cross-site requests, including navigations from external links. Most secure but breaks flows like following an email link to a protected page — the user must re-authenticate.

**`SameSite=Lax`** (the Chrome default since 2020): Cookie included in cross-site GET top-level navigations (clicking a link in an email) but excluded from cross-site POST, `<img>` loads, iframes, and background `fetch()` calls. Protects against the majority of CSRF attacks.

**`SameSite=None; Secure`**: No restriction. Required for cross-site embedded use cases (payment widgets, cross-domain SSO, third-party analytics).

**SHOULD set `SameSite=Lax` or `SameSite=Strict` on all session cookies** as a defense-in-depth layer alongside a primary defense.

**SameSite alone is insufficient** for three reasons:
- `Lax` permits GET-based CSRF (if the server handles state changes on GET endpoints)
- Chrome applies a 120-second grace window: cookies without an explicit `SameSite` declaration permit cross-site POST for 2 minutes after issuance — exploitable via OAuth implicit flow
- Sibling subdomain XSS defeats SameSite: a script on `evil.example.com` is **same-site** with `app.example.com`, so Strict and Lax cookies are both attached to requests it makes

### Fetch Metadata Headers (Modern Default)

Since 2019–2022, browsers attach read-only `Sec-Fetch-*` headers to every request, identifying where the request originated and how it is used. A server can implement a **Resource Isolation Policy** (RIP) by inspecting these headers and blocking cross-origin requests to protected endpoints.

**SHOULD implement a Resource Isolation Policy on all state-changing endpoints:**

```python
def resource_isolation_policy(req) -> bool:
    """Returns True if request should be allowed."""
    site = req.headers.get('Sec-Fetch-Site')

    # Step 1: Legacy browsers do not send Sec-Fetch-* — fall through to other defenses
    if not site:
        return True

    # Step 2: Same-origin and same-site requests always allowed
    if site in ('same-origin', 'same-site', 'none'):
        return True

    # Step 3: Cross-site GET navigation allowed (link click) but not object/embed
    if (req.headers.get('Sec-Fetch-Mode') == 'navigate'
            and req.method == 'GET'
            and req.headers.get('Sec-Fetch-Dest') not in ('object', 'embed')):
        return True

    # Step 4: Explicit opt-outs (public API endpoints, webhooks)
    if req.path in CROSS_ORIGIN_ALLOWED_PATHS:
        return True

    # Step 5: Block everything else
    return False
```

For GET endpoints that serve cached content, **MUST include `Vary: Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site`** in responses to prevent a CDN from caching a cross-origin response and serving it to same-origin requests (or vice versa).

Fetch Metadata has ~98% browser coverage as of 2024 (Chrome 76+, Firefox 90+, Edge 79+, Safari 16.4+). The 2% gap requires the legacy fallback path to a token-based defense.

### Custom Request Headers (JavaScript-Only APIs)

For APIs consumed exclusively by JavaScript, requiring any custom header on state-changing requests is sufficient. Browsers enforce CORS preflight for requests with non-standard headers (`X-Requested-With: XMLHttpRequest`, `X-CSRF-Token: <value>`), and cross-origin pages cannot trigger a preflighted request without the server's CORS cooperation.

The header value need not carry a token — its presence proves the request originated from JavaScript code running in a page with same-origin access to the server. HTML forms cannot set custom headers; only `fetch()` and `XMLHttpRequest` can, and they are subject to CORS.

Angular implements this automatically: it reads a cookie named `XSRF-TOKEN` and sets `X-XSRF-TOKEN` on every state-changing request. The server validates that the header matches the cookie.

**This defense does not apply to HTML form submission paths** — only to endpoints exclusively reachable via JavaScript API calls. If the same endpoint also accepts HTML form `multipart/form-data` or `application/x-www-form-urlencoded` without a custom header, this defense provides no protection for that path.

## When CSRF Does Not Apply

**JSON APIs using `Authorization: Bearer <token>` headers are not vulnerable to CSRF.** The browser does not automatically attach `Authorization` headers to cross-site requests. An attacker can trigger an unpreflighted request with no `Authorization` header, but the server will reject it as unauthenticated. This is the primary reason stateless JWT-based APIs are recommended over session-cookie-based APIs when cross-origin interaction is required.

**Pure read operations are not exploitable.** CSRF causes harm only when the forged request modifies server state. An endpoint that returns data without side effects carries no CSRF risk — although it may carry CORS-related data leakage risk if the CORS policy is permissive.

## Visual

```mermaid
sequenceDiagram
    participant Victim as Victim's Browser
    participant Attacker as Attacker's Page
    participant Server as Legitimate Server

    Note over Attacker,Victim: Attack (no CSRF defense)
    Attacker->>Victim: Serve page with hidden form targeting Server
    Victim->>Server: POST /transfer (session cookie auto-attached by browser)
    Server-->>Victim: 200 OK — transfer executed

    Note over Attacker,Victim: Defended (Synchronizer Token)
    Victim->>Server: GET /transfer-form
    Server-->>Victim: Form + CSRF token embedded
    Victim->>Server: POST /transfer + CSRF token in body
    Server->>Server: Compare token to session store — match
    Server-->>Victim: 200 OK — transfer executed

    Note over Attacker,Victim: Attack vs. Defense
    Attacker->>Victim: Serve page with hidden form (attacker does not know victim's CSRF token)
    Victim->>Server: POST /transfer (no CSRF token in body — attacker cannot include it)
    Server->>Server: Compare token to session store — missing/mismatch
    Server-->>Victim: 403 Forbidden

    style Server fill:#27ae60,color:#fff
    style Victim fill:#2980b9,color:#fff
    style Attacker fill:#c0392b,color:#fff
```

## Common Mistakes

**Using GET requests for state-changing operations.** The most direct CSRF vector is an `<img>` or `<a href>` that triggers a GET which modifies data. HTTP semantics reserve GET for safe, idempotent operations. Fund transfers, account changes, and permission grants MUST use POST/PUT/PATCH/DELETE.

**Relying on the `Referer` header.** The `Referer` header can be stripped by browser privacy settings, corporate proxies, and the Referrer-Policy header — all of which are legitimate configurations. A server that requires a `Referer` to be present will reject legitimate requests from privacy-conscious users. A server that accepts any `Referer` or a missing one provides no CSRF protection.

**Using a naive (unsigned) double-submit cookie without HMAC binding.** An attacker who can plant a cookie on `.example.com` via XSS on a sibling subdomain can set both the cookie and the form field to a known value, defeating the protection. Always bind the token to the session identifier via HMAC.

**Treating SameSite as a complete solution.** `SameSite=Lax` prevents the majority of CSRF attacks but not all — in particular, GET-based state changes remain vulnerable, and sibling subdomain XSS is same-site. SameSite should be deployed alongside, not instead of, a token-based defense.

**Forgetting login CSRF.** Attackers can forge a login request that authenticates the victim as the attacker's account. The victim then performs actions (uploading documents, entering payment details) that land in the attacker's account. This is exploitable even when the application itself has no XSS. Pre-authentication pages need CSRF protection on the login form.

## Related BEEs

- [BEE-1004](../auth/session-management.md) -- Session Management: session cookies are the attack surface for CSRF; `httpOnly` and `Secure` flags are prerequisites for cookie security
- [BEE-2004](cors-and-same-origin-policy.md) -- CORS and Same-Origin Policy: CORS preflights are the mechanism that makes custom-header defense work; same-origin policy is why CSRF requires the cookie vector
- [BEE-2009](http-security-headers.md) -- HTTP Security Headers: `SameSite` lives in `Set-Cookie`; the CSRF / CSP interaction (XSS defeats all CSRF defenses)
- [BEE-2008](owasp-api-security-top-10.md) -- OWASP API Security Top 10: CSRF surfaces when API authentication relies on cookies rather than explicit tokens

## References

- [OWASP CSRF Prevention Cheat Sheet — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Cross-Site Request Forgery (CSRF) — PortSwigger Web Security Academy](https://portswigger.net/web-security/csrf)
- [Bypassing SameSite Restrictions — PortSwigger Web Security Academy](https://portswigger.net/web-security/csrf/bypassing-samesite-restrictions)
- [Cross-Site Request Forgery (CSRF) — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF)
- [Protect your resources from web attacks with Fetch Metadata — web.dev](https://web.dev/articles/fetch-metadata)
- [Cross-site request forgery — OWASP Community](https://owasp.org/www-community/attacks/csrf)
- [Cross-site request forgery — Wikipedia](https://en.wikipedia.org/wiki/Cross-site_request_forgery)
