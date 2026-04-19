# Design Spec: BEE Numbering and Category Restructure

**Status:** Approved for implementation planning
**Date:** 2026-04-19
**Author (brainstorm):** alegnadise@gmail.com + Claude
**Project context:** Restructure the BEE article numbering and URL scheme of `backend-engineering-essentials` to fix four user-acknowledged concerns: numbers don't cluster by category, the integer space has overflowed the original 20-unit-per-category convention, within-series numbering forces unrelated next articles to inherit weird numbers, and the project's "essentials" framing is mismatched with the now-deep deep-dive articles.

This is **NOT a documentation article**. This is a code + tooling + content-migration project. The implementation plan will be code-shaped (script + tests + config changes + bulk find/replace + bilingual file renames), not research-and-write-shaped.

---

## 1. Goals and Non-Goals

**Goals:**

- Replace integer-only BEE IDs with category-blocked integer IDs (every category gets a 1000-number block, AI Backend Patterns gets a 10000-number block).
- Replace URL-as-integer (`/596`) with semantic URL-as-category-and-slug (`/api-design/graphql-http-caching`).
- Preserve the "BEE-XXXX" identifier convention for cross-references and article H1s.
- Keep bilingual parity: every change applied identically to EN and zh-TW trees.
- Atomic migration: one commit transitions the whole repo.
- Backward-compat: old URLs (`/596`, `/205`, etc.) redirect to new URLs via HTML meta-refresh stubs (GitHub Pages constraint).

**Non-Goals:**

- Not modifying article content (titles, prose, schemas) beyond frontmatter.
- Not rewriting historical specs/plans in `docs/superpowers/`. They reference old IDs and stay as session-time-stamped artifacts.
- Not adding a tier hierarchy ("essentials" vs "deep-dives") to the categories. The category list itself stays flat. The "essentials" branding question is treated as content-level, addressed separately if needed.

---

## 2. Combined Scheme

| Layer | Rule | Example |
|---|---|---|
| Frontmatter `id` | Integer in category-allocated 1000-block (10000-block for AI Backend Patterns) | `id: 4010` |
| Frontmatter `slug` (NEW) | URL-safe English slug derived from title; required; unique within category | `slug: graphql-http-caching` |
| File location | `docs/{locale}/{category-slug}/{content-slug}.md` | `docs/en/api-design/graphql-http-caching.md` |
| URL | `/{category-slug}/{content-slug}` (EN) or `/zh-tw/{category-slug}/{content-slug}` (zh-TW) | `/api-design/graphql-http-caching` |
| Cross-reference | `[BEE-{id}]({relative-path-to-md})` — ID-first format | `[BEE-4010](../api-design/graphql-http-caching.md)` |
| H1 in article | `# [BEE-{id}] {title}` (unchanged convention) | `# [BEE-4010] GraphQL HTTP-Layer Caching` |

**Identity preservation:** "BEE-XXXX" remains the project's primary article identifier (in H1, References citations, cross-references). The integer ID now carries category meaning (1000s = Auth, 4000s = API Design, etc.).

**Bilingual:** zh-TW uses the **same** English slug for category folders and content slugs. URL paths are identical between locales except for the `/zh-tw/` prefix.

---

## 3. Block Allocation (Locked)

Listed in order of new block range. Source folders renamed to slug-cased category folders.

| Block range | New folder slug | Old folder name | Current count |
|---|---|---|---|
| 1–99 | `bee-overall` | `BEE Overall` | 3 |
| 1001–1999 | `auth` | `Authentication and Authorization` | 6 |
| 2001–2999 | `security-fundamentals` | `Security Fundamentals` | 21 |
| 3001–3999 | `networking-fundamentals` | `Networking Fundamentals` | 6 |
| 4001–4999 | `api-design` | `API Design and Communication Protocols` | 13 |
| 5001–5999 | `architecture-patterns` | `Architecture Patterns` | 9 |
| 6001–6999 | `data-storage` | `Data Storage and Database Fundamentals` + `Databases` (merged) | 7 + 1 = 8 |
| 7001–7999 | `data-modeling` | `Data Modeling and Schema Design` | 6 |
| 8001–8999 | `transactions` | `Transactions and Data Integrity` | 6 |
| 9001–9999 | `caching` | `Caching` | 6 |
| 10001–10999 | `messaging` | `Messaging and Event-Driven` | 8 |
| 11001–11999 | `concurrency` | `Concurrency and Async` | 6 |
| 12001–12999 | `resilience` | `Resilience and Reliability` | 7 |
| 13001–13999 | `performance-scalability` | `Performance and Scalability` | 6 |
| 14001–14999 | `observability` | `Observability` | 7 |
| 15001–15999 | `testing` | `Testing Strategies` | 7 |
| 16001–16999 | `cicd-devops` | `CI CD and DevOps` | 8 |
| 17001–17999 | `search` | `Search` | 9 |
| 18001–18999 | `multi-tenancy` | `Multi-Tenancy` | 6 |
| 19001–19999 | `distributed-systems` | `Distributed Systems` | 33 |
| 30001–39999 | `ai-backend-patterns` | `AI Backend Patterns` | 93 |

