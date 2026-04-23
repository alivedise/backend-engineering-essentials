---
id: 1008
title: "Passkeys: Discoverable Credentials and UX Patterns"
state: draft
slug: passkeys-discoverable-credentials
---

# [BEE-1008] Passkeys: Discoverable Credentials and UX Patterns

:::info
A passkey is a WebAuthn discoverable credential, usually with platform sync, presented through a UX that hides the username field. The credential model from BEE-1007 is unchanged — what changes is how the relying party drives the ceremony and how the user experiences sign-in.
:::

## Context

[BEE-1007](webauthn-fundamentals.md) introduced WebAuthn as an API where the relying party identifies the user via account lookup, then asks an authenticator to sign a challenge. Two parts of that workflow can be reframed.

First, the credential the authenticator stores can be **server-side** (the authenticator does not retain enough metadata to surface the credential without the relying party providing a credential ID via `allowCredentials`) or **client-side discoverable** (the authenticator stores the user handle and display name, enabling username-less sign-in). The W3C spec defines a discoverable credential as "a public key credential source that is _discoverable_ and usable in authentication ceremonies where the Relying Party does not provide any credential IDs" ([W3C WebAuthn L3 §6.2.2](https://www.w3.org/TR/webauthn-3/#client-side-discoverable-credential)).

Second, the browser can present that credential through **conditional UI**: the autofill picker on the username field surfaces available passkeys alongside saved passwords. The user clicks one and signs in. No "Sign in with passkey" button required.

The combination — a discoverable credential plus conditional UI plus, usually, sync across the user's devices via a password manager — is what the industry markets as a **passkey**. The protocol is the same as in BEE-1007. The deployment shape is what's new.

## Principle

Relying parties **MUST** set `residentKey: "required"` and `userVerification: "required"` to register a passkey-grade credential. Relying parties **SHOULD** offer conditional UI on the username field of every sign-in form. Relying parties **MUST NOT** assume the user understands the difference between a passkey, a password, and a password manager — write copy that describes the action ("Use your saved passkey"), not the technology.

## Discoverable vs Non-Discoverable Credentials

The `authenticatorSelection.residentKey` field controls which kind the registration ceremony creates. Per W3C WebAuthn L3, the values are:

| Value | Behaviour |
|-------|-----------|
| `"required"` | The authenticator MUST create a discoverable credential. Registration fails if it cannot. |
| `"preferred"` | The authenticator SHOULD create a discoverable credential if it can. |
| `"discouraged"` | The authenticator SHOULD NOT create a discoverable credential. |

(`residentKey` replaces the deprecated boolean `requireResidentKey`.)

What changes between the two modes:

| Aspect | Server-side credential | Discoverable credential |
|--------|------------------------|-------------------------|
| Authenticator storage | Credential private key only | Private key + user handle + display name |
| Registration call | `residentKey: "discouraged"` (or omitted) | `residentKey: "required"` |
| Authentication call | RP **MUST** supply `allowCredentials` with the user's credential IDs | RP **MAY** omit `allowCredentials` (empty list); authenticator surfaces matching credentials |
| Username step | RP first asks for username, then invokes WebAuthn | No username step; the credential identifies the account via the returned `userHandle` |
| Hardware-key fit | Unlimited storage (credential ID encrypts the key) | Limited slots on hardware keys (see [BEE-1010](fido2-hardware-security-keys.md)) |

Discoverable credentials make the username-less flow possible, and the username-less flow is what conditional UI surfaces.

## Conditional UI / Conditional Mediation

Conditional UI uses the [Credential Management API mediation requirement](https://www.w3.org/TR/webauthn-3/#enum-mediation-requirement). The four values that can be passed to `navigator.credentials.get`:

| `mediation` | Behaviour |
|-------------|-----------|
| `"silent"` | No UI, no prompt; succeed only if a credential is immediately available without user interaction. |
| `"optional"` | Default; the browser may prompt. |
| `"conditional"` | Conditional UI; available credentials surface in the autofill picker on input fields the page marks for it. |
| `"required"` | The browser MUST show an explicit credential-selection UI. |

To enable conditional UI, the relying party:

1. Marks the username `<input>` with `autocomplete="username webauthn"`.
2. Calls `navigator.credentials.get({ mediation: "conditional", publicKey: { challenge, rpId, allowCredentials: [] } })` on page load.
3. Awaits the promise. If the user picks a passkey from autofill, the promise resolves with the assertion. If the user types a password instead, the promise stays pending until the page navigates.

```javascript
async function setupConditionalUI() {
  if (!window.PublicKeyCredential?.isConditionalMediationAvailable) return;
  if (!await PublicKeyCredential.isConditionalMediationAvailable()) return;

  const assertion = await navigator.credentials.get({
    mediation: "conditional",
    publicKey: {
      challenge: await fetchChallenge(),
      rpId: "example.com",
      allowCredentials: [],
      userVerification: "preferred"
    }
  });
  if (assertion) await submitAssertion(assertion);
}
```

The browser's autofill picker now shows passkeys alongside saved passwords on the username field. The user picks one, the authenticator runs the ceremony, the page receives the assertion.

## Sync vs Device-Bound

Discoverable credentials may be **synced** across a user's devices through a credential provider, or **device-bound** to the authenticator that created them. From the relying party's perspective, the protocol is identical — the difference lives entirely in the authenticator and credential provider layer.

**Synced** credentials propagate through the platform's credential provider:

- **Apple platforms**: iCloud Keychain syncs passkeys across devices signed into the same Apple ID.
- **Android / Chrome**: Google Password Manager syncs passkeys across the user's Google account.
- **Cross-platform**: third-party password managers (1Password, Bitwarden, Dashlane) can act as the credential provider on platforms that expose the WebAuthn provider API.

Per [passkeys.dev](https://passkeys.dev/docs/intro/what-are-passkeys/), the property the protocol guarantees is that "servers that assist in the syncing of passkeys across a user's devices never have the ability to view or use the private keys" — sync is end-to-end encrypted within the provider.

**Device-bound** credentials live on a single authenticator and never leave it. Hardware security keys ([BEE-1010](fido2-hardware-security-keys.md)) produce device-bound credentials by default. Some platform authenticators (older Android, enterprise-locked devices) also produce device-bound credentials.

The relying party cannot directly tell from the protocol whether a credential is synced or device-bound. Treat sync as the default assumption for consumer flows; if you need to enforce device-bound (regulated environments, high-value accounts), require attestation and validate the AAGUID against a hardware-key allowlist.

## Account Selection UX

When the authenticator finds multiple discoverable credentials matching the requested `rpId`, the platform displays a chooser. When it finds one, behaviour varies by platform — some auto-select, some still confirm. Two implications:

- A user with multiple accounts on the same site sees an account picker. Make sure the user handle and display name you registered are recognisable (not opaque IDs).
- A user with one passkey on a device may see a confirmation dialog rather than auto-sign-in. That is the platform's choice, not yours; do not try to suppress it.

## Fallback Flows

Conditional UI is opportunistic. The user may be on a device with no passkey, or in a browser that does not yet support conditional UI. The relying party must continue to offer:

- **Cross-device authentication** ([BEE-1009](cross-device-authentication.md)) — the user authenticates with a passkey on their phone via QR-code handoff.
- **Email magic-link** — issue a one-time link to the registered email address.
- **Password fallback** — for users who have not enrolled a passkey yet.

The sign-in form should keep both the password field and conditional-UI-enabled username field side by side. The user picks the path that works for them; the relying party serves both.

## Common Mistakes

- **Treating passkeys as a username replacement instead of a credential type.** A passkey identifies a credential; the account model behind it (email, display name, profile) still belongs to the relying party. Do not delete account records when the user removes a passkey.
- **Not enabling conditional UI.** A "Sign in with passkey" button below the password field is the worst-of-both UX: the user has to know what a passkey is and click the right button. Conditional UI surfaces passkeys where users already look — the autofill dropdown.
- **Hard-deleting credential records when the user removes a device.** A synced passkey may exist on devices the relying party cannot see. Only delete credential records when the user explicitly revokes them through your account-settings page.
- **Treating UV signal as user identity proof.** User verification proves a local human authenticated to the device (PIN, biometric). It does not prove which human. Identity is what your account model says, anchored at registration.
- **Setting `residentKey: "preferred"` for a passkey flow.** Use `"required"` — `"preferred"` lets the authenticator silently fall back to a server-side credential, which then breaks the username-less assumption your UI made.

## Related BEEs

- [BEE-1007](webauthn-fundamentals.md) WebAuthn Fundamentals -- the credential model this article builds on.
- [BEE-1009](cross-device-authentication.md) Cross-Device Authentication -- the fallback when no local passkey exists.
- [BEE-1010](fido2-hardware-security-keys.md) FIDO2 Hardware Security Keys -- contrast with synced platform passkeys.
- [BEE-1011](migrating-from-passwords-to-passkeys.md) Migrating from Passwords to Passkeys -- enrollment-flow design uses these passkey concepts.

## References

- W3C. 2024. "Web Authentication: An API for accessing Public Key Credentials -- Level 3". https://www.w3.org/TR/webauthn-3/
- W3C WebAuthn L3 §6.2.2 Client-Side Discoverable Public Key Credential Source. https://www.w3.org/TR/webauthn-3/#client-side-discoverable-credential
- W3C WebAuthn L3 §5.4.6 ResidentKeyRequirement. https://www.w3.org/TR/webauthn-3/#enum-residentKeyRequirement
- W3C WebAuthn L3 — CredentialMediationRequirement (conditional UI). https://www.w3.org/TR/webauthn-3/#enum-mediation-requirement
- FIDO Alliance / passkeys.dev. "What are passkeys?". https://passkeys.dev/docs/intro/what-are-passkeys/
