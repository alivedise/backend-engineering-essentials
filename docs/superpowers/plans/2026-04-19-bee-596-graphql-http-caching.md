# BEE-596 GraphQL HTTP-Layer Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research, write, and publish BEE-596 "GraphQL HTTP-Layer Caching" as a parallel EN + zh-TW article pair, per the design spec at `docs/superpowers/specs/2026-04-19-bee-596-graphql-http-caching-design.md` (commit `cfb0099`).

**Architecture:** Documentation article. Two parallel markdown files following the BEE template (Context → Principle → six body sections → Visual → Example → Common Mistakes → Related BEPs → References). EN written first against verified primary sources, then zh-TW translated under the writing-style constraints in the user's global CLAUDE.md. Three Mermaid diagrams render-verified in the VitePress dev server. Single commit at the end matches the project's `feat: add BEE-XXX (EN + zh-TW)` convention.

**Tech Stack:** VitePress 1.3.1, vitepress-plugin-mermaid 2.0.16, Mermaid 10.9.1, pnpm 8.15.5, Markdown.

---

## Reference Material

- **Spec:** `docs/superpowers/specs/2026-04-19-bee-596-graphql-http-caching-design.md` (commit `cfb0099`). Read end-to-end before starting Task 1.
- **Project conventions:** `/Users/alive/Projects/backend-engineering-essentials/CLAUDE.md` (BEE template, vendor-neutrality, RFC 2119 voice, every reference URL must be verified).
- **Personal style constraints (apply to zh-TW prose):** `~/.claude/CLAUDE.md`. Forbidden patterns:
  1. Contrastive negation (「不是 X，而是 Y」).
  2. Empty-contrast sentences where B is unrelated to A.
  3. Precision-puffery (「說得很清楚」, 「(動詞)得很精確」).
  4. Em-dash chains stringing filler clauses.
  5. Undefined adjectives (bare 「很重」 without scale/criterion).
  6. Undefined verbs without subject/range (bare 「可以跑」).
  7. "可以 X 可以 Y 可以 Z" capability stacks.
- **Sibling articles to study for tone, depth, and structure:**
  - `docs/en/Caching/205.md` — HTTP Caching and Conditional Requests (foundation; this article references it heavily)
  - `docs/en/API Design and Communication Protocols/74.md` — GraphQL vs REST vs gRPC (sibling category, similar topic)
  - `docs/en/API Design and Communication Protocols/485.md` — GraphQL Federation (same GraphQL family)

---

## File Structure

**Files to create:**
- `docs/en/API Design and Communication Protocols/596.md` — EN article (~2,400-2,800 words)
- `docs/zh-tw/API Design and Communication Protocols/596.md` — zh-TW translation, parallel structure

**Files to modify:**
- `docs/en/list.md` — append line 305: `- [596.GraphQL HTTP-Layer Caching](596)`
- `docs/zh-tw/list.md` — append corresponding line in zh-TW (find the equivalent ending line; preserve project convention for translated titles)

**Files NOT to modify:**
- VitePress config (`docs/.vitepress/config.*`) — sidebar is dynamic from frontmatter, no registration needed
- Sibling BEE articles — out of scope for this plan; deferred to NEW-B/NEW-C cycles

---

## Task 1: Pre-flight check

**Files:** none modified

- [ ] **Step 1: Read the spec end-to-end**

Read `docs/superpowers/specs/2026-04-19-bee-596-graphql-http-caching-design.md` in full. The plan below references spec section numbers (§3.1 etc.); you must have those in your head, not just look them up step-by-step.

- [ ] **Step 2: Read the three sibling articles**

Read in order:
- `docs/en/Caching/205.md` (BEE-205) — to understand the HTTP-caching mental model this article assumes
- `docs/en/API Design and Communication Protocols/74.md` (BEE-74) — to understand the existing one-bullet treatment of GraphQL caching that this article deepens
- `docs/en/API Design and Communication Protocols/485.md` (BEE-485) — to match GraphQL family tone

Note any house conventions: heading style, code-block fence languages, link formatting (relative paths vs filename-only), Mermaid diagram styling.

- [ ] **Step 3: Confirm clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean` (or only the in-progress plan file). If anything else is dirty, stop and surface it before proceeding.

- [ ] **Step 4: Confirm dev server runs**

Run: `pnpm install` (only if `node_modules` is missing or stale)
Run: `pnpm docs:dev` in a background process; wait for "vitepress" listening output; visit `http://localhost:5173/` once to confirm a page loads. Then leave running OR shut down — you will spin it back up in Task 5 and Task 8 for render verification.