**Pedagogical order preservation:** Within each category block, existing articles are renumbered in their current `id` order (lowest current ID gets lowest new ID in block). So:

- BEE-70 (REST API Design Principles) → BEE-4001
- BEE-71 (API Versioning Strategies) → BEE-4002
- BEE-72 (Idempotency in APIs) → BEE-4003
- BEE-73 (Pagination Patterns) → BEE-4004
- BEE-74 (GraphQL vs REST vs gRPC) → BEE-4005
- BEE-75 (API Error Handling and Problem Details) → BEE-4006
- BEE-76 (Webhooks and Callback Patterns) → BEE-4007
- BEE-485 (GraphQL Federation) → BEE-4008
- BEE-498 (OpenAPI Specification and API-First Design) → BEE-4009
- BEE-596 (GraphQL HTTP-Layer Caching) → BEE-4010
- BEE-597 (GraphQL vs REST: Request-Side HTTP Trade-offs) → BEE-4011
- BEE-598 (GraphQL vs REST: Response-Side HTTP Trade-offs) → BEE-4012
- BEE-599 (GraphQL Operational Patterns) → BEE-4013

**Special handling — Databases folder:**

- `docs/{locale}/Databases/481.md` (Database Connection Proxy and Pooler Architecture) is the only file in the `Databases/` folder.
- It's merged into the `data-storage` block. New ID assigned in pedagogical position (after BEE-126 in the current Data Storage ordering — likely BEE-6007 or BEE-6008 depending on its semantic placement).
- `Databases/` folder deleted from the repo after migration.

**Forward extensibility:** new articles append to their category block. After BEE-4013 in API Design, the next article is BEE-4014. After the last AI Backend Patterns article (currently in 595 range, will be ~30093 after migration), the next is BEE-30094.

---

## 4. Slug Rules

**Content slug rules** (derived from English title):

- All-lowercase ASCII.
- Words separated by hyphens (`-`); no underscores or spaces.
- Drop articles (`a`, `an`, `the`) from the start; keep mid-slug only if they carry meaning.
- Drop punctuation (`,`, `:`, `'`, `"`, `?`, `!`, parentheses).
- Numerics preserved with hyphens (`HTTP/1.1` → `http-1-1`); editorial shortening to `http-versions` or similar permitted when unambiguous.
- Acronyms lowercased (`OAuth 2.0 and OpenID Connect` → `oauth-2-openid-connect` or shortened to `oauth-openid-connect`).
- **Stable**: once published, never rename. New article on the same topic gets a new slug.
- **Unique within category**: not required to be globally unique.

**Category folder slug rules** (locked list in §3):

- Same rules applied to category names.
- Locked list of 22 folder slugs in §3 above.

**Examples** (representative, full mapping in `migration/bee-id-mapping.json`):

| Title | Slug |
|---|---|
| GraphQL HTTP-Layer Caching | `graphql-http-caching` |
| HTTP Caching and Conditional Requests | `http-caching-conditional-requests` |
| Cache Invalidation Strategies | `cache-invalidation` |
| RBAC vs ABAC Access Control Models | `rbac-vs-abac` |
| OAuth 2.0 and OpenID Connect | `oauth-openid-connect` |
| Idempotency in APIs | `api-idempotency` |
| The N+1 Query Problem and Batch Loading | `n-plus-1-query-batching` |

**Bilingual slug handling:** zh-TW articles use the same English slugs. URLs become:
- EN: `/api-design/graphql-http-caching`
- zh-TW: `/zh-tw/api-design/graphql-http-caching`

---

## 5. Tooling Changes

### 5.1 VitePress rewrite rule (`docs/.vitepress/config/index.mjs`)

Current:
```js
rewrites: {
  'en/:path+/:page': ':page',
  'en/list.md': 'list.md',
  'en/faq.md': 'faq.md',
  'zh-tw/:path+/:page': 'zh-tw/:page',
}
```

New:
```js
rewrites: {
  'en/:category/:page': ':category/:page',
  'en/list.md': 'list.md',
  'en/faq.md': 'faq.md',
  'zh-tw/:category/:page': 'zh-tw/:category/:page',
}
```

