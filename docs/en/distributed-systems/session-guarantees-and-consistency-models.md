---
id: 19019
title: Session Guarantees and Consistency Models
state: draft
slug: session-guarantees-and-consistency-models
---

# [BEE-19019] Session Guarantees and Consistency Models

:::info
Between linearizability (globally ordered, real-time) and eventual consistency (no ordering guarantees) lies a spectrum of models — session guarantees, causal consistency, sequential consistency — that trade coordination cost against freshness, giving system designers a vocabulary for specifying exactly the consistency properties their application needs rather than accepting an all-or-nothing choice.
:::

## Context

CAP theorem forces a binary choice between consistency and availability during network partitions, but most engineers face a richer question: what consistency level does this particular operation actually need? Werner Vogels framed this in "Eventually Consistent" (Communications of the ACM, January 2009) by distinguishing **server-centric** consistency (properties observable from any external observer, like linearizability) from **client-centric** consistency (properties observable from a single client's perspective over its own session). A user reading their own profile after updating it needs the former; a user browsing a product catalog does not.

The formal foundation for client-centric models was laid by Douglas Terry, Alan Demers, Karin Petersen, and colleagues at Xerox PARC in "Session Guarantees for Weakly Consistent Replicated Data" (PDIS 1994). They defined four session guarantees that can be composed independently:

- **Read Your Writes (RYW)**: a read within a session always reflects the writes of that same session. If you write value V, you will never read a value older than V in the same session.
- **Monotonic Reads (MR)**: once a session observes a value at version V, it never observes a version older than V. Time only moves forward from the session's perspective.
- **Monotonic Writes (MW)**: writes issued by a session are applied at all replicas in the order they were issued. A later write is never visible before an earlier write from the same session.
- **Writes Follow Reads (WFR)**: if a session reads version V of an object and then writes a new version, that write is applied only to replicas that have already applied version V. This ensures causally related writes are ordered correctly.

Combining all four gives **session consistency** (also called PRAM — Pipeline RAM, Lipton and Sandberg, 1988), which captures the intuitive guarantees a single user expects from their own session without requiring global coordination across all sessions. Peter Bailis, Aaron Davidson, and collaborators proved in "Highly Available Transactions: Virtues and Limitations" (VLDB 2013) that RYW, MR, and MW are achievable with high availability (AP systems can provide them); full causal consistency (WFR extended to cross-session causality) requires at least some coordination.

Daniel Abadi extended the CAP framework in "Consistency Tradeoffs in Modern Distributed Database System Design" (IEEE Computer, February 2012) with the **PACELC theorem**: even in the absence of partitions, systems must choose between lower **L**atency and stronger **C**onsistency. PACELC classifies systems on two axes: PA/EL (partition-available, else latency-optimized — Cassandra, DynamoDB) vs. PC/EC (partition-consistent, else consistency-optimized — CockroachDB, Cloud Spanner). This explains why even in a healthy cluster, a read from a Cassandra ONE replica is faster but potentially staler than a QUORUM read.

## Design Thinking

**Match the consistency model to the access pattern, not to the database default.** The same database may serve multiple access patterns with different needs. A user reading their own shopping cart needs RYW — they must see their own just-added items. A user browsing a product listing needs MR — prices should not jump backward — but does not need to see every other user's edits in real time. An analytics dashboard needs eventual consistency — slight staleness is acceptable for throughput. Configure per-request or per-session consistency rather than applying the strongest model globally.

**Session guarantees are cheap when routing is sticky.** RYW and MR can be guaranteed simply by routing all requests from a session to the same replica — the replica's local ordering guarantees monotonicity. This requires no inter-replica coordination. The cost is reduced load balancing across replicas for that session. When sticky routing is infeasible (the session spans multiple services, or the replica is unavailable), vector-clock-based version tracking moves the coordination to the client: include the session's last-seen version token in every request; the replica waits until it has applied that version before serving the read.

**Causal consistency and PACELC latency are linked.** Causal consistency requires that writes propagating to replica B are applied only after the writes they causally depend on. Enforcing this requires replicas to exchange dependency metadata on every write — minimum one cross-replica round-trip per write. This is the latency cost PACELC's "E" term captures: even when the cluster is healthy, causal consistency costs more latency than eventual consistency. Systems like MongoDB's causal sessions and Amazon's CausalConsistency read concern implement this via a cluster time scalar; systems like COPS (Lloyd et al., SOSP 2011) use dependency lists.

**Upgrading to stronger consistency is one-way and localized.** Starting with eventual consistency and upgrading to causal or session consistency is a valid migration path. But the strengthening only helps operations that explicitly opt into it. If a microservice reads with eventual consistency and another writes causally, there is no guarantee the eventually-consistent reader sees causally-ordered data. The session guarantee is per-session: it says nothing about cross-session ordering.

## Consistency Spectrum

| Model | Guarantee | Achievable with HA? | Coordination cost |
|---|---|---|---|
| Linearizability | Total order matching real time | No | High (quorum per op) |
| Sequential | Total order, no real-time | No | High |
| Causal | Causally related ops ordered | No (convergent causal: yes) | Medium |
| Session (RYW+MR+MW+WFR) | Session-local ordering | Yes (with sticky routing) | Low |
| Monotonic Reads only | No backward time-travel per session | Yes | None (sticky) |
| Eventual | All replicas eventually agree | Yes | None |

## Example

**MongoDB causal consistency session:**

```python
from pymongo import MongoClient

client = MongoClient("mongodb://replica-set-host/?replicaSet=rs0")
db = client.mydb

# Start a causal session — MongoDB tracks cluster time and operation time
# to enforce RYW, MR, MW, WFR across the replica set
with client.start_session(causal_consistency=True) as session:
    # Write with majority write concern — ensures write reaches majority before ack
    db.orders.insert_one(
        {"order_id": 42, "status": "pending"},
        session=session
    )

    # Read with majority read concern + session token
    # MongoDB sends the session's cluster time; the replica waits until it
    # has applied all operations up to that time before serving the read
    order = db.orders.find_one(
        {"order_id": 42},
        session=session
    )
    # Guaranteed to reflect the insert above (RYW), even if the read
    # is served by a different replica set member than the write
    assert order["status"] == "pending"
```

**Version token approach for RYW without sticky routing:**

```python
# After a write, the server returns the version token (LSN, vector clock, etc.)
# Client includes this token in subsequent reads; replica waits until it reaches that version

def write_order(order_data):
    result = db.execute("INSERT INTO orders ...", order_data)
    return result.replication_token   # e.g., "lsn:0/3A9B4F8"

def read_order(order_id, min_version_token=None):
    # Include the token from the write so any replica can serve this read
    # once it has caught up to at least that LSN
    return db.execute(
        "SELECT * FROM orders WHERE order_id = %s",
        order_id,
        consistency="session",
        min_lsn=min_version_token
    )

token = write_order({"order_id": 42, "status": "pending"})
# Pass token to any downstream service or next request
order = read_order(42, min_version_token=token)
# RYW guaranteed even if routed to a different node than the write
```

**PACELC in practice — per-operation consistency selection:**

```
# Cassandra: PA/EL system
# Default: PA (eventual consistency), low latency
SELECT * FROM product_catalog WHERE product_id = 'sku-1';   # ONE → fast, stale ok

# Upgrade to PC for this operation (pay coordination cost)
SELECT * FROM inventory WHERE product_id = 'sku-1' USING SERIAL;  # Paxos linearizable

# DynamoDB: PA/EL system
# Eventually consistent read — ~50% cost, possibly stale
response = table.get_item(Key={"order_id": 42})

# Strongly consistent read — 2× cost, always fresh (not linearizable, but RYW)
response = table.get_item(Key={"order_id": 42}, ConsistentRead=True)

# CockroachDB: PC/EC system
# All reads are linearizable by default — consistency at cost of latency
SELECT * FROM orders WHERE order_id = 42;  # always linearizable, cross-region = slower

# Optional: stale reads for read-heavy replicas (accept up to 10s staleness)
SET transaction_read_only = true;
SET transaction_as_of_system_time = '-10s';
SELECT * FROM product_catalog WHERE product_id = 'sku-1';
```

## Related BEEs

- [BEE-19001](cap-theorem-and-the-consistency-availability-tradeoff.md) -- CAP Theorem: CAP describes the partition-time tradeoff; PACELC extends it with the latency-consistency tradeoff during normal operation — session guarantees are one tool for navigating the CAP availability side without fully sacrificing per-session freshness
- [BEE-19003](vector-clocks-and-logical-timestamps.md) -- Vector Clocks and Logical Timestamps: version tokens used to implement RYW and WFR across replicas are often vector clocks or scalar logical timestamps; the client tracks the last-seen clock value and requests reads at that version or later
- [BEE-19009](linearizability-and-serializability.md) -- Linearizability and Serializability: linearizability and sequential consistency are the strongest server-centric models on the consistency spectrum; session guarantees are the strongest achievable client-centric models without cross-session coordination
- [BEE-19014](quorum-systems-and-nwr-consistency.md) -- Quorum Systems and NWR Consistency: QUORUM reads approximate session consistency (MR, RYW) when W+R>N; ONE reads provide only eventual consistency; the quorum size determines where on the consistency spectrum each read lands

## References

- [Session Guarantees for Weakly Consistent Replicated Data -- Terry, Demers, Petersen et al., PDIS 1994](https://ieeexplore.ieee.org/document/331722/)
- [Eventually Consistent -- Werner Vogels, CACM January 2009](https://dl.acm.org/doi/10.1145/1435417.1435432)
- [Consistency Tradeoffs in Modern Distributed Database System Design (PACELC) -- Daniel Abadi, IEEE Computer 2012](https://ieeexplore.ieee.org/document/6127847/)
- [PACELC Paper PDF -- Daniel Abadi, University of Maryland](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf)
- [Highly Available Transactions: Virtues and Limitations -- Bailis, Davidson, Fekete et al., VLDB 2013](https://www.vldb.org/pvldb/vol7/p181-bailis.pdf)
- [Highly Available Transactions (extended) -- arXiv 2013](https://arxiv.org/abs/1302.0309)
- [Causal Consistency Read/Write Concerns -- MongoDB Documentation](https://www.mongodb.com/docs/manual/core/causal-consistency-read-write-concerns/)
- [Linearizability: A Correctness Condition for Concurrent Objects -- Herlihy and Wing, ACM TOPLAS 1990](https://dl.acm.org/doi/10.1145/78969.78972)