If install fails, surface the error; do not work around it.

---

## Task 2: Verify every reference URL

**Files:** none modified (research output captured in conversation context, used in Task 4)

This is the most important task in the plan. Per the project CLAUDE.md: "Every article MUST be researched against authoritative sources. AI internal knowledge alone is insufficient." Each URL below must be fetched and the cited claim confirmed against the source. If a URL is dead or the source does not support the claim, replace the URL with a working source or revise the claim.

For each URL: WebFetch the page, extract the specific quote/section that supports the cited claim, and record (URL, claim, supporting quote, accessed-date). Carry this evidence into Task 4's drafting.

- [ ] **Step 1: Verify GraphQL specification**

URL: `https://spec.graphql.org/`
Claim to confirm: The spec defines query / mutation / subscription operation types, declares mutations may have side effects, and is **silent** on HTTP transport and caching. Capture the exact spec edition (e.g., October 2021) and the section reference for "Operations" / "Mutations".

- [ ] **Step 2: Verify GraphQL-over-HTTP working draft**

URL: `https://github.com/graphql/graphql-over-http`
Claim to confirm: An active working draft exists addressing GET handling, content negotiation, and persisted documents. Capture: current draft state (rendered URL if available — likely `https://graphql.github.io/graphql-over-http/draft/`), the latest commit/date consulted, and the draft's status on GET requests and persisted documents.

- [ ] **Step 3: Verify RFC 9111 §4 on POST cacheability**

URL: `https://www.rfc-editor.org/rfc/rfc9111.html`
Claim to confirm: §4 (or wherever the relevant text lives) describes when a POST response may be cached. Capture the exact paragraph that establishes POST is not generally cacheable by intermediaries without explicit freshness information AND method recognition. Cite the section number precisely.

- [ ] **Step 4: Verify MDN — HTTP caching**

URL: `https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching`
Claim to confirm: Cache-Control directives (`public`, `private`, `max-age`, `s-maxage`, `no-store`, `no-cache`, `immutable`, `stale-while-revalidate`) are documented and behave as described in BEE-205.

- [ ] **Step 5: Verify MDN — HTTP conditional requests**

URL: `https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests`
Claim to confirm: ETag + `If-None-Match` flow returns 304 Not Modified with no body when the ETag matches.

- [ ] **Step 6: Verify Apollo `@cacheControl` directive and response cache plugin**

URL: `https://www.apollographql.com/docs/apollo-server/performance/caching`
Claims to confirm:
  (a) `@cacheControl(maxAge: N, scope: PUBLIC|PRIVATE)` directive exists with that signature.
  (b) The server walks the resolved response and computes the **minimum** maxAge across all selected fields, plus the **strictest** scope.
  (c) The server emits a `Cache-Control` HTTP header derived from the computed values.

If any of these claims are wrong or have changed, revise spec §3.5's wording in your draft. Note also: the spec flags one specific claim for verification — that schema-hint patterns are "partially proposed for the GraphQL-over-HTTP draft." Confirm or revise.

- [ ] **Step 7: Verify Apollo APQ protocol**

URL: `https://www.apollographql.com/docs/apollo-server/performance/apq`
Claims to confirm:
  (a) Hash is sha256 of the query text.
  (b) GET request shape uses `extensions={"persistedQuery":{"version":1,"sha256Hash":"..."}}` plus `variables=...` query parameters.
  (c) Server returns `PersistedQueryNotFound` error with extension code `PERSISTED_QUERY_NOT_FOUND` on first miss; client retries with full query text to register.

- [ ] **Step 8: Verify a non-Apollo persisted-query implementation (vendor-neutrality requirement)**

Try first: `https://the-guild.dev/graphql/yoga-server/docs/features/response-caching`
Fall back to: GraphQL Yoga persisted-operations docs (`https://the-guild.dev/graphql/yoga-server/docs/features/persisted-operations`), or Hot Chocolate query persistence docs (`https://chillicream.com/docs/hotchocolate/v13/server/persisted-queries`), or Mercurius docs.

Claim to confirm: At least one non-Apollo GraphQL server supports the same persisted-query/response-cache pattern. Capture the chosen URL and a brief paraphrase of the supporting feature.

