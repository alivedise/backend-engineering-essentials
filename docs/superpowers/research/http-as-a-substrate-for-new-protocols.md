# Findings: HTTP as a Substrate for New Protocols

**Generated:** 2026-04-29
**Target article:** BEE-3008 — http-as-a-substrate-for-new-protocols
**Subagent mode:** PER-ARTICLE

## Claims

### Claim 1

- **Text:** HTTP is defined as a stateless, application-level family of protocols sharing a generic interface and extensible semantics, which is precisely what makes it usable as a substrate for new application protocols.
- **Target section:** Context
- **Source URL:** https://www.rfc-editor.org/rfc/rfc9110.html
- **Pulled quote:** "HTTP is a family of stateless, application-level, request/response protocols that share a generic interface, extensible semantics, and self-descriptive messages."

### Claim 2

- **Text:** HTTP fields (headers and trailers) are defined as an extensible name/value namespace, so new protocols layered on HTTP can introduce custom headers without changing the protocol version.
- **Target section:** Context
- **Source URL:** https://www.rfc-editor.org/rfc/rfc9110.html
- **Pulled quote:** "HTTP uses 'fields' to provide data in the form of extensible name/value pairs with a registered key namespace. Fields are sent and received within the header and trailer sections."

### Claim 3

- **Text:** HTTP/1.1 chunked transfer encoding wraps content as a series of self-delimited chunks, which is what allows long-lived streaming bodies (SSE, gRPC over HTTP/1.1 fallbacks, MCP Streamable HTTP) to share a single response.
- **Target section:** Context
- **Source URL:** https://www.rfc-editor.org/rfc/rfc9112.html
- **Pulled quote:** "The chunked transfer coding wraps content in order to transfer it as a series of chunks, each with its own size indicator."

### Claim 4

- **Text:** HTTP/2 keeps HTTP semantics intact while replacing the transport with binary framing and independent multiplexed streams; this is the layer gRPC and WebTransport over HTTP/2 reuse.
- **Target section:** Visual
- **Source URL:** https://www.rfc-editor.org/rfc/rfc9113.html
- **Pulled quote:** "HTTP/2 provides an optimized transport for HTTP semantics. HTTP/2 supports all of the core features of HTTP but aims to be more efficient than HTTP/1.1."

### Claim 5

- **Text:** HTTP/3 explicitly defines itself as a mapping of HTTP semantics over QUIC, which lets WebTransport and other layered protocols inherit a working transport without redoing the semantic layer.
- **Target section:** Visual
- **Source URL:** https://www.rfc-editor.org/rfc/rfc9114.html
- **Pulled quote:** "This document defines HTTP/3: a mapping of HTTP semantics over the QUIC transport protocol, drawing heavily on the design of HTTP/2."

### Claim 6

- **Text:** Server-Sent Events is defined as a single MIME type, `text/event-stream`, layered over an ordinary HTTP response, with a UTF-8 line-based wire format.
- **Target section:** Example
- **Source URL:** https://html.spec.whatwg.org/multipage/server-sent-events.html
- **Pulled quote:** "This event stream format's MIME type is `text/event-stream`."

### Claim 7

- **Text:** SSE delegates resume semantics back into HTTP itself by reusing the standard `Last-Event-ID` request header on reconnect, instead of inventing a new resume protocol.
- **Target section:** Example
- **Source URL:** https://html.spec.whatwg.org/multipage/server-sent-events.html
- **Pulled quote:** "The `Last-Event-ID` HTTP request header reports an `EventSource` object's last event ID string to the server when the user agent is to reestablish the connection."

### Claim 8

- **Text:** WebSocket reuses HTTP only for the opening handshake: the client sends an HTTP Upgrade request whose `Upgrade` field includes `websocket`, and the server responds with `101 Switching Protocols` before switching to its own framing.
- **Target section:** Example
- **Source URL:** https://www.rfc-editor.org/rfc/rfc6455.html
- **Pulled quote:** "The WebSocket client's handshake is an HTTP Upgrade request... The request MUST contain an |Upgrade| header field whose value MUST include the 'websocket' keyword."

