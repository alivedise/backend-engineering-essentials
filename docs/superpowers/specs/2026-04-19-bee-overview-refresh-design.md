---
title: BEE Overview Refresh — Design
date: 2026-04-19
status: approved
---

# BEE Overview Refresh — Design

## Goal

Bring `bee-overall/` documents and the wider docs tree into alignment with the post-restructure state of the project. Three coordinated changes:

1. Strip 275 redundant horizontal-rule (`---`) lines that sit between headings in article bodies (mechanical cleanup, mirrored EN + zh-TW).
2. Rewrite the **Categories** section of `bee-overview.md` to match the new 1000-block-per-category numbering with semantic URLs, and refresh the **Context** prose to acknowledge the deep-dive expansion.
3. Fix stale links and terminology drift in `how-to-read-bee.md` and `glossary.md`.

All three ship as separate commits in the same session, EN + zh-TW lockstep, gated by `pnpm docs:build` passing.

## Change 1: Horizontal-rule cleanup

### Problem

275 mid-document `---` lines act as section dividers immediately above an H2/H3. The heading itself already provides visual separation in VitePress's rendered output, so the HR is pure noise. Counts are symmetric: 275 lines across 35 EN files, 275 across 35 zh-TW files.

### Operation

Delete every line whose trimmed contents equal `---` and whose position is **after** the file's frontmatter (i.e. after the second `---` from the top). Frontmatter delimiters themselves stay untouched.

### Constraints

