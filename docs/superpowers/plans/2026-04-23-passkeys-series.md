# Passkeys / WebAuthn Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five articles (BEE-1007 through BEE-1011) extending the auth block with the WebAuthn / passkey story — bilingual EN + zh-TW, anchored to verified canonical sources, polish-documents on every file before commit.

**Architecture:** Five sequential commits, one per article-pair. Each article is researched against W3C / FIDO / vendor docs via WebFetch, drafted in EN against the BEE template, translated to zh-TW, polished in both locales, and committed only after `pnpm docs:build` passes. Optional sixth commit cross-references the new series from older auth articles. User-gated push at the end.

**Tech Stack:** VitePress 1.3.x, Markdown with YAML frontmatter, Mermaid diagrams, gray-matter, polish-documents skill, WebFetch for source verification.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `docs/en/auth/webauthn-fundamentals.md` | BEE-1007 EN article: anchor for the series |
| `docs/zh-tw/auth/webauthn-fundamentals.md` | BEE-1007 zh-TW counterpart |
| `docs/en/auth/passkeys-discoverable-credentials.md` | BEE-1008 EN |
| `docs/zh-tw/auth/passkeys-discoverable-credentials.md` | BEE-1008 zh-TW |
| `docs/en/auth/cross-device-authentication.md` | BEE-1009 EN |
| `docs/zh-tw/auth/cross-device-authentication.md` | BEE-1009 zh-TW |
| `docs/en/auth/fido2-hardware-security-keys.md` | BEE-1010 EN |
| `docs/zh-tw/auth/fido2-hardware-security-keys.md` | BEE-1010 zh-TW |
| `docs/en/auth/migrating-from-passwords-to-passkeys.md` | BEE-1011 EN |
| `docs/zh-tw/auth/migrating-from-passwords-to-passkeys.md` | BEE-1011 zh-TW |
| `docs/en/auth/{older articles}.md` | Optional Related-BEEs cross-reference updates |
| `docs/zh-tw/auth/{older articles}.md` | Optional Related-BEEs cross-reference updates (mirror) |

---

## BEE article template (reference for every article task)

Frontmatter:

```yaml
---
id: <numeric id>
title: <Title>
state: draft
slug: <slug>
---
```

Body skeleton:

```markdown
# [BEE-<id>] <Title>

:::info
<One-sentence summary, 25-40 words.>
:::

## Context

<Why this matters. Multi-paragraph. Reference what the reader already knows from prior auth articles or the foundational specs.>

## Principle

<RFC 2119 keywords (MUST, SHOULD, MAY) in bold. Two to four sentences.>

## <Topic-specific sections>

<Several H2 sections covering the article's substance. Use code blocks for examples, mermaid blocks for sequence diagrams, tables for comparisons.>

## Common Mistakes

<Bullet list of specific anti-patterns with one-sentence rationale each.>

## Related BEEs

- [BEE-<id>](slug.md) <Title> -- <one-line "why related">
<for each cross-reference>

## References

- <Author/Org>. <Year>. "<Title>". <Source>. <verified URL>
<one entry per source URL used, in the order they appear in the body>
```

Each article body should be 600-1500 words. Tables and Mermaid blocks count toward the upper end.

---

## Task 1: Pre-flight

**Files:** none (verification only)

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: `working tree clean`, branch is `main`. If the tree has unexpected changes, stop and resolve before continuing — concurrent-session edits can conflict with the bilingual lockstep.

- [ ] **Step 2: Confirm baseline build passes**

Run: `pnpm docs:build`
Expected: `build complete in ~75s` with no errors.

- [ ] **Step 3: Confirm auth block IDs are intact**

Run: `grep -h '^id:' docs/en/auth/*.md | sort -t: -k2 -n`
Expected: `id: 1001` through `id: 1006`. The new articles will be 1007-1011.

---

## Task 2: BEE-1007 WebAuthn Fundamentals

**Files:**
- Create: `docs/en/auth/webauthn-fundamentals.md`
- Create: `docs/zh-tw/auth/webauthn-fundamentals.md`

### Step 1: Research canonical sources

WebFetch each URL, capture title + 2-3 key claims that anchor the article's main statements.

- [ ] WebFetch `https://www.w3.org/TR/webauthn-3/` — focus on §1 Introduction, §3 Dependencies, §4 Terminology, §5 Web Authentication API (high-level)
- [ ] WebFetch `https://www.w3.org/TR/webauthn-3/#sctn-rp-operations` — registration and authentication ceremonies
- [ ] WebFetch `https://www.w3.org/TR/webauthn-3/#sctn-attestation` — attestation conveyance preference, attestation statement formats
- [ ] WebFetch `https://fidoalliance.org/how-fido-works/` — FIDO Alliance high-level overview (relying party, authenticator, client triangle)

