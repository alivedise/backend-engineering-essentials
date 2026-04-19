---
id: 11007
title: Virtual Threads and Structured Concurrency
state: draft
slug: virtual-threads-and-structured-concurrency
---

# [BEE-11007] Virtual Threads and Structured Concurrency

:::info
Java's Project Loom makes the simple thread-per-request model scale like reactive programming — by making threads cheap enough to block without wasting OS resources — while structured concurrency enforces lifetime rules that prevent thread leaks.
:::

## Context

The fundamental scalability problem of Java servers before 2023 was the 1:1 mapping between a Java thread and an OS thread. An OS thread consumes approximately 1 MB of stack memory and requires a kernel thread to schedule. A server with 10,000 concurrent requests needed 10,000 OS threads — a constraint that pushed the industry toward reactive programming (Spring WebFlux, RxJava, Vert.x) where a small pool of threads handles requests non-blocking via callbacks and futures. Reactive frameworks solve the scalability problem but at a steep cost: stack traces become fragmented across callback chains, standard Java debugging tools stop working, and every library in the dependency graph must expose a reactive API.

Project Loom is the OpenJDK initiative to eliminate this trade-off. Ron Pressler (Technical Lead, Oracle), in his InfoQ podcast interview (May 2021), framed the core insight: "Modern servers support up to one million open sockets, but Java can only sustain a few thousand platform threads. Virtual threads eliminate this bottleneck by making threads cheap enough to allocate one per task."

Virtual Threads were finalized in Java 21 (JEP 444, September 2023). They are ordinary `java.lang.Thread` instances, but they live on the heap rather than the OS stack. The JVM mounts a virtual thread onto a platform thread (a "carrier thread") to run, and unmounts it when the virtual thread blocks on I/O — freeing the carrier thread to run another virtual thread immediately. The blocking virtual thread's stack is preserved in heap memory as a continuation. No OS thread sits idle waiting.

Structured Concurrency (under preview since Java 21 via JEP 453; still evolving through Java 25 via JEP 525) provides the complementary API: when you fork multiple subtasks from a virtual thread, `StructuredTaskScope` guarantees that all subtasks complete or are cancelled before the scope exits. This eliminates the class of bugs where a failed subtask leaks a running thread in the background.

## How Virtual Threads Work

The JVM maintains a dedicated `ForkJoinPool` called the **virtual thread scheduler**. Platform threads within this pool are called **carrier threads**.

**Default scheduler configuration:**
- `jdk.virtualThreadScheduler.parallelism`: number of carrier threads = CPU core count
- `jdk.virtualThreadScheduler.maxPoolSize`: hard upper bound of 256 carrier threads
- The pool can temporarily expand above parallelism (up to 256) to compensate for pinned carrier threads

When a virtual thread executes a blocking operation (I/O, `Thread.sleep()`, `Object.wait()`), it unmounts from the carrier thread. The carrier is returned to the pool immediately and picks up another runnable virtual thread. The blocking virtual thread's stack frames are serialized as a **continuation** object on the heap — a few hundred bytes rather than the 1 MB reserved for a platform thread stack.

```java
// Creates one virtual thread per submitted task — the recommended production pattern
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    Future<Order>    order    = executor.submit(() -> db.fetchOrder(id));
    Future<Customer> customer = executor.submit(() -> db.fetchCustomer(id));
    return new Response(order.get(), customer.get());
}

// Named virtual threads (useful for thread dumps)
ThreadFactory factory = Thread.ofVirtual().name("req-handler-", 0).factory();
```

## The Pinning Problem and Its Resolution

A virtual thread is **pinned** — unable to unmount from its carrier thread during a blocking operation — in two situations:

1. The virtual thread is inside a `synchronized` block or method (Java 21–23)
2. The virtual thread is executing a native method or JNI call

Pinning is not a correctness bug, but it harms scalability: if all 256 carrier threads are pinned, no other virtual thread can progress.