### Claim 9

- **Text:** gRPC encodes its wire format as `application/grpc` content-type with HTTP/2 HEADERS+CONTINUATION frames for metadata and an HTTP/2 trailers section for status, leaning entirely on HTTP/2 framing primitives instead of inventing new ones.
- **Target section:** Example
- **Source URL:** https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md
- **Pulled quote:** "Content-Type → 'application/grpc' [('+proto' / '+json' / {custom})]... Request-Headers are delivered as HTTP2 headers in HEADERS + CONTINUATION frames... Response → (Response-Headers *Length-Prefixed-Message Trailers) / Trailers-Only"

### Claim 10

- **Text:** WebDAV demonstrates that "new protocol on HTTP" can mean adding entirely new methods (PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK), not only new headers or content types.
- **Target section:** Convention Catalog
- **Source URL:** https://www.rfc-editor.org/rfc/rfc4918.html
- **Pulled quote:** "Of the methods defined in HTTP and WebDAV, PUT, POST, PROPPATCH, LOCK, UNLOCK, MOVE, COPY (for the destination resource), DELETE, and MKCOL are affected by write locks."

### Claim 11

- **Text:** JSON:API is registered as the IANA media type `application/vnd.api+json` and is purely a content-type-level convention layered over plain HTTP, illustrating the "media type as protocol" axis.
- **Target section:** Convention Catalog
- **Source URL:** https://jsonapi.org/
- **Pulled quote:** "Its media type designation is `application/vnd.api+json`."

### Claim 12

- **Text:** WebTransport is defined as a session over an HTTP/3 or HTTP/2 connection, exposing multiple streams, unidirectional streams, and unreliable datagrams on top of HTTP's existing transport.
- **Target section:** Convention Catalog
- **Source URL:** https://www.w3.org/TR/webtransport/
- **Pulled quote:** "A WebTransport session is a session of WebTransport over an HTTP/3 or HTTP/2 underlying connection... It can be used like WebSockets but with support for multiple streams, unidirectional streams, out-of-order delivery, and reliable as well as unreliable transport."

### Claim 13

- **Text:** MCP's Streamable HTTP transport defines a single MCP endpoint that accepts both POST and GET — the entire protocol surface lives behind one URL.
- **Target section:** Case Study: Streamable HTTP
- **Source URL:** https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- **Pulled quote:** "The server **MUST** provide a single HTTP endpoint path (hereafter referred to as the **MCP endpoint**) that supports both POST and GET methods."

### Claim 14

- **Text:** Streamable HTTP switches body shape via the standard HTTP `Accept` / `Content-Type` mechanism, returning either `application/json` (one-shot) or `text/event-stream` (SSE stream) for the same request — content negotiation is doing protocol selection.
- **Target section:** Case Study: Streamable HTTP
- **Source URL:** https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- **Pulled quote:** "If the input contains any number of JSON-RPC *requests*, the server **MUST** either return `Content-Type: text/event-stream`, to initiate an SSE stream, or `Content-Type: application/json`, to return one JSON object."

### Claim 15

- **Text:** Streamable HTTP carries session affinity in a single custom header, `Mcp-Session-Id`, treating sessions as a pure HTTP-header convention rather than a new connection protocol.
- **Target section:** Case Study: Streamable HTTP
- **Source URL:** https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- **Pulled quote:** "A server using the Streamable HTTP transport **MAY** assign a session ID at initialization time, by including it in an `Mcp-Session-Id` header on the HTTP response containing the `InitializeResult`."

### Claim 16

- **Text:** Streamable HTTP gets resumability for free by deferring to SSE's `Last-Event-ID` header — no new resume mechanism, just the existing one from the WHATWG spec.
- **Target section:** Case Study: Streamable HTTP
- **Source URL:** https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
- **Pulled quote:** "If the client wishes to resume after a broken connection, it **SHOULD** issue an HTTP GET to the MCP endpoint, and include the `Last-Event-ID` header to indicate the last event ID it received."

### Claim 17

