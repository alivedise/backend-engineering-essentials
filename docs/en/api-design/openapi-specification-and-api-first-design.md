---
id: 4009
title: OpenAPI Specification and API-First Design
state: draft
slug: openapi-specification-and-api-first-design
---

# [BEE-498] OpenAPI Specification and API-First Design

:::info
OpenAPI is a vendor-neutral, language-agnostic format for describing REST APIs. API-first design means writing the OpenAPI document before writing code — making the contract the deliverable, not a byproduct.
:::

## Context

Tony Tam created Swagger at Wordnik in 2010–2011 to solve a problem that every API team eventually hits: documentation falls out of sync with the implementation. Swagger 2.0 (2014) addressed this by defining a machine-readable format that could simultaneously describe, document, mock, validate, and generate code for a REST API. The format's utility drove rapid adoption — within two years it had become the de facto standard for REST API description.

SmartBear acquired Swagger in 2015, then immediately donated the specification to the newly formed OpenAPI Initiative (OAI), a Linux Foundation project. On January 1, 2016, the Swagger Specification was renamed the OpenAPI Specification (OAS). The governance shift mattered: OAI included members from Google, Microsoft, IBM, PayPal, and Capital One, transforming a single-company tool into a vendor-neutral standard. OpenAPI 3.0.0 followed in July 2017 with a restructured document format and first-class support for webhooks and callbacks. OpenAPI 3.1.0 (February 2021) resolved a longstanding tension: it replaced the home-grown JSON Schema subset used in 3.0 with full JSON Schema 2020-12 alignment, enabling validators, generators, and documentation tools to share a single schema dialect.

The practical result of this standardization: Stripe, GitHub, and Twilio all publish their full API surfaces as OpenAPI documents. Stripe's OpenAPI spec drives SDK generation for seven languages. GitHub's 600+ operations are described in both 3.0 and 3.1 formats. Tooling — mock servers, linters, code generators, documentation renderers — can treat any of these APIs uniformly because the format is a stable standard.

## Design Thinking

The fundamental question an API team must answer is when the specification is written: before the code (API-first / design-first) or after (code-first).

**Code-first** generates the spec from code — annotations in Spring Boot, FastAPI's automatic schema derivation from Python type hints, or a post-hoc Swagger document. This is the default path of least resistance. The spec reflects what the code does, which is accurate by definition — but it reflects only what the code already does, which means design decisions are made implicitly during implementation rather than explicitly during review.

**API-first** writes the OpenAPI document before writing any production code. The spec is submitted as a pull request, reviewed by consumers, frontend engineers, and API governance teams, and locked before implementation begins. This has two consequences. First, teams working on consumers (mobile app, other microservices) can begin against a mock server the moment the spec merges, in parallel with the server implementation. Second, design mistakes — a missing field, an inconsistent naming convention, a response shape that cannot model optional vs. missing — are caught in a 10-minute review rather than a multi-day refactor after clients have integrated.

The trade-off is upfront cost: writing a full OpenAPI document for a new service requires familiarity with the format and discipline to maintain it as implementation reveals edge cases. For public or partner-facing APIs, or for services with multiple consumers, the investment pays off. For a quick internal endpoint used by one team, code-first is often reasonable.

## OpenAPI 3.x Document Structure

An OpenAPI 3.1 document is a JSON or YAML file with these top-level fields:

