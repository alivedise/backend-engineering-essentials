---
title: Caching Block Extension — Design
date: 2026-04-23
status: approved
---

# Caching Block Extension — Design

## Goal

Extend the `Caching/` category with ten articles (IDs 9007–9016) that close three practitioner gaps left by the current six-article block: read/write integration patterns as first-class topics, operational levers (TTL, keys, purge, tiered caches) that backend engineers hit daily, and hot-key plus admission policies that the existing "eviction" and "stampede" articles do not cover.

## Why this extension, why now

- The caching block currently has six articles (IDs 9001–9006) covering fundamentals/hierarchy, invalidation, eviction, distributed caching, stampede, and HTTP/conditional requests. The block stops at the fundamentals.
- Practitioners repeatedly hit the same operational questions: how to pick TTLs, how to design keys that do not blow up cache cardinality, how to purge with tags across a CDN, how to keep regions coherent, how to protect against hot keys that no eviction policy can save.
- Canonical sources are unusually strong for every topic chosen: Facebook memcached NSDI '13 for operational patterns at scale, RFC 9111 for the HTTP semantics, Vattani et al. VLDB 2015 for probabilistic early expiration, Einziger & Friedman ACM TWEB 2017 for TinyLFU, FIDO-style vendor engineering docs (Cloudflare, Fastly, AWS) for the edge/CDN angle.
- Scale matches established precedent: the passkeys series committed earlier today ships five articles with an umbrella spec; this extension is twice that size, using the same umbrella-spec pattern.
- Work happens in a dedicated worktree so other concurrent sessions (passkeys on `auth/`, any in-progress cleanup edits on `main`) do not collide.

## Scope

Ten articles, IDs **9007–9016**, caching block currently filled 9001–9006. Every EN file at `docs/en/Caching/<slug>.md` has a parallel zh-TW counterpart at `docs/zh-tw/Caching/<slug>.md` with identical frontmatter `id` and `slug`.

| New ID | Slug | Title (EN) | Angle |
|---|---|---|---|
| 9007 | `write-through-write-behind-write-around` | Write-Through, Write-Behind, and Write-Around Caching | integration |
| 9008 | `cache-aside-and-read-through-patterns` | Cache-Aside and Read-Through Patterns | integration |
| 9009 | `negative-caching` | Negative Caching | integration |
| 9010 | `ttl-selection-and-jitter` | TTL Selection, Jitter, and Probabilistic Early Expiration | operational |
| 9011 | `cache-key-design` | Cache Key Design | operational |
| 9012 | `multi-region-cache-coherence` | Multi-Region Cache Coherence | integration |
| 9013 | `purge-strategies-and-surrogate-keys` | Purge Strategies and Surrogate Keys | operational |
| 9014 | `tiered-caches-and-origin-shield` | Tiered Caches and Origin Shield | operational |
| 9015 | `admission-policies-and-tinylfu` | Admission Policies: TinyLFU and W-TinyLFU | probabilistic |
| 9016 | `hot-key-detection-and-mitigation` | Hot-Key Detection and Mitigation | probabilistic |

zh-TW titles are finalized during the per-article plan step by the drafting session.

## Article scopes

### BEE-9007 Write-Through, Write-Behind, and Write-Around Caching

Compare three write paths:
- Write-through: synchronous write to cache and store; strongest consistency, highest write latency.
- Write-behind (write-back): write to cache, asynchronous flush to store; lowest write latency, risk of durability loss on cache failure before flush.
- Write-around: write bypasses cache and goes to store; invalidate on write to avoid stale reads; read-miss storm possible after bulk writes.

Failure modes the article must cover: write-behind durability loss and batch-flush thundering herd, write-through latency amplification under store slowdown, write-around cold-read penalty. Include selection guidance by workload (read-heavy vs write-heavy, durability tolerance).

