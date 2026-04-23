# REST vs GraphQL Versioning — Design Spec

**Date:** 2026-04-23
**Scope:** Add REST vs GraphQL versioning treatment to three existing BEE articles (EN + zh-TW).
**Target articles:** BEE-4002, BEE-4011, BEE-4005.

## Thesis

REST inherits a versioning affordance from HTTP — URL, headers, and content-type can all carry a version, and intermediaries can route, cache, and rate-limit per version without touching the application. GraphQL collapses traffic to one URL and must rebuild evolution inside the schema: additive changes, `@deprecated` for retirement, introspection for discovery, and — when that discipline isn't sufficient — calendar-versioned schema cuts (Shopify model) or calendar-gated breaking-change windows (GitHub model).

Each of the three target articles frames this thesis at a different altitude:

- **BEE-4002** (API Versioning Strategies) — GraphQL schema evolution as a peer to the four REST strategies.
- **BEE-4011** (Request-Side HTTP Trade-offs) — versioning as the fourth HTTP affordance GraphQL forfeits.
- **BEE-4005** (GraphQL vs REST vs gRPC) — three-way comparison row that also pulls gRPC/protobuf discipline into the picture.

## Non-goals

- No new articles. All changes are surgical edits to existing files.
- Not a how-to-migrate guide from versioned REST to versionless GraphQL — this spec only describes the discipline, not migration playbooks.
- Not touching BEE-4012 (response-side trade-offs); versioning is a request-side affordance.

## Research findings that shape the writing

1. **No Lee Byron blog post on versioning exists.** The "versionless" framing comes from GraphQL.org's Schema Design page, not a single-source Byron post. Do not attribute quotes to Byron.
2. **`@deprecated` in the October 2021 GraphQL spec is narrower than common lore.** The published spec allows `@deprecated` only on `FIELD_DEFINITION | ENUM_VALUE`. Argument and input-field deprecation exist in the working draft and in Apollo / graphql-js implementations but are NOT in the October 2021 edition. Callouts must be precise.
3. **GitHub GraphQL deprecation is quarterly, not ad-hoc.** Breaking changes take effect on Jan 1 / Apr 1 / Jul 1 / Oct 1, announced at least three months in advance. The "schema changelog" page is updated several times per month but removals are calendar-gated.
4. **Shopify Admin GraphQL** uses URL-path calendar versioning: `/admin/api/{version}/graphql.json`, stable for 12 months minimum, 9 months of overlap between consecutive versions, fall-forward to oldest supported stable on retirement.
5. **gRPC defers to protobuf** for schema evolution; grpc.io has no separate versioning policy. The canonical rules live in `protobuf.dev/programming-guides/proto3/#updating` and Google's AIP-180 / AIP-181.

## Per-article changes

### BEE-4002 — `docs/en/api-design/api-versioning-strategies.md` (+ zh-TW)

**Insertion point:** new H3 between "The Four Versioning Strategies" and "Stripe's Date-Based Versioning Model".

**New section: `### GraphQL: schema evolution instead of version bumps` (~500 words).**

Five subsections:

1. **Why GraphQL changes the question (~80 words).** `POST /graphql` has no URL segment to version and no verb to key off. The schema is the contract; evolving the contract means evolving the schema in place. Cite graphql.org/learn/schema-design/.

2. **The additive-only rule (~100 words).** Add fields and types freely — old clients ignore them. Never remove or rename without a deprecation cycle. Adding a non-null field to an input type is breaking (parallel to making an optional REST field required). Cite Apollo Principled GraphQL agility principles.

3. **The `@deprecated` directive (~120 words).** Exact syntax from October 2021 spec:

    ```graphql
    directive @deprecated(reason: String = "No longer supported")
      on FIELD_DEFINITION | ENUM_VALUE
    ```

    Callout box: argument and input-field deprecation exists in the working draft and in Apollo Server / graphql-js, but NOT in the October 2021 published edition. Introspection surface: `__Field.isDeprecated`, `__Field.deprecationReason`, `__Type.fields(includeDeprecated: false)`. SDL example:

    ```graphql
    type User {
      id: ID!
      phone: String @deprecated(reason: "Use contact.phone instead. Removed 2026-10-01.")
      contact: Contact!
    }
    ```

4. **When schema evolution isn't enough — calendar versioning (~150 words).**
   - Shopify Admin GraphQL: quarterly releases `2026-04` / `2026-07`; URL path `/admin/api/{version}/graphql.json`; 12-month support minimum; 9-month overlap; fall-forward after retirement.
   - GitHub GraphQL: single continuously-evolving schema BUT quarterly breaking-change windows (Jan 1 / Apr 1 / Jul 1 / Oct 1), announced ≥3 months in advance via public changelog.
   - Meta Graph API: versioned URL path `v25.0`, 2-year support per version.

