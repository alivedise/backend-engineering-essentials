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

Backend engineering spans a vast landscape -- from authentication and networking to distributed systems and observability. Engineers often learn these concepts piecemeal, through scattered blog posts, tribal knowledge, or painful production incidents. BEE provides a structured, numbered set of principles that build a coherent mental model of backend engineering.

## Purpose

- Establish shared vocabulary for backend engineering discussions
- Provide actionable, vendor-neutral guidance for common backend decisions
- Serve as an onboarding resource for engineers entering backend development
- Bridge the gap between "I know the syntax" and "I understand the system"

## How to Read BEPs

Each BEE follows a consistent structure:

- **Context** -- Why this principle matters
- **Principle** -- The core guidance (uses RFC 2119 keywords: MUST, SHOULD, MAY)
- **Visual** -- Diagrams where they aid understanding
- **Example** -- Concrete, vendor-agnostic examples
- **Common Mistakes** -- Anti-patterns to avoid
- **Related BEPs** -- Cross-references to other principles
- **References** -- External resources for deeper learning

## Categories

### Foundation Layer (0-89)

| Range | Category | Focus |
|-------|----------|-------|
| 0-9 | BEE Overall | Purpose, glossary, meta |
| 10-29 | Authentication & Authorization | Identity, access control, tokens, sessions |
| 30-49 | Security Fundamentals | OWASP, input validation, secrets, cryptography |
| 50-69 | Networking Fundamentals | TCP/IP, DNS, HTTP, TLS, load balancing |
| 70-89 | API Design & Communication Protocols | REST, gRPC, GraphQL, versioning, pagination |

### Architecture & Data Layer (100-179)

| Range | Category | Focus |
|-------|----------|-------|
| 100-119 | Architecture Patterns | Monolith, microservices, DDD, CQRS, hexagonal |
| 120-139 | Data Storage & Database Fundamentals | SQL vs NoSQL, indexing, replication, sharding |
| 140-159 | Data Modeling & Schema Design | ER modeling, normalization, serialization |
| 160-179 | Transactions & Data Integrity | ACID, isolation levels, sagas, idempotency |

### Runtime Layer (200-279)

| Range | Category | Focus |
|-------|----------|-------|
| 200-219 | Caching | Invalidation, eviction, distributed cache, HTTP caching |
| 220-239 | Messaging & Event-Driven | Queues, pub/sub, delivery guarantees, event sourcing |
| 240-259 | Concurrency & Async | Threads, locks, async I/O, worker pools |
| 260-279 | Resilience & Reliability | Circuit breakers, retries, timeouts, rate limiting |

### Engineering Practices Layer (300-379)

| Range | Category | Focus |
|-------|----------|-------|
| 300-319 | Performance & Scalability | Estimation, scaling, profiling, CDN |
| 320-339 | Observability | Logs, metrics, traces, SLOs, alerting |
| 340-359 | Testing Strategies | Test pyramid, integration, contract, load testing |
| 360-379 | CI/CD & DevOps | CI, deployment strategies, IaC, feature flags |

## Related Resources

- [ADE](https://alivedise.github.io/api-design-essentials/) -- API Design Essentials (deep dive on API design)
- [DEE](https://alivedise.github.io/database-engineering-essentials/) -- Database Engineering Essentials (deep dive on database design)

## Maintainer

Alive Kuo -- [alegnadise@gmail.com](mailto:alegnadise@gmail.com)

## Related BEPs

- [BEE-2](how-to-read-bee.md) How to Read BEE
- [BEE-3](glossary.md) Glossary