### Step 2: Draft EN article

Create `docs/en/auth/webauthn-fundamentals.md` with frontmatter:

```yaml
---
id: 1007
title: WebAuthn Fundamentals
state: draft
slug: webauthn-fundamentals
---
```

Required body sections (in order):

1. `# [BEE-1007] WebAuthn Fundamentals`
2. `:::info` — one-sentence summary describing WebAuthn as the W3C public-key authentication API and what makes it phishing-resistant.
3. `## Context` — why password-based auth keeps failing (phishing, credential stuffing, breach reuse) and what WebAuthn changes (challenge-response with origin-bound public keys). Reference the existing auth block: cite `[BEE-1002](token-based-authentication.md)` for tokens and `[BEE-1003](oauth-openid-connect.md)` for OAuth as the prior baseline.
4. `## Principle` — MUST/SHOULD statements: RP MUST verify the challenge it issued, MUST verify the origin matches its expected RP ID, SHOULD use user-verifying authenticators when stepping up, MAY require attestation for regulated use cases.
5. `## The Three-Party Model` — relying party, client (browser/platform), authenticator. Glossary entries for credential ID, user handle, AAGUID. One Mermaid sequence diagram showing the registration ceremony.
6. `## Registration Ceremony` — `navigator.credentials.create({publicKey: {...}})` flow: RP generates challenge, sends `PublicKeyCredentialCreationOptions`, authenticator generates keypair, returns `AuthenticatorAttestationResponse`, RP verifies and stores public key. Code block with the JSON-shape of the options object.
7. `## Authentication Ceremony` — `navigator.credentials.get({publicKey: {...}})` flow: RP generates challenge, authenticator signs over `clientDataJSON || authenticatorData`, RP verifies signature against stored public key. Code block.
8. `## Why Phishing-Resistance Comes for Free` — origin binding: the client includes `origin` in `clientDataJSON`, so a credential issued for `example.com` cannot be exercised against `example-attacker.com`. Contrast with TOTP/SMS where the user can be tricked into entering the code on a phishing site.
9. `## Attestation` — what an attestation statement asserts (the authenticator's identity / model), why most consumer-facing RPs skip attestation (`attestation: "none"`), when to require it (enterprise key allowlists, regulated industries with FIPS requirements).
10. `## Common Mistakes` — bullet list:
    - Storing the credential ID hashed (must be stored verbatim — it is opaque, not a secret).
    - Not enforcing user verification (UV) for high-value operations.
    - Reusing challenges (defeats anti-replay).
    - Treating attestation as authentication (attestation says what the authenticator is, not who the user is).
11. `## Related BEEs` —
    - `[BEE-1001](authentication-vs-authorization.md) Authentication vs Authorization` — WebAuthn is authentication; authorization happens after.
    - `[BEE-1002](token-based-authentication.md) Token-Based Authentication` — sessions and tokens are typically issued after a successful WebAuthn ceremony.
    - `[BEE-1008](passkeys-discoverable-credentials.md) Passkeys: Discoverable Credentials and UX Patterns` — passkeys are a specific deployment of WebAuthn discoverable credentials.
    - `[BEE-2005](../security-fundamentals/cryptographic-basics-for-engineers.md) Cryptographic Basics for Engineers` — public-key crypto background.
12. `## References` — verified URLs from Step 1, in order of first citation in the body. Include W3C WebAuthn L3 with the exact section anchor where each cited claim came from.

### Step 3: Verify no fabrication

Re-read the draft. For every concrete claim (a number, a protocol detail, a named field), check that a source URL in References supports it. If a claim cannot be anchored, either remove it or skip the article and add a note for the user. **Do not invent sources.**

### Step 4: Draft zh-TW counterpart

Create `docs/zh-tw/auth/webauthn-fundamentals.md` with identical frontmatter (`id: 1007`, `slug: webauthn-fundamentals`).

Translation guidance:

- Title becomes `# [BEE-1007] WebAuthn 基礎` (keep "WebAuthn" in English).
- Section headings translate per the existing zh-TW articles' conventions (see `docs/zh-tw/auth/oauth-openid-connect.md` for examples).
- Technical identifiers stay English: `WebAuthn`, `AAGUID`, `clientDataJSON`, `authenticatorData`, `navigator.credentials.create`, `attestation`.
- Use both forms for newly-introduced terms: `中繼方 (relying party)`, `驗證器 (authenticator)`, `公開金鑰憑證 (public-key credential)`.
- Mermaid diagram labels stay English (matches existing zh-TW articles).
- Source URLs are identical (W3C/FIDO docs are English-only).

### Step 5: Polish EN file

Invoke the `polish-documents` skill on `docs/en/auth/webauthn-fundamentals.md` at default surface depth. Apply non-fabricating suggestions only.

### Step 6: Polish zh-TW file

Invoke `polish-documents` on `docs/zh-tw/auth/webauthn-fundamentals.md`. Apply non-fabricating suggestions only.

### Step 7: Build

Run: `pnpm docs:build`
Expected: build succeeds. New article appears in sidebar under auth.

### Step 8: Commit

```bash
git add docs/en/auth/webauthn-fundamentals.md docs/zh-tw/auth/webauthn-fundamentals.md docs/en/list.md docs/zh-tw/list.md
git commit -m "$(cat <<'EOF'
feat: add BEE-1007 WebAuthn Fundamentals (EN + zh-TW)

Anchors the passkeys series. Covers the relying-party / client /
authenticator three-party model, registration and authentication
ceremonies via navigator.credentials.create / .get, attestation
conveyance preference, and origin-binding as the source of
phishing-resistance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(`docs/en/list.md` and `docs/zh-tw/list.md` regenerate during the build; they ride along with the article commit per the BEE convention.)

---

## Task 3: BEE-1008 Passkeys: Discoverable Credentials and UX Patterns

**Files:**
- Create: `docs/en/auth/passkeys-discoverable-credentials.md`
- Create: `docs/zh-tw/auth/passkeys-discoverable-credentials.md`

### Step 1: Research canonical sources

- [ ] WebFetch `https://www.w3.org/TR/webauthn-3/#client-side-discoverable-credential` — discoverable credentials definition
- [ ] WebFetch `https://www.w3.org/TR/webauthn-3/#enum-mediation-requirement` — `CredentialMediationRequirement` enum (`silent`, `optional`, `conditional`, `required`)
- [ ] WebFetch `https://developer.apple.com/passkeys/` — Apple Passkey developer landing page
- [ ] WebFetch `https://developers.google.com/identity/passkeys` — Google Identity passkey overview
- [ ] WebFetch `https://passkeys.dev/docs/intro/what-are-passkeys/` — FIDO Alliance practitioner guide

### Step 2: Draft EN article

Create `docs/en/auth/passkeys-discoverable-credentials.md` with frontmatter:

```yaml
---
id: 1008
title: "Passkeys: Discoverable Credentials and UX Patterns"
state: draft
slug: passkeys-discoverable-credentials
---
```

Required body sections:

1. `# [BEE-1008] Passkeys: Discoverable Credentials and UX Patterns`
2. `:::info` — one-sentence summary distinguishing a passkey from a generic WebAuthn credential.
3. `## Context` — recap from BEE-1007: WebAuthn credentials can be either server-side (RP supplies `allowCredentials` list) or discoverable (authenticator stores enough metadata to surface credentials without an RP-provided list). The "passkey" brand is industry shorthand for the second category, usually with sync.
4. `## Principle` — RP MUST set `residentKey: "required"` and `userVerification: "required"` to register a passkey-grade credential. Conditional UI SHOULD be offered on the username field. RP MUST NOT assume the user knows the difference between a passkey and a password.
5. `## Discoverable vs Non-Discoverable Credentials` — what changes in the registration ceremony (`authenticatorSelection.residentKey: "required"`), what changes in the authentication ceremony (RP can omit `allowCredentials`), table comparing the two modes' storage and UX implications.
6. `## Conditional UI / Conditional Mediation` — `mediation: "conditional"` on `navigator.credentials.get()`. The browser surfaces passkeys in the autofill dropdown alongside saved passwords. Code block showing the call. Note Safari, Chrome, Edge support timeline.
7. `## Sync vs Device-Bound` — iCloud Keychain syncs across the user's Apple devices, Google Password Manager syncs across Android + Chrome, third-party password managers (1Password, Bitwarden, Dashlane) provide cross-platform sync. Device-bound credentials (hardware keys) do not sync. The RP cannot detect sync state from the protocol — assume sync.
8. `## Account Selection UX` — when the authenticator displays a chooser (multiple credentials match `rpId`) vs auto-selects (single match). UX implications for users with multiple accounts.
9. `## Fallback Flows` — what happens when a user is on a device with no synced passkey: cross-device authentication (handoff to BEE-1009), email-magic-link, password fallback.
10. `## Common Mistakes` —
    - Treating passkeys as a username replacement instead of a credential type (still need an account model).
    - Not offering Conditional UI (kills discoverability — user has to click "Sign in with passkey" explicitly).
    - Hard-deleting credential records when a user removes a device (the credential may exist on synced devices the RP cannot see).
    - Treating UV signal as user identity proof (UV proves the human did something local, not which human).
11. `## Related BEEs` —
    - `[BEE-1007](webauthn-fundamentals.md) WebAuthn Fundamentals` — credential model background.
    - `[BEE-1009](cross-device-authentication.md) Cross-Device Authentication` — fallback when no local passkey.
    - `[BEE-1011](migrating-from-passwords-to-passkeys.md) Migrating from Passwords to Passkeys` — enrollment flow design uses passkey concepts.
12. `## References` — verified URLs.

### Step 3: Verify no fabrication, Step 4: zh-TW translation, Step 5: polish EN, Step 6: polish zh-TW, Step 7: build

Same shape as Task 2 Steps 3-7. Translation: title becomes `# [BEE-1008] Passkey：可發現憑證與 UX 模式`. Use `可發現憑證 (discoverable credentials)`, `條件式 UI (conditional UI)`.

### Step 8: Commit

```bash
git add docs/en/auth/passkeys-discoverable-credentials.md docs/zh-tw/auth/passkeys-discoverable-credentials.md docs/en/list.md docs/zh-tw/list.md
git commit -m "$(cat <<'EOF'
feat: add BEE-1008 Passkeys: Discoverable Credentials and UX Patterns (EN + zh-TW)

Distinguishes passkeys from generic WebAuthn credentials. Covers
discoverable vs non-discoverable credentials, Conditional UI for
autofill-style sign-in, sync vs device-bound passkeys, account
selection UX, and fallback flows when no local passkey exists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: BEE-1009 Cross-Device Authentication (Hybrid Transport)

**Files:**
- Create: `docs/en/auth/cross-device-authentication.md`
- Create: `docs/zh-tw/auth/cross-device-authentication.md`

### Step 1: Research canonical sources

- [ ] WebFetch `https://fidoalliance.org/specs/fido-v2.2-rd-20230321/fido-client-to-authenticator-protocol-v2.2-rd-20230321.html#sctn-hybrid` — CTAP 2.2 Hybrid Transport section (formerly caBLE)
- [ ] WebFetch `https://developers.google.com/identity/passkeys/supported-environments` — Google environment support including hybrid
- [ ] WebFetch `https://passkeys.dev/docs/reference/terms/#cross-device-authentication-cda` — cross-device authentication terminology

### Step 2: Draft EN article

Create `docs/en/auth/cross-device-authentication.md` with frontmatter:

```yaml
---
id: 1009
title: Cross-Device Authentication (Hybrid Transport)
state: draft
slug: cross-device-authentication
---
```

Required body sections:

1. `# [BEE-1009] Cross-Device Authentication (Hybrid Transport)`
2. `:::info` — one-sentence summary describing hybrid transport as the BLE + cloud handoff that lets a phone authenticate a desktop login.
3. `## Context` — the problem: a user wants to sign into a relying party from a desktop they've never used before. They have a passkey on their phone but no passkey on this desktop. Older flows (TOTP, SMS, push notifications) are phishable. Hybrid transport is the FIDO Alliance answer.
4. `## Principle` — Hybrid transport MUST use BLE for proximity verification, not pure cloud relay. The desktop MUST display a QR code that encodes the relay endpoint; the phone MUST validate proximity over BLE before authorising the ceremony. Relying parties MUST NOT need to know hybrid is in use — the protocol is transparent at the WebAuthn API layer.
5. `## The QR Dance` — Mermaid sequence diagram: desktop (client) requests authentication → desktop displays QR → user scans with phone → phone establishes BLE-attested tunnel via cloud relay → phone runs the WebAuthn ceremony → result returned to desktop.
6. `## Why BLE, Why Not Pure Cloud` — BLE proximity is the anti-phishing anchor. Without BLE, an attacker on a different network could intercept the QR and trigger a remote ceremony. BLE forces the phone to be physically near the desktop, which prevents remote-attacker scenarios.
7. `## Limitations` — requires Bluetooth on both devices, requires recent Android 9+/iOS 16+, can fail in environments where BLE is jammed or disabled. The ceremony takes 5-15 seconds end-to-end.
8. `## Comparison with Older Cross-Device Patterns` — table comparing hybrid transport, TOTP, SMS OTP, push approval. Columns: phishing-resistant, requires app install, requires network, requires proximity.
9. `## When to Offer Hybrid` — RPs SHOULD enable hybrid by default for their authentication flow (zero RP-side configuration required — the client surfaces it). RPs SHOULD provide a fallback (email magic link, password) for users without phones.
10. `## Common Mistakes` —
    - Building a custom QR-based "scan to login" instead of using hybrid transport (loses the BLE proximity check).
    - Assuming hybrid replaces the need for passkey enrollment on the desktop (it does not — first-time users still need a passkey path).
    - Treating hybrid as "phone-as-authenticator forever" (the user should be prompted to register a passkey on the desktop after one successful hybrid sign-in).
11. `## Related BEEs` —
    - `[BEE-1007](webauthn-fundamentals.md) WebAuthn Fundamentals`
    - `[BEE-1008](passkeys-discoverable-credentials.md) Passkeys: Discoverable Credentials and UX Patterns` — hybrid is one of the fallback flows referenced there.
12. `## References`

### Step 3-7: same shape as Task 2

Translation: title becomes `# [BEE-1009] 跨裝置認證（Hybrid Transport）`. Use `混合傳輸 (hybrid transport)`, `近距離驗證 (proximity verification)`.

### Step 8: Commit

```bash
git add docs/en/auth/cross-device-authentication.md docs/zh-tw/auth/cross-device-authentication.md docs/en/list.md docs/zh-tw/list.md
git commit -m "$(cat <<'EOF'
feat: add BEE-1009 Cross-Device Authentication (Hybrid Transport) (EN + zh-TW)

Covers FIDO hybrid transport (formerly caBLE): the QR + BLE
proximity dance that lets a phone authenticate a desktop login
without a passkey on the desktop. Why BLE proximity is the
anti-phishing anchor, what the limitations are, and how hybrid
compares to older cross-device patterns (TOTP, SMS OTP, push).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: BEE-1010 FIDO2 Hardware Security Keys

**Files:**
- Create: `docs/en/auth/fido2-hardware-security-keys.md`
- Create: `docs/zh-tw/auth/fido2-hardware-security-keys.md`

### Step 1: Research canonical sources

- [ ] WebFetch `https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-20210615.html` — CTAP 2.1 spec, focus on §1, §2 Conformance, §6 Message Encoding
- [ ] WebFetch `https://developers.yubico.com/WebAuthn/` — Yubico WebAuthn developer guide
- [ ] WebFetch `https://pages.nist.gov/800-63-3/sp800-63b.html` — NIST SP 800-63B authenticator assurance levels (focus on AAL2/AAL3)

### Step 2: Draft EN article

Create `docs/en/auth/fido2-hardware-security-keys.md` with frontmatter:

```yaml
---
id: 1010
title: FIDO2 Hardware Security Keys
state: draft
slug: fido2-hardware-security-keys
---
```

Required body sections:

1. `# [BEE-1010] FIDO2 Hardware Security Keys`
2. `:::info` — one-sentence summary describing roaming authenticators (USB/NFC/BLE) and where they fit in a passkey-dominant world.
3. `## Context` — passkeys handle the consumer case; hardware security keys handle the cases passkeys cannot reach: regulated environments (FedRAMP, FIPS), high-value privileged accounts, environments where sync providers are not trusted, attestation enforcement.
4. `## Principle` — RP MAY require a hardware authenticator via `attestation: "direct"` plus AAGUID allowlist. Enterprises SHOULD enforce attestation for privileged accounts. Hardware keys MUST be issued via a managed enrollment process, not user-initiated, when used for compliance.
5. `## The CTAP2 Protocol Layer` — WebAuthn is the JS API; CTAP2 is the wire protocol between the client and the authenticator. Three transports: USB-HID, NFC, BLE. Mermaid diagram showing the layered model: RP ↔ WebAuthn ↔ Client ↔ CTAP2 ↔ Authenticator.
6. `## Discoverable vs Non-Discoverable on Hardware Keys` — hardware keys have limited storage (typical 25-100 discoverable credentials per device for current YubiKey 5 series, more for YubiKey Bio and newer Yubico keys per Yubico docs). Non-discoverable credentials are unlimited because the credential ID itself encrypts the private key.
7. `## When to Require a Hardware Key` — table: scenario | requires hardware? | rationale.
   - Consumer auth: no
   - Privileged admin accounts: yes (attestation enforcement)
   - Code signing keys: yes (key never extractable)
   - Compliance-mandated environments (FIPS-validated): yes
8. `## Enterprise-Managed Keys` — AAGUID allowlists (only Yubico models X, Y, Z), attestation verification at registration, IT-driven enrollment ceremonies (the user does not pick the key model). Reference NIST SP 800-63B AAL3.
9. `## User Presence vs User Verification` — UP (touch the key) proves a human is there. UV (PIN or biometric on the key) proves which human. RPs MUST NOT conflate them; both are independently signalled in the authenticator data flags.
10. `## Common Mistakes` —
    - Requiring attestation on consumer flows (defeats passkeys; consumer authenticators usually return `attestation: "none"`).
    - Allowing user-self-enrolled hardware keys for compliance flows (defeats attestation guarantees).
    - Treating UP as UV (UP just means "someone touched it").
    - Not handling the credential-storage limit (registering more than the key can hold silently overwrites the oldest credential).
11. `## Related BEEs` —
    - `[BEE-1007](webauthn-fundamentals.md) WebAuthn Fundamentals` — attestation background.
    - `[BEE-1008](passkeys-discoverable-credentials.md) Passkeys: Discoverable Credentials and UX Patterns` — contrast with sync passkeys.
    - `[BEE-2003](../security-fundamentals/secrets-management.md) Secrets Management` — hardware keys are an enterprise secrets-management primitive.
12. `## References`

### Step 3-7: same shape as Task 2

Translation: title becomes `# [BEE-1010] FIDO2 硬體安全金鑰`. Use `硬體安全金鑰 (hardware security key)`, `證明 (attestation)`.

### Step 8: Commit

```bash
git add docs/en/auth/fido2-hardware-security-keys.md docs/zh-tw/auth/fido2-hardware-security-keys.md docs/en/list.md docs/zh-tw/list.md
git commit -m "$(cat <<'EOF'
feat: add BEE-1010 FIDO2 Hardware Security Keys (EN + zh-TW)

Covers roaming authenticators in a passkey-dominant world: CTAP2
protocol layer (USB / NFC / BLE), discoverable-credential storage
limits, when to require hardware (regulated environments, privileged
accounts, attestation enforcement), enterprise enrollment with AAGUID
allowlists, and the user-presence vs user-verification distinction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: BEE-1011 Migrating from Passwords to Passkeys

**Files:**
- Create: `docs/en/auth/migrating-from-passwords-to-passkeys.md`
- Create: `docs/zh-tw/auth/migrating-from-passwords-to-passkeys.md`

### Step 1: Research canonical sources

- [ ] WebFetch `https://developer.apple.com/videos/play/wwdc2022/10092/` — Apple WWDC22 "Meet passkeys" (transcript / overview)
- [ ] WebFetch `https://developers.google.com/identity/passkeys/developer-guides` — Google passkey developer guide (adoption section)
- [ ] WebFetch `https://passkeys.dev/docs/use-cases/passwordless/` — FIDO Alliance passwordless use case guide
- [ ] WebFetch `https://github.blog/2023-07-12-introducing-passwordless-authentication-on-github-com/` — GitHub passkey rollout case study
- [ ] WebFetch `https://developer.apple.com/news/?id=upqglm5x` — Apple "Get started with passkeys" practitioner notes

### Step 2: Draft EN article

Create `docs/en/auth/migrating-from-passwords-to-passkeys.md` with frontmatter:

```yaml
---
id: 1011
title: Migrating from Passwords to Passkeys
state: draft
slug: migrating-from-passwords-to-passkeys
---
```

Required body sections:

1. `# [BEE-1011] Migrating from Passwords to Passkeys`
2. `:::info` — one-sentence summary on how a relying party with millions of password users adds passkeys without breaking the world.
3. `## Context` — passkeys are not a drop-in password replacement at scale. Existing users need an enrollment path; account recovery flows need rethinking; the threat model shifts. This article walks the rollout playbook.
4. `## Principle` — RPs MUST treat passkeys as additive credentials, not replacements, for at least the first phase of rollout. RPs SHOULD prompt enrollment after a successful password sign-in. RPs MUST audit every recovery channel against the new threat model — SMS recovery becomes the weakest link the moment passwords are not the weakest link.
5. `## Coexistence: Additive Credentials` — the user has a password; we add a passkey; both work. Database model: a `credentials` table with rows of type `password | webauthn`. The sign-in form's username field gets Conditional UI. The password form remains for users without passkeys.
6. `## Enrollment Flow Design` — three patterns: (a) post-signin nudge ("Set up a passkey for faster sign-in next time" after successful password login), (b) opportunistic enrollment (offer passkey during a critical-flow step like changing email), (c) dedicated security-settings flow (user navigates to it). Trade-offs in conversion rate vs intrusiveness. Mermaid diagram for pattern (a).
7. `## Account Recovery` — passkeys live on devices the RP does not control. A user who loses their phone may lose their passkey. Recovery channels need rethinking:
   - Email magic-link recovery: still phishable (user clicks link in email on a phishing page).
   - SMS recovery: weakest link; SIM-swap attacks bypass everything.
   - Backup codes printed at enrollment: user must store somewhere safe; defeats convenience.
   - Trusted contact / social recovery: complex; rarely deployed.
   - Re-enrollment via a second passkey on a different device: best, requires user has registered ≥2 devices.
8. `## Threat Model Shifts` — pre-passkey, the password is the weakest link. Post-passkey, attackers pivot to recovery flows. Audit your recovery channels: every channel that bypasses the passkey is your new attack surface. Specifically: SMS reset, support-driven manual reset, email magic-link.
9. `## Telemetry: Knowing It's Working` — signals to track:
   - Passkey enrollment rate (per signin, per active user, per cohort)
   - Conditional UI fill rate (autofill clicks vs explicit "Sign in with passkey" clicks)
   - Sign-in success rate by credential type (passkey vs password)
   - Recovery channel usage (rising SMS reset = warning sign)
   - Time-to-sign-in by credential type
10. `## Rollout Sequencing` — staged rollout list:
    1. Internal dogfood: employees only, Conditional UI on, full instrumentation.
    2. Opt-in beta: feature flag, public users who toggle the setting.
    3. Default for new users: all newly-registered accounts get a passkey enrollment prompt.
    4. Opt-in for existing users: post-signin nudge for everyone.
    5. Gradual password-form deprecation: hide the password field for accounts with a registered passkey; eventually offer "delete password" in security settings.
    6. (Long-term, optional) Password retirement: delete password credentials for accounts with a verified passkey for ≥N months. Most consumer RPs never reach this stage.
11. `## Common Mistakes` —
    - Replacing passwords with passkeys overnight (breaks users mid-flow with no warning).
    - Not auditing recovery flows (the threat model shifted; SMS reset is now the front door).
    - Treating passkey enrollment rate alone as the success metric (a high enrollment rate with low actual passkey sign-in rate means users do not understand the flow).
    - Forgetting account export (some users will want to switch sync providers; have a credential-rotation flow ready).
12. `## Related BEEs` —
    - `[BEE-1007](webauthn-fundamentals.md) WebAuthn Fundamentals`
    - `[BEE-1008](passkeys-discoverable-credentials.md) Passkeys: Discoverable Credentials and UX Patterns`
    - `[BEE-1009](cross-device-authentication.md) Cross-Device Authentication (Hybrid Transport)` — recovery via cross-device.
    - `[BEE-1010](fido2-hardware-security-keys.md) FIDO2 Hardware Security Keys` — option for the "second device" recovery story.
    - `[BEE-1004](session-management.md) Session Management` — sessions issued after passkey sign-in still apply.
13. `## References`

### Step 3-7: same shape as Task 2

Translation: title becomes `# [BEE-1011] 從密碼遷移到 Passkey`. Use `共存 (coexistence)`, `帳號復原 (account recovery)`.

### Step 8: Commit

```bash
git add docs/en/auth/migrating-from-passwords-to-passkeys.md docs/zh-tw/auth/migrating-from-passwords-to-passkeys.md docs/en/list.md docs/zh-tw/list.md
git commit -m "$(cat <<'EOF'
feat: add BEE-1011 Migrating from Passwords to Passkeys (EN + zh-TW)

Closes the passkeys series with the rollout playbook: coexistence
as additive credentials, three enrollment-flow patterns, recovery-
channel audit (SMS becomes the front door once passwords are not),
threat-model shifts, telemetry signals, and a six-stage rollout
sequence from internal dogfood to optional password retirement.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Cross-reference pass on existing auth articles (optional)

**Files:**
- Modify: `docs/en/auth/authentication-vs-authorization.md` and zh-TW counterpart
- Modify: `docs/en/auth/token-based-authentication.md` and zh-TW counterpart

These older articles predate the passkey series. Add the new series to their Related BEEs sections so a reader landing on the foundational articles discovers the modern story.

### Step 1: Edit `docs/en/auth/authentication-vs-authorization.md`

Find the `## Related BEEs` section (or `## Related BEPs` if the older article still uses the old terminology). Append:

```markdown
- [BEE-1007](webauthn-fundamentals.md) WebAuthn Fundamentals -- modern phishing-resistant authentication
- [BEE-1011](migrating-from-passwords-to-passkeys.md) Migrating from Passwords to Passkeys -- rollout playbook for the modern auth model
```

### Step 2: Edit `docs/zh-tw/auth/authentication-vs-authorization.md`

Mirror the EN edit. Translate the trailing description per existing zh-TW conventions: `WebAuthn 基礎 -- 現代的抗釣魚認證`, `從密碼遷移到 Passkey -- 現代認證模型的推行手冊`.

### Step 3: Edit `docs/en/auth/token-based-authentication.md`

Append to its Related BEEs:

```markdown
- [BEE-1007](webauthn-fundamentals.md) WebAuthn Fundamentals -- WebAuthn ceremonies typically issue a session token on success
- [BEE-1008](passkeys-discoverable-credentials.md) Passkeys: Discoverable Credentials and UX Patterns -- passkey-issued sessions follow the same token-management patterns covered here
```

### Step 4: Edit `docs/zh-tw/auth/token-based-authentication.md`

Mirror the EN edit.

### Step 5: Polish all four modified files

Invoke `polish-documents` on each. Edits are minimal so polish should be near no-op.

### Step 6: Build

Run: `pnpm docs:build`
Expected: build succeeds.

### Step 7: Commit

```bash
git add docs/en/auth/authentication-vs-authorization.md docs/zh-tw/auth/authentication-vs-authorization.md docs/en/auth/token-based-authentication.md docs/zh-tw/auth/token-based-authentication.md
git commit -m "$(cat <<'EOF'
docs(auth): cross-reference passkey series from foundational articles

Add Related-BEEs links to BEE-1007 / BEE-1008 / BEE-1011 from the
two most-read auth articles (AuthN vs AuthZ, Token-Based Auth) so
readers landing on the foundations discover the modern passwordless
story. EN + zh-TW lockstep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: User-gate before push

**Files:** none (interaction only)

- [ ] **Step 1: Summarise the commit list to the user**

Run: `git log origin/main..HEAD --oneline`
Expected: 6 commits (5 article commits + 1 cross-ref commit), or 5 if the cross-ref task was skipped.

Report each commit by hash + subject line.

- [ ] **Step 2: Ask explicit confirmation**

Ask the user: "Ready to push N commits to origin/main?"

- [ ] **Step 3: Push only on explicit confirmation**

If confirmed:

```bash
git push origin main
```

Expected: push succeeds; report the SHA range pushed.

If declined: report local commit hashes and stop. Do not amend or rebase.

---

## Self-Review

**Spec coverage:**

| Spec section | Plan task |
|--------------|-----------|
| BEE-1007 WebAuthn Fundamentals | Task 2 |
| BEE-1008 Passkeys: Discoverable Credentials and UX Patterns | Task 3 |
| BEE-1009 Cross-Device Authentication | Task 4 |
| BEE-1010 FIDO2 Hardware Security Keys | Task 5 |
| BEE-1011 Migrating from Passwords to Passkeys | Task 6 |
| Per-article BEE template | Embedded in each task's Step 2 (required body sections) |
| Source verification approach | Each task's Step 1 (WebFetch list) and Step 3 (no-fabrication check) |
| Bilingual handling | Each task's Step 4 (zh-TW translation guidance) |
| Polish cadence | Each task's Steps 5-6 |
| Build gate | Each task's Step 7 |
| Five article commits | Each task's Step 8 |
| Optional cross-ref pass | Task 7 |
| Push gate | Task 8 |

All spec requirements covered.

**Placeholder scan:**

- No "TBD", "implement later", "fill in details" anywhere.
- Each WebFetch URL is concrete.
- Each task's required body sections are listed by name with topic notes; the article writer needs to compose prose anchored to the WebFetch'd sources but the structure is fixed.
- Translation guidance is concrete (specific terms, specific bilingual patterns).

**Type consistency:**

- Article IDs 1007-1011 used consistently across spec, plan tasks, commit messages, and cross-references.
- Slugs match across spec table, frontmatter examples, file paths, and inter-article links.
- Related-BEEs links use the same slug-based paths (`webauthn-fundamentals.md`, etc.) consistently.

No issues found.