The pattern uses `:category/:page` (single-segment category) instead of `:path+/:page` (multi-segment path). Category folders are flat by construction (locked list in §3), so single-segment matching is correct.

### 5.2 Sidebar generator (`docs/.vitepress/config/en.js` and `zh-tw.js`)

Current sidebar entry construction (line 63-73 of `en.js`):
```js
let title = `${data.id}.${data.title}` || file.replace('.md', '');
mdFileList.push({
  listItem: `- [${title}](${data.id})`,
  id: data.id,
});
result.push({
  text: title,
  link: `/${data.id}`,
});
```

New construction (uses `data.slug` and the category folder name from path):
```js
const categorySlug = path.basename(path.dirname(fullPath));
const articleSlug = data.slug;
const displayTitle = `BEE-${data.id} ${data.title}`;
mdFileList.push({
  listItem: `- [${displayTitle}](/${categorySlug}/${articleSlug})`,
  id: data.id,
});
result.push({
  text: displayTitle,
  link: `/${categorySlug}/${articleSlug}`,
});
```

The sidebar sort still uses `data.id` (integers; new category-blocked values naturally cluster by category when sorted ascending). The "Overall" pin-to-top special case stays.

The `placeholder` badge logic (line 60-62) is preserved.

### 5.3 Frontmatter schema (additive)

```yaml
---
id: 4010                              # NEW: integer in category-allocated block
title: "GraphQL HTTP-Layer Caching"
slug: graphql-http-caching            # NEW: required, unique within category
state: draft
---
```

The `id` field stays integer-typed; existing tooling already treats it that way. The new `slug` field is added.

If `slug` is missing on any article during build, the sidebar generator falls back to using a slugified version of the title and emits a console warning. This is a forgiving default for hand-written new articles, but the migration script populates `slug` on every article so the warning shouldn't fire after migration.

### 5.4 list.md auto-generation

`list.md` is auto-generated by the build. After migration, the file regenerates with:
- `BEE-{id}` prefix in the link text (was bare `{id}.{title}`)
- Semantic URL `/{category-slug}/{slug}` in the link target (was `/{id}`)

No manual edits needed; first build after migration produces the new format.

### 5.5 Cross-reference rewrite — bulk operation

Every existing inline link of the form `[BEE-{old_id}]({any-relative-path}/{old_id}.md)` (or just `({old_id})` if relative-path-omitted) gets rewritten to `[BEE-{new_id}](../{new-category-slug}/{new-slug}.md)`.

The migration script handles this via regex against every `.md` file under `docs/en/` and `docs/zh-tw/`, driven by the mapping table. Estimated link count: 600–800 inline cross-references across ~500 files.

Cross-references in spec/plan files under `docs/superpowers/` are **NOT** rewritten (per Goals/Non-Goals §1). A `docs/superpowers/MIGRATION-NOTE.md` documents this and points to the mapping table.

### 5.6 Backward-compat redirects (HTML meta-refresh stubs)

GitHub Pages doesn't support server-side redirects. The migration emits an HTML meta-refresh stub for every old BEE ID, written to the build output:

```html
<!-- dist/596/index.html -->
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=/backend-engineering-essentials/api-design/graphql-http-caching">
<link rel="canonical" href="/backend-engineering-essentials/api-design/graphql-http-caching">
<title>Redirecting to GraphQL HTTP-Layer Caching</title>
</head>
<body>
<p>This page has moved to <a href="/backend-engineering-essentials/api-design/graphql-http-caching">/api-design/graphql-http-caching</a>.</p>
</body>
</html>
```

Generated by a VitePress `buildEnd` hook (added in `docs/.vitepress/config/index.mjs`) that reads the mapping table and writes one stub per old ID. The stubs include the `/backend-engineering-essentials/` base path because the project is hosted at `alivedise.github.io/backend-engineering-essentials/`.

zh-TW old URLs (`/zh-tw/596`) get a parallel stub at `dist/zh-tw/596/index.html` redirecting to `/backend-engineering-essentials/zh-tw/api-design/graphql-http-caching`.

---

## 6. Migration Mechanics

### 6.1 Mapping table — `migration/bee-id-mapping.json`

Single source of truth for the migration. One entry per article (250 entries total):

```json
[
  {
    "old_id": 70,
    "new_id": 4001,
    "title": "REST API Design Principles",
    "old_path": "API Design and Communication Protocols/70.md",
    "new_path": "api-design/rest-api-design-principles.md",
    "slug": "rest-api-design-principles",
    "category_old": "API Design and Communication Protocols",
    "category_new": "api-design"
  },
  ...
]
```

