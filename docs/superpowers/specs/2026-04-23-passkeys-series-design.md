---
title: Passkeys / WebAuthn Series — Design
date: 2026-04-23
status: approved
---

# Passkeys / WebAuthn Series — Design

## Goal

Extend the `auth/` category with a five-article series covering WebAuthn and the passkey ecosystem. Mirrors the structure of the GraphQL HTTP-layer series (BEE-4007 through BEE-4010): identify a documented practitioner gap with strong canonical sources, write a coherent multi-article series anchored to those sources, ship bilingual EN + zh-TW in lockstep.

## Why this series, why now

- The `auth/` block currently has six articles covering classical auth concepts (AuthN vs AuthZ, tokens, OAuth/OIDC, sessions, RBAC/ABAC, API keys). It stops short of the modern passwordless story.
- W3C WebAuthn Level 3 reached Candidate Recommendation in 2024, and the major platforms (Apple, Google, Microsoft) are mid-migration to passkeys in 2025-2026. Practitioners hit the same questions repeatedly: how does the credential model differ from passwords, how do conditional UI and autofill work, what is hybrid transport, when do hardware security keys still apply, how to migrate.
- Strong canonical sources exist: W3C WebAuthn L3 spec, FIDO2 CTAP 2.1, FIDO Alliance server requirements, Apple Passkey developer docs, Google Identity passkey docs, Yubico developer docs.
- The series ends with a migration article so a reader can act, not just understand.

## Scope

**Five articles**, IDs **BEE-1007 through BEE-1011** (auth block currently fills 1001-1006).

| ID | Slug | Title |
|----|------|-------|
| 1007 | `webauthn-fundamentals` | WebAuthn Fundamentals |
| 1008 | `passkeys-discoverable-credentials` | Passkeys: Discoverable Credentials and UX Patterns |
| 1009 | `cross-device-authentication` | Cross-Device Authentication (Hybrid Transport) |
| 1010 | `fido2-hardware-security-keys` | FIDO2 Hardware Security Keys |
| 1011 | `migrating-from-passwords-to-passkeys` | Migrating from Passwords to Passkeys |

Bilingual lockstep: every EN article gets a parallel zh-TW counterpart at `docs/zh-tw/auth/<slug>.md` with identical frontmatter `id` and `slug`.

## Article scopes

### BEE-1007 WebAuthn Fundamentals

Anchors the rest of the series. Covers:

- The relying-party + client + authenticator three-party model.
- Public-key credential lifecycle: registration ceremony (`navigator.credentials.create`) and authentication ceremony (`navigator.credentials.get`).
- Attestation: what an attestation statement asserts, why most relying parties skip it, when to require it (enterprise, regulated industries).
- The challenge-response loop and why it stops phishing in a way passwords cannot.
- Glossary: relying party, authenticator (platform vs roaming), credential ID, user handle, AAGUID.

Sources: W3C WebAuthn Level 3 §1-§6, FIDO Alliance "WebAuthn for the curious".

### BEE-1008 Passkeys: Discoverable Credentials and UX Patterns

What distinguishes a "passkey" from a generic WebAuthn credential. Covers:

- Discoverable (resident) credentials: credential metadata stored on the authenticator, allowing username-less sign-in.
- Conditional UI / Conditional Mediation: how the browser's autofill picker surfaces passkeys without an explicit button click.
- Account selection UX: when the authenticator displays a chooser vs auto-selects.
- Sync vs device-bound passkeys: iCloud Keychain / Google Password Manager / 1Password syncing the private key across devices.
- Fallback flows when the user is on a device with no synced passkey.

Sources: W3C WebAuthn L3 §5.1.3 (discoverable credentials), §5.1.4 (mediation), Apple "Supporting passkeys" docs, Google Identity passkey UX guide.

### BEE-1009 Cross-Device Authentication (Hybrid Transport)

How a phone can authenticate a desktop login when the desktop has no passkey of its own. Covers:

- Hybrid transport (formerly "caBLE"): BLE proximity check + cloud-assisted handoff.
- The QR code dance: desktop displays QR, phone scans, ceremony runs over the cloud relay with BLE attesting proximity.
- Why hybrid transport is not pure cloud (the BLE step is the anti-phishing anchor).
- Limitations: requires Bluetooth on both devices, requires recent Android/iOS versions.
- Comparison with one-time codes / push approval (less secure, more compatible).

Sources: FIDO Alliance "Client to Authenticator Protocol (CTAP) 2.2 — Hybrid Transport", Chrome blog posts on caBLE.

### BEE-1010 FIDO2 Hardware Security Keys

Roaming authenticators (YubiKey, SoloKey, Feitian) and where they fit in the passkey-dominant world. Covers:

- CTAP2 protocol layer (USB, NFC, BLE).
- Discoverable vs non-discoverable credentials on hardware keys (limited storage, ~25-100 discoverable credentials per device).
- When to require a hardware key: regulated environments, high-value accounts, attestation enforcement.
- Enterprise-managed keys: AAGUID allowlists, attestation verification, key registration ceremonies for IT.
- The user-presence vs user-verification distinction (PIN, biometric).

Sources: FIDO CTAP 2.1, Yubico developer docs, NIST SP 800-63B (authenticator assurance levels).

### BEE-1011 Migrating from Passwords to Passkeys

How a relying party with millions of password users introduces passkeys without breaking the world. Covers:

