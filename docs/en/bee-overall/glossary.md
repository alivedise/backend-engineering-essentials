---
id: 3
title: Glossary
state: draft
slug: glossary
---

# [BEE-5] Glossary

:::info
Common terms used across BEE documents.
:::

## Authentication & Security

| Term | Definition |
|------|-----------|
| **Authentication (AuthN)** | Verifying the identity of a user or system |
| **Authorization (AuthZ)** | Determining what an authenticated entity is allowed to do |
| **JWT** | JSON Web Token -- a compact, self-contained token for transmitting claims |
| **OAuth 2.0** | An authorization framework for delegated access |
| **RBAC** | Role-Based Access Control -- permissions assigned to roles, roles assigned to users |
| **ABAC** | Attribute-Based Access Control -- permissions based on attributes of user, resource, and environment |

## Networking & API

| Term | Definition |
|------|-----------|
| **REST** | Representational State Transfer -- an architectural style for networked applications |
| **gRPC** | A high-performance RPC framework using Protocol Buffers |
| **Idempotency** | The property that an operation produces the same result regardless of how many times it is applied |
| **Load Balancer** | A component that distributes incoming requests across multiple backend servers |
| **Reverse Proxy** | A server that forwards client requests to backend servers |

## Architecture

| Term | Definition |
|------|-----------|
| **Microservices** | An architecture where an application is composed of small, independently deployable services |
| **Monolith** | An architecture where the entire application is deployed as a single unit |
| **Modular Monolith** | A monolith with well-defined internal module boundaries |
| **CQRS** | Command Query Responsibility Segregation -- separate models for reads and writes |
| **DDD** | Domain-Driven Design -- modeling software around the business domain |
| **Bounded Context** | A DDD concept defining the boundary within which a particular domain model applies |

## Data & Storage

| Term | Definition |
|------|-----------|
| **ACID** | Atomicity, Consistency, Isolation, Durability -- transaction properties |
| **CAP Theorem** | A distributed system can guarantee at most two of: Consistency, Availability, Partition tolerance |
| **Eventual Consistency** | A consistency model where replicas converge to the same state over time |
| **Sharding** | Distributing data across multiple databases based on a partition key |
| **Replication** | Copying data across multiple database instances |

## Runtime & Reliability

| Term | Definition |
|------|-----------|
| **Circuit Breaker** | A pattern that prevents cascading failures by stopping requests to a failing service |
| **Backpressure** | A mechanism for a consumer to signal a producer to slow down |
| **SLO** | Service Level Objective -- a target value for a service level indicator |
| **Error Budget** | The allowed amount of unreliability within an SLO period |
| **Dead Letter Queue** | A queue for messages that cannot be processed successfully |

## Related BEPs

- [BEE-1](bee-overview.md) BEE Overview
- [BEE-2](how-to-read-bee.md) How to Read BEE
