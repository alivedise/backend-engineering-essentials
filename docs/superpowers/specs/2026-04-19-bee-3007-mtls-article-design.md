# BEE-3007 — Mutual TLS (mTLS) Handshake and Server Configuration — Design

**Date:** 2026-04-19
**Status:** Draft (design complete, awaiting user review)
**Author brainstorm:** superpowers:brainstorming session

## Context

BEE-19048 (Service-to-Service Authentication) lists mTLS as one of three service-auth strategies and gives it comparison-depth treatment. The reader who wants to understand *how mTLS actually works at the protocol level* — what messages are added relative to one-way TLS, how the server proves client identity, how to set mTLS up on a real server — cannot get that from 19048 alone. Adjacent articles fill neighboring slots but none own the mechanics:

| Article | Role | mTLS depth today |
|---|---|---|
| BEE-3004 (TLS/SSL Handshake) | Base TLS handshake, 1.2 vs 1.3 | One-line mention ("client identity optionally verified") |
| BEE-2011 (TLS Certificate Lifecycle and PKI) | Public CA, ACME, cert rotation | Public-PKI focused; internal-PKI-for-mTLS not covered |
| BEE-5006 (Sidecar and Service Mesh Concepts) | Mesh architecture | mTLS listed as one of many mesh-managed concerns |
| BEE-19048 (Service-to-Service Authentication) | Strategy comparison | mTLS as one row in a strategy table |
| BEE-2007 (Zero-Trust Security Architecture) | Architectural direction | mTLS as the east-west primitive |

The gap: mTLS-specific protocol mechanics and a practical server setup recipe. BEE-3007 fills that gap.

## Goals

- Explain the mTLS handshake at the protocol level: which messages are added, what each proves, how server-side verification decides accept/reject
- Cover TLS 1.3 primary with a compact TLS 1.2 delta subsection
- Give the reader a concrete recipe to set mTLS up on a server in the two dominant real-world topologies (Nginx-terminated with cleartext upstream; Go application terminating mTLS itself)
- Provide debugging primitives (`openssl s_client`, `curl --cert`) and an alert-decoding table

## Non-Goals

- Deep PKI / CA hierarchy design — belongs in BEE-2011
- Service mesh internals — belongs in BEE-5006
- Comparison of mTLS vs JWT service tokens vs cloud-IAM workload identity — belongs in BEE-19048
- Zero-trust architectural discussion — belongs in BEE-2007
- Language coverage beyond Go + Nginx. Other stacks can be linked out as references if needed

## Identity & Placement

| Field | Value |
|---|---|
| **BEE id** | 3007 |
| **Title** | Mutual TLS (mTLS) Handshake and Server Configuration |
| **Slug** | `mutual-tls-handshake-and-server-configuration` |
| **Category** | `networking-fundamentals/` |
| **State** | `draft` |
| **EN file** | `docs/en/networking-fundamentals/mutual-tls-handshake-and-server-configuration.md` |
| **zh-TW file** | `docs/zh-tw/networking-fundamentals/mutual-tls-handshake-and-server-configuration.md` |

**Placement rationale:** the primary angle is protocol mechanics, which is the networking chapter's focus. Placing it next to BEE-3004 (TLS/SSL Handshake) keeps the TLS coverage coherent in one sidebar section rather than splitting TLS content across networking and security categories. The sidebar is auto-generated from frontmatter, so `id: 3007` slots in automatically — no manual sidebar edit required.

## Info-Callout Thesis

> Mutual TLS extends the base TLS handshake with a server-sent `CertificateRequest` and a client-sent `Certificate` + `CertificateVerify`, so both peers prove possession of a private key bound to a certificate their counterpart trusts — turning the connection itself into authenticated identity.

## Content Outline

### Context

Three paragraphs, scaling the reader in:

