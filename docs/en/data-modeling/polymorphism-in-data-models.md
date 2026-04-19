---
id: 7006
title: Polymorphism in Data Models
state: draft
slug: polymorphism-in-data-models
---

# [BEE-7006] Polymorphism in Data Models

:::info
Choose an inheritance mapping strategy deliberately. The wrong choice creates either a table bloated with nullable columns or a query plan drowning in joins.
:::

## Context

Object-oriented systems model hierarchies naturally: a `Payment` might be a `CreditCardPayment`, a `BankTransfer`, or a `WalletPayment`. Each shares a core concept but carries different attributes. Relational databases have no native concept of inheritance, so engineers must choose an explicit mapping strategy. The wrong choice — or no explicit choice at all — produces schemas that are painful to query, hard to enforce constraints on, or impossible to extend.

This problem is well-studied. Martin Fowler documented three canonical patterns in *Patterns of Enterprise Application Architecture*: Single Table Inheritance, Class Table Inheritance, and Concrete Table Inheritance ([martinfowler.com](https://martinfowler.com/eaaCatalog/singleTableInheritance.html)). A fourth approach — document embedding via JSONB or a document store — has grown practical with modern databases. Each has a distinct cost/benefit profile.

## The Problem

Polymorphic entities share a base concept but diverge in their specific attributes:

- A **notification** can be sent by email, SMS, or push. Email needs `to_address` and `subject`; SMS needs `phone_number` and `message_body`; push needs `device_token` and `payload`.
- A **payment** can be a credit card charge, a bank transfer, or a wallet debit. Each needs different routing fields.
- A **shape** in a drawing tool can be a circle, rectangle, or polygon — different geometry data per type.

The challenge: how do you store these in a relational database without sacrificing query simplicity, data integrity, or storage efficiency?

## The Four Strategies

### Strategy 1: Single Table Inheritance (STI)

All sub-types live in one table. A `type` discriminator column identifies the sub-type. Sub-type-specific columns are present for all rows; rows of other types leave them `NULL`.

```sql
CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,          -- 'email' | 'sms' | 'push'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     BIGINT NOT NULL,

  -- Email-only
  to_address  TEXT,
  subject     TEXT,

  -- SMS-only
  phone_number TEXT,
  message_body TEXT,

  -- Push-only
  device_token TEXT,
  payload      JSONB
);
```

**Pros:** Single table means no joins. Simple queries. Easy to add a new sub-type column without touching other tables. Supported out-of-the-box by most ORMs (ActiveRecord, Hibernate, SQLAlchemy).

**Cons:** Every row has many `NULL` columns. Adding a sub-type with 10 unique fields adds 10 nullable columns to every other row. `NOT NULL` constraints cannot be enforced at the DB level (only at the application layer). Tables with many sub-types balloon in width.

**When to use:** Few sub-types (2–5), attribute overlap is high, sub-types are queried together frequently. STI is a pragmatic first choice for small hierarchies.


### Strategy 2: Class Table Inheritance (CTI)

One base table holds shared attributes. Each sub-type gets its own table with a foreign key back to the base table. The sub-type row always has the same `id` as the base row.

```sql
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    BIGINT NOT NULL
);

CREATE TABLE notifications_email (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id),
  to_address      TEXT NOT NULL,
  subject         TEXT NOT NULL
);

CREATE TABLE notifications_sms (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id),
  phone_number    TEXT NOT NULL,
  message_body    TEXT NOT NULL
);

CREATE TABLE notifications_push (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id),
  device_token    TEXT NOT NULL,
  payload         JSONB
);
```

To fetch a full email notification:

```sql
SELECT n.*, e.to_address, e.subject
FROM notifications n
JOIN notifications_email e ON e.notification_id = n.id
WHERE n.id = $1;
```

**Pros:** No nullable columns. Sub-type-specific `NOT NULL` constraints are enforced at the DB level. Each sub-type table is narrow and focused. Schema clearly communicates the type hierarchy.

**Cons:** Every read of a concrete type requires a join. Polymorphic queries ("show me the last 50 notifications of any type") require multiple queries or `UNION ALL`. Schema changes to the base table propagate everywhere.

**When to use:** Sub-types have many unique attributes, data integrity matters (lots of `NOT NULL`/`UNIQUE`/`FK` constraints), and most queries target a specific sub-type rather than all types together. See also: [Baeldung SQL Inheritance](https://www.baeldung.com/sql/database-inheritance).


### Strategy 3: Concrete Table Inheritance (CTI-Leaf)

No shared base table. Each concrete sub-type gets a fully independent table with all columns — shared and specific — duplicated.

```sql
CREATE TABLE notifications_email (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      BIGINT NOT NULL,
  to_address   TEXT NOT NULL,
  subject      TEXT NOT NULL
);

CREATE TABLE notifications_sms (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      BIGINT NOT NULL,
  phone_number TEXT NOT NULL,
  message_body TEXT NOT NULL
);

CREATE TABLE notifications_push (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      BIGINT NOT NULL,
  device_token TEXT NOT NULL,
  payload      JSONB
);
```

**Pros:** No joins, ever. Full constraint enforcement per table. Tables are completely independent — schema changes to one don't touch others.

**Cons:** No single primary key namespace across types (two different notifications can share the same `id`). Polymorphic queries across types require `UNION ALL`. Changes to shared attributes (e.g., renaming `user_id` to `account_id`) require updating every table. Hard to enforce a foreign key that points to "any notification."

**When to use:** Sub-types are truly independent (rarely queried together), shared attributes are minimal, and you never need a single FK that references the whole hierarchy. Often the right answer when "inheritance" is the wrong mental model — these are just separate entities.


### Strategy 4: Document Embedding (JSONB / Document Store)

Store the type discriminator and shared fields as regular columns. Pack all sub-type-specific attributes into a single JSONB column.

```sql
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id    BIGINT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'
);
```

Example rows:

```sql
-- Email
INSERT INTO notifications (type, user_id, attributes) VALUES (
  'email', 42,
  '{"to_address": "user@example.com", "subject": "Your order shipped"}'
);

-- Push
INSERT INTO notifications (type, user_id, attributes) VALUES (
  'push', 42,
  '{"device_token": "abc123", "payload": {"title": "Shipped", "badge": 1}}'
);
```

Querying by sub-type attribute:

```sql
SELECT * FROM notifications
WHERE type = 'push'
  AND attributes->>'device_token' = 'abc123';

-- Index on a JSONB field for performance
CREATE INDEX ON notifications ((attributes->>'device_token'))
  WHERE type = 'push';
```

**Pros:** Schema is stable — adding a new sub-type attribute never requires `ALTER TABLE`. Handles deeply nested or highly variable structures well. Works with document-store databases natively. PostgreSQL JSONB supports GIN indexing for efficient attribute search ([PostgreSQL JSONB docs](https://www.postgresql.org/docs/current/datatype-json.html)).

**Cons:** Sub-type-specific `NOT NULL` constraints cannot be enforced at the DB level. Type safety lives entirely in the application layer. JSONB queries are less readable than column-based queries. Aggregations over JSONB fields are more complex.

**When to use:** Sub-type attributes are highly variable and evolve frequently, you need schema flexibility without migrations, or you're already in a document-store context (BEE-6001). Also well-suited when the number of sub-type variants is large and poorly bounded.


## Mermaid Diagram: Payment Hierarchy Side-by-Side

```mermaid
erDiagram

  %% ── Single Table Inheritance ─────────────────────────────────
  PAYMENTS_STI {
    bigint id PK
    text   type
    text   status
    decimal amount
    text   cc_last4
    text   cc_network
    text   bank_account_no
    text   bank_routing_no
    text   wallet_provider
    text   wallet_token
  }

  %% ── Class Table Inheritance ──────────────────────────────────
  PAYMENTS_BASE {
    bigint  id PK
    text    type
    text    status
    decimal amount
  }

  PAYMENTS_CREDIT_CARD {
    bigint id PK_FK
    text   cc_last4
    text   cc_network
  }

  PAYMENTS_BANK_TRANSFER {
    bigint id PK_FK
    text   bank_account_no
    text   bank_routing_no
  }

  PAYMENTS_WALLET {
    bigint id PK_FK
    text   wallet_provider
    text   wallet_token
  }

  PAYMENTS_BASE ||--o| PAYMENTS_CREDIT_CARD : "extends"
  PAYMENTS_BASE ||--o| PAYMENTS_BANK_TRANSFER : "extends"
  PAYMENTS_BASE ||--o| PAYMENTS_WALLET : "extends"

  %% ── Document Embedding ───────────────────────────────────────
  PAYMENTS_DOC {
    bigint id PK
    text   type
    text   status
    decimal amount
    jsonb  attributes
  }
```

## Worked Example: Notification System

All three relational strategies applied to the same domain — creating an email notification.

### Single-Table Approach

```sql
-- Schema: one wide table
CREATE TABLE notifications (
  id           BIGSERIAL PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('email','sms','push')),
  user_id      BIGINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  to_address   TEXT,   -- email only
  subject      TEXT,   -- email only
  phone_number TEXT,   -- sms only
  message_body TEXT,   -- sms only
  device_token TEXT,   -- push only
  payload      JSONB   -- push only
);

-- Insert email notification
INSERT INTO notifications (type, user_id, to_address, subject)
VALUES ('email', 1, 'alice@example.com', 'Welcome!');

-- Fetch all notifications for a user (no joins)
SELECT id, type, created_at FROM notifications WHERE user_id = 1;

-- Fetch email-specific fields
SELECT to_address, subject FROM notifications
WHERE user_id = 1 AND type = 'email';
```

Query complexity: low. Storage: 5 NULL columns per email row, 4 per SMS row, 5 per push row.


### Class-Table Approach

```sql
-- Schema: base + sub-type tables
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  user_id    BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_emails (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id),
  to_address      TEXT NOT NULL,
  subject         TEXT NOT NULL
);

CREATE TABLE notification_sms (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id),
  phone_number    TEXT NOT NULL,
  message_body    TEXT NOT NULL
);

CREATE TABLE notification_push (
  notification_id BIGINT PRIMARY KEY REFERENCES notifications(id),
  device_token    TEXT NOT NULL,
  payload         JSONB
);

-- Insert email notification (two statements, one transaction)
BEGIN;
INSERT INTO notifications (type, user_id) VALUES ('email', 1) RETURNING id;
-- assume id = 5
INSERT INTO notification_emails (notification_id, to_address, subject)
VALUES (5, 'alice@example.com', 'Welcome!');
COMMIT;

-- Fetch a full email notification (requires join)
SELECT n.id, n.created_at, e.to_address, e.subject
FROM notifications n
JOIN notification_emails e ON e.notification_id = n.id
WHERE n.user_id = 1;

-- Fetch recent notifications of any type (requires UNION)
SELECT id, type, created_at FROM notifications
WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;
```

Query complexity: moderate (join for typed reads, `UNION ALL` for polymorphic reads). Storage: zero NULL columns.


### Document-Embedding Approach

```sql
-- Schema: base columns + JSONB bag
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  type       TEXT NOT NULL,
  user_id    BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attrs      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_notifications_email ON notifications ((attrs->>'to_address'))
  WHERE type = 'email';

-- Insert email notification
INSERT INTO notifications (type, user_id, attrs)
VALUES ('email', 1, '{"to_address":"alice@example.com","subject":"Welcome!"}');

-- Fetch recent notifications for a user (no join)
SELECT id, type, created_at, attrs FROM notifications
WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;

-- Look up by email address
SELECT * FROM notifications
WHERE type = 'email' AND attrs->>'to_address' = 'alice@example.com';
```

Query complexity: low. Storage: compact. Constraint enforcement: application-side only.


### Comparison

| Concern                   | Single Table     | Class Table         | Document Embedding  |
|---------------------------|------------------|---------------------|---------------------|
| Read a typed entity       | 1 query, no join | 1 query + 1 join    | 1 query, no join    |
| Read all types together   | 1 query          | `UNION ALL` or app  | 1 query             |
| DB-level NOT NULL         | No               | Yes                 | No                  |
| Schema change for new type| `ALTER TABLE`    | New sub-type table  | No migration needed |
| NULL column waste         | High             | None                | None                |
| Scales to 100s of sub-types| Poorly          | Reasonably          | Well                |

## Common Mistakes

**1. STI with too many sub-types.** Once you have more than ~5 sub-types with distinct attribute sets, a single-table schema accumulates dozens of nullable columns. A table with 80 columns where most rows leave 60 of them NULL is a schema smell — migrate to class-table or document embedding.

**2. Class-table inheritance with heavy polymorphic reads.** If your most common query is "show me the last 100 notifications of any type," CTI forces a `UNION ALL` over all sub-type tables. That query plan does not scale. If polymorphic reads dominate, STI or document embedding is a better fit.

**3. No discriminator column.** Without a `type` column, the only way to know which sub-type a row belongs to is to check which sub-type table has a matching FK row (in CTI) or guess from nullable column patterns (in STI). Always store the discriminator explicitly. It also enables partial indexes and CHECK constraints.

**4. Mixing strategies without clear rationale.** Some codebases start with STI, then add CTI for one sub-type, then add JSONB for another. The result is that application developers must know which strategy applies to each entity. If you must mix strategies, document the rationale and enforce it in team conventions — not just in code.

**5. Reaching for polymorphism when separate tables are simpler.** Not every "there are multiple types" problem is an inheritance problem. If `email_notifications`, `sms_notifications`, and `push_notifications` have almost nothing in common and are never queried together, three independent tables (concrete-table inheritance, or simply three distinct entities) is simpler than any shared-table approach. Prefer composition and separate entities over inheritance mapping when the hierarchy is shallow and the overlap is small.

## Decision Guide

```
Does the hierarchy have ≤5 sub-types with mostly shared attributes?
  YES → Single Table Inheritance (simple, fast, good ORM support)

Do sub-types have many unique attributes needing DB-level constraints?
  YES → Class Table Inheritance (normalized, integrity-preserving)

Are sub-types truly independent, rarely queried together?
  YES → Concrete Table Inheritance (or separate entities; no shared concept)

Are attributes highly variable, evolving, or schema-migration-averse?
  YES → Document Embedding (JSONB or document store; application enforces shape)
```

## Principle

Pick one inheritance mapping strategy per hierarchy and enforce it consistently. The discriminator column is non-negotiable — it is the only DB-level signal of which sub-type a row represents. Prefer Single Table Inheritance for small, stable hierarchies; Class Table Inheritance when sub-type attributes need DB-level constraints; and Document Embedding when the attribute set is open-ended or evolving rapidly.

## Related BEPs

- [BEE-6001](../data-storage/sql-vs-nosql-tradeoffs.md) — SQL vs NoSQL: document stores handle polymorphic data natively and remove the need for any of the relational inheritance patterns described here.
- [BEE-7001](entity-relationship-modeling.md) — ER Modeling: inheritance mapping decisions flow directly from entity-relationship analysis.
- [BEE-7002](normalization-and-denormalization.md) — Normalization: Class Table Inheritance is a normalized approach; Single Table Inheritance deliberately de-normalizes for query simplicity.

## References

- Martin Fowler, [Single Table Inheritance](https://martinfowler.com/eaaCatalog/singleTableInheritance.html), *Patterns of Enterprise Application Architecture*
- Martin Fowler, [Class Table Inheritance](https://martinfowler.com/eaaCatalog/classTableInheritance.html), *Patterns of Enterprise Application Architecture*
- Martin Fowler, [Concrete Table Inheritance](https://martinfowler.com/eaaCatalog/concreteTableInheritance.html), *Patterns of Enterprise Application Architecture*
- Artem Khrienov, [Table Inheritance Patterns: Single Table vs. Class Table vs. Concrete Table Inheritance](https://medium.com/@artemkhrenov/table-inheritance-patterns-single-table-vs-class-table-vs-concrete-table-inheritance-1aec1d978de1), Medium
- PostgreSQL, [JSONB Data Type](https://www.postgresql.org/docs/current/datatype-json.html), Official Documentation
- Baeldung, [How to Represent Inheritance in a Database](https://www.baeldung.com/sql/database-inheritance)
