---
id: 1003
title: OAuth 2.0 and OpenID Connect
state: draft
slug: oauth-openid-connect
---

# [BEE-1003] OAuth 2.0 and OpenID Connect

:::info
OAuth 2.0 delegates access without sharing credentials. OpenID Connect adds verified identity on top. Using OAuth 2.0 alone for authentication is one of the most common and dangerous misunderstandings in modern API security.
:::

## Context

Before OAuth 2.0, applications obtained access to third-party resources by asking users to hand over their credentials directly — a model that violates the principle of least privilege and makes credential revocation impossible without a password change.

RFC 6749 (2012) introduced OAuth 2.0 as an authorization delegation framework: a resource owner (user) grants a client (application) limited access to resources hosted on a resource server, via an authorization server, without ever sharing their credentials with the client.

OAuth 2.0 is explicitly an authorization framework. The specification does not define an authentication mechanism. An access token proves that some resource owner granted certain scopes — it does not prove who the current user is. This distinction caused widespread misuse: applications were inferring user identity from access tokens alone, which is insecure.

OpenID Connect (OIDC) Core 1.0 was published by the OpenID Foundation in 2014 to close this gap. OIDC is a thin identity layer on top of OAuth 2.0: it adds an ID token (a signed JWT) that carries verified claims about the authenticated end-user's identity, and standardizes a `/userinfo` endpoint for additional claims.

RFC 7636 (PKCE, 2015) addressed a code interception attack against public clients (mobile apps, single-page apps) that cannot securely store a client secret. PKCE binds the authorization request to the token exchange with a cryptographic challenge, making intercepted authorization codes useless to an attacker.

RFC 9700 (OAuth 2.0 Security Best Current Practice, 2025) codifies accumulated security experience and explicitly deprecates the Implicit grant and Resource Owner Password Credentials grant for new deployments.

## Principle

**P1 — Use OAuth 2.0 for delegated authorization, not for authentication.** An access token is a capability token — it proves access was granted, not that a specific user is present. When you need to know who the user is, use OpenID Connect and validate the ID token.

**P2 — Use the Authorization Code grant with PKCE for all interactive flows.** This applies to web applications, mobile apps, and single-page applications. PKCE is required for public clients (RFC 9700 §2.1.1) and RECOMMENDED for all clients. Do not use the Implicit grant.

**P3 — Use Client Credentials for machine-to-machine flows.** When no user is involved and a service acts on its own behalf, Client Credentials is the correct grant. There is no user delegation and no refresh token in this flow.

**P4 — Never use the Implicit or Resource Owner Password Credentials grants in new systems.** The Implicit grant exposes tokens in the URL fragment, bypasses PKCE, and offers no mechanism for token refresh. The Resource Owner Password Credentials grant requires the client to handle user credentials directly, breaking the delegation model entirely. Both are deprecated by RFC 9700.

**P5 — Always validate the `state` parameter on the callback.** The `state` parameter is a CSRF defense. A client MUST generate a random `state` value, bind it to the user's session, and verify that the callback carries the same value before proceeding. Skipping this check allows an attacker to initiate an authorization flow and inject their authorization code into a victim's session.

**P6 — Request the minimum necessary scopes.** Scopes define the boundary of delegated access. Requesting broad scopes (`*`, `admin`, `write:all`) when narrow ones suffice violates least privilege and increases breach impact. Request only what the current operation requires.

**P7 — Validate the ID token fully before trusting identity claims.** The ID token is a JWT. All JWT validation rules apply (see [BEE-2](../bee-overall/how-to-read-bee.md)1): verify signature, `iss`, `aud`, `exp`, and `nonce` (when used). Do not use the access token or the `/userinfo` response as a substitute for ID token validation.

## Visual

The following diagram shows the Authorization Code flow with PKCE, covering all four parties and the complete sequence of redirects, code exchange, and API access.

```mermaid
sequenceDiagram
    participant RO as Resource Owner<br/>(User/Browser)
    participant Client as Client<br/>(Your App)
    participant AS as Authorization Server
    participant RS as Resource Server<br/>(API)

    Note over Client: Generate code_verifier (random)<br/>code_challenge = S256(code_verifier)

    Client->>RO: Redirect to authorization URL<br/>?response_type=code<br/>&client_id=...&scope=...<br/>&state=xyz&code_challenge=...

    RO->>AS: Follow redirect (GET /authorize)
    AS->>RO: Show login + consent screen
    RO->>AS: Authenticate and approve

    AS->>RO: Redirect to redirect_uri<br/>?code=AUTH_CODE&state=xyz

    RO->>Client: Follow redirect (callback)

    Note over Client: Verify state == xyz (CSRF check)

    Client->>AS: POST /token<br/>grant_type=authorization_code<br/>code=AUTH_CODE<br/>code_verifier=...
    AS->>AS: Verify code_verifier<br/>matches code_challenge

    AS-->>Client: { access_token, id_token,<br/>refresh_token, expires_in }

    Note over Client: Validate id_token (sig, iss, aud, exp, nonce)

    Client->>RS: GET /api/resource<br/>Authorization: Bearer access_token
    RS->>RS: Verify access_token + scopes
    RS-->>Client: 200 OK + resource data
```

## Example

The following shows a complete Authorization Code + PKCE flow using generic HTTP requests. All values are illustrative.

### Step 1 — Generate the PKCE parameters

Before redirecting, the client generates a random secret and derives the challenge:

```
code_verifier  = base64url(random_bytes(32))
               = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

code_challenge = base64url(SHA256(code_verifier))
               = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
```

### Step 2 — Authorization request (client redirects the user)