1. **What's insufficient about one-way TLS** — the server is authenticated, the client is not. At the TLS layer, every client is anonymous; identity comes from a later application-layer mechanism (cookies, OAuth bearer tokens). For internal service-to-service traffic where there is no human identity to authenticate, "the caller is anonymous at the transport layer" is a zero-trust violation.
2. **Where mTLS sits in the stack** — below application-layer auth, above TCP. The connection itself carries verified identity, which means the application can read the peer certificate out of the TLS session state instead of having a separate authentication exchange.
3. **Brief history** — TLS 1.2 defined optional client authentication (RFC 5246 §7.4.4) but the client `Certificate` message was sent in cleartext. TLS 1.3 (RFC 8446, published 2018) restructured the handshake so that from `EncryptedExtensions` onward all messages are encrypted under handshake keys, which includes the client's `Certificate`. TLS 1.3 also introduced `post_handshake_auth` for requesting client authentication after the initial handshake.

Explicit pointers out: "for the architectural motivation, see BEE-2007; for the strategy comparison against JWT and workload IAM, see BEE-19048."

### Principle

Short — the reader needs the structural picture before the details:

- The three extra handshake messages relative to one-way TLS: `CertificateRequest` (server), `Certificate` (client), `CertificateVerify` (client)
- Why `CertificateVerify` is structurally necessary: without it, a client could replay a certificate it captured somewhere else. The signed transcript hash proves possession of the matching private key.
- Identity binding stays at the SAN level — URI SANs for SPIFFE IDs, DNS SANs for hostnames, never CN (deprecated since RFC 2818, rejected by browsers since ~2017). Deep PKI treatment is deferred to BEE-2011.

### Visual

Mermaid `sequenceDiagram` of the TLS 1.3 mTLS handshake. Highlight the mTLS-specific messages (the three added by mutual auth) in a distinct color so the reader can see at a glance what changes relative to one-way TLS. Include both directions of `Certificate` + `CertificateVerify` + `Finished`.

### Protocol Walkthrough — TLS 1.3 Primary

The meat of the article. Subsections:

**`CertificateRequest` message (RFC 8446 §4.3.2)**
- Sent by the server inside the encrypted handshake, after `EncryptedExtensions`, before the server's own `Certificate`
- `certificate_authorities` extension: the DNs of CAs the server will accept. Clients use this to select which of potentially many available certs to present.
- `signature_algorithms` extension: constrains which signature algorithms the client's `CertificateVerify` may use.

**Client `Certificate` message (RFC 8446 §4.4.2)**
- In TLS 1.3 this message is sent under handshake encryption (the privacy property TLS 1.2 lacks)
- May be empty — client signaling "I have no certificate matching your CA list." Server then decides: fail the handshake (if client auth is mandatory) or continue (if optional)

**Client `CertificateVerify` message (RFC 8446 §4.4.3)**
- Signature over the transcript hash with the client's private key
- Without this message a client could present a captured certificate without holding its key. `CertificateVerify` is the proof-of-possession step.

**Server-side verification** — what the server actually checks:
1. Chain-to-trust-anchor (builds chain from presented cert to a CA in its trust store)
2. Validity window (`notBefore` / `notAfter`)
3. SAN match against authorization policy (URI/DNS)
4. Signature on `CertificateVerify` against the transcript hash
5. Optional revocation: CRL / OCSP / OCSP stapling

**Post-handshake client authentication (RFC 8446 §4.6.2)**
- TLS 1.3 `post_handshake_auth` extension
- Allows the server to request client auth later in a long-lived connection (e.g., when the client tries to access a more sensitive resource). Brief note — explain the mechanism, point readers to the RFC section.

### TLS 1.2 Delta

Compact subsection. Only the differences that matter:
- Client `Certificate` is sent in cleartext (privacy consideration — the client identity is visible to passive observers on the path; TLS 1.3 fixed this)
- `CertificateRequest` is sent with `ServerHelloDone` in the same flight, not inside encrypted extensions
- No post-handshake client auth
- TLS 1.2 uses a different set of signature algorithms; RFC 5246 §7.4.4 has the enumeration

