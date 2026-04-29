---
title: Expand networking-fundamentals (2026-04-29)
date: 2026-04-29
status: Approved for research/write
category: networking-fundamentals
locale: en + zh-tw
---

# Expand networking-fundamentals: HTTP as a Substrate for New Protocols

## Scope

Add **one** article to the `networking-fundamentals` category capturing the principle that new transports and protocol layers should compose conventions on HTTP rather than invent a new wire protocol. The article was triggered by Streamable HTTP (the MCP transport, BEE-30003), but is intentionally vendor-neutral and treats Streamable HTTP as one example among several.

## Article

| Field | Value |
|---|---|
| ID | 3008 |
| Slug | `http-as-a-substrate-for-new-protocols` |
| Title (EN) | HTTP as a Substrate for New Protocols |
| Title (zh-TW) | HTTP 作為新協定的承載基底 |
| State | draft |
| Locale parity | EN + zh-TW |

## Section structure

Per `~/.claude/skills/expanding-category-articles/templates/article.md` and CLAUDE.md (updated 2026-04-29 to align with the skill template):

1. `## Context` — HTTP's evolution into a generic application substrate; inventory of reusable primitives (verbs, headers, status codes, content negotiation, chunked transfer, `Upgrade`, caching, conditional requests).
2. `## Visual` — Layered diagram. Bottom: HTTP/1.1 / 2 / 3 wire. Middle: HTTP primitives. Top: layered conventions annotated with the primitives they exploit.
3. `## Example` — Concrete walkthroughs of three older, well-known conventions: SSE, WebSocket, gRPC.
4. `## Best Practices` — RFC 2119 guidance on advertising custom media types, separating transport vs application errors, testing through real intermediaries, caching headers on streaming responses, and when to use `Upgrade`.
5. `## Convention Catalog` *(topic-specific)* — Reference table: each layered convention with the HTTP primitives it leans on, defining spec, and fit.
6. `## Case Study: Streamable HTTP` *(topic-specific)* — Walk through how MCP's Streamable HTTP composes single-endpoint dispatch + content-type-switched body + custom session header + SSE `Last-Event-ID` resume entirely from existing HTTP primitives. Demonstrates the principle in a contemporary protocol.
7. `## When NOT to Layer on HTTP` *(topic-specific)* — Counterexamples and substitutes: sub-millisecond bidirectional traffic, raw socket protocols, embedded targets where HTTP overhead is fatal.
8. `## Related Topics` — Cross-links to http-versions, long-polling-sse-and-websocket-architecture, grpc-streaming-patterns, model-context-protocol-mcp, proxies-and-reverse-proxies.
9. `## References` — Authoritative sources only: RFCs and WHATWG specs.

## Research targets

The research subagent will gather evidence for each section, with explicit URL coverage of:

- RFC 9110 (HTTP Semantics)
- RFC 9112 (HTTP/1.1)
- RFC 9113 (HTTP/2)
- RFC 9114 (HTTP/3)
- WHATWG HTML Living Standard, "Server-sent events" section
- RFC 6455 (WebSocket)
- RFC 4918 (WebDAV)
- gRPC over HTTP/2 protocol spec (grpc.io)
- Model Context Protocol transport spec (modelcontextprotocol.io)
- WebTransport (W3C / IETF drafts)
- RFC 7240, RFC 5789 (PATCH), RFC 6585 (additional status codes) — for the primitive inventory
- MQTT and CoAP specs — for the "when NOT to layer on HTTP" section

## Constraints

- Vendor-neutral; treat Streamable HTTP as one example, not the topic.
- All factual claims must trace to a citation in the findings doc.
- No invented URLs in References.
- Polish-documents pass on both EN and zh-TW before commit.
- Avoid "核心" / "the core insight" / "key takeaway" preambles.