- Skip the YAML frontmatter at the top of every file.
- Skip code fences. (HR-like lines inside ` ``` ` blocks are content, not markup.)
- Skip blockquotes. (None observed in current grep, but the script must guard against them.)
- Operate on `docs/en/` and `docs/zh-tw/` only. Skip `docs/superpowers/` (historical artifacts).
- Run as a one-off script committed to `scripts/cleanup-redundant-hrs.mjs` so the operation is reproducible and auditable, even though it is not expected to run a second time.

### Verification

- After running, `git diff --stat` should show ~70 files changed and ~550 deletions, no insertions.
- `pnpm docs:build` must succeed.
- Spot-check three rendered articles in dev mode to confirm no visual regression.

### Commit

Single commit, both locales:

```
chore: remove redundant horizontal-rule separators in article bodies

VitePress already renders visible section breaks at every H2/H3, so the
mid-document `---` lines were doubling the separator. 275 lines per
locale, removed mechanically by scripts/cleanup-redundant-hrs.mjs.
```

## Change 2: bee-overview.md refresh

### Problem

The current `## Categories` section lists 17 categories grouped into 4 layers, with numeric ranges in the legacy 0-379 space (20-unit blocks). After the 2026-04-19 restructure:

- 21 categories exist.
- Numbering is 1000-block per category, with AI Backend Patterns getting a 10000-wide mega-block (30001-39999).
- 4 categories are new since the original overview was written: Search, Multi-Tenancy, Distributed Systems, AI Backend Patterns.
- URLs are semantic (`/auth/oauth-openid-connect`) instead of numeric (`/1003`).

The intro prose also still calls BEE "essentials" without acknowledging that the AI Backend Patterns block (~95 articles) and series like GraphQL Federation are substantively deep-dives.

### New Categories table — prefix format

Replace the existing four tables with five new tables keyed on category prefix, one per layer:

```markdown
## Categories

### Foundation Layer (1xxx-4xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 1-99   | BEE Overall | `/bee-overall` | Purpose, glossary, meta |
| 1xxx   | Authentication & Authorization | `/auth` | Identity, access control, tokens, sessions |
| 2xxx   | Security Fundamentals | `/security-fundamentals` | OWASP, input validation, secrets, cryptography |
| 3xxx   | Networking Fundamentals | `/networking-fundamentals` | TCP/IP, DNS, HTTP, TLS, load balancing |
| 4xxx   | API Design & Communication Protocols | `/api-design` | REST, gRPC, GraphQL, versioning, pagination |

### Architecture & Data Layer (5xxx-8xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 5xxx   | Architecture Patterns | `/architecture-patterns` | Monolith, microservices, DDD, CQRS, hexagonal |
| 6xxx   | Data Storage & Database Fundamentals | `/data-storage` | SQL vs NoSQL, indexing, replication, sharding |
| 7xxx   | Data Modeling & Schema Design | `/data-modeling` | ER modeling, normalization, serialization |
| 8xxx   | Transactions & Data Integrity | `/transactions` | ACID, isolation levels, sagas, idempotency |

### Runtime Layer (9xxx-12xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 9xxx   | Caching | `/caching` | Invalidation, eviction, distributed cache, HTTP caching |
| 10xxx  | Messaging & Event-Driven | `/messaging` | Queues, pub/sub, delivery guarantees, event sourcing |
| 11xxx  | Concurrency & Async | `/concurrency` | Threads, locks, async I/O, worker pools |
| 12xxx  | Resilience & Reliability | `/resilience` | Circuit breakers, retries, timeouts, rate limiting |

### Engineering Practices Layer (13xxx-16xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 13xxx  | Performance & Scalability | `/performance-scalability` | Estimation, scaling, profiling, CDN |
| 14xxx  | Observability | `/observability` | Logs, metrics, traces, SLOs, alerting |
| 15xxx  | Testing Strategies | `/testing` | Test pyramid, integration, contract, load testing |
| 16xxx  | CI/CD & DevOps | `/cicd-devops` | CI, deployment strategies, IaC, feature flags |

### Specialized Domains (17xxx+)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 17xxx  | Search | `/search` | Inverted indexes, ranking, query parsing, vector search |
| 18xxx  | Multi-Tenancy | `/multi-tenancy` | Tenant isolation, noisy-neighbour, per-tenant limits |
| 19xxx  | Distributed Systems | `/distributed-systems` | Consensus, replication, partition tolerance, time |
| 30xxx  | AI Backend Patterns | `/ai-backend-patterns` | LLM serving, embeddings, RAG, ML pipelines, MLOps |

> **Why is AI Backend Patterns in the 30xxx block?** It is the only category with a 10000-wide allocation (30001-39999) instead of 1000-wide. The block reflects intentionally deeper coverage of AI-system patterns and reserves room for the topic to grow without colliding with future foundational categories.
```

### Notation note

A one-line callout explains the prefix shorthand:

> Each category occupies a 1000-id block; `1xxx` means BEE-1001 through BEE-1999. `BEE Overall` is an exception (1-99) because it predates the block scheme. `AI Backend Patterns` is a deliberate exception (30001-39999, 10000 wide).

This sits between the layer tables and the legend's first row.

### Context prose update

Replace the current second paragraph of `## Context`:

**Before:**

> Backend engineering spans a vast landscape — from authentication and networking to distributed systems and observability. Engineers often learn these concepts piecemeal, through scattered blog posts, tribal knowledge, or painful production incidents. BEE provides a structured, numbered set of principles that build a coherent mental model of backend engineering.

**After:**

> Backend engineering spans a wide surface area: authentication, networking, data, distributed systems, observability, and increasingly machine-learning workloads. Engineers learn these topics piecemeal, from blog posts, tribal knowledge, and production incidents. BEE collects them into a numbered, vendor-neutral catalogue with two depth levels: short essentials articles for the foundations, and longer deep-dive series (GraphQL HTTP-layer caching, AI backend patterns) where the topic warrants extended treatment.

Add a third paragraph immediately after, explaining the URL/numbering invariant:

> Article IDs cluster by category in 1000-id blocks (auth = 1xxx, security = 2xxx, …) and URLs are semantic slugs (`/auth/oauth-openid-connect`, not `/1003`). Old numeric URLs continue to resolve via redirect stubs.

### Cross-reference fixes inside bee-overview.md

- Line 26 currently reads `## How to Read BEPs`. Change to `## How to Read BEE Articles`.
- Bottom "Related BEPs" → "Related BEEs".
- Bottom links already point to `[BEE-2]` and `[BEE-3]` correctly; leave intact.

### zh-TW counterpart

Mirror every structural change in `docs/zh-tw/bee-overall/bee-overview.md`. Translation guidance:

- "Foundation Layer" → 「基礎層」 (already used)
- "Specialized Domains" → 「專門領域」
- "Why is AI Backend Patterns in the 30xxx block?" callout → translate verbatim with bilingual technical terms preserved
- Slug column stays in English (slugs are URL-stable)
- "Related BEEs" → 「相關 BEE」

### Polish

Run `polish-documents` skill on both refreshed files before the commit, per the saved feedback memory.

### Commit

Single commit, both locales:

```
docs(bee-overall): refresh BEE Overview to reflect 1000-block restructure

The Categories section listed the legacy 0-379 numbering across 17
categories grouped into 4 layers. Replace with prefix-based table
covering 21 categories across 5 layers (adding Specialized Domains
for Search, Multi-Tenancy, Distributed Systems, AI Backend Patterns).
Refresh the intro prose to acknowledge that BEE now spans both
essentials and deep-dive series.
```

## Change 3: Sibling document fixes

### how-to-read-bee.md

Issues:

- L59: `[BEE-2](bee-overview.md) BEE Overview` — should be `[BEE-1]`.
- L57: `## Related BEPs` → `## Related BEEs`.

### glossary.md

Issues:

- L66: `## Related BEPs` → `## Related BEEs`.
- L68: `[BEE-2](bee-overview.md) BEE Overview` — should be `[BEE-1]`.
- L69: `[BEE-2](how-to-read-bee.md) How to Read BEE` — already correct, leave intact (the file's id is 2).

### zh-TW counterparts

Same fixes mirrored in `docs/zh-tw/bee-overall/how-to-read-bee.md` and `docs/zh-tw/bee-overall/glossary.md`. Heading rename: 「相關 BEP」→「相關 BEE」 (none currently spell BEP in Chinese; check before renaming).

### Polish

Run `polish-documents` on each modified file before commit.

### Commit

Single commit, both locales, both files:

```
docs(bee-overall): fix stale BEE-1 links and unify BEE/BEP terminology

how-to-read-bee.md and glossary.md both linked to BEE Overview as
"BEE-2" (its real ID is 1). They also used "Related BEPs" inconsistent
with the project name. Fix both, EN + zh-TW.
```

## Out of scope

- Empty legacy folders (`docs/en/AI Backend Patterns/`, etc.) left behind by the restructure's `git mv`. Worth removing in a separate housekeeping pass, but unrelated to overview content.
- Renumbering existing articles. The 1000-block scheme is stable.
- Changes to article structure (the Context/Principle/Visual/Example/Common Mistakes/Related/References template). Out of scope.
- Glossary additions for new categories (Search, Multi-Tenancy, Distributed Systems, AI). Could be follow-up work; not part of this refresh.

## Verification checklist

- `pnpm docs:build` passes after each commit.
- Spot-check rendered `/bee-overview` in dev mode (EN + zh-TW): tables render, prefix notation reads naturally, slug column is monospace.
- Sidebar still shows alphabetised category names with no numeric prefix (preserved from previous session).
- Polish-documents reports no rule violations on the four modified files.
- HR cleanup script's diff is purely deletions (no whitespace shifts, no accidental code-fence damage).

## Risks

- **HR cleanup inside code fences.** A naive line-level deletion could strip ` --- ` lines that appear inside ` ```yaml ` or ` ```markdown ` blocks. The script must track fence state and skip lines inside them. The current 275-line count was produced without fence-tracking; the script must redo the count with fence tracking and the verification step must confirm the new count differs only if fence-tracking finds protected lines.
- **Bilingual drift.** If the EN and zh-TW HR counts diverge after fence tracking, the script must report the divergence and stop. Both locales must be processed in a single run with parity checked.
- **VitePress section anchors.** Removing the HR before a heading does not change the heading's slug or anchor. Existing in-prose links to `#section` anchors remain valid. No anchor rewrites required.

## Sequencing

1. Write `scripts/cleanup-redundant-hrs.mjs` with fence tracking.
2. Run, verify diff, commit (Change 1).
3. Edit `bee-overview.md` EN + zh-TW per Change 2; polish; build; commit.
4. Edit `how-to-read-bee.md` and `glossary.md` EN + zh-TW per Change 3; polish; build; commit.
5. Push the three commits together (or hold for explicit user gate, per session preference).