Explicit pointer: "Most new internal environments should default to TLS 1.3. TLS 1.2 remains relevant for long-lived meshes and legacy constraints."

### In Practice — Setting up mTLS on a Server

Four subsections, each with runnable commands.

**1. Generate CA, server cert, client cert with `openssl`**
- Root CA (self-signed)
- Server cert (SAN: DNS name)
- Client cert (SAN: URI for SPIFFE-style identity, or DNS)
- ~10 lines of `openssl req` / `openssl x509` commands

**2. Topology A — mTLS at Nginx, cleartext upstream**

nginx.conf fragment:
```nginx
ssl_client_certificate /etc/nginx/ca.crt;
ssl_verify_client on;
ssl_verify_depth 2;

location / {
    proxy_pass http://backend;
    proxy_set_header X-SSL-Client-Verify $ssl_client_verify;
    proxy_set_header X-SSL-Client-S-DN   $ssl_client_s_dn;
    proxy_set_header X-SSL-Client-Cert   $ssl_client_escaped_cert;
}
```

**Critical call-out:** trusted identity headers are only safe if the upstream hop is on a private network the attacker cannot reach. Otherwise an attacker on that network can spoof the headers directly to the upstream, bypassing Nginx entirely. This is the single most common mTLS-at-proxy deployment mistake.

**3. Topology B — mTLS all the way to the Go app**

Server `tls.Config`:
```go
caPool := x509.NewCertPool()
caPool.AppendCertsFromPEM(caPEM)

tlsConfig := &tls.Config{
    ClientAuth: tls.RequireAndVerifyClientCert,
    ClientCAs:  caPool,
    MinVersion: tls.VersionTLS13,
}
```

Handler extracts and validates peer identity:
```go
if len(r.TLS.PeerCertificates) == 0 {
    http.Error(w, "client certificate required", http.StatusUnauthorized)
    return
}
peer := r.TLS.PeerCertificates[0]
// SPIFFE-style URI SAN validation
for _, uri := range peer.URIs {
    if strings.HasPrefix(uri.String(), "spiffe://internal.example.com/") {
        handle(w, r, uri.String())
        return
    }
}
http.Error(w, "untrusted peer identity", http.StatusForbidden)
```

Contrast `RequireAndVerifyClientCert` with `RequireAnyClientCert` — the latter accepts any syntactically valid cert without chaining it to `ClientCAs`. Using `RequireAnyClientCert` by mistake means any self-signed cert passes.

**4. Testing and debugging**

Commands readers copy:
```
openssl s_client -connect svc.example.com:443 \
  -cert client.crt -key client.key \
  -CAfile ca.crt -tls1_3 -showcerts

curl --cert client.crt --key client.key --cacert ca.crt \
  https://svc.example.com/
```

Alert-decoding table (TLS alert descriptions per RFC 8446 §6):

| Alert | Code | Typical cause |
|---|---|---|
| `bad_certificate` | 42 | Client cert malformed, or its signature doesn't verify |
| `unsupported_certificate` | 43 | Algorithm in cert not in server's `signature_algorithms` |
| `certificate_expired` | 45 | Cert outside validity window |
| `unknown_ca` | 48 | Server can't chain client cert to a known CA |
| `certificate_required` | 116 | TLS 1.3: server required a client cert, client sent none |

### Common Mistakes

Each item gets one to two sentences of explanation:

- **Forwarding trusted identity headers over an untrusted network hop** — the Nginx-terminated topology only works if the upstream network is actually private
- **Using `RequireAnyClientCert` instead of `RequireAndVerifyClientCert`** — accepts any syntactically valid cert, including self-signed, as long as it parses
- **Matching identity on CN instead of SAN** — CN-based matching is deprecated (RFC 2818) and will reject you in strict implementations
- **No revocation strategy for long-lived client certs** — if mTLS certs are long-lived (which itself is a smell), you need CRL/OCSP; short-lived SVIDs sidestep this problem entirely
- **Trusting the OS default CA bundle for internal workloads** — use a dedicated `ClientCAs` pool containing only the internal CA, never the public root store

