---
id: 1
title: BEE Overview
state: draft
overview: true
slug: bee-overview
---

# [BEE-1] BEE Overview

:::info
BEE (Backend Engineering Essentials) is a collection of vendor-agnostic guidelines and best practices for backend engineering.
:::

## Context

Backend engineering spans a wide surface area: authentication, networking, data, distributed systems, observability, and increasingly machine-learning workloads. Engineers learn these topics piecemeal, from blog posts, tribal knowledge, and production incidents. BEE collects them into a numbered, vendor-neutral catalogue with two depth levels: short essentials articles for the foundations, and longer deep-dive series (GraphQL HTTP-layer caching, AI backend patterns) where the topic warrants extended treatment.

Article IDs cluster by category in 1000-id blocks (auth = 1xxx, security = 2xxx, and so on) and URLs are semantic slugs (`/auth/oauth-openid-connect`, not `/1003`). Old numeric URLs continue to resolve via redirect stubs.

## Purpose

- Establish shared vocabulary for backend engineering discussions
- Provide actionable, vendor-neutral guidance for common backend decisions
- Serve as an onboarding resource for engineers entering backend development
- Bridge the gap between "I know the syntax" and "I understand the system"

## How to Read BEE Articles

Each BEE follows a consistent structure:

- **Context** -- Why this principle matters
- **Principle** -- The core guidance (uses RFC 2119 keywords: MUST, SHOULD, MAY)
- **Visual** -- Diagrams where they aid understanding
- **Example** -- Concrete, vendor-agnostic examples
- **Common Mistakes** -- Anti-patterns to avoid
- **Related BEEs** -- Cross-references to other principles
- **References** -- External resources for deeper learning

## Categories

> Each category occupies a 1000-id block; `1xxx` means BEE-1001 through BEE-1999. `BEE Overall` is an exception (1-99) because it predates the block scheme. `AI Backend Patterns` is a deliberate exception (30001-39999, 10000 wide).

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

## Related Resources

- [ADE](https://alivedise.github.io/api-design-essentials/) -- API Design Essentials (deep dive on API design)
- [DEE](https://alivedise.github.io/database-engineering-essentials/) -- Database Engineering Essentials (deep dive on database design)

## Maintainer

Alive Kuo -- [alegnadise@gmail.com](mailto:alegnadise@gmail.com)

## Related BEEs

- [BEE-2](how-to-read-bee.md) How to Read BEE
- [BEE-3](glossary.md) Glossary