5. **The rule in one line (~50 words).** Default: additive + `@deprecated`. Cut a calendar-named schema version when consumer base is too large for per-field coordination. Never: rename a field in place without deprecation.

**Decision-tree update.** The existing Mermaid decision tree under "Visual" is REST-only. Add a pre-branch: `Is this a GraphQL API?` → default to `schema evolution + @deprecated` → `too many consumers for coordinated deprecation?` → `calendar versioning (Shopify model)`. Keep the existing REST tree intact.

**Common Mistakes addition.** Add one new mistake entry: *"Treating GraphQL as 'versionless' and therefore skipping deprecation discipline"* — either relying on `@deprecated` without actually removing the field, or removing a field without a deprecation cycle.

**Related BEPs addition.** Add `[BEE-4005](graphql-vs-rest-vs-grpc.md)` and `[BEE-4011](graphql-vs-rest-request-side-http-trade-offs.md)`.

**References additions:**

- GraphQL Foundation. "Schema Design". https://graphql.org/learn/schema-design/
- GraphQL Foundation. "@deprecated directive". GraphQL Specification October 2021, §3.13.3. https://spec.graphql.org/October2021/#sec--deprecated
- GraphQL Foundation. "Field Deprecation". GraphQL Specification October 2021, §3.6.2. https://spec.graphql.org/October2021/#sec-Field-Deprecation
- Apollo. "Principled GraphQL — Agility". https://principledgraphql.com/agility
- Apollo. "Schema deprecations". Apollo GraphOS docs. https://www.apollographql.com/docs/graphos/schema-design/guides/deprecations
- Shopify. "About Shopify API versioning". https://shopify.dev/docs/api/usage/versioning
- GitHub. "Breaking changes". GitHub GraphQL API docs. https://docs.github.com/en/graphql/overview/breaking-changes
- GitHub. "Changelog". GitHub GraphQL API docs. https://docs.github.com/en/graphql/overview/changelog
- Giroux, M-A. "How Should We Version GraphQL APIs?". Production Ready GraphQL. https://productionreadygraphql.com/blog/2019-11-06-how-should-we-version-graphql-apis/

### BEE-4011 — `docs/en/api-design/graphql-vs-rest-request-side-http-trade-offs.md` (+ zh-TW)

Extend the "three gaps" frame to four.

**Header update.** `:::info` line: "three request-side gaps" → "four request-side gaps".

**Context enumeration.** Add a fourth numbered point:

> 4. **A URL-addressable version carrier.** REST's URL path, custom headers, and `Accept` media-type parameter are all reachable by HTTP intermediaries. A gateway can route `/v1/*` to one deployment and `/v2/*` to another; a CDN can key cache on `Accept: application/vnd.api.v2+json`; a rate limiter can apply different budgets per version. See [BEE-4002](api-versioning-strategies.md) for the four strategies. GraphQL's single `POST /graphql` endpoint erases every one of these carriers.

Update the closing paragraph of Context: "on all three axes" → "on all four axes"; extend the enumeration with a clause about the version signal sitting inside the request body where gateways cannot route on it.

**Principle section update.** Extend with one sentence: "Schema evolution SHOULD be additive with `@deprecated` for retirement; when the consumer base exceeds what coordinated deprecation can manage, a calendar-versioned schema cut (Shopify model) is the escape valve."

**Table update.** Rename heading `## The three gaps at a glance` → `## The four gaps at a glance`. Add row:

| Concern | REST inherits from HTTP | GraphQL must build it |
|---|---|---|
| **Versioning carrier** | URL path / header / `Accept` (BEE-4002) | Additive schema evolution + `@deprecated` + optional calendar-cut schema versions |

**New H2 `## Versioning and schema evolution` (~400 words).** Parallel shape to the other three gap sections:

- **REST baseline.** Any of the four strategies makes the version visible to HTTP intermediaries. Gateway can route per version; CDN caches per version; deprecation shows up in `Sunset`/`Deprecation` headers (RFC 8594) on a per-URL basis. Link to BEE-4002.
- **GraphQL gap.** `POST /graphql` flattens every version of every operation to one URL. Quote from graphql.org/learn/schema-design/: *"GraphQL takes a strong opinion on avoiding versioning by providing the tools for the continuous evolution of a GraphQL schema."*
- **Mitigation pattern 1 — additive-only + `@deprecated`.** Exact directive syntax from October 2021 spec. Callout: argument/input-field deprecation is in the working draft and Apollo/graphql-js but not in the October 2021 edition. Reuse the same SDL example as BEE-4002 (deprecated `phone` field pointing to `contact.phone`). Introspection behavior: `isDeprecated` + `deprecationReason` surface to tooling (GraphiQL, codegen, linters).
- **Mitigation pattern 2 — calendar-versioned schema cuts.** Shopify Admin: `/admin/api/2026-04/graphql.json`, 12-month support, 9-month overlap, fall-forward. GitHub: single schema, quarterly breaking-change windows announced ≥3 months ahead.
- **Recommendation.** Default additive + `@deprecated`. Lift to calendar versioning only when coordinated deprecation won't scale to the consumer base. Never remove a field in place without a deprecation cycle — the spec's Field Deprecation section (§3.6.2) explicitly keeps deprecated fields selectable.

