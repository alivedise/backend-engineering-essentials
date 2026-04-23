---
id: 1008
title: "Passkey：可發現憑證與 UX 模式"
state: draft
slug: passkeys-discoverable-credentials
---

# [BEE-1008] Passkey：可發現憑證與 UX 模式

:::info
Passkey 是一個 WebAuthn 可發現憑證 (discoverable credential)，通常搭配平台同步，並透過隱藏帳號欄位的 UX 呈現。BEE-1007 的憑證模型沒有改變——改變的是中繼方如何驅動儀式，以及使用者如何體驗登入。
:::

## 背景

[BEE-1007](webauthn-fundamentals.md) 介紹 WebAuthn 為一個 API：中繼方先以帳號查詢識別使用者，再請驗證器簽署一個 challenge。這個工作流程的兩個部分可以重新框架。

第一，驗證器儲存的憑證可以是**伺服器端的**（驗證器沒有保留足夠中介資料以在沒有 `allowCredentials` 中提供的 credential ID 時主動呈現憑證）或**客戶端可發現的**（驗證器儲存了 user handle 與顯示名稱，能支援無帳號名稱的登入）。W3C 規範定義可發現憑證為「一個可被_發現_並能在中繼方未提供任何 credential ID 的認證儀式中使用的公開金鑰憑證來源」（[W3C WebAuthn L3 §6.2.2](https://www.w3.org/TR/webauthn-3/#client-side-discoverable-credential)）。

第二，瀏覽器可以透過**條件式 UI** (conditional UI) 呈現該憑證：帳號欄位的自動填寫選單會將可用的 passkey 與儲存的密碼一同呈現。使用者點選一個就完成登入。不需要「以 Passkey 登入」的按鈕。

可發現憑證 + 條件式 UI +（通常還加上）跨裝置的密碼管理員同步——這個組合就是業界所稱的 **passkey**。協定與 BEE-1007 相同。新的是部署形態。

## 原則

中繼方 **MUST** 設定 `residentKey: "required"` 與 `userVerification: "required"` 才能註冊出 passkey 等級的憑證。中繼方 **SHOULD** 在每個登入表單的帳號欄位上提供條件式 UI。中繼方 **MUST NOT** 預設使用者理解 passkey、密碼、密碼管理員之間的差別——文案要描述動作（「使用您已儲存的 Passkey」），不要描述技術。

## 可發現 vs 非可發現憑證

`authenticatorSelection.residentKey` 欄位控制註冊儀式建立哪一種。依 W3C WebAuthn L3，可選值：

| 值 | 行為 |
|----|------|
| `"required"` | 驗證器 MUST 建立可發現憑證。若無法則註冊失敗。 |
| `"preferred"` | 驗證器 SHOULD 建立可發現憑證（若可行）。 |
| `"discouraged"` | 驗證器 SHOULD NOT 建立可發現憑證。 |

（`residentKey` 取代已棄用的布林值 `requireResidentKey`。）

兩種模式之間的差異：

| 面向 | 伺服器端憑證 | 可發現憑證 |
|------|--------------|------------|
| 驗證器儲存 | 僅 credential 私鑰 | 私鑰 + user handle + 顯示名稱 |
| 註冊呼叫 | `residentKey: "discouraged"`（或省略） | `residentKey: "required"` |
| 認證呼叫 | 中繼方 **MUST** 在 `allowCredentials` 中提供使用者的 credential ID | 中繼方 **MAY** 省略 `allowCredentials`（空清單）；驗證器主動呈現相符憑證 |
| 帳號名稱步驟 | 中繼方先要求帳號名稱，再呼叫 WebAuthn | 沒有帳號名稱步驟；憑證透過回傳的 `userHandle` 識別帳號 |
| 硬體金鑰相容性 | 無限儲存（credential ID 加密了金鑰） | 硬體金鑰上有儲存格上限（見 [BEE-1010](fido2-hardware-security-keys.md)） |

可發現憑證讓無帳號名稱流程成為可能，而無帳號名稱流程就是條件式 UI 所呈現的東西。

## 條件式 UI / Conditional Mediation

條件式 UI 使用 [Credential Management API 的 mediation 要求](https://www.w3.org/TR/webauthn-3/#enum-mediation-requirement)。可傳給 `navigator.credentials.get` 的四個值：

| `mediation` | 行為 |
|-------------|------|
| `"silent"` | 沒有 UI、沒有提示；只在憑證可立即取得且無需使用者互動時成功。 |
| `"optional"` | 預設值；瀏覽器可能提示。 |
| `"conditional"` | 條件式 UI；可用憑證會在頁面標記過的輸入欄位的自動填寫選單中浮現。 |
| `"required"` | 瀏覽器 MUST 顯示明確的憑證選擇 UI。 |

要啟用條件式 UI，中繼方：

1. 在帳號 `<input>` 上設定 `autocomplete="username webauthn"`。
2. 在頁面載入時呼叫 `navigator.credentials.get({ mediation: "conditional", publicKey: { challenge, rpId, allowCredentials: [] } })`。
3. 等待該 promise。若使用者從自動填寫中選了 passkey，promise 會 resolve 並回傳 assertion。若使用者改打密碼，promise 維持 pending 直到頁面導航。

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

瀏覽器的自動填寫選單現在會在帳號欄位上同時呈現 passkey 與儲存的密碼。使用者選一個，驗證器跑儀式，頁面收到 assertion。

## 同步 vs 裝置綁定

可發現憑證可以透過憑證提供者跨使用者裝置**同步** (synced)，也可以**綁定裝置** (device-bound) 在建立它的驗證器上。從中繼方角度看，協定是相同的——差別完全發生在驗證器與憑證提供者層。

**同步**型憑證透過平台的憑證提供者傳播：

- **Apple 平台**：iCloud Keychain 在登入同一 Apple ID 的裝置間同步 passkey。
- **Android / Chrome**：Google Password Manager 在使用者的 Google 帳戶間同步 passkey。
- **跨平台**：在曝露 WebAuthn provider API 的平台上，第三方密碼管理員（1Password、Bitwarden、Dashlane）也可作為憑證提供者。

依 [passkeys.dev](https://passkeys.dev/docs/intro/what-are-passkeys/) 所述，協定保證的性質是「協助跨裝置同步 passkey 的伺服器永遠無法檢視或使用私鑰」——同步是在提供者內部端到端加密的。

**裝置綁定** (device-bound) 憑證住在單一驗證器上，永不離開。硬體安全金鑰（[BEE-1010](fido2-hardware-security-keys.md)）預設產生裝置綁定憑證。某些平台驗證器（較舊的 Android、企業鎖定的裝置）也產生裝置綁定憑證。

中繼方無法直接從協定判斷憑證是同步的還是裝置綁定的。消費者流程預設視為同步；若需要強制裝置綁定（受規範環境、高價值帳號），請求 attestation 並依 AAGUID 對硬體金鑰允許清單做驗證。

## 帳號選擇 UX

當驗證器找到多個符合請求 `rpId` 的可發現憑證時，平台會顯示選擇器。當只找到一個時，行為依平台而定——有些自動選取，有些仍會確認。兩個含義：

- 在同一站台有多個帳號的使用者會看到帳號選擇器。確認你註冊時提供的 user handle 與顯示名稱是可辨識的（不是不透明的 ID）。
- 在裝置上只有一個 passkey 的使用者可能看到確認對話框而非自動登入。那是平台的選擇，不是你的；不要試圖抑制它。

## 後備流程

條件式 UI 是機會主義式的。使用者可能在沒有 passkey 的裝置上、或在尚未支援條件式 UI 的瀏覽器上。中繼方仍須提供：

- **跨裝置認證**（[BEE-1009](cross-device-authentication.md)）——使用者透過 QR code 接力，用手機上的 passkey 認證。
- **電子郵件 magic-link**——對註冊的電子郵件發出一次性連結。
- **密碼後備**——對尚未註冊 passkey 的使用者使用。

登入表單應該把密碼欄位與啟用條件式 UI 的帳號欄位並列。使用者選對自己有效的路徑；中繼方兩條都提供。

## 常見錯誤

- **把 passkey 當成帳號名稱替代品而非憑證類型。** Passkey 識別憑證；它背後的帳號模型（電子郵件、顯示名稱、個人資料）仍屬於中繼方。使用者移除 passkey 時不要刪除帳號紀錄。
- **沒有啟用條件式 UI。** 在密碼欄位下方放一個「以 Passkey 登入」按鈕是兩面不討好的 UX：使用者得知道 passkey 是什麼、還得點對按鈕。條件式 UI 把 passkey 呈現在使用者本來就會看的地方——自動填寫下拉選單。
- **使用者移除裝置時硬刪除憑證紀錄。** 同步型 passkey 可能存在於中繼方看不見的裝置上。只在使用者透過你的帳號設定頁明確撤銷時才刪除憑證紀錄。
- **把 UV 訊號當成使用者身分證明。** UV 證明本地的某個人對裝置完成了驗證（PIN、生物辨識）。它不證明是哪個人。身分由你的帳號模型決定，於註冊時錨定。
- **為 passkey 流程設定 `residentKey: "preferred"`。** 用 `"required"`——`"preferred"` 會讓驗證器靜默地退回伺服器端憑證，繼而打破你 UI 假定的無帳號名稱前提。

## 相關 BEE

- [BEE-1007](webauthn-fundamentals.md) WebAuthn 基礎 -- 本文建立其上的憑證模型。
- [BEE-1009](cross-device-authentication.md) 跨裝置認證 -- 沒有本地 passkey 時的後備。
- [BEE-1010](fido2-hardware-security-keys.md) FIDO2 硬體安全金鑰 -- 與同步型平台 passkey 的對比。
- [BEE-1011](migrating-from-passwords-to-passkeys.md) 從密碼遷移到 Passkey -- 註冊流程設計使用本文的 passkey 概念。

## 參考資料

- W3C. 2024. "Web Authentication: An API for accessing Public Key Credentials -- Level 3". https://www.w3.org/TR/webauthn-3/
- W3C WebAuthn L3 §6.2.2 Client-Side Discoverable Public Key Credential Source. https://www.w3.org/TR/webauthn-3/#client-side-discoverable-credential
- W3C WebAuthn L3 §5.4.6 ResidentKeyRequirement. https://www.w3.org/TR/webauthn-3/#enum-residentKeyRequirement
- W3C WebAuthn L3 — CredentialMediationRequirement（條件式 UI）. https://www.w3.org/TR/webauthn-3/#enum-mediation-requirement
- FIDO Alliance / passkeys.dev. "What are passkeys?". https://passkeys.dev/docs/intro/what-are-passkeys/