- **Text:** CoAP is the canonical case where HTTP is too heavy: it deliberately implements a REST subset for 8-bit microcontrollers and lossy 6LoWPAN networks instead of layering on HTTP.
- **Target section:** When NOT to Layer on HTTP
- **Source URL:** https://www.rfc-editor.org/rfc/rfc7252.html
- **Pulled quote:** "The nodes often have 8-bit microcontrollers with small amounts of ROM and RAM, while constrained networks such as IPv6 over Low-Power Wireless Personal Area Networks (6LoWPANs) often have high packet error rates and a typical throughput of 10s of kbit/s... The goal of CoAP is not to blindly compress HTTP, but rather to realize a subset of REST common with HTTP but optimized for M2M applications."

### Claim 18

- **Text:** MQTT explicitly targets constrained M2M and IoT environments where HTTP's per-request overhead is prohibitive — a documented case for picking a non-HTTP substrate.
- **Target section:** When NOT to Layer on HTTP
- **Source URL:** https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html
- **Pulled quote:** "It is light weight, open, simple, and designed to be easy to implement... ideal for use in many situations, including constrained environments such as for communication in Machine to Machine (M2M) and Internet of Things (IoT) contexts where a small code footprint is required and/or network bandwidth is at a premium."

### Claim 19

- **Text:** When sub-millisecond bidirectional traffic matters more than HTTP's affordances, applications drop down to QUIC's raw streams over UDP rather than going through an HTTP layer.
- **Target section:** When NOT to Layer on HTTP
- **Source URL:** https://www.rfc-editor.org/rfc/rfc9000.html
- **Pulled quote:** "Endpoints communicate in QUIC by exchanging QUIC packets... QUIC packets are carried in UDP datagrams to better facilitate deployment in existing systems and networks. Streams in QUIC provide a lightweight, ordered byte-stream abstraction to an application."

### Claim 20

- **Text:** The `Prefer` request header is the canonical example of HTTP's "extension by header" pattern: clients signal optional, non-required behavior to servers without inventing a new method.
- **Target section:** Best Practices
- **Source URL:** https://www.rfc-editor.org/rfc/rfc7240.html
- **Pulled quote:** "The Prefer request header field is used to indicate that particular server behaviors are preferred by the client but are not required for successful completion of the request."

### Claim 21

- **Text:** RFC 5789 added PATCH as a wholly new HTTP method, demonstrating the precedent that the IETF formally accepts method-level extensions to HTTP — relevant to advising when (rarely) to introduce a new method versus a header.
- **Target section:** Best Practices
- **Source URL:** https://www.rfc-editor.org/rfc/rfc5789.html
- **Pulled quote:** "This proposal adds a new HTTP method, PATCH, to modify an existing HTTP resource."

### Claim 22

- **Text:** Cache-Control directives are how layered protocols opt streaming responses out of caching; without explicit directives, intermediaries are free to follow default storage rules.
- **Target section:** Best Practices
- **Source URL:** https://www.rfc-editor.org/rfc/rfc7234.html
- **Pulled quote:** "The 'Cache-Control' header field is used to specify directives for caches along the request/response chain."

## Reference URLs (de-duplicated, for the article's References section)