- Coexistence: passkeys as an additive credential type, not a replacement.
- Enrollment flow design: prompt after successful password sign-in, opportunistic enrollment, dedicated security-settings flow.
- Account recovery: what changes when the credential is bound to a device or sync provider you do not control.
- Phishing-resistance threat model shifts: SMS recovery becomes the weakest link; rethink recovery flows.
- Telemetry: signals that tell you whether passkey adoption is healthy (sign-in success rate, conditional UI fill rate, recovery requests).
- Rollout sequencing: dogfood → opt-in beta → default for new users → opt-in for existing users → eventual password retirement.

Sources: Apple "Migrating from passwords to passkeys" WWDC sessions, Google Identity passkey adoption guides, real-world case studies (eBay, GitHub, Shopify passkey rollout writeups).

## Per-article structure (BEE template)

Each article follows the standard BEE template:

- Title `# [BEE-{id}] {Title}`
- `:::info` block with one-sentence summary
- **Context** — why this matters
- **Principle** — core guidance using RFC 2119 keywords (MUST, SHOULD, MAY)
- **Visual** — Mermaid diagram (sequence or state) where it aids understanding
- **Example** — concrete, vendor-neutral illustration
- **Common Mistakes** — anti-patterns
- **Related BEEs** — cross-references (each article links to BEE-1007 + adjacent series articles + relevant security-fundamentals/networking articles)
- **References** — verified URLs only (no AI invention)

## Source verification approach

Per `CLAUDE.md`: "Every article MUST be researched against authoritative sources. AI internal knowledge alone is insufficient. References must contain real, verified URLs."

For each article, before writing:

1. Pull the relevant W3C / FIDO spec section by URL and read it.
2. Cross-reference against the platform docs (Apple, Google, Microsoft, Yubico) for any UX claims or transport details.
3. Capture URLs at the time of writing, including spec section anchors where applicable.
4. Mark any claim that cannot be anchored to a source — either remove it or skip the article until a source surfaces (no fabrication).

## Bilingual handling

Each EN article ships with a parallel zh-TW counterpart at the same path under `docs/zh-tw/auth/`. Translation guidance:

- Technical identifiers stay in English: `WebAuthn`, `CTAP2`, `AAGUID`, `relying party`, `authenticator`. Some terms have established Chinese translations and use both: 中繼方 (relying party), 驗證器 (authenticator).
- The Mermaid diagram labels stay English (matches the rest of the project).
- Source URLs are identical (the W3C spec is English-only; this is by design — readers are expected to handle English specs).

## Polish and commit cadence

Per saved feedback memory: run `polish-documents` on every EN + zh-TW pair before the article's commit.

Five articles → five commits, each carrying both locales:

```
feat: add BEE-1007 WebAuthn Fundamentals (EN + zh-TW)
feat: add BEE-1008 Passkeys: Discoverable Credentials and UX Patterns (EN + zh-TW)
feat: add BEE-1009 Cross-Device Authentication (Hybrid Transport) (EN + zh-TW)
feat: add BEE-1010 FIDO2 Hardware Security Keys (EN + zh-TW)
feat: add BEE-1011 Migrating from Passwords to Passkeys (EN + zh-TW)
```

After all five land, an optional cross-reference pass updates `auth/authentication-vs-authorization.md` and `auth/token-based-authentication.md` to reference the new series in their Related BEEs section. That is a single combined commit.

## Build gates

Each commit gated by `pnpm docs:build` passing. The buildEnd hook will not generate redirect stubs for these new articles (only old IDs in the mapping JSON get stubs — new IDs do not need backward compat).

## Push gate

After all five article commits land + the optional cross-reference commit, summarise the commit list to the user and require explicit confirmation before `git push`. Standard precedent.

## Out of scope

- WebAuthn Level 1 / Level 2 historical retrospective. The series teaches L3 as the current baseline.
- Browser-extension based password managers as a substitute for passkeys (covered implicitly in BEE-1011's threat model section, not as its own article).
- Server SDK comparisons (SimpleWebAuthn vs platform-native libraries). Vendor-specific.
- The OAuth 2.0 + WebAuthn integration story (`prompt=passkey` patterns). Could be a follow-up article but is one layer up the stack and not part of the foundational series.
- Backwards compatibility with U2F (deprecated since 2019). Mention in BEE-1010 only as historical context.

## Verification checklist

- All five articles ship with EN + zh-TW counterparts at parallel paths.
- Each article's `id` matches its sequence in the auth block (1007 through 1011).
- Each article's `slug` is in the table above.
- `pnpm docs:build` passes after each commit.
- Sidebar shows the five new articles in numeric order under the `auth/` category.
- `polish-documents` reports no rule violations on either locale of any article.
- Every claim in every article has a corresponding source URL in References.
- No source URL invented (verify each via WebFetch before final commit).

## Risks

- **W3C spec churn.** WebAuthn L3 is at Candidate Recommendation; some details could change before Recommendation. Anchor articles to L2 (stable Recommendation) where possible and call out L3 additions explicitly.
- **Vendor doc decay.** Apple/Google docs reorganise URLs frequently. Capture publication dates alongside URLs so a reader landing on a 404 has search terms to recover with.
- **Translation precision.** Chinese passkey terminology is still settling. Where there is no settled term (e.g. "discoverable credentials"), keep the English term in parens after the Chinese rendering.

## Sequencing

1. Write BEE-1007 (Fundamentals) first — anchors all subsequent articles.
2. Write BEE-1008 (Passkeys / discoverable creds) — depends on the credential model from 1007.
3. Write BEE-1009 (Hybrid transport) — depends on 1007 + 1008 for the credential model and discoverability.
4. Write BEE-1010 (Hardware keys) — independent of 1008/1009 but later because hardware keys are an "advanced" topic in the passkey-default world.
5. Write BEE-1011 (Migration) — last because it references all four prior articles.
6. Optional cross-reference pass on existing auth articles.
7. Push gate.