### Related BEEs

Ordered by id:

- **BEE-2007** (Zero-Trust Security Architecture) — the "why": mTLS is the east-west authentication primitive in a zero-trust network
- **BEE-2011** (TLS Certificate Lifecycle and PKI) — supplies the certs this article assumes you have; deeper PKI lives there
- **BEE-3004** (TLS/SSL Handshake) — prerequisite; base handshake mechanics this article extends
- **BEE-5006** (Sidecar and Service Mesh Concepts) — how meshes automate the in-practice patterns from this article
- **BEE-19048** (Service-to-Service Authentication) — mTLS as one of three strategies, comparison context

### References

- RFC 8446 — The Transport Layer Security (TLS) Protocol Version 1.3 — specifically §4.3.2 (CertificateRequest), §4.4.2 (Certificate), §4.4.3 (CertificateVerify), §4.6.2 (Post-Handshake Authentication)
- RFC 5246 — The Transport Layer Security (TLS) Protocol Version 1.2 — §7.4.4 (Certificate Request)
- RFC 8705 — OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens
- RFC 5280 — X.509 PKI Certificate and CRL Profile
- Nginx Documentation — `ngx_http_ssl_module` (`ssl_verify_client`, `ssl_client_certificate`, `ssl_verify_depth`)
- Go Documentation — `crypto/tls` package, `ClientAuthType` constants

## Cross-References — Reverse Links Into Existing Articles

Ten one-line additions total (5 files × 2 languages). Each goes into the target article's `Related BEEs` section in BEE-id order.

| Target article | EN file | zh-TW file | Reason for reverse link |
|---|---|---|---|
| BEE-2007 (Zero-Trust) | `docs/en/security-fundamentals/zero-trust-security-architecture.md` | `docs/zh-tw/security-fundamentals/zero-trust-security-architecture.md` | Currently links 19048 for the strategy angle; should also link 3007 for the mechanics |
| BEE-2011 (TLS Cert Lifecycle) | `docs/en/security-fundamentals/tls-certificate-lifecycle-and-pki.md` | `docs/zh-tw/security-fundamentals/tls-certificate-lifecycle-and-pki.md` | Internal-PKI-for-mTLS is a primary consumer |
| BEE-3004 (TLS/SSL Handshake) | `docs/en/networking-fundamentals/tls-ssl-handshake.md` | `docs/zh-tw/networking-fundamentals/tls-ssl-handshake.md` | Currently touches mTLS in a single line; the deep mechanics now live in 3007 |
| BEE-5006 (Sidecar & Service Mesh) | `docs/en/architecture-patterns/sidecar-and-service-mesh-concepts.md` | `docs/zh-tw/architecture-patterns/sidecar-and-service-mesh-concepts.md` | "mutual TLS" is listed as a mesh-managed concern; should link the mechanics |
| BEE-19048 (Service-to-Service Auth) | `docs/en/distributed-systems/service-to-service-authentication.md` | `docs/zh-tw/distributed-systems/service-to-service-authentication.md` | mTLS strategy row in the comparison table has no deep reference today |

Relative paths for the links will be computed from each target article's directory at write time.

## Open Questions

None. All scoping decisions confirmed during brainstorming:
- Angle: protocol mechanics (A)
- Version coverage: TLS 1.3 primary with compact 1.2 delta (A)
- In-practice scope: Nginx proxy-terminated + Go app-terminated, both with `openssl s_client` + `curl` debugging (B)
- Category: `networking-fundamentals/`
- BEE id: 3007
- Reverse links: all five adjacent articles get one-line additions in both languages

## Next Steps

1. User reviews this spec
2. On approval, invoke `superpowers:writing-plans` to produce the implementation plan (step-by-step: author EN draft → author zh-TW translation → polish both → add five reverse-link pairs → commit)
3. Implementation plan executes against the approved design
