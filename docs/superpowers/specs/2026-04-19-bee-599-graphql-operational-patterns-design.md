# Design Spec: BEE-599 — GraphQL Operational Patterns

**Status:** Approved for implementation planning
**Date:** 2026-04-19
**Author (brainstorm):** alegnadise@gmail.com + Claude
**Series context:** Article **C** (closing) of the four-article series on the HTTP-ecosystem gap in GraphQL.

| | Article | Status |
|---|---|---|
| A | BEE-596 GraphQL HTTP-Layer Caching | Shipped (commit `0bf8ea7`) |
| B-1 | BEE-597 GraphQL vs REST: Request-Side HTTP Trade-offs | Shipped (commit `22d1f3e`) |
| B-2 | BEE-598 GraphQL vs REST: Response-Side HTTP Trade-offs | Shipped (commit `0529036`) |
| **C** | **BEE-599 GraphQL Operational Patterns** (this spec) | Brainstormed |

This is the closing article. No further forward-references in the series after this.

---

## 1. Article Identity

| Field | Value |
|---|---|
| BEE number | 599 |
| Title (EN) | GraphQL Operational Patterns |
| Title (zh-TW) | GraphQL 營運模式 |
| Category | API Design and Communication Protocols |
| State | `draft` |
| EN file | `docs/en/API Design and Communication Protocols/599.md` |
| zh-TW file | `docs/zh-tw/API Design and Communication Protocols/599.md` |
| `:::info` tagline | "Three operational patterns that determine whether a GraphQL deployment survives production: persisted-query allowlisting as a security boundary, query complexity governance as an organizational discipline, and additive schema evolution as the GraphQL alternative to REST-style versioning. The closing article in the four-part series on GraphQL's HTTP-ecosystem gap." |
| Estimated length | 3,400–4,000 words EN |

Frontmatter shape:

```yaml
---
id: 599
title: "GraphQL Operational Patterns"
state: draft
---
```

---

## 2. Thesis

This article closes the four-part series on the HTTP-ecosystem gap in GraphQL. Where BEE-596 covered the caching mechanism and BEE-597/BEE-598 walked the request-side and response-side comparison, this article picks up the operational patterns those articles forward-referenced.

C is structurally different from B-1/B-2: it is **not** a REST-vs-GraphQL comparison. It is a patterns deep-dive on three GraphQL-specific operational disciplines:

1. **Persisted-query allowlisting** as a security and DoS boundary (forward-referenced from BEE-596 and BEE-597).
2. **Query complexity governance** as an organizational discipline (extends BEE-597's technical layer).
3. **Additive schema evolution** as the GraphQL alternative to the REST versioning strategies in BEE-71.

The article uses pattern-focused section structure: **Pattern statement → Why it exists → Implementation depth → Production lessons** per section, in place of B-1/B-2's REST-baseline/gap/mitigation/recommendation shape.

The schema-evolution section is **weighted heavier** (~1,500 words) than the other two (~900 words each) because the contrast with BEE-71's REST versioning model is genuinely novel content; the persisted-query and complexity sections build incrementally on already-shipped foundations.

---

## 3. Section-by-Section Content Plan

### 3.1 Context (~280 words)

Recap the series so far: BEE-596 established the caching mechanism; BEE-597 and BEE-598 walked through six request-side and response-side dimensions where REST inherits HTTP infrastructure and GraphQL must rebuild it. Each forward-referenced operational topics that this article picks up.

Then enumerate the three operational patterns:

1. **Persisted-query allowlisting** as a security and DoS boundary. BEE-596 introduced persisted queries as a *caching* mechanism — GET-addressable URLs the CDN can store. The same mechanism, run with stricter registration discipline, becomes a security mechanism: the server rejects any query whose hash is not in the allowlist, eliminating the attack surface where clients send arbitrary expensive queries. BEE-597 flagged this as a forward-reference; this article delivers it.

2. **Query complexity governance.** BEE-597 introduced the three layers of complexity defense (depth limit, complexity scoring, per-resolver limits). What was deferred is the *organizational* layer: who picks the budget, how it is reviewed when the schema changes, how cost annotations stay consistent across teams, and how budget violations get triaged in production. The technical layer is not the hard part; the governance is.

3. **Additive schema evolution.** GraphQL was designed around the premise that schemas evolve forever without version numbers. This is a sharp departure from the REST versioning strategies covered in BEE-71. The contrast is worth treating in depth: the rules that make additive evolution work (never remove, always deprecate first, nullability invariants), the `@deprecated` directive, federation contracts as consumer-segment-specific schema variants, and what to do when an unavoidable breaking change arrives.

Close: this is the closing reference for GraphQL operational discipline in the repo. Sections after it are out of scope for the four-article series.

### 3.2 Principle (one paragraph, RFC 2119 voice)

> Teams running GraphQL in production **MUST** establish three operational disciplines beyond the schema and resolver layer. Persisted-query allowlisting in build-time-registration mode **SHOULD** be the default for any client surface under the team's control; auto-register mode **MUST NOT** be treated as a security mechanism. Query complexity budgets **MUST** be set by measurement of the existing query catalog, reviewed when the schema changes, and enforced at the gateway with a documented exception process. Schema evolution **SHOULD** be additive — fields **MUST** be deprecated with the `@deprecated` directive before removal, **MUST** continue to resolve for the deprecation window, and **SHOULD** be removed only after measurable client uptake of the replacement field.

### 3.3 Body Section 1: Persisted-query allowlisting as a security boundary (~900 words)

Internal structure: Pattern statement (~80) → Why it exists (~200) → Implementation depth (~400) → V1 sequence diagram → Production lessons (~220).

**Pattern statement.** Maintain a build-time allowlist of every GraphQL operation the client surface is allowed to send. The server rejects any operation whose SHA-256 hash is not in the allowlist. The mechanism is identical to BEE-596's persisted queries; the difference is registration discipline — only operations registered at build/deploy time are accepted, and runtime auto-registration is disabled.

**Why it exists.** Two threats get neutralized simultaneously:

- **Arbitrary-query DoS.** Without an allowlist, the rate-limiting layers from BEE-597 (depth limit, complexity scoring) are the entire defense. A sufficiently clever attacker probes the cost-scoring rules and finds a query that just barely passes the budget but consumes maximum origin work. With an allowlist, the only queries the server resolves are ones the client team registered, which are by construction the queries the application actually needs.
- **Schema-introspection-based reconnaissance.** GraphQL's introspection lets any caller enumerate the entire schema. Combined with arbitrary-query execution, this gives an attacker a map of the system. Allowlisting (plus disabling introspection in production) closes that loop. BEE-499 (BOLA) is the adjacent concern at the per-object layer; allowlisting is the operation-shape layer.

**Implementation depth.**

- **Build-time registration flow.** The client repo emits a hash → query manifest at build time (Apollo's `apollo client:codegen`, GraphQL Code Generator's persisted-documents preset, Relay's persisted query support). The manifest is uploaded to the GraphQL server's allowlist store before deploy.
- **Server-side enforcement.** Apollo Server's persisted-queries plugin in `mode: "only"` rejects any unregistered hash with `PERSISTED_QUERY_NOT_FOUND` or a 4xx HTTP status (per BEE-598's GraphQL-over-HTTP mapping). GraphQL Yoga's persisted-operations plugin behaves similarly.
- **CI/CD integration.** Hash mismatches between client build and server allowlist must fail the deploy, not the runtime. The standard pattern: client publishes manifest to a registry (Apollo Studio, GraphOS, self-hosted) on every PR build; the server pulls the union of recent client manifests on startup.
- **Disabling auto-register in production.** Apollo's APQ has `mode: "auto"` (register-on-first-miss) and `mode: "only"` (reject unknown hashes). Production must use `mode: "only"`. Auto-register mode bypasses the security boundary; it is appropriate only in development.
- **Multi-client manifest union.** Multi-client deployments (web + mobile + partner) require manifest union from all client builds. The server allowlist is `union(web@v1.2, mobile@v1.1, partner@v0.9)`. When a client version is sunset, its manifest entries can be pruned.
- **Disabling introspection in production.** Independent but adjacent: production servers should reject introspection queries (`__schema`, `__type`) unless the client carries an admin token. Apollo Server: `introspection: false`. graphql-armor: `useIntrospectionPlugin({ enabled: false })`.

V1 sequence diagram (see §3.6).

**Production lessons.**

- **The first incident is an unregistered query.** A client team adds a new query in a hot fix and forgets to publish the manifest. Production rejects it. This is the system working correctly, but the fix path must be fast: a one-command manifest upload, not a full deploy cycle.
- **The exception process matters.** Internal admin tools, ad-hoc data exports, support engineers running diagnostic queries — all need to bypass the allowlist. Pattern: a separate authenticated endpoint (`/graphql/admin`) that allows arbitrary queries for users with an admin role, scoped logged.
- **Manifest growth is bounded by client diversity, not user count.** Each client build adds N persisted queries (the operations in that client). The allowlist size scales with `clients × operations_per_client`, not with traffic. A typical web app has 50–200 operations; mobile adds another similar set; the allowlist is well within memory.
- **Observability tie-in.** Reject responses must be logged with operation hash and client version; this is the trail for debugging "my query stopped working after I refactored." BEE-598's `extensions.code` should carry `PERSISTED_QUERY_NOT_FOUND` on rejection.

### 3.4 Body Section 2: Query complexity governance (~900 words)

Internal structure: Pattern statement (~80) → Why it exists (~150) → Implementation depth (~400) → V2 feedback loop diagram → Production lessons (~270).

**Pattern statement.** Treat query complexity as an organizational discipline, not a server config. The technical defense (BEE-597 Layer 2 — schema-directive cost annotations, parser-time scoring, per-IP cost-budget enforcement) only works if the cost annotations match real resolver work, the budget reflects measured legitimate traffic, and the policy gets reviewed when the schema or the client surface changes.

**Why it exists.** Three failure modes appear when complexity is treated as a one-time configuration:

- **Cost annotations drift from real resolver work.** A schema field is annotated `@cost(complexity: 1)` when first written; six months later, its resolver fans out to a slow downstream and the real cost is 100. Nothing in the cost-scoring layer catches this — it scores against the annotation, not the actual work.
- **Budget set once, never re-measured.** The 99th percentile of legitimate query cost shifts as the schema and client behavior evolve. A budget set at deploy-1 admits queries at month-12 that should be rejected, or rejects queries that should be admitted.
- **No exception process for legitimate expensive queries.** Internal dashboards, batch reports, admin tooling — all may legitimately exceed the per-IP budget. Without a documented exception process, teams either suppress the rate limiter selectively (silently weakening it for everyone) or block legitimate work.

**Implementation depth.**

- **Cost-annotation review checklist.** When a schema PR adds or modifies a field with `@cost`, reviewers must check: does the annotation match the real resolver complexity? Is `multipliers` set correctly for list-returning fields? Is the cost in the same scale as adjacent fields? Maintain a living rubric of known-cost ranges (`db.findById = 1`, `db.search = 5`, `external API call = 20`).
- **Budget tuning as a quarterly exercise.** Every quarter (or after major schema or client release), re-run the cost analyzer over the previous N days of production query logs. Recompute the 99th percentile of legitimate cost-per-window per user/IP. Adjust the budget. Document the change in a changelog so on-call engineers know why thresholds moved.
- **Per-actor budget classes.** A single global budget rarely fits all clients. The standard pattern is budget classes — anonymous IP gets 1,000 cost units/min; authenticated user gets 10,000; service account gets 100,000; admin token gets unlimited. The class is selected by the gateway before cost evaluation.
- **Exception process.** When an internal team needs a high-cost query (a cron-job report, an admin dashboard refresh), the request goes through a documented path: file a ticket with the query, the expected frequency, and the resolver work it triggers; on approval, the query gets registered as a persisted query with a budget exemption tag; the gateway recognizes the tag and skips the cost limit.
- **Cost-budget violations as alerts, not silent rejections.** A `429` returned because a legitimate user hit the budget should produce a warning-level alert in the team's monitoring channel; a sustained pattern of 429s for the same operation indicates either the budget is too tight or the operation is genuinely too expensive. BEE-598's observability layer (operation-name tagging) is what makes this triage possible.

V2 feedback loop diagram (see §3.6).

**Production lessons.**

- **The cost rubric is the document, not the directives.** Schema authors copy `@cost(complexity: 5)` from an adjacent field without thinking about whether 5 is the right number. A written cost rubric ("database point-read = 1; database scan = 5; external HTTP call = 20; ML inference = 100") gives reviewers a baseline to compare against. Without it, costs converge to whatever the most recent author guessed.
- **Cost regression tests in CI.** Add a test: parse representative production queries against the current schema, sum their costs, and assert each one stays under a threshold. A schema change that triples a query's cost surfaces in CI rather than as a 429 storm in production.
- **The budget class boundary is the auth boundary.** Selecting which budget applies depends on identity, which depends on the auth layer (BEE-598's authorization granularity discussion). An unauthenticated user cannot have a per-user budget; only a per-IP budget. This couples the rate limiter to the auth layer; teams that build the limiter first and the auth integration second end up with two systems that disagree on identity.
- **GitHub's public model as a worked example.** GitHub's GraphQL API (cited in BEE-597 references) publishes its cost formula and 5,000-points-per-hour budget. The fact that they can publish it at all is a sign the discipline is mature: the rules are stable enough to document, the budget is large enough to accommodate the legitimate range, and the formula is simple enough to reason about.

### 3.5 Body Section 3: Additive schema evolution (~1,500 words — heaviest section)

Internal structure: Pattern statement (~100) → Why it exists (~250) → Implementation depth (~700) → V3 timeline comparison → Production lessons (~450).

**Pattern statement.** GraphQL schemas evolve forever. Fields are added freely, deprecated when superseded, and removed only after measurable client uptake of the replacement. The schema does not carry a version number; the client's selected fields carry the implicit version. This is the GraphQL alternative to the REST versioning strategies in BEE-71, and the contrast matters: REST versioning is about navigating breaking changes safely; GraphQL versioning is about not having breaking changes in the first place.

**Why it exists.** Three properties of GraphQL make additive evolution the natural model:

1. **Clients select what they consume.** A REST endpoint returns a fixed shape; adding a field changes every client's payload. A GraphQL field is invisible to clients that do not select it. Adding a new field is non-breaking by definition.
2. **The server enforces the schema; clients enforce their query against it.** Removing a field that no client selects is non-breaking. The schema registry can answer the question "is this removal safe?" by checking the operation manifest of every active client.
3. **Federation makes per-team evolution independent.** A subgraph can add fields to a federated type without coordinating with the gateway team or other subgraphs (BEE-485 covers federation mechanics).

The contrast with REST: BEE-71 documents four versioning strategies (URL path, custom header, query param, content negotiation) and Stripe's date-based model. All of them are mechanisms to *manage* breaking changes — to give consumers a stable surface during a transition window. GraphQL flips the question: instead of managing breaking changes, design them out. The cost is discipline (additive only, deprecate before remove) and infrastructure (schema registry, operation manifests). The benefit is no consumer-facing version negotiation, no `Sunset` header, no `/v1/` and `/v2/` running in parallel.

This is genuinely different. It is not "REST versioning, but better"; it is a different category of solution to the same underlying problem of safe API evolution.

**Implementation depth.**

**Additive evolution rules.**

| Change | Status | Mechanism |
|---|---|---|
| Add a field | Non-breaking | Just add it |
| Add an enum value | Breaking-ish | Clients with exhaustive switches break; treat as breaking for strongly-typed clients |
| Add an optional argument | Non-breaking | Default value in resolver |
| Add a required argument | Breaking | Always — same problem as REST required-field-add |
| Remove a field | Breaking | Use deprecation cycle (below) |
| Rename a field | Breaking | Add new field, deprecate old, remove on cycle |
| Change a field's type | Breaking | Add new field with new type, deprecate old |
| Change nullability `T!` → `T` | Non-breaking on wire | Strongly-typed clients with non-null assumptions may NPE — treat as breaking for them |
| Change nullability `T` → `T!` | Breaking | Server now refuses to return null; partial-success behavior changes |

The `T!` ↔ `T` rules are the most subtle. The wire format does not change for adding nullability (`T!` → `T`) — a client receiving a value still gets a value. But strongly-typed clients (TypeScript, Kotlin, Swift) generate code that assumes non-null and will break at runtime when null arrives. Treat nullability changes as breaking for any consumer with type generation.

**The `@deprecated` directive.**

```graphql
type User {
  id: ID!
  name: String! @deprecated(reason: "Use `givenName` and `familyName` instead. Removal scheduled for 2026-12-31.")
  givenName: String!
  familyName: String!
}
```

The deprecation is visible in introspection (`__type` returns `isDeprecated: true` and `deprecationReason`). Schema explorers (Apollo Studio, GraphiQL, Insomnia) render deprecated fields in red. Codegen tools emit deprecation warnings on use.

**Deprecation policy.**

- The `reason` field MUST name the replacement and the planned removal date.
- The deprecation window MUST cover the slowest-updating client. For mobile apps with monthly release cycles and 90-day adoption tails, the window is at least 6 months.
- The schema registry MUST track which clients still select the deprecated field. Removal proceeds only when usage drops below a threshold (commonly 1% of operations).
- For federated graphs, the deprecation lives in the owning subgraph; the router surfaces it to all consumers.

**Federation contracts as consumer segmentation.**

Federation contracts (BEE-485) let a single supergraph project multiple consumer-specific schema variants. A contract filters the supergraph by tag — `@tag(name: "mobile")`, `@tag(name: "partner")` — producing a schema variant that includes only fields tagged for that consumer.

```graphql
type User {
  id: ID! @tag(name: "mobile") @tag(name: "partner")
  name: String! @tag(name: "mobile") @tag(name: "partner")
  internalAuditNotes: String @tag(name: "internal")  # not in mobile or partner schemas
}
```

The mobile contract emits a schema with `id` and `name` only; the partner contract similar; the internal contract includes `internalAuditNotes`. Each consumer sees the schema variant appropriate to it. Contracts are an alternative to URL-path versioning for large, multi-audience APIs — instead of `/v1/` and `/v2/`, you have `mobile.example.com/graphql` and `partner.example.com/graphql` serving different schema views of the same underlying graph.

**The unavoidable breaking change escape hatch.**

Sometimes additive evolution is impossible — security forces removal of a field that exposes sensitive data; a regulatory change requires a type change. The escape hatch is the same one REST uses, applied per-operation rather than per-API:

- Mark the operation deprecated on the registry.
- Notify clients via the deprecation channel (changelog, dashboard, email).
- After the deprecation window, the persisted-query allowlist drops the operation and the server rejects it with `OPERATION_DEPRECATED`.

This works because the persisted-query allowlist gives the server precise knowledge of which operations are in flight. REST's URL-pattern versioning is coarser; persisted-query-aware GraphQL deprecation can be per-operation.

V3 timeline comparison (see §3.6).

**Production lessons.**

- **The `@deprecated` directive without a registry is performative.** Deprecating a field gives schema explorers a warning, but if no system tracks who still uses the field, removal becomes a guessing game. Build (or buy) a schema registry that records every operation hash, the fields it selects, and the client that registered it. Apollo Studio, GraphOS, WunderGraph Cosmo, and self-hosted alternatives like Hive all do this. The registry is not optional infrastructure; it is the inverse of REST's `Sunset` header — instead of telling clients "this version is going away," you ask the registry "who is using this field?"
- **Backward-compatibility tests in CI.** When a schema change is proposed, the registry runs every persisted operation (or every operation observed in the last N days) against the proposed schema. Any operation that fails to validate is a breaking change. The tool exists in every federation registry (`rover subgraph check`, `wgc subgraph check`, `hive schema:check`); use it as a CI gate, not an afterthought.
- **Federation contracts replace per-version maintenance.** Teams running multiple consumer versions in REST (`/v1/`, `/v2/`, `/v3/`) typically have parallel codebases for each. Federation contracts let one schema project all variants — the v1 mobile schema is a tagged subset of the same supergraph as the v2 web schema. The cost is up-front discipline in tagging; the benefit is no parallel codebases.
- **Deprecation removal is the hard part, not deprecation itself.** Adding `@deprecated` is easy and gets done. Removing the deprecated field is the discipline — it requires ongoing measurement of usage, follow-up with low-priority clients, and willingness to break a long-tail of stragglers. Without organizational commitment to actually completing removals, the schema accumulates dead fields, and the deprecation directive becomes a wishlist instead of a contract.
- **Field renames are the most tempting non-additive change.** A field name that turns out to be confusing is a constant temptation to rename. The additive path (`add givenName`, `deprecate name`, `wait`, `remove name`) is slow and feels bureaucratic. Teams that bypass it for "just this one rename" build the habit of bypassing it for the next one. The discipline is to never bypass; rename always runs through the deprecation cycle.
- **Cross-link to BEE-71 in the article.** REST teams reading this section should understand that GraphQL's evolution model does not eliminate versioning concerns — it relocates them from URL-level versioning to field-level deprecation tracking. The questions are still "when can we remove this?" and "who is still using it?"; the mechanisms are different.

### 3.6 Visual

Three diagrams, one per body section:

**V1 — Persisted-query allowlisting flow.**

```mermaid
sequenceDiagram
    participant CR as Client repo
    participant SR as Schema registry
    participant GS as GraphQL server
    participant C as Client (production)

    Note over CR,GS: Build-time registration (per client deploy)
    CR->>CR: Build emits operation manifest<br/>(hash → query text)
    CR->>SR: Publish manifest<br/>(client=web, version=v1.2)
    SR->>GS: Allowlist sync<br/>(union of all active client manifests)

    Note over C,GS: Request-time enforcement
    C->>GS: GET /graphql?id=hash&variables=...
    alt hash in allowlist
        GS->>GS: Resolve operation
        GS-->>C: 200 + data
    else hash not in allowlist
        GS-->>C: 4xx + extensions.code: PERSISTED_QUERY_NOT_FOUND
        Note over GS: Logged with client identity for triage
    end
```

**V2 — Cost governance feedback loop.**

```mermaid
flowchart LR
    A[Schema author<br/>adds @cost annotation]
    B[Code review checks<br/>against cost rubric]
    C[Production query log<br/>per-operation cost histogram]
    D[Quarterly review:<br/>recompute 99th percentile<br/>of legitimate cost]
    E[Adjust budget<br/>document in changelog]
    F[Cost regression tests<br/>in CI]

    A --> B
    B --> F
    F --> C
    C --> D
    D --> E
    E --> A
```

**V3 — REST versioning vs GraphQL evolution timeline.**

```mermaid
flowchart TB
    subgraph REST["REST versioning timeline (BEE-71)"]
        direction LR
        R0[t=0<br/>v1 stable<br/>name field] --> R1[t=1<br/>v2 ships<br/>v1 + v2 in parallel<br/>Sunset header on v1]
        R1 --> R2[t=2<br/>v1 deprecated<br/>migration guide published]
        R2 --> R3[t=3<br/>Sunset date passes<br/>v1 returns 410 Gone]
    end

    subgraph GQL["GraphQL additive evolution timeline"]
        direction LR
        G0[t=0<br/>name field stable] --> G1[t=1<br/>givenName, familyName added<br/>name @deprecated<br/>both resolve in parallel]
        G1 --> G2[t=2<br/>Registry tracks name usage<br/>clients migrate]
        G2 --> G3[t=3<br/>name usage near zero<br/>field removed from schema<br/>persisted-query allowlist drops it]
    end
```

### 3.7 No separate `## Example` section

Same deliberate departure as B-1/B-2. SDL snippets in §3.5 (the `@deprecated` directive example, the federation `@tag` example, the additive-rules table) and the wire-format snippets in §3.3/§3.4 carry the example load.

### 3.8 Common Mistakes (5 items)

1. **Treating persisted-query auto-register as a security mechanism.** APQ in Apollo's `mode: "auto"` accepts any query the client sends on the registration round-trip. Production must use `mode: "only"`. The first sign this is wrong: a security audit asks "how do you prevent arbitrary queries?" and the answer is "we have persisted queries" without mentioning the mode.

2. **Disabling introspection without disabling auto-register.** A common partial fix: production rejects `__schema` introspection but still accepts any query the client sends. The attacker cannot enumerate the schema directly, but they can probe by sending guessed queries; auto-register accepts them. Both controls are necessary; either alone is leaky. BEE-499 (BOLA) is the per-object analog of this layered-defense argument.

3. **Setting a query complexity budget once and never re-measuring.** A budget set at deploy-1 admits queries at month-12 that should be rejected. Schedule a quarterly recomputation of the 99th percentile of legitimate cost-per-window from production logs; document the change in a changelog. The budget is not a constant; it is a calibrated value with a half-life.

4. **Adding `@deprecated` and never removing the field.** Deprecation is the easy half. Removing the field is the discipline — it requires registry-tracked usage measurement, follow-up with low-priority clients, and willingness to break a long-tail of stragglers. Without organizational commitment to actually completing removals, the schema accumulates dead fields.

5. **Renaming a field as "just one quick change" outside the deprecation cycle.** The additive path (add new, deprecate old, wait, remove old) feels bureaucratic; bypassing it once builds the habit of bypassing it always. Rename always runs through the deprecation cycle. The cost of the discipline is paid once per rename; the cost of bypassing accumulates as silent client breakage.

### 3.9 Related BEPs

**Persisted-query allowlisting cluster:**

- [BEE-596](596.md) GraphQL HTTP-Layer Caching — introduced persisted queries as a caching mechanism; this article uses the same primitive for security
- [BEE-597](597.md) GraphQL vs REST: Request-Side HTTP Trade-offs — Layer 1/2/3 rate-limiting; allowlisting can replace Layers 1 and 2 for controlled-client APIs
- [BEE-598](598.md) GraphQL vs REST: Response-Side HTTP Trade-offs — `extensions.code` conventions; `PERSISTED_QUERY_NOT_FOUND` follows that pattern
- [BEE-499](../Security Fundamentals/499.md) Broken Object Level Authorization (BOLA) — adjacent layered-defense argument
- [BEE-488](../Security Fundamentals/488.md) OWASP API Security Top 10 — context for API-layer threats

**Query complexity governance cluster:**

- [BEE-597](597.md) GraphQL vs REST: Request-Side HTTP Trade-offs — Layer 2 schema-directive cost annotations and parser-time scoring; this article extends with the organizational layer
- [BEE-266](../Resilience and Reliability/266.md) Rate Limiting and Throttling — token bucket and sliding window algorithms underlying budget enforcement
- [BEE-449](../Distributed Systems/449.md) Distributed Rate Limiting Algorithms — distributed budget enforcement concerns

**Schema evolution cluster:**

- [BEE-71](71.md) API Versioning Strategies — REST baseline this section explicitly contrasts with
- [BEE-485](485.md) GraphQL Federation — federation contracts as consumer-segment schema variants
- [BEE-142](../Data Modeling and Schema Design/142.md) Schema Evolution and Backward Compatibility — general schema-evolution principles applicable to GraphQL
- [BEE-75](75.md) API Error Handling and Problem Details — referenced for error-contract evolution discipline

**Series closure:**

- [BEE-596](596.md), [BEE-597](597.md), [BEE-598](598.md) — the three sibling articles in the series this article closes

### 3.10 References — research plan

Reused from BEE-596/597/598 research (no re-fetch needed):

| URL | Source for |
|---|---|
| https://spec.graphql.org/October2021/ | GraphQL spec, including `@deprecated` directive |
| https://github.com/graphql/graphql-over-http | Status code mapping for rejection responses |
| https://www.apollographql.com/docs/apollo-server/performance/apq | APQ protocol; `mode: only` vs `mode: auto` |
| https://github.com/Escape-Technologies/graphql-armor | Multi-server middleware including introspection-disable |
| https://www.apollographql.com/docs/apollo-server/data/errors | `extensions.code` defaults including `PERSISTED_QUERY_NOT_FOUND` |
| https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api | Public cost-budget reference |

Newly required URLs (verify in Task 2 of the implementation plan):

1. **GraphQL `@deprecated` directive specification.** Locate the precise spec section (likely https://spec.graphql.org/October2021/#sec--deprecated). Capture: applies to fields and enum values, requires `reason: String` argument, surfaces in introspection.
2. **Apollo Server persisted queries — `mode: only` configuration.** Find current docs URL under apollographql.com/docs/. Confirm the modes available and the security recommendation.
3. **GraphQL Code Generator persisted-documents preset.** https://the-guild.dev/graphql/codegen/ or the dedicated preset URL. Confirm that build-time hash manifest emission is a first-class workflow.
4. **Federation contracts and `@tag` directive.** https://www.apollographql.com/docs/graphos/platform/schema-management/delivery/contracts or current canonical location. Capture the tagging mechanism and the contract variant model.
5. **WunderGraph Cosmo schema check / Hive schema:check.** Non-Apollo schema-registry alternatives that perform breaking-change detection. Capture at least one current docs URL for each.
6. **Apollo `rover subgraph check` documentation.** The CI command for breaking-change detection in federation. Confirm the workflow.
7. **GraphQL.org "Versioning" or "Best Practices" page.** https://graphql.org/learn/best-practices/ — captures the GraphQL Foundation's stated position on versioning. If sparse, cite the spec's `@deprecated` definition instead.
8. **One neutral practitioner article on GraphQL schema evolution at scale.** Search candidates: GitHub Engineering on their public schema, Shopify's schema governance, Netflix DGS team's posts. Drop if no strong source found.
9. **Apollo introspection disable / production hardening guide.** Find current canonical URL. Confirm: production servers should disable introspection; the configuration to do so.

Vendor-neutrality note: Apollo cited as one implementation alongside GraphQL Yoga, Mercurius, graphql-armor, WunderGraph Cosmo, Hive. Same standard as BEE-596–598.

---

## 4. Bilingual Production Notes

- EN written first, then zh-TW as a parallel translation.
- **Style constraints (zh-TW), per `~/.claude/CLAUDE.md`:** no contrastive negation (「不是 X，而是 Y」), no empty contrast, no precision-puffery (「說得很清楚」, 「(動詞)得很精確」), no em-dash chains stringing filler clauses (「——」), no undefined adjectives, no undefined verbs without subject/range, no `可以X可以Y可以Z` capability stacks.
- Code blocks (GraphQL SDL with `@deprecated` and `@tag`, HTTP wire format, Mermaid diagrams) copied verbatim between locales; only prose translates.
- Technical terms stay in English: `@deprecated`, `@tag`, `@cost`, `@auth`, `PERSISTED_QUERY_NOT_FOUND`, `OPERATION_DEPRECATED`, `mode: only`, `mode: auto`, `Sunset`, `410 Gone`, `4xx`, `5xx`, `rover`, `wgc`, `hive schema:check`, `T!`, `T`, etc.
- **Polish-documents step (per persistent memory feedback):** After EN passes self-review and after zh-TW passes its style-rule scan, run the **polish-documents** skill on each file path. Review polish output, accept changes that don't undo deliberate stylistic choices, then commit.
- Single commit per project convention:

  ```
  feat: add BEE-599 GraphQL Operational Patterns (EN + zh-TW)
  ```

---

## 5. Out of Scope (Explicitly Deferred)

- **GraphQL Federation operational deep-dive** — BEE-485 covers federation basics; this article touches contracts only as they relate to schema versioning. A dedicated federation-operations article (subgraph independence, router scaling, cross-team contracts) is out of scope but a candidate for a future series.
- **GraphQL Subscriptions architecture** — long-lived WebSocket subscriptions have a different operational model than request-response query/mutation traffic. Out of scope; would warrant its own article.
- **Client-side normalized cache deep-dive** — mentioned as a future BEE in BEE-596 §3.8. Still out of scope here.
- **Multi-tenant schema isolation** — interesting but tangential; touches BEE-400–405 territory more than the GraphQL operational story.
- **Schema-driven testing strategies** — schema-aware contract tests, mock data generation. Out of scope; warrants its own article.

---

## 6. Implementation Plan Hand-off

Documentation article. Same plan template as BEE-598 (`docs/superpowers/plans/2026-04-19-bee-598-graphql-rest-response-side.md`), with two adjustments:

1. **URL reuse table now includes BEE-596 + BEE-597 + BEE-598 verified URLs.** Most caching, idempotency, observability, and authorization URLs are reusable. Only the 9 newly-required URLs in §3.10 above need fresh fetching.
2. **Section structure differs from B-1/B-2.** The article follows pattern-statement → why → implementation → production-lessons rather than REST-baseline → gap → mitigation → recommendation. Plan tasks 4 and 7 (EN drafting and zh-TW translation) need to follow this shape; the self-review structural check still expects 9 section headers and no `## Example`.

Plan sequence:

1. **Reference verification:** every URL in §3.10 fetched, claims confirmed against actual content.
2. **EN draft** following the structure in §3 (Context → Principle → 3 body sections → Common Mistakes → Related BEPs → References). No separate `## Example`; inline examples per body section.
3. **EN self-review:** check against article template, RFC 2119 voice in Principle, no vendor promotion, no precision-puffery.
4. **EN polish:** run `polish-documents` on EN file; review and accept output.
5. **zh-TW translation:** parallel structure, same code blocks, prose translated under the zh-TW style constraints.
6. **zh-TW self-review:** style-rule grep scans (no contrastive negation, no em-dash chain, etc.).
7. **zh-TW polish:** run `polish-documents` on zh-TW file; review and accept output.
8. **Update list.md** in both locales: append `- [599.GraphQL Operational Patterns](599)` (EN) and `- [599.GraphQL 營運模式](599)` (zh-TW) after the BEE-598 entry.
9. **Single commit** with the message in §4.