**Generated** by step 2 of the migration script (deterministic from current frontmatter + the slug rules + the block allocation).

**Committed to the repo** at `migration/bee-id-mapping.json`. Retained as historical artifact; future cross-references in old documentation, blog posts, or external sources can be resolved against it.

### 6.2 Migration script — `scripts/migrate-bee-numbering.mjs`

Single Node.js script, runnable from the repo root with `node scripts/migrate-bee-numbering.mjs`.

**Steps:**

1. **Validate inputs.** Read all `.md` files under `docs/en/` and `docs/zh-tw/`. Confirm every article has `id`, `title`, `state` in frontmatter. Refuse to proceed if any article is missing required fields.
2. **Generate mapping table.** For each category folder (using §3 source-to-new-folder map), list articles in current `id` ascending order. Assign new IDs sequentially within the block. Compute slugs from titles using §4 rules. Build `migration/bee-id-mapping.json`.
3. **Pre-flight checks.**
   - Verify slug uniqueness within each category. Abort if duplicates found (script aborts and reports duplicates; user resolves manually by editing slug suggestions).
   - Verify `Databases/` folder contains only the expected single file (`481.md`). Abort if unexpected content.
   - Verify all old paths exist. Abort if any mapping entry's old path is missing.
4. **Rename files.** For each entry, `git mv {docs/en/{old_path}} {docs/en/{new_path}}`. Mirror for `docs/zh-tw/`. The `git mv` preserves history.
5. **Update frontmatter.** For each renamed file, parse frontmatter, update `id` to new value, add `slug` field, write back. Preserve other fields (title, state, anything else).
6. **Rewrite cross-references.** Regex pass over every `.md` file under `docs/en/` and `docs/zh-tw/` (NOT under `docs/superpowers/`). Replace inline links matching `\[BEE-(\d+)\](\(.*?(\d+)\.md\))` (or simpler integer-only `\(\d+\)`) using the mapping table.
7. **Update VitePress config.** Patch `docs/.vitepress/config/index.mjs` to use the new `:category/:page` rewrite rule. Patch `docs/.vitepress/config/en.js` and `zh-tw.js` sidebar generator per §5.2. Add the `buildEnd` hook for redirect stub generation per §5.6.
8. **Write `MIGRATION-NOTE.md`.** Create `docs/superpowers/MIGRATION-NOTE.md` explaining that historical specs/plans reference old BEE IDs and pointing to `migration/bee-id-mapping.json` for translation.
9. **Build validation.** Run `pnpm docs:build`. If the build fails, abort and revert (do not commit). Report the failure to the user.
10. **Verify output.**
    - Check `dist/` contains the expected new URL paths.
    - Spot-check that several redirect stubs exist (`dist/596/index.html`, `dist/205/index.html`, etc.) and contain the correct meta-refresh URLs.
    - Run `git status` and confirm: ~500 file renames (250 EN + 250 zh-TW), ~250 frontmatter modifications, ~600-800 cross-reference edits, config file edits, new mapping file, new MIGRATION-NOTE.md.
11. **Commit.** Single commit message:

    ```
    chore: restructure BEE numbering into category-blocks and semantic URLs

    Replaces integer-only BEE IDs with category-allocated 1000-blocks
    (AI Backend Patterns gets a 10000-block). Replaces URL-as-integer
    (/596) with semantic URL (/api-design/graphql-http-caching). Renames
    250 article files, updates frontmatter on each, rewrites 600+ inline
    cross-references, updates VitePress rewrite + sidebar generator, adds
    HTML meta-refresh redirects for all 250 old BEE URLs.

    Mapping table at migration/bee-id-mapping.json is the source of truth
    for old → new ID translation. Specs and plans under docs/superpowers/
    intentionally retain old BEE IDs as session-time-stamped artifacts;
    see docs/superpowers/MIGRATION-NOTE.md for the translation pointer.
    ```

### 6.3 Migration script: testing strategy

The script is the load-bearing piece of the migration. It needs unit tests:

- **Slug generation tests.** Given a title, assert the slug. Cover acronyms, punctuation, articles, numerics. Use a dozen representative titles from the catalog.
- **ID assignment tests.** Given a category and a list of current IDs, assert the new ID assignment preserves order and starts at the block start.
- **Mapping table generation test.** Given a fixture of fake articles, assert the generated mapping has the expected shape.
- **Cross-reference rewrite tests.** Given a fixture markdown string with `[BEE-X](Y.md)` inline links and a mapping table, assert the rewritten string has the new IDs and paths.
- **End-to-end dry-run mode.** Script supports `--dry-run` flag: generates the mapping, renames in a temp directory, runs build, reports what WOULD change without committing.