```yaml
openapi: "3.1.0"
info:
  title: "Order Service API"
  version: "2.1.0"
  description: "Manages order lifecycle for the e-commerce platform"
  contact:
    name: "Platform Team"
    email: "platform@example.com"

servers:
  - url: "https://api.example.com/v2"
    description: "Production"
  - url: "https://api.staging.example.com/v2"
    description: "Staging"

tags:
  - name: orders
    description: Order creation and lifecycle
  - name: fulfillment
    description: Shipping and delivery

paths:
  /orders:
    post:
      operationId: createOrder
      tags: [orders]
      summary: Create a new order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateOrderRequest"
      responses:
        "201":
          description: Order created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Order"
        "422":
          $ref: "#/components/responses/ValidationError"
      security:
        - bearerAuth: []

components:
  schemas:
    CreateOrderRequest:
      type: object
      required: [customerId, items]
      properties:
        customerId:
          type: string
          format: uuid
        items:
          type: array
          minItems: 1
          items:
            $ref: "#/components/schemas/OrderItem"
    OrderItem:
      type: object
      required: [productId, quantity]
      properties:
        productId:
          type: string
        quantity:
          type: integer
          minimum: 1
    Order:
      allOf:
        - $ref: "#/components/schemas/CreateOrderRequest"
        - type: object
          required: [id, status, createdAt]
          properties:
            id:
              type: string
              format: uuid
            status:
              type: string
              enum: [pending, confirmed, shipped, delivered, cancelled]
            createdAt:
              type: string
              format: date-time

  responses:
    ValidationError:
      description: Request validation failed
      content:
        application/problem+json:
          schema:
            $ref: "#/components/schemas/ProblemDetail"

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

**`components`** is the key to a maintainable spec. Schemas, responses, parameters, and examples defined there are referenced via `$ref` throughout the document. Duplication in OpenAPI specs is a maintenance hazard: a field renamed in one `$ref` propagates everywhere; the same field duplicated in ten path definitions requires ten edits and usually results in drift.

### OpenAPI 3.0 vs 3.1: JSON Schema Alignment

OpenAPI 3.0 used a modified subset of JSON Schema Draft 5 with incompatible extensions. The friction was significant: a JSON Schema validator could not validate an OpenAPI 3.0 schema object without an OAS-specific dialect because the two diverged:

| Feature | JSON Schema | OpenAPI 3.0 | OpenAPI 3.1 |
|---------|-------------|-------------|-------------|
| Nullable types | `"type": ["string", "null"]` | `nullable: true` (OAS extension) | `"type": ["string", "null"]` |
| Exclusive bounds | numeric (`"exclusiveMinimum": 5`) | boolean (`"exclusiveMinimum": true`) | numeric (restored) |
| `$ref` with siblings | allowed | siblings ignored | allowed |
| Multiple types | `"type": ["string", "integer"]` | not supported | supported |

New projects should target OpenAPI 3.1. Existing OpenAPI 3.0 specs can continue to work — most tooling supports both — but 3.1 opens the door to reusing JSON Schema tooling and schemas directly.

## Best Practices

**MUST version the OpenAPI document in version control alongside the code** it describes. The spec and the implementation drift apart the moment they are maintained separately. The canonical pattern: the spec lives in the service repository, CI validates that the running service's responses conform to the spec, and spec changes require code changes in the same pull request.

**SHOULD define every reusable schema in `components/schemas` and reference it with `$ref` rather than inlining.** Inline schemas cannot be referenced from other paths and cannot be used for code generation without duplication. A schema inlined in five different paths is five schemas to keep in sync.

**MUST assign an `operationId` to every operation.** Code generators use `operationId` as the generated function or method name. Without it, generators fall back to path-based names like `postOrdersOrderIdItems`, which are verbose and unstable. Canonical form: camelCase verb + noun — `createOrder`, `listOrderItems`, `cancelOrder`.

**SHOULD use `$ref` for error responses.** All 422 responses across a service should use the same `ProblemDetail` schema referenced from `components/responses`. This ensures consistency, makes linting possible, and avoids the common problem where different endpoints return different shapes for the same error condition.

**SHOULD lint the spec in CI using Spectral.** Spectral applies configurable rules to OpenAPI documents — enforcing naming conventions, requiring descriptions on all operations, validating that security schemes are applied, rejecting `any` types in request bodies:

```yaml
# .spectral.yaml
extends: ["spectral:oas"]
rules:
  operation-description: error        # all operations must have descriptions
  operation-operationId: error        # all operations must have operationIds
  oas3-api-servers: error             # servers array must be present
  no-$ref-siblings: off               # allow $ref siblings (OpenAPI 3.1)