- [ ] **Step 9: Find and verify one neutral practitioner article on cache fragmentation**

Search for an architecture/infrastructure blog post (not a vendor product page) that discusses GraphQL CDN caching and the cache-fragmentation/per-query-shape problem. Acceptable sources: engineering blogs of well-known companies, conference talks transcribed online, or technical Substacks. Avoid product marketing pages.

If a strong source cannot be found, drop this from the references list and note that omission in your Task 6 self-review — do not pad with weak citations.

- [ ] **Step 10: Compile verified references list**

Produce the final References block for the article. Each entry: `- [Source title](url) — one-sentence note on what claim it supports`. Format matches the existing convention in BEE-205 §References. Carry this block into Task 4 Step 9.

---

## Task 3: Create EN article skeleton

**Files:**
- Create: `docs/en/API Design and Communication Protocols/596.md`

- [ ] **Step 1: Create the file with frontmatter, H1, and section headers only**

Write the following into `docs/en/API Design and Communication Protocols/596.md`:

```markdown
---
id: 596
title: "GraphQL HTTP-Layer Caching"
state: draft
---

# [BEE-596] GraphQL HTTP-Layer Caching

:::info
GraphQL was not designed around HTTP caching, but it can participate in it. The path runs through GET-via-persisted-queries, response cache directives, and ETag revalidation — and through understanding why naive `POST /graphql` defeats every CDN.
:::

## Context

## Principle

## Why default `POST /graphql` defeats the HTTP cache

## GET-via-persisted-queries: making the request URL-addressable

## Per-response cache directives

## ETag and conditional revalidation in GraphQL

## Cache fragmentation: the cost of query-shape granularity

## Brief contrast: client-side normalized cache

## Visual

## Example

## Common Mistakes

## Related BEPs

## References
```

- [ ] **Step 2: Verify file is well-formed**

Run: `head -10 "docs/en/API Design and Communication Protocols/596.md"`
Expected: frontmatter visible, `id: 596`, `title: "GraphQL HTTP-Layer Caching"`, `state: draft`. Do not commit yet.

---

## Task 4: Write EN article body

**Files:**
- Modify: `docs/en/API Design and Communication Protocols/596.md`

For each step below, write the body of the corresponding section per the spec. The spec is the source of truth for content and word count targets. Your job is to render the spec into final prose that matches BEE-205's tone and density.

Style requirements throughout (apply to every step):
- RFC 2119 keywords (MUST, SHOULD, MAY, MUST NOT) used only in the Principle section and where guidance is normative — not as filler.
- Vendor-neutral. Apollo may be cited as one concrete implementation alongside at least one alternative; do not promote a specific vendor.
- No precision-puffery ("says X clearly", "explains precisely"). State things, don't editorialize about how clearly you state them.
- No empty-contrast sentences ("not X, but Y" where X and Y are unrelated).
- No undefined adjectives ("very heavy" without a scale).

- [ ] **Step 1: Write the Context section** (per spec §3.1, ~250 words)