**Detecting pinning (Java 21+):**
```bash
-Djdk.tracePinnedThreads=full    # full stack trace on pinning
-Djdk.tracePinnedThreads=short   # only the blocking frames
```

Java Flight Recorder (JFR) also emits `jdk.VirtualThreadPinned` events (default threshold: 20 ms).

**Fixing pinning in Java 21–23:** replace `synchronized` blocks that contain I/O with `ReentrantLock`:

```java
// Java 21-23: synchronized pins the carrier thread during I/O
synchronized (lock) {
    result = callExternalService(); // BLOCKS carrier
}

// Fix: ReentrantLock allows unmounting
lock.lock();
try {
    result = callExternalService(); // virtual thread unmounts; carrier is free
} finally {
    lock.unlock();
}
```

**Java 24+ (JEP 491):** The `synchronized` keyword was reimplemented so that virtual threads can acquire, hold, and release object monitors independently of carrier threads. In benchmarks, CPU-intensive scenarios under pinning showed a 70x improvement (31.8 s → 0.45 s), and Spring Boot I/O scenarios showed a 5.3x improvement (12.5 s → 2.3 s). After JEP 491, `ReentrantLock` migration is no longer required for scalability.

## Structured Concurrency

The problem with `ExecutorService` for fan-out patterns: if you fork two tasks and one throws an exception, the other task keeps running until you explicitly cancel it. Forgetting to cancel is a thread leak. Error propagation is manual. Thread dumps show a flat list with no parent-child structure.

`StructuredTaskScope` enforces a **lifetime rule**: all forked subtasks must complete (or be cancelled) before the scope closes. Being `AutoCloseable`, it is used in try-with-resources.

**ShutdownOnFailure** — all subtasks must succeed; first failure cancels the rest:

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Subtask<Order>    order    = scope.fork(() -> db.fetchOrder(id));
    Subtask<Customer> customer = scope.fork(() -> db.fetchCustomer(id));

    scope.join();           // wait for all subtasks to finish or the scope to shut down
    scope.throwIfFailed();  // propagate the first exception; cancels any still-running subtask

    return new Response(order.get(), customer.get());
}
// Scope close: guaranteed that both subtasks have finished — no thread leak
```

**ShutdownOnSuccess** — return the first successful result; cancel the rest:

```java
try (var scope = new StructuredTaskScope.ShutdownOnSuccess<String>()) {
    scope.fork(() -> fetchFromPrimary());
    scope.fork(() -> fetchFromReplica());

    scope.join();
    return scope.result(); // first successful result; losers cancelled
}
```

Structured concurrency also makes thread dumps readable: the threads forked inside a scope appear as children of the scope owner in the dump, matching the logical program structure.

**Status:** Structured Concurrency has been in preview since Java 21 (JEP 453) and remains in preview through Java 25 (JEP 525) while the API is refined. The semantics are stable; the factory method API changed in JEP 505. Do not use it in stable library APIs yet, but it is safe for application code.

## Scoped Values

`ThreadLocal` was designed for long-lived, pooled platform threads. With virtual threads — which are never pooled and live only for one task — `ThreadLocal` causes problems:

- Every virtual thread allocates its own slot, yielding zero cache benefit.
- Libraries that use `ThreadLocal` to cache expensive objects (e.g., `SimpleDateFormat`, date formatters) instantiate a new cached object per virtual thread — creating heap pressure with no reuse.
- `ThreadLocal` is mutable; any callee can overwrite the value.
- Cleanup requires explicit `remove()`; forgetting causes leaks.

`ScopedValue` (JEP 487 in Java 24 preview; **finalized in Java 25 via JEP 506**) is the correct replacement:

```java
static final ScopedValue<User> CURRENT_USER = ScopedValue.newInstance();

// Bind in the request handler
ScopedValue.where(CURRENT_USER, authenticatedUser)
           .run(() -> handleRequest()); // CURRENT_USER is visible to all callees