**References additions:** same subset as BEE-4002 (Schema Design, spec §3.13.3, Shopify, GitHub breaking changes).

### BEE-4005 — `docs/en/api-design/graphql-vs-rest-vs-grpc.md` (+ zh-TW)

**Insertion point:** new H3 under Principle, between gRPC and WebSocket/SSE.

**New section: `### Versioning across the three protocols` (~200 words).**

Compact three-row table:

| Protocol | Primary mechanism | Breaking-change discipline | Enforcement |
|---|---|---|---|
| REST | URL path / header / `Accept` / date header (BEE-4002) | Per-version sunset window; `Sunset` + `Deprecation` headers (RFC 8594) | Per-URL at the gateway |
| GraphQL | Additive schema evolution + `@deprecated`; calendar cuts when needed (Shopify) | Deprecation shows in introspection; removal after overlap window | In schema + CI schema-diff (GraphQL Inspector, Apollo `rover graph check`) |
| gRPC / protobuf | `v1alpha1` / `v1beta1` / `v1` package suffixes (Google AIP-181); field numbers are the identity | Protobuf update rules: never change field numbers; use `reserved`; never retype in place | `buf breaking` (`WIRE` / `WIRE_JSON` / `PACKAGE` / `FILE`) |

**Paragraph (~150 words).** Frame the commonality — all three converge on additive-within-a-major-version — and the divergence: REST uses HTTP carriers (link to BEE-4002), GraphQL rebuilds evolution inside the schema (link to BEE-4011), gRPC/protobuf enforces field-number stability mechanically via tooling. Takeaway: "All three protocols make 'evolve additively, break only at a major boundary' the default; they differ in *where* the version signal lives and *how* violations are caught."

**References additions:**

- Google Protocol Buffers. "Updating A Message Type". https://protobuf.dev/programming-guides/proto3/#updating
- Google AIP-180. "Backwards compatibility". https://google.aip.dev/180
- Google AIP-181. "Stability levels". https://google.aip.dev/181
- Buf. "Breaking rules and categories". https://buf.build/docs/breaking/rules/

## Bilingual lockstep (zh-TW)

Every change duplicates into `docs/zh-tw/` with matching structure. zh-TW drafting must respect the user's banned-phrase list:

- No 「不是 X，而是 Y」 contrastive negation.
- No 「核心」/「核心洞見」/「關鍵」 importance-announcement preambles.
- No 破折號句型 cliff-run of补述/冗語.
- No unanchored 「很 X」 adjectives.
- No 「可以 X 可以 Y 可以 Z」 capability stacks.

The pending in-flight edit on `docs/zh-tw/api-design/graphql-vs-rest-request-side-http-trade-offs.md` (the "犧牲" wording fix already staged in the working tree) will ship as part of the BEE-4011 change, not as a separate commit.

## Cross-link pass

Each article's "Related BEPs" section gets forward and reverse links:

- BEE-4002 → BEE-4011, BEE-4005
- BEE-4011 → BEE-4002 (already present), BEE-4005
- BEE-4005 → BEE-4002 (add), BEE-4011

## Polish pass

Run `polish-documents` skill on all six modified files (EN + zh-TW for each of the three articles) before the final commit — per saved feedback memory on polish-before-commit.

## Commit shape

One commit per article, each covering EN + zh-TW:

1. `docs(bee-4002): add GraphQL schema evolution as a versioning path`
2. `docs(bee-4011): extend request-side HTTP trade-offs to four gaps`
3. `docs(bee-4005): add versioning comparison across REST/GraphQL/gRPC`

Cross-link touch-ups roll into each commit where the link is added.

## Out of scope

- BEE-4012 response-side trade-offs — versioning is request-side.
- Migration playbooks (how to move a live versioned REST API to versionless GraphQL) — separate article if ever.
- Federation-specific versioning (Apollo Federation composition keys) — tangential; BEE-4010/-4011 cover federation elsewhere.
- Schema-registry tooling deep dive (Apollo GraphOS checks, Hasura, Hive) — reference only, not primary content.

## Success criteria

- Each of the three EN articles has the new content at the specified insertion points.
- Each of the three zh-TW articles mirrors the EN structure and references.
- Every cited URL resolves (HTTP 200) at the time of commit.
- No style-banned phrases in zh-TW output.
- Cross-links form a closed triangle among BEE-4002 / BEE-4011 / BEE-4005.
- All three EN articles and all three zh-TW articles pass a final `polish-documents` run.