Open by referencing BEE-205 (HTTP caching as REST's free lunch). Pivot to GraphQL's design and the three blockers (POST not cacheable, body-as-cache-key, response-shape varies). Close with the practical motivation: zero CDN hit rate, conflation with client-side cache. Match BEE-205's `## Context` density.

- [ ] **Step 2: Write the Principle section** (per spec §3.2, one paragraph)

Use the verbatim Principle paragraph from spec §3.2 as the basis. Adjust only if Task 2 reference verification surfaced a contradiction. Keep the RFC 2119 voice.

- [ ] **Step 3: Write body section "Why default `POST /graphql` defeats the HTTP cache"** (per spec §3.3, ~200 words)

Three blockers, each one short paragraph. Include the wire-format request snippet showing what the CDN sees, with the inline annotation about method/URL/cache-key entropy. Cite RFC 9111 with the section number captured in Task 2 Step 3.

- [ ] **Step 4: Write body section "GET-via-persisted-queries"** (per spec §3.4, ~300 words)

Cover hash computation (sha256 of normalized query text), the two registration strategies (build-time allowlist vs runtime auto-persist), the wire-format GET URL, and the standards picture (GraphQL spec silent, GraphQL-over-HTTP draft, APQ as one concrete implementation, list of other implementations from Task 2 Step 8). Close with what this unlocks at the edge.

- [ ] **Step 5: Write body section "Per-response cache directives"** (per spec §3.5, ~250 words)

Cover the schema-hint pattern (`@cacheControl(maxAge: N, scope: PUBLIC|PRIVATE)`) using the SDL snippet from spec §3.5, the minimum-across-all-fields rule (with the worked example), and the scope-downgrade trap. If Task 2 Step 6 found that the GraphQL-over-HTTP draft has *not* in fact proposed schema-hint patterns, remove that claim and reference only the de-facto convention.

- [ ] **Step 6: Write body section "ETag and conditional revalidation in GraphQL"** (per spec §3.6, ~250 words)

Cover the two ETag generation strategies (response-body hash vs entity-version composition), the `If-None-Match` flow (full GET request with header), and the honest caveat about query-shape coarseness vs REST resource-level ETags.

- [ ] **Step 7: Write body section "Cache fragmentation"** (per spec §3.7, ~200 words)

Use the Alice-five-shapes worked example. Cover the three honest approaches (tagged invalidation, TTL-only acceptance, allowlisted query set). Frame this as a real trade-off without a single right answer — do not pretend it's solved.

- [ ] **Step 8: Write body section "Brief contrast: client-side normalized cache"** (per spec §3.8, ~150 words + table)

Short prose explanation of normalized client cache (Apollo Client / Relay / urql; entity identity by `__typename:id`; in-memory; per-tab). Then the comparison table from spec §3.8 verbatim. Close with one sentence noting that normalized client cache deserves its own future BEE.

- [ ] **Step 9: Write Visual, Example, Common Mistakes, Related BEPs, References**

Paste the three Mermaid diagrams from spec §3.9 verbatim into the Visual section. (Do not modify the diagrams in this step; render-fix happens in Task 5.) Paste the three-state Example walkthrough from spec §3.10 verbatim. Write the five Common Mistakes from spec §3.11 in full prose. Write the Related BEPs list from spec §3.12 — verify every referenced BEE file exists with `ls "docs/en/<category>/<id>.md"` for each entry, and adjust the link target to match the project's convention (after reading sibling articles in Task 1, you'll know whether the convention is `74.md` or `../API%20Design.../74.md`). Paste the verified References block compiled in Task 2 Step 10.

- [ ] **Step 10: Verify file is complete and reads end-to-end**

Run: `wc -w "docs/en/API Design and Communication Protocols/596.md"`
Expected: between 2,300 and 3,000 words (target 2,400-2,800 + frontmatter overhead).

Read the file end-to-end yourself. Confirm: every section has substantive content (no empty headers); the narrative flows from "why it's hard" to "what to do" to "where the trade-offs are"; no TODO/TBD/placeholder text.

---

## Task 5: EN self-review against style and project constraints

**Files:** may modify `docs/en/API Design and Communication Protocols/596.md` for fixes

Run each check sequentially. If a check fails, fix the article inline and re-run.

- [ ] **Step 1: Vendor-neutrality check**

Run: `grep -in "apollo" "docs/en/API Design and Communication Protocols/596.md" | wc -l`
Inspect each match. Apollo references must appear only as: (a) one concrete implementation of a generic pattern, alongside at least one named alternative; (b) the originator of a named protocol (APQ); (c) verified-source citations in References. No prose that sells Apollo as the recommended choice.

Run: `grep -inE "we recommend (apollo|relay|urql|yoga|hot chocolate)" "docs/en/API Design and Communication Protocols/596.md"`
Expected: zero matches. If any vendor is recommended over another in prose, rewrite to neutral framing.

- [ ] **Step 2: Precision-puffery check**