```
GET /authorize
    ?response_type=code
    &client_id=app-client-123
    &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
    &scope=openid%20profile%20email%20read%3Adocuments
    &state=af0ifjsldkj
    &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    &code_challenge_method=S256
Host: auth.example.com
```

Key parameters:

| Parameter | Purpose |
|---|---|
| `response_type=code` | Request an authorization code (not a token directly) |
| `scope=openid ...` | `openid` scope triggers OIDC; additional scopes define API access |
| `state` | Random value bound to session; MUST be verified on callback |
| `code_challenge` | SHA-256 hash of `code_verifier`; binds this request to the token exchange |
| `code_challenge_method=S256` | Specifies the hash algorithm; `S256` is required (plain is insecure) |

### Step 3 — Authorization server redirects back with code

After the user logs in and approves:

```
HTTP/1.1 302 Found
Location: https://app.example.com/callback
    ?code=SplxlOBeZQQYbYS6WxSbIA
    &state=af0ifjsldkj
```

The client MUST verify that `state` matches the value stored in the user's session before proceeding.

### Step 4 — Token exchange

```
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
&client_id=app-client-123
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

The authorization server verifies that `SHA256(code_verifier) == code_challenge` from step 2. An intercepted code without the `code_verifier` cannot be exchanged.

Response:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "8xLOxBtZp8",
  "id_token": "eyJhbGciOiJSUzI1NiJ9...",
  "scope": "openid profile email read:documents"
}
```

### Step 5 — Validate the ID token

The ID token is a signed JWT. Decode and verify before trusting any claims:

```json
{
  "iss": "https://auth.example.com",
  "sub": "user-7f3a9b",
  "aud": "app-client-123",
  "exp": 1712530800,
  "iat": 1712530200,
  "nonce": "n-0S6_WzA2Mj",
  "email": "alice@example.com",
  "name": "Alice"
}
```

Validation MUST include: signature (against AS public key), `iss` matches known issuer, `aud` matches your `client_id`, `exp` is in the future, `nonce` matches the value sent in step 2 (when used).

### Step 6 — Use the access token to call the API

```
GET /api/documents HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...
```

The resource server validates the access token (signature, `exp`, `aud`, scopes) and returns the resource. The access token proves delegated access to `read:documents` — it does not prove the caller's identity to the resource server independently of the ID token flow.

### Token comparison

| Token | Purpose | Who validates | Typical lifetime |
|---|---|---|---|
| Access token | Authorize API calls (delegated access) | Resource server | 15 minutes |
| ID token | Authenticate the end-user (OIDC only) | Client application | Single use (verify once) |
| Refresh token | Obtain new access tokens | Authorization server | Hours to days |

## Common Mistakes

**1. Using OAuth 2.0 alone for authentication.**

Calling `GET /userinfo` with an access token does not authenticate the user to your application — it fetches claims from the authorization server, but provides no binding to the current session or user interaction. Use OpenID Connect: verify the ID token's signature and `nonce` claim to establish that a specific user authenticated in this specific session. (See [BEE-1001](authentication-vs-authorization.md) for the AuthN/AuthZ distinction.)

**2. Using the Implicit grant in new applications.**

The Implicit grant returns an access token directly in the URL fragment (`#access_token=...`). Tokens in URL fragments are logged by proxies, stored in browser history, and visible to JavaScript on the page. The Implicit grant was designed before PKCE existed. It is deprecated by RFC 9700. Use Authorization Code + PKCE instead — it works for SPAs and mobile apps without requiring a client secret.

**3. Not validating the `state` parameter.**

A server that ignores the `state` value on the callback is vulnerable to CSRF. An attacker can initiate an OAuth flow with their own authorization code and trick the victim's browser into completing it, binding the attacker's identity (or access) to the victim's session. Generate a cryptographically random `state` per request, bind it to the session, and reject any callback where `state` does not match.

**4. Requesting overly broad scopes.**

`scope=*` or `scope=admin` requests every permission the authorization server supports. When the client is later compromised, every scope is accessible to the attacker. Scope creep also erodes user trust in the consent dialog. Request the minimum scope set needed for the current operation. For API-to-API access via Client Credentials, define per-resource scopes (`read:orders`, `write:orders`) rather than blanket grants.

## Related BEPs

- [BEE-1001: Authentication vs Authorization](10.md) — the conceptual boundary that OAuth 2.0 and OIDC operate across
- [BEE-1002: Token-Based Authentication](11.md) — JWT structure, validation, and the token lifecycle
- [BEE-2004: Third-Party API Integration Security](33.md) — OAuth in the context of external service integration

## References

- Hardt, D. (ed.), "The OAuth 2.0 Authorization Framework" RFC 6749 (2012). https://datatracker.ietf.org/doc/html/rfc6749
- Sakimura, N. et al., "Proof Key for Code Exchange by OAuth Public Clients" RFC 7636 (2015). https://datatracker.ietf.org/doc/html/rfc7636
- Sakimura, N. et al., "OpenID Connect Core 1.0 incorporating errata set 2" (2023). https://openid.net/specs/openid-connect-core-1_0.html
- Lodderstedt, T. et al., "Best Current Practice for OAuth 2.0 Security" RFC 9700 (2025). https://datatracker.ietf.org/doc/rfc9700/
- Parecki, A., "OAuth 2.0 Simplified" (2020). https://oauth2simplified.com/
- Jones, M. and Hardt, D., "The OAuth 2.0 Authorization Framework: Bearer Token Usage" RFC 6750 (2012). https://datatracker.ietf.org/doc/html/rfc6750
- OWASP, "OAuth 2.0 Cheat Sheet" (2024). https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html