```

```bash
# Run in CI
npx @stoplight/spectral-cli lint openapi.yaml --ruleset .spectral.yaml
```

**MUST detect breaking changes before merging spec updates** that affect consumers. A breaking change is any modification that causes a client built against the previous spec to receive a response it cannot parse, or to send a request that the new server rejects. Common breaking changes: removing a required field from a response, adding a required field to a request body, changing a field's type, removing an enum value.

`oasdiff` compares two spec versions and reports breaking changes:

```bash
oasdiff breaking openapi-main.yaml openapi-branch.yaml
# outputs:
# error: deleted response property 'trackingId' [response-property-removed]
# error: new required request property 'shippingMethod' [request-property-became-required]
```

Integrate `oasdiff` as a CI check that fails the PR when breaking changes are introduced without a version bump.

**SHOULD use a mock server during development.** Prism converts an OpenAPI spec into a working HTTP mock server that returns example responses:

```bash
npx @stoplight/prism-cli mock openapi.yaml
# Starts a mock server on http://localhost:4010
# POST /orders → 201 with example Order response
```

Frontend and integration test teams can develop against the mock immediately after the spec PR merges, without waiting for the server implementation to complete.

## Tooling Reference

| Purpose | Tool | Notes |
|---------|------|-------|
| Documentation UI | Swagger UI | Embedded in most frameworks |
| Documentation UI | Redoc | Three-panel layout; better for large specs |
| Visual design | Stoplight Studio | GUI editor with live preview |
| Mock server | Prism | `npx @stoplight/prism-cli mock spec.yaml` |
| Code generation | openapi-generator | 50+ client languages, 40+ server stubs |
| Linting | Spectral | Configurable rulesets; CI integration |
| Breaking change detection | oasdiff | 300+ categories; GitHub Action available |

**openapi-generator** produces server stubs and client SDKs from a spec:

```bash
# Generate a Python client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g python \
  -o ./sdk/python \
  --additional-properties=packageName=order_client

# Generate a Spring Boot server stub
openapi-generator-cli generate \
  -i openapi.yaml \
  -g spring \
  -o ./server-stub \
  --additional-properties=interfaceOnly=true
```

The `interfaceOnly=true` flag generates only the interface layer, leaving the implementation to you. This avoids the common anti-pattern of generating then hand-editing server code — the generated interface is regenerated from the spec on every CI run, keeping it current.

## Related BEEs

- [BEE-4001](rest-api-design-principles.md) -- REST API Design Principles: REST conventions (resource naming, status codes, HTTP methods) that the OpenAPI spec should enforce
- [BEE-4002](api-versioning-strategies.md) -- API Versioning Strategies: how to express version changes in the OpenAPI `info.version` field and servers array
- [BEE-4006](api-error-handling-and-problem-details.md) -- API Error Handling and Problem Details: the `application/problem+json` schema used in `components/responses`
- [BEE-15003](../testing/contract-testing.md) -- Contract Testing: Prism and openapi-generator–based clients provide an alternative to Pact-style consumer-driven contracts
- [BEE-16001](../cicd-devops/continuous-integration-principles.md) -- Continuous Integration Principles: Spectral linting and oasdiff breaking-change checks belong in the CI pipeline

## References

- [OpenAPI Initiative. OpenAPI Specification — openapis.org](https://www.openapis.org/)
- [OpenAPI Initiative. Learn OpenAPI — learn.openapis.org](https://learn.openapis.org/specification/)
- [OpenAPI Initiative. OpenAPI Specification 3.1.0 — spec.openapis.org](https://spec.openapis.org/oas/v3.1.0.html)
- [OpenAPI Initiative. Upgrading from OpenAPI 3.0 to 3.1 — learn.openapis.org](https://learn.openapis.org/upgrading/v3.0-to-v3.1.html)
- [Swagger.io. Code-First vs. Design-First API Development — swagger.io](https://swagger.io/blog/code-first-vs-design-first-api/)
- [Stoplight. Spectral — stoplight.io](https://stoplight.io/open-source/spectral)
- [Stoplight. Prism — stoplight.io](https://stoplight.io/open-source/prism)
- [OpenAPI Generator — openapi-generator.tech](https://openapi-generator.tech/)
- [oasdiff. OpenAPI diff and breaking changes — oasdiff.com](https://www.oasdiff.com/)
- [GitHub. Introducing GitHub's OpenAPI Description — github.blog](https://github.blog/news-insights/product-news/introducing-githubs-openapi-description/)
- [Stripe. OpenAPI Specification — github.com/stripe/openapi](https://github.com/stripe/openapi)
- [Twilio. OpenAPI Specification — github.com/twilio/twilio-oai](https://github.com/twilio/twilio-oai)