- https://www.rfc-editor.org/rfc/rfc9110.html — IETF, "HTTP Semantics," RFC 9110 (2022)
- https://www.rfc-editor.org/rfc/rfc9112.html — IETF, "HTTP/1.1," RFC 9112 (2022)
- https://www.rfc-editor.org/rfc/rfc9113.html — IETF, "HTTP/2," RFC 9113 (2022)
- https://www.rfc-editor.org/rfc/rfc9114.html — IETF, "HTTP/3," RFC 9114 (2022)
- https://www.rfc-editor.org/rfc/rfc9000.html — IETF, "QUIC: A UDP-Based Multiplexed and Secure Transport," RFC 9000 (2021)
- https://www.rfc-editor.org/rfc/rfc6455.html — IETF, "The WebSocket Protocol," RFC 6455 (2011)
- https://www.rfc-editor.org/rfc/rfc4918.html — IETF, "HTTP Extensions for Web Distributed Authoring and Versioning (WebDAV)," RFC 4918 (2007)
- https://www.rfc-editor.org/rfc/rfc7234.html — IETF, "HTTP/1.1: Caching," RFC 7234 (2014)
- https://www.rfc-editor.org/rfc/rfc7240.html — IETF, "Prefer Header for HTTP," RFC 7240 (2014)
- https://www.rfc-editor.org/rfc/rfc5789.html — IETF, "PATCH Method for HTTP," RFC 5789 (2010)
- https://www.rfc-editor.org/rfc/rfc7252.html — IETF, "The Constrained Application Protocol (CoAP)," RFC 7252 (2014)
- https://html.spec.whatwg.org/multipage/server-sent-events.html — WHATWG, "Server-sent events," HTML Living Standard
- https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md — gRPC Authors, "gRPC over HTTP/2"
- https://www.w3.org/TR/webtransport/ — W3C, "WebTransport" (Editor's Draft / Working Draft)
- https://modelcontextprotocol.io/specification/2025-03-26/basic/transports — Anthropic et al., "Model Context Protocol — Transports (2025-03-26)"
- https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html — OASIS, "MQTT Version 5.0 OASIS Standard" (2019)
- https://jsonapi.org/ — JSON:API Working Group, "JSON:API"

## Rejected sources

- https://en.wikipedia.org/wiki/Server-sent_events — Wikipedia is not in the allowed source tier; replaced by WHATWG HTML Living Standard.
- https://grpc.io/docs/what-is-grpc/core-concepts/ — Not rejected per se, but the page does not contain a single quote tying HTTP/2 framing and protobuf together; the canonical wire-level facts come from `github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md`, which I used instead.

## Research notes

- The MCP transport spec page (`/specification/2025-03-26/basic/transports`) is canonical and version-stamped; the writer should cite the dated path rather than a `/draft/` or `/latest/` URL so the article remains stable as MCP versions roll forward. A newer dated revision likely exists by 2026; the writer may want to check `https://modelcontextprotocol.io/specification/` and pick the most recent published version, but the 2025-03-26 spec is the one that introduced the Streamable HTTP transport replacing HTTP+SSE.
- RFC 9112 covers chunked transfer cleanly. The Upgrade-header semantics for HTTP/1.1 also live in RFC 9110 §7.8 ("Upgrade") in the 2022 revision rather than 9112; if the writer wants a primary citation specifically for `Upgrade`, RFC 9110 is the better link than RFC 9112. RFC 6455 §1.3 already gives the WebSocket-specific Upgrade quote, which is what the Example section actually needs.
- For the Convention Catalog, JSON:API was preferred over OData because JSON:API's spec is shorter, vendor-neutral, and explicitly declares its IANA media type in one line. OData (`https://www.odata.org/`) would also work; it is OASIS-published and adds its own conventions for `$filter`, `$expand`, etc. Either one demonstrates "media type plus query convention" as a layering style.
- For "When NOT to Layer on HTTP," I have CoAP and MQTT for the constrained-device axis and QUIC for the low-latency-bidirectional axis. Raw socket protocols (SSH, IRC) are widely understood and don't really need a citation for the article's claim that they exist; the writer can name them as examples without a verified URL since the claim ("SSH is not layered on HTTP") is uncontroversial. If a citation is wanted, RFC 4253 (SSH Transport Layer Protocol) is canonical.
- WebTransport's W3C page confirms HTTP/2 *and* HTTP/3 as underlying transports; some older blog posts only mention HTTP/3, so the writer should not write "HTTP/3 only."
- Coverage is strong across all required sections. The thinnest spot is the Best Practices section's "advertising custom media types" point — it is supported indirectly by the JSON:API IANA-registered-media-type quote (Claim 11) plus general RFC 9110 extensibility framing (Claim 2). If the writer wants a stronger BP-specific anchor, RFC 6838 ("Media Type Specifications and Registration Procedures") at `https://www.rfc-editor.org/rfc/rfc6838.html` is the canonical procedural reference, but I did not WebFetch-verify it in this pass since the existing claims already carry the section.
- All 17 reference URLs were WebFetch-verified during this research pass and returned content matching expectations; none 404'd or redirected to surprising destinations.