Run: `grep -inE "(clearly|precisely|exactly explains|explains exactly|says clearly)" "docs/en/API Design and Communication Protocols/596.md"`
Expected: zero matches in normal prose. The word "exactly" is allowed when literally required ("the response is exactly the shape the client requested" — that's a factual claim about GraphQL semantics, not self-praise about the writing).

- [ ] **Step 3: RFC 2119 voice check**

The Principle section MUST contain at least one each of MUST, SHOULD, MUST NOT. Other sections MAY use RFC 2119 keywords sparingly when stating normative guidance; they MUST NOT use them as filler.

Run: `grep -nE "\b(MUST|SHOULD|MAY|MUST NOT|SHOULD NOT)\b" "docs/en/API Design and Communication Protocols/596.md"`
Inspect each match. Outside the Principle section, every keyword usage must be deliberate.

- [ ] **Step 4: BEE template structural check**

Confirm the article has, in order: frontmatter, H1, `:::info` tagline, `## Context`, `## Principle`, body sections, `## Visual`, `## Example`, `## Common Mistakes`, `## Related BEPs`, `## References`.

Run: `grep -n "^## " "docs/en/API Design and Communication Protocols/596.md"`
Expected: section headers in the order above.

- [ ] **Step 5: Reference URL spot-check**

Pick three URLs at random from the References block. WebFetch each one. Confirm each is still live and the cited claim is still in the source. (Task 2 already verified all of them, but URLs occasionally rot between tasks; this is a sanity check.)

- [ ] **Step 6: Cross-reference path check**

For each link in `## Related BEPs`, run: `ls <resolved-path>` to confirm the target file exists. Adjust link paths if any 404.

---

## Task 6: Render-verify EN article + Mermaid diagrams

**Files:** may modify `docs/en/API Design and Communication Protocols/596.md` if Mermaid syntax errors surface

- [ ] **Step 1: Start dev server in the background**

Run (background): `pnpm docs:dev`
Wait for "vitepress" listening output. Capture the local URL (typically `http://localhost:5173/`).

- [ ] **Step 2: Navigate to the article and inspect**

Open: `http://localhost:5173/en/API%20Design%20and%20Communication%20Protocols/596`
(Adjust the path if the project's URL routing strips spaces or transforms category names — confirm by clicking through from `http://localhost:5173/en/list` to BEE-595 or BEE-485 and observing the URL pattern.)

Verify:
- The page loads without console errors.
- The `:::info` block renders as a styled callout.
- All three Mermaid diagrams render as SVG (not as raw code blocks). If any diagram shows as code, it's a syntax error — open the browser console for the parser error message, fix the Mermaid source in the article, save, wait for HMR, re-check.
- Tables render with borders.
- All HTTP code blocks render with appropriate syntax highlighting (use the ` ```http ` fence).

- [ ] **Step 3: Verify the article appears in the dynamic sidebar**

Open: `http://localhost:5173/en/API%20Design%20and%20Communication%20Protocols/485` (BEE-485)
Confirm BEE-596 appears in the sidebar (the dynamic sidebar generates from frontmatter at build time per project CLAUDE.md). If BEE-596 is missing from the sidebar despite being a sibling of BEE-485, troubleshoot the frontmatter (likely `id` mismatch).

- [ ] **Step 4: Stop dev server**

Stop the background process. Output should be clean (no unhandled errors during the session).

---

## Task 7: Translate to zh-TW

**Files:**
- Create: `docs/zh-tw/API Design and Communication Protocols/596.md`

The zh-TW article is a parallel translation of the EN article. Same frontmatter (with translated title), same section structure, same Mermaid diagrams (verbatim — code is language-neutral), same code/HTTP snippets (verbatim). Only the prose paragraphs translate.

- [ ] **Step 1: Read existing zh-TW articles to match house style**

Read `docs/zh-tw/API Design and Communication Protocols/485.md` and `docs/zh-tw/Caching/205.md` first. Note specifically: do section headers translate fully (`## 背景`) or keep English in parens (`## 背景 (Context)`) or stay in English? Does the `:::info` tagline translate? How are technical terms inlined into Chinese prose? Whatever pattern those files use, this article matches.

- [ ] **Step 2: Create the file with translated frontmatter, tagline, and section headers**

Write into `docs/zh-tw/API Design and Communication Protocols/596.md`:

```markdown
---
id: 596
title: "GraphQL 的 HTTP 層快取"
state: draft
---

# [BEE-596] GraphQL 的 HTTP 層快取

:::info
GraphQL 並非以 HTTP 快取為前提設計，但仍可參與其中。可行路徑包含三步：透過 persisted query 改用 GET、為回應加上快取指令、使用 ETag 進行條件式重新驗證。前提是先理解預設的 `POST /graphql` 為什麼會讓 CDN 失去作用。
:::

## 背景

## 原則

## 為什麼預設的 `POST /graphql` 會破壞 HTTP 快取

## 透過 Persisted Query 改用 GET：讓請求變成 URL 可定址

## 每個回應的快取指令

## GraphQL 中的 ETag 與條件式重新驗證

## 快取碎片化：query 形狀粒度的代價

## 與用戶端 Normalized Cache 的對比

## 視覺化

## 範例

## 常見錯誤

## 相關 BEP

## 參考資料
```

If Step 1's house-style review found that existing zh-TW articles use a different convention (e.g., `## 背景 (Context)` with English in parens, or English-only headers), adjust the headers above to match. The tagline draft above already avoids the forbidden patterns from `~/.claude/CLAUDE.md` (no contrastive negation, no em-dash chain, no precision-puffery, no `可以X可以Y可以Z` stack); refine wording only if Step 1 reveals a tone mismatch with sibling articles.

- Context → 背景
- Principle → 原則
- Why default `POST /graphql` defeats the HTTP cache → 為什麼預設的 `POST /graphql` 會破壞 HTTP 快取
- GET-via-persisted-queries: making the request URL-addressable → 透過 Persisted Query 改用 GET：讓請求變成 URL 可定址
- Per-response cache directives → 每個回應的快取指令
- ETag and conditional revalidation in GraphQL → GraphQL 中的 ETag 與條件式重新驗證
- Cache fragmentation: the cost of query-shape granularity → 快取碎片化：query 形狀粒度的代價
- Brief contrast: client-side normalized cache → 與用戶端 normalized cache 的對比
- Visual → 視覺化
- Example → 範例
- Common Mistakes → 常見錯誤
- Related BEPs → 相關 BEP
- References → 參考資料

(If the existing zh-TW articles use different translations for "Context"/"Principle"/"Common Mistakes"/etc., follow the house style instead.)

- [ ] **Step 3: Translate each prose section**

For each EN section, write a parallel zh-TW version. Constraints:

- Technical terms stay in English: `ETag`, `Cache-Control`, `If-None-Match`, `Vary`, `persisted query`, `CDN`, `scope`, `hash`, `GraphQL`, `REST`, `GET`, `POST`, `JSON`, `SDL`, field names like `__typename`.
- Surrounding prose in Traditional Chinese (繁體中文 / Traditional).
- Forbidden patterns (from `~/.claude/CLAUDE.md`):
  - 「不是 X，而是 Y」 — rewrite as a positive statement.
  - Empty contrasts where B is unrelated to A — rewrite both halves to relate.
  - 「說得很清楚」, 「(動詞)得很精確」 — drop the precision-puffery; state the thing.
  - Em-dash chains stringing filler — replace with proper sentences or commas.
  - Bare 「很重」 / 「很大」 / 「很重要」 without a scale — add the scale or remove the adjective.
  - Bare 「可以跑」 without subject/range — name the subject and range.
  - 「可以 X 可以 Y 可以 Z」 排比句 — rewrite as concrete claims.
- Code blocks, HTTP snippets, GraphQL SDL, and Mermaid diagrams: copy verbatim from the EN file. Do not translate identifiers or keywords.
- Tables: translate headers and prose cells; keep technical terms in English.

- [ ] **Step 4: Verify file structure parity with EN**

Run: `grep -c "^## " "docs/zh-tw/API Design and Communication Protocols/596.md"`
Run: `grep -c "^## " "docs/en/API Design and Communication Protocols/596.md"`
Expected: identical counts. If not, a section is missing.

Run: `grep -c "^\`\`\`mermaid" "docs/zh-tw/API Design and Communication Protocols/596.md"`
Expected: `3` (matches V1, V2, V3 in EN).

- [ ] **Step 5: Style-rule scan**

Run: `grep -nE "不是.{1,30}而是" "docs/zh-tw/API Design and Communication Protocols/596.md"`
Expected: zero matches.

Run: `grep -nE "(說得很清楚|得很精確|寫得很精確)" "docs/zh-tw/API Design and Communication Protocols/596.md"`
Expected: zero matches.

Run: `grep -nE "可以.{1,15}可以.{1,15}可以" "docs/zh-tw/API Design and Communication Protocols/596.md"`
Expected: zero matches.

If any check fails, rewrite the offending sentence and re-run.

---

## Task 8: Render-verify zh-TW article

**Files:** may modify `docs/zh-tw/API Design and Communication Protocols/596.md` if Mermaid or markdown errors surface

- [ ] **Step 1: Start dev server**

Run (background): `pnpm docs:dev`

- [ ] **Step 2: Navigate to the zh-TW article**

Open: `http://localhost:5173/zh-tw/API%20Design%20and%20Communication%20Protocols/596` (or the project's actual zh-TW route — confirm by clicking through from `http://localhost:5173/zh-tw/list`).

Verify same render checks as Task 6 Step 2: callout block, three Mermaid SVGs, tables, HTTP code blocks. Confirm Chinese characters render correctly (no font-fallback boxes).

- [ ] **Step 3: Verify zh-TW article appears in zh-TW sidebar**

Open: `http://localhost:5173/zh-tw/API%20Design%20and%20Communication%20Protocols/485`
Confirm BEE-596 appears in the sidebar.

- [ ] **Step 4: Stop dev server**

---

## Task 9: Update `list.md` in both locales

**Files:**
- Modify: `docs/en/list.md` (append after current line 304)
- Modify: `docs/zh-tw/list.md`

- [ ] **Step 1: Append entry to EN list.md**

Open `docs/en/list.md`. After the line:
```
- [595.Data Augmentation Strategies for ML Training](595)
```
Add:
```
- [596.GraphQL HTTP-Layer Caching](596)
```

- [ ] **Step 2: Append entry to zh-TW list.md**

Open `docs/zh-tw/list.md`. Find the corresponding line for BEE-595 (use `grep -n "595" docs/zh-tw/list.md`). After it, add:
```
- [596.GraphQL 的 HTTP 層快取](596)
```
(If the zh-TW list.md uses a different format/punctuation/spacing convention than the EN list.md — confirmed by reading nearby entries — match that convention.)

- [ ] **Step 3: Verify both list.md files are well-formed**

Run: `tail -5 docs/en/list.md docs/zh-tw/list.md`
Expected: BEE-596 appears as the last entry in both, formatting consistent with surrounding entries.

---

## Task 10: Final commit

**Files:** stages all of:
- `docs/en/API Design and Communication Protocols/596.md` (new)
- `docs/zh-tw/API Design and Communication Protocols/596.md` (new)
- `docs/en/list.md` (modified)
- `docs/zh-tw/list.md` (modified)

- [ ] **Step 1: Review the full diff**

Run: `git status`
Expected: 4 files (2 new, 2 modified). Nothing else.

Run: `git diff --stat`
Run: `git diff docs/en/list.md docs/zh-tw/list.md`
Expected: each list.md gets exactly one line added.

Read both new article files end-to-end one final time. This is the last opportunity to catch issues before they land on `main`.

- [ ] **Step 2: Stage and commit**

Run:
```bash
git add "docs/en/API Design and Communication Protocols/596.md" \
        "docs/zh-tw/API Design and Communication Protocols/596.md" \
        docs/en/list.md \
        docs/zh-tw/list.md
```

Run:
```bash
git commit -m "$(cat <<'EOF'
feat: add BEE-596 GraphQL HTTP-Layer Caching (EN + zh-TW)

First article in a planned three-article series on the HTTP-ecosystem
gap in GraphQL. Covers why default POST /graphql defeats the HTTP cache,
GET-via-persisted-queries to restore URL-addressability, per-response
cache directives and the scope-downgrade trap, ETag-based conditional
revalidation, the cache-fragmentation cost of query-shape granularity,
and a contrast with client-side normalized cache.

Spec: docs/superpowers/specs/2026-04-19-bee-596-graphql-http-caching-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify commit landed**

Run: `git log -1 --stat`
Expected: 4 files in the commit, message as above.

Run: `git status`
Expected: `nothing to commit, working tree clean`.

---

## Done

After Task 10, the article is on `main` with the verification chain complete:
1. Spec approved by user (commit `cfb0099`)
2. Every reference URL fetched and claim confirmed (Task 2)
3. Article structurally matches BEE template (Task 5)
4. Mermaid diagrams render in EN (Task 6) and zh-TW (Task 8)
5. Article registered in both list.md files (Task 9)
6. Single commit per project convention (Task 10)

Next steps in the series (separate brainstorm cycles, not part of this plan):
- **NEW-B:** GraphQL vs REST — HTTP Infrastructure Trade-offs (caching ↪ this article, idempotency, observability, rate limiting, authorization granularity, error semantics)
- **NEW-C:** GraphQL Operational Patterns (persisted-query allowlisting as DoS/security boundary, query complexity scoring, schema versioning)