Tests live alongside the script: `scripts/migrate-bee-numbering.test.mjs`. Run with `node --test scripts/migrate-bee-numbering.test.mjs` (Node 20+ built-in test runner, matches the deploy.yml Node version).

---

## 7. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Migration script has bugs and corrupts files | Tests (§6.3), `--dry-run` mode, atomic git operation (commit only after build passes), git's own history as ultimate undo |
| Slug rules produce duplicates within a category | Pre-flight check (§6.2 step 3) aborts and asks user to edit slugs |
| Cross-reference regex misses some links | Post-migration grep for any remaining `\[BEE-\d+\]\(\d+\.md\)` patterns; manually resolve |
| Build fails after migration | Step 9 catches this; abort and revert |
| Old external links break | HTML meta-refresh stubs (§5.6) cover known old URLs; nothing to do for completely external content (e.g., academic papers citing specific URLs) |
| `id` collisions in new scheme (two articles assigned same new ID) | Mapping generation is deterministic and category-scoped; collision impossible by construction. Tests verify. |
| zh-TW divergence from EN (file name mismatch) | Migration script processes EN and zh-TW in lockstep using the same mapping; tests verify parity |
| Specs/plans under `docs/superpowers/` confuse readers with old IDs | `MIGRATION-NOTE.md` explains; mapping table provides translation |
| Users have bookmarks to old URLs | HTML meta-refresh stubs at every old `/{id}` and `/zh-tw/{id}` URL |
| Hosting redirect cost | None — GitHub Pages serves static HTML; meta-refresh stubs are free |

---

## 8. Open Items (Resolved)

| Item | Resolution |
|---|---|
| Databases folder | Merged into `data-storage` block (§3 special handling) |
| Specs/plans references | Left unchanged; `MIGRATION-NOTE.md` explains |
| Build validation | Mandatory; script aborts on build failure |
| Redirects format | HTML meta-refresh stubs (GitHub Pages constraint) |

---

## 9. Out of Scope (Explicitly Deferred)

- **"Essentials" vs "Deep Dives" tier system.** The category list stays flat; tier-based naming is a separate content-level decision if pursued.
- **Article content edits.** Migration only touches frontmatter and cross-reference syntax. Article body content (prose, code, diagrams) is not modified.
- **Specs/plans rewrites.** Historical brainstorm and plan files retain old IDs.
- **VitePress version upgrade or theme changes.** Migration patches the existing config minimally; no other changes to build pipeline.
- **Search index regeneration.** VitePress local search index regenerates automatically on next build; no special handling needed.
- **PWA cache invalidation.** Service worker will pick up new URLs on next user visit; no manual SW versioning required (the existing `@vite-pwa/vitepress` plugin handles this).
- **External link audit.** No attempt to find and notify external sites that link to old BEE URLs. The meta-refresh stubs handle in-bound traffic.

---

## 10. Implementation Plan Hand-off

This is a **code project**, not a documentation article. The writing-plans skill should produce a code-shaped implementation plan with:

1. **Pre-flight task:** read this spec; verify clean working tree; install dependencies; confirm `pnpm docs:build` works on current `main` baseline.
2. **Test-first tasks:** write the slug-generation tests, ID-assignment tests, mapping-generation tests, cross-reference-rewrite tests. Each task follows TDD shape (write failing test → run → implement → run → commit).
3. **Migration script tasks:** implement each script step (validate, generate mapping, pre-flight checks, rename, frontmatter update, cross-ref rewrite, config patches, MIGRATION-NOTE generation, build validation). One commit per coherent step.
4. **VitePress config patch tasks:** rewrite rule, sidebar generator, `buildEnd` hook for redirect stubs. Each as its own focused commit.
5. **Dry-run task:** run the full migration script in `--dry-run` mode against the live repo. Inspect output. Report findings to user before live run.
6. **Live migration task:** run the migration script. Verify the resulting commit. Push? (Wait for user confirmation before push.)
7. **Post-migration verification:** spot-check several articles in dev mode; spot-check a few redirect stubs; run `gstack` against a few new URLs and a few old URLs to confirm both work.

The plan should respect:
- Polish-documents skill is **NOT** invoked here (no article content drafted).
- Render-verification IS warranted for this migration (high stakes; URL routing changes; redirects need to actually work).
- TDD throughout for the script.
- Single migration commit + per-test/per-config-patch commits leading up to it.