// Read deep in the call stack — no parameter threading required
void handleRequest() {
    User u = CURRENT_USER.get();
    // ...
}
```

Scoped values are **immutable** (a rebind creates a new inner scope), **automatically disposed** when the `run()` block exits, and **inherited by child threads** in `StructuredTaskScope` — subtasks automatically see the parent's scoped values.

## Best Practices

**MUST NOT use virtual threads for CPU-bound tasks.** Virtual threads do not preempt CPU-bound work. A virtual thread running pure computation holds its carrier thread until it blocks or completes. Use a bounded platform thread pool (`Executors.newFixedThreadPool(availableProcessors())`) for CPU-intensive operations.

**MUST bound concurrent access to shared resources with finite capacity.** Creating one virtual thread per incoming request with no throttling will overwhelm databases and downstream services, which still have bounded connection pools and thread pools. Use a `Semaphore`:

```java
private final Semaphore dbSemaphore = new Semaphore(100); // max 100 concurrent DB calls

void queryDatabase() throws InterruptedException {
    dbSemaphore.acquire();
    try {
        db.query(...);
    } finally {
        dbSemaphore.release();
    }
}
```

**MUST audit dependencies for `ThreadLocal` misuse before migrating to virtual threads.** Libraries that cache per-thread objects via `ThreadLocal` (connection state, formatters, parsers) will allocate those objects for every virtual thread with zero reuse. Prefer `ScopedValue` for request-scoped context propagation.

**SHOULD replace `synchronized`-with-I/O with `ReentrantLock` for Java 21–23 deployments.** On Java 24+ (JEP 491), this migration is no longer needed for scalability.

**SHOULD monitor virtual thread pinning via JFR `jdk.VirtualThreadPinned` events** in production. A spike in pinning events indicates a library or framework is holding synchronized monitors over blocking I/O.

**SHOULD use `StructuredTaskScope` for all fan-out patterns** (parallel sub-requests, redundant calls). It prevents thread leaks that are easy to introduce with raw `Future` composition.

**MUST NOT pool virtual threads.** Thread pools exist to amortize the cost of thread creation; virtual threads are so cheap to create that pooling is unnecessary and counterproductive (it defeats the lifetime-per-task model that structured concurrency requires).

## Virtual Threads vs. Reactive and Go Goroutines

**vs. Reactive programming (WebFlux, RxJava):** Both achieve I/O concurrency without proportionally scaling OS threads. Reactive requires async APIs throughout the stack and produces fragmented stack traces. Virtual threads use ordinary blocking Java code and work with any existing blocking library (JDBC, file I/O, `Thread.sleep()`). For I/O-bound workloads at typical enterprise scale (10k–50k concurrent requests), throughput is equivalent. Reactive retains an advantage at extreme streaming concurrency (500k+ persistent connections).

**vs. Go goroutines:** Both are user-space threads with M:N scheduling. Go's scheduler implements asynchronous preemption (since Go 1.14) — a CPU-bound goroutine will eventually be preempted, allowing others to run. Java virtual threads have no CPU preemption; a CPU-bound virtual thread holds its carrier until it blocks. Go goroutines handle CPU-intensive concurrent workloads more gracefully. For I/O-bound server workloads, the models are functionally equivalent.

## Framework Adoption

**Spring Boot 3.2+ (Java 21 required):** One property switches all request handling to virtual threads:
```properties
spring.threads.virtual.enabled=true
```
This reconfigures Tomcat's thread pool to `Executors.newVirtualThreadPerTaskExecutor()` and Spring's async task executor to use virtual threads.

**Quarkus:** Annotate blocking endpoint handlers with `@RunOnVirtualThread` to dispatch on a virtual thread instead of the Vert.x event loop. Works across REST, Kafka consumers, and database operations.

**Helidon Níma (Helidon 4):** The first Java microservices framework designed from the ground up on virtual threads — no reactive core underneath. Uses blocking sockets rather than NIO, with one virtual thread per HTTP connection. Helidon benchmarks show performance competitive with async Netty.

## Common Mistakes

**Benchmarking virtual threads under CPU-bound load.** IBM's Open Liberty team found 10–40% lower throughput vs. a well-tuned platform thread pool on CPU-intensive workloads, and 50–55% of baseline on 2-CPU machines due to Linux scheduler / ForkJoinPool interaction. Virtual threads provide scale at high concurrency, not faster per-request execution.

**Not capping downstream parallelism.** Virtual threads make it trivially easy to issue 50,000 concurrent JDBC queries. A database typically handles hundreds to low thousands of concurrent queries efficiently. Without a `Semaphore` or connection pool size limit, virtual threads will overwhelm the database.

**Using `Thread.currentThread()` identity for state.** Virtual threads are created fresh per task and never reused. Patterns that cache state keyed to `Thread.currentThread()` identity — or use `ThreadLocal` for caching rather than context propagation — break under virtual threads. Migrate caching patterns to explicit scopes or request-scoped contexts.

**Treating virtual threads as green threads for all use cases.** Virtual threads block cooperatively at well-defined points (blocking I/O, `Object.wait()`). They are not magic: code that spins in a tight CPU loop, holds `synchronized` over network I/O (Java 21–23), or calls long native methods (JNI) will not benefit from virtual threads.

## Related BEEs

- [BEE-11001](threads-vs-processes-vs-coroutines.md) -- Threads vs Processes vs Coroutines: the conceptual distinction between OS threads, green threads, and coroutines that virtual threads build on
- [BEE-11004](async-i-o-and-event-loops.md) -- Async I/O and Event Loops: reactive programming model that virtual threads offer an alternative to for I/O-bound workloads
- [BEE-11005](producer-consumer-and-worker-pool-patterns.md) -- Producer-Consumer and Worker Pool Patterns: when to use bounded platform thread pools (CPU-bound tasks) vs. virtual threads (I/O-bound tasks)
- [BEE-13003](../performance-scalability/connection-pooling-and-resource-management.md) -- Connection Pooling and Resource Management: why connection pools still matter even with virtual threads
- [BEE-13008](../performance-scalability/jvm-jit-compilation-and-application-warm-up.md) -- JVM JIT Compilation and Application Warm-Up: JVM internals context for understanding carrier thread scheduling

## References

- [JEP 444: Virtual Threads — OpenJDK (Java 21)](https://openjdk.org/jeps/444)
- [JEP 453: Structured Concurrency (First Preview) — OpenJDK (Java 21)](https://openjdk.org/jeps/453)
- [JEP 491: Synchronize Virtual Threads without Pinning — OpenJDK (Java 24)](https://openjdk.org/jeps/491)
- [JEP 506: Scoped Values (Final) — OpenJDK (Java 25)](https://openjdk.org/jeps/506)
- [Virtual Threads — Oracle Java 21 Core Libraries](https://docs.oracle.com/en/java/javase/21/core/virtual-threads.html)
- [Ron Pressler: Java's Project Loom — InfoQ Podcast (May 2021)](https://www.infoq.com/podcasts/java-project-loom/)
- [Managing Throughput with Virtual Threads — Billy Korando, inside.java (February 2024)](https://inside.java/2024/02/04/sip094/)
- [Java Virtual Threads: A Case Study — Gary DeVal et al., InfoQ (July 2024)](https://www.infoq.com/articles/java-virtual-threads-a-case-study/)
- [When Quarkus Meets Virtual Threads — Clement Escoffier, Quarkus Blog (September 2023)](https://quarkus.io/blog/virtual-thread-1/)
- [All together now: Spring Boot 3.2, Java 21, and Virtual Threads — Spring Blog (September 2023)](https://spring.io/blog/2023/09/09/all-together-now-spring-boot-3-2-graalvm-native-images-java-21-and-virtual/)