Sources: "Scaling Memcache at Facebook" (Nishtala et al., NSDI '13) §3 on leases and write handling, AWS ElastiCache best-practices doc, Redis persistence docs, Microsoft Azure Cache for Redis write-pattern guidance.

### BEE-9008 Cache-Aside and Read-Through Patterns

Where the cache-fill logic lives determines the failure envelope:
- Cache-aside (lookaside): application reads cache, on miss reads store and populates cache. Application owns correctness.
- Read-through: a cache library loads from store on miss transparently (Caffeine `CacheLoader`, Ehcache `CacheLoader`). Library owns correctness.

Consistency pitfalls: the classic read-then-write race (reader populates stale value after writer's invalidation), double-loading under concurrent misses, load-timeout semantics. When the transparent-loader tradeoff is worth it.

Sources: Caffeine project docs on `CacheLoader` and `LoadingCache`, AWS Builders' Library "Caching challenges and strategies," Phil Eaton "How to think about caching" writeup, Memcached `cas` operation docs.

### BEE-9009 Negative Caching

Why caching absences matters: DNS NXDOMAIN responses, 404s from databases, authz denials. Sizing the negative TTL is a correctness lever — too long produces stale "does not exist" replies after data is created, too short defeats the point under abuse. Abuse scenarios: cache-filling DoS via junk lookups, negative-cache poisoning.

Sources: RFC 2308 (DNS Negative Caching), RFC 8767 (Serving Stale Data), Akamai caching-404s docs, Varnish `beresp.ttl` on non-200 discussions.

### BEE-9010 TTL Selection, Jitter, and Probabilistic Early Expiration

Treat TTL as a correctness decision: it bounds the staleness window a reader can observe between store writes and cache invalidations. Jitter to avoid synchronized expiry (directly complements the existing stampede article at 9005). Probabilistic early expiration (XFetch) from Vattani et al. VLDB 2015 — recompute a fraction of requests before expiry proportional to compute cost, preventing the expire-coincidence stampede. Adaptive TTL based on object volatility (mutation frequency signals).

Sources: Vattani, Chierichetti, Lowenstein "Optimal Probabilistic Cache Stampede Prevention" (VLDB 2015), RFC 9111 §4.2 Freshness, DynamoDB DAX TTL semantics, Memcached `expiration` semantics.

### BEE-9011 Cache Key Design

Keys are the cache's contract. Covers:
- Canonicalization (normalize query-param order, strip tracking params, lowercase hosts).
- `Vary` header cardinality blowup (Vary: User-Agent is an anti-pattern).
- Tenant scoping for multi-tenant isolation.
- Versioned keys for zero-downtime schema changes (embed schema or deploy version).
- Hash collisions and key length tradeoffs.

Sources: RFC 9111 §2 (storing responses) and §4.1 (constructing cache keys), Fastly VCL `hash_data` docs, Cloudflare Cache Rules and cache-key customization docs, Varnish hashing docs.

### BEE-9012 Multi-Region Cache Coherence

When the cache layer is regional but the data layer is global (or vice versa). Invalidation fanout patterns: synchronous global purge, pub-sub invalidation stream, last-writer-wins with staleness budgets. Hybrid strategy: region-local caches with a global purge channel.

Sources: "Scaling Memcache at Facebook" §5 (Regions and replication), AWS DAX multi-region documentation, Cloudflare global purge architecture posts, Fastly global Surrogate-Key purge docs.

### BEE-9013 Purge Strategies and Surrogate Keys

Beyond single-URL purge:
- Tag-based purge via surrogate keys / cache tags: one tag purges many URLs.
- URL-based vs pattern-based purge.
- Soft purge (serve-stale-while-revalidate) to avoid origin stampede at purge time.
- Purge propagation delay — purges are eventually consistent across edges.

Sources: Fastly Surrogate-Key docs, Varnish `ban` and `purge` docs, Cloudflare Cache Tags docs, RFC 5861 (`stale-while-revalidate`, `stale-if-error`).

### BEE-9014 Tiered Caches and Origin Shield

L1 in-process cache → L2 remote cache → origin. Design choices: tier-specific TTL, eviction policy per tier, coalesce-on-shield to prevent a thundering herd hitting origin. Origin shield as a designated intermediary PoP that fronts all other PoPs.

Sources: Cloudflare Tiered Cache docs and Argo Smart Routing whitepaper, Fastly Shielding docs, Caffeine tiered-cache configurations, Ehcache tiered-storage documentation.

### BEE-9015 Admission Policies: TinyLFU and W-TinyLFU

Admission is the question eviction cannot answer: should this item ever enter the cache? TinyLFU maintains a frequency sketch (approximate counting Bloom filter) to decide, outperforming LRU on skewed workloads by 20%+. W-TinyLFU adds a small admission window to handle bursty newness.

Sources: Einziger, Manes, Friedman "TinyLFU: A Highly Efficient Cache Admission Policy" (ACM TWEB 2017), Ben Manes "Design of a Modern Cache" blog series, Caffeine project docs on admission policies, Caffeine source for `FrequencySketch` and `WindowTinyLfuPolicy`.

### BEE-9016 Hot-Key Detection and Mitigation

Detection: Count-Min Sketch for approximate frequency counting under bounded memory. Mitigation: key splaying (shard one logical key across N replicas), client-side local caches with short TTLs, request collapsing at the cache layer, write-combining for counters.

Sources: Cormode & Muthukrishnan "An Improved Data Stream Summary: The Count-Min Sketch and its Applications" (J. Algorithms 2005), Facebook memcached §3.2.2 (hot keys and replication), Redis Cluster hot-shard guidance, AWS Builders' Library "Caching challenges."

## Article independence and suggested drafting order

Articles are structurally independent — each can be drafted without the others landing first. Recommended order optimizes for cross-reference density and research-reuse:

1. **9011 Cache Key Design** — foundational; every other article references keys.
2. **9007 Write-Through/Behind/Around** — write-path integration.
3. **9008 Cache-Aside and Read-Through** — read-path integration.
4. **9009 Negative Caching** — integration corner case; short article.
5. **9010 TTL Selection and Jitter** — operational foundation; complements existing 9005 stampede article.
6. **9013 Purge Strategies** — operational.
7. **9014 Tiered Caches and Origin Shield** — operational.
8. **9012 Multi-Region Cache Coherence** — builds on 9010, 9013.
9. **9015 Admission Policies** — probabilistic; references existing 9003 eviction article.
10. **9016 Hot-Key Detection and Mitigation** — probabilistic; builds on 9010, 9015.

## Worktree mechanics

**Branch name:** `extend-caching-block`

**Worktree location:** `~/Projects/backend-engineering-essentials-caching/`

**Creation command (run from the primary repo):**
```
git worktree add ../backend-engineering-essentials-caching -b extend-caching-block
```

**Rebase cadence:** rebase `extend-caching-block` onto `origin/main` between articles so landings from concurrent sessions (passkeys on `auth/`, cleanup edits on `main`) merge cleanly. Conflicts on `scripts/lib/blocks.mjs` or other shared infrastructure files are resolved before the next article starts.

**Integration back to main:** the work lands as a PR or direct merge per the user's preference once all ten articles are in. No integration decision is required at spec time.

## Per-article workflow

For each article, in order:

1. **Write the plan.** `docs/superpowers/plans/plan-bee-<id>-<slug>.md` drafted via the writing-plans skill. Plan names canonical sources, key points, and the article outline.
2. **Research.** Pull the named canonical sources. Capture direct quotes and URLs for the References section. AI-internal-knowledge-only drafting is rejected.
3. **Draft EN.** `docs/en/Caching/<slug>.md` with full frontmatter (`id`, `title`, `state: draft`). Follow the BEE article template (Context, Principle, Visual, Example, Common Mistakes, Related BEEs, References).
4. **Draft zh-TW.** `docs/zh-tw/Caching/<slug>.md` parallel, identical frontmatter `id`, translated `title`, same structure and anchor content.
5. **Polish.** Run `polish-documents` skill on both files.
6. **Wire reverse links.** Add this article to the Related BEEs sections of adjacent caching articles where the relationship is substantive (not every pair). Forward-link from this article to 9001 (fundamentals) and to any specifically-referenced existing article.
7. **Commit sequence.** `docs(plan): plan for BEE-<id>` → `feat(bee-<id>): <title> (EN + zh-TW)` → optional `docs(bee-<id>): wire reverse links` if cross-file edits are substantial enough to separate.
8. **Verify.** `pnpm docs:build` green before starting the next article.

## Quality gates

- **Bilingual lockstep.** No EN commit lands without its zh-TW counterpart in the same feat commit.
- **Canonical sources only.** Every article's References section lists real, verified URLs anchored to specs, papers, or vendor engineering blogs. Broken or hallucinated URLs fail review.
- **Vendor neutrality.** Per `CLAUDE.md`, articles do not include company-specific internal URLs or product names as the canonical approach. Vendor documentation is acceptable as references and as clearly-attributed illustrative examples.
- **polish-documents applied.** Both EN and zh-TW files run through the polish-documents skill before the feat commit.
- **Build green.** `pnpm docs:build` passes at the end of each feat commit.
- **Sidebar.** Generated automatically from frontmatter; no manual sidebar edits.
- **No renumbering.** Existing IDs 9001–9006 are not renumbered. The new IDs start at 9007.

## Done criteria for the series

- Ten articles committed (EN + zh-TW, twenty files total).
- Reverse links wired from adjacent existing articles where substantive.
- `pnpm docs:build` green on the final commit.
- Branch rebased on latest `main`.
- Ready for PR creation or direct merge per user preference.

## Out of scope

- Bloom-filter-for-cache-existence-checks article. If written, belongs in a future probabilistic-data-structures article (likely in `distributed-systems/` or `data-modeling/`).
- Cache warming / priming article. The topic is narrow enough to fold into an existing article if ever needed.
- Any changes to the existing 9001–9006 articles beyond adding Related BEEs reverse links.
- Changes to `scripts/lib/blocks.mjs` or the block allocation infrastructure (caching block range 9001–9999 already has sufficient headroom).
- Any sidebar, theme, or build-config changes.

## Risks

- **Concurrent-session conflicts.** Mitigated by the dedicated worktree and rebase-between-articles cadence.
- **Research scope creep.** Mitigated by naming canonical sources per article in this spec; deviations require an updated plan doc.
- **zh-TW quality drift.** Mitigated by the polish-documents skill run on zh-TW before every feat commit, and by the bilingual-lockstep gate.
- **Over-long articles.** Mitigated by the strict per-article scope in §"Article scopes"; topics not listed for an article are either deferred or out of scope.
