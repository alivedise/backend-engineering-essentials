---
id: 15007
title: Property-Based Testing
state: draft
slug: property-based-testing
---

# [BEE-15007] Property-Based Testing

:::info
Property-based testing replaces manually chosen examples with automatically generated inputs checked against a general claim — then automatically finds the smallest input that breaks it.
:::

## Context

Example-based testing (the dominant form in BEE-15001's Testing Pyramid) has a structural weakness: you can only test what you think to write. A developer writing `assert sort([3,1,2]) == [1,2,3]` has chosen a specific input and expected output. If the sort algorithm works for that input but fails for an input with duplicate elements, an empty list, or a list of a million identical values, the test passes and the bug ships.

Property-based testing (PBT) was invented by Koen Claessen and John Hughes as QuickCheck, presented at ICFP 2000 ("QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs," ACM SIGPLAN Notices). The paper received the ACM SIGPLAN Most Influential ICFP Paper award in 2010. Instead of specifying *examples*, specify *properties*: universally quantified claims that must hold for all valid inputs. The framework generates hundreds or thousands of random inputs, checks whether the property holds for each, and upon finding a counterexample, automatically shrinks it to the minimal failing case.

The practical impact is disproportionate relative to the code required. David MacIver (creator of Hypothesis, the leading Python PBT library) documented Hypothesis finding a buffer overflow in an Argon2 implementation (triggered only at hash lengths above 512), a year/month swap in ISO 8601 date parsing (triggered only for dates like `0005-01-01`), and prototype poisoning bugs in npm packages — all through roundtrip and invariant properties that were shorter than the implementation they were testing.

Dropbox built a PBT system called CanopyCheck for their Nucleus sync engine that generates three random filesystem trees and verifies their sync planner always converges them to a consistent state. John Hughes, Benjamin Pierce, Thomas Arts, and Ulf Norell used PBT to find surprising bugs in Dropbox and competing sync services (IEEE ICST 2016, "Mysteries of DropBox"). The pattern: PBT excels at finding edge cases at the intersection of domain constraints — precisely the cases a human cannot enumerate.

## Core Concepts

### Properties vs. Examples

An example test:
```python
assert sorted([3, 1, 2]) == [1, 2, 3]
```

A property:
```python
for all lists xs:
    result = sorted(xs)
    # Property 1: the result is ordered
    assert all(result[i] <= result[i+1] for i in range(len(result)-1))
    # Property 2: the result contains the same elements
    assert sorted(result) == result  # idempotency
    assert len(result) == len(xs)
```

The property does not require knowing what `sorted([3,1,2])` returns — only that whatever it returns obeys these invariants. This is the shift from "what does this function return for this input?" to "what must always be true about any output?"

### Generators and Strategies

Generators (called "strategies" in Hypothesis) produce random values of a specified type. Frameworks ship built-in generators for:
- Primitives: integers (including boundary values like `MIN_INT`, `MAX_INT`, `0`, `-1`), floats (including `NaN`, `+Inf`, `-Inf`), booleans
- Text: ASCII, unicode (including code points that break ASCII assumptions: null bytes, RTL markers, zero-width joiners, emoji)
- Collections: lists, sets, dicts, tuples of arbitrary element type and size
- Domain: `st.emails()`, `st.ip_addresses()`, `st.datetimes()`, `st.fractions()`

Strategies compose: `st.lists(st.text())` generates lists of strings; `st.dictionaries(st.text(), st.integers())` generates string-keyed integer dicts. Custom strategies build domain objects from primitive components.

### Shrinking

Finding a failure is only half the value of PBT. The other half is shrinking: automatically finding the *minimal* input that still triggers the failure. Without shrinking, a failed property might report a 500-element list with arbitrary values as its counterexample — nearly impossible to debug. After shrinking, it reports `[0, -1]` — the smallest list that exposes the bug.

**QuickCheck-style (type-class) shrinking**: Each type defines its own shrinking strategy. `Int` shrinks toward 0; lists shrink by removing elements and shrinking individual elements. This is fast but can violate generator invariants: a generator that produces only even integers may shrink a failing even integer to an odd one, causing a spurious failure.

**Hypothesis integrated shrinking**: Hypothesis shrinks the underlying byte stream that all strategies read from, not the generated value directly. Because the same strategy code re-executes on the shrunk stream, all generator invariants are automatically preserved. This makes Hypothesis's shrinking more reliable across complex composed strategies.

### Stateful (Model-Based) Testing

Stateful PBT tests a system that evolves through operations, not a pure function. The framework defines:
- A **model**: a simplified, obviously correct representation of expected state (e.g., a `dict` for a cache)
- **Rules**: the allowed operations (put, get, delete)
- **Postconditions**: assertions that after each operation, the real system's result matches the model's prediction
- **Invariants**: properties that must hold after every operation regardless of which rule fired

The framework generates random rule sequences, runs them against both model and real system, and shrinks any failing sequence to the minimal sequence of steps that causes divergence. This catches bugs in complex stateful systems that no amount of example testing covers — the bug only manifests after a specific sequence of operations.

## Property Patterns

John Hughes's "How to Specify It!" (2019/2020) identifies five approaches to writing properties, in ascending order of effectiveness at bug-finding:

**1. Roundtrip / There-and-Back**
`parse(serialize(x)) == x` or `decode(encode(x)) == x`

The most effective single pattern for serialization, compression, encryption, and codec code. Catches: silent data corruption, boundary condition truncation, encoding assumption mismatches.

**2. Invariants / Some Things Never Change**
A transformation preserves a structural property:
- `sorted(xs)` is in ascending order
- `len(map(f, xs)) == len(xs)`
- `deduplicate(xs)` contains no duplicates

**3. Algebraic Properties**
Mathematical laws the function must obey:
- Idempotency: `sort(sort(xs)) == sort(xs)`; `deduplicate(deduplicate(xs)) == deduplicate(xs)`
- Commutativity: `add(x, y) == add(y, x)`
- Associativity: `add(add(x, y), z) == add(x, add(y, z))`

**4. Oracle / Reference Model**
Compare a fast but complex implementation against a slow but obviously correct reference:
```python
for all xs:
    assert optimized_sort(xs) == naive_bubble_sort(xs)
```
The naive implementation serves as the oracle. Effective during optimization or refactoring.

**5. Model-Based / Stateful**
After any valid sequence of operations, real system matches model. Highest bug-finding rate in Hughes's empirical study — 100% detection of seeded bugs vs. 57% for simpler postcondition tests.

## Best Practices

**SHOULD add PBT alongside, not instead of, example-based tests.** Properties are best at finding edge cases in the input domain; examples are best at documenting expected behavior for specific scenarios. The two are complementary.

**MUST start with roundtrip properties for any serialization, encoding, or parsing code.** `parse(serialize(x)) == x` requires almost no domain knowledge and has an extremely high bug-detection rate. It catches silent truncation, encoding assumption violations, and boundary handling bugs that manual test cases systematically miss.

**SHOULD use the default run count for development (100 examples in most frameworks) and a higher count for CI nightly runs.** PBT tests are more expensive than example tests. The trade-off: 100 random examples in the fast path catch most regressions; 10,000 examples in nightly runs find rarer edge cases.

**MUST configure seeds for reproducibility.** Most frameworks support a fixed seed for debugging. In CI, log the seed used for any failing run so it can be replayed locally:

```python
# Hypothesis: use @settings(derandomize=True) for fixed seed
@settings(derandomize=True)
@given(st.lists(st.integers()))
def test_sort_idempotent(xs):
    assert sorted(sorted(xs)) == sorted(xs)
```

**SHOULD write custom strategies for domain objects** rather than generating unconstrained random primitives that violate business rules. A strategy that generates valid `Order` objects produces more relevant failures than a strategy that generates arbitrary strings for order IDs.

**SHOULD use stateful testing for any component that maintains non-trivial internal state**: caches, queues, rate limiters, connection pools, state machines. The model need not be sophisticated — a plain dict or list suffices as the oracle for most cache and queue implementations.

**MUST NOT treat "no exception raised" as a meaningful property.** Smoke properties (`no crash for any input`) have low signal. Combine with structural invariants: `no exception AND output is correctly ordered AND output length matches input length`.

## Implementation Notes

### Python — Hypothesis

```python
from hypothesis import given, settings, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, rule, invariant

# Basic property: roundtrip
@given(st.text())
def test_json_roundtrip(s):
    import json
    assert json.loads(json.dumps({"key": s}))["key"] == s

# Stateful test: cache model
class CacheTest(RuleBasedStateMachine):
    def __init__(self):
        super().__init__()
        self.cache = MyLRUCache(capacity=3)
        self.model = {}

    @rule(key=st.text(), value=st.integers())
    def put(self, key, value):
        self.cache.put(key, value)
        self.model[key] = value          # model update

    @rule(key=st.text())
    def get(self, key):
        cached = self.cache.get(key)
        # postcondition: result matches model (ignoring eviction)
        if key in self.model and cached is not None:
            assert cached == self.model[key]

    @invariant()
    def size_within_capacity(self):
        assert self.cache.size() <= 3

TestCache = CacheTest.TestCase
```

Hypothesis maintains a `.hypothesis/` database of previously failing inputs and replays them first on every run — CI will always catch regressions that were previously discovered, even if the random seed is different.

### Java — jqwik

```java
import net.jqwik.api.*;

class SortingProperties {
    @Property
    boolean sortedIsIdempotent(@ForAll List<Integer> xs) {
        List<Integer> once = sorted(xs);
        List<Integer> twice = sorted(once);
        return once.equals(twice);
    }

    @Property
    boolean sortedContainsSameElements(@ForAll List<Integer> xs) {
        List<Integer> result = sorted(xs);
        return new HashSet<>(result).equals(new HashSet<>(xs))
               && result.size() == xs.size();
    }
}
```

### JavaScript/TypeScript — fast-check

```typescript
import fc from "fast-check";

// Roundtrip property for a custom serializer
fc.assert(
  fc.property(fc.string(), (s) => {
    expect(deserialize(serialize(s))).toEqual(s);
  })
);

// Commutativity of merge
fc.assert(
  fc.property(
    fc.object(), fc.object(),
    (a, b) => deepEqual(merge(a, b), merge(b, a))
  )
);
```

fast-check replays failures deterministically via a seed printed in the failure message. Pass `{seed, path}` from the failure output to reproduce:

```typescript
fc.assert(fc.property(fc.integer(), ...), { seed: 1234, path: "0:0" });
```

### Go — rapid

```go
import "pgregory.net/rapid"

func TestSortIdempotent(t *testing.T) {
    rapid.Check(t, func(t *rapid.T) {
        xs := rapid.SliceOf(rapid.Int()).Draw(t, "xs")
        once := sort.Ints(copyOf(xs)); sort.Ints(once)
        twice := copyOf(once); sort.Ints(twice)
        if !slicesEqual(once, twice) {
            t.Fatalf("sort not idempotent: %v vs %v", once, twice)
        }
    })
}
```

## Common Mistakes

**Writing trivial properties that test nothing.** `for all xs: sort(xs) != nil` passes for any broken sort that returns an empty list. Properties must make structural claims about the relationship between input and output.

**Generating unconstrained inputs for constrained domains.** If a function requires a valid email address, generating arbitrary `st.text()` will produce mostly invalid emails, and the test will fail on input validation rather than the logic under test. Build a custom strategy that generates valid emails.

**Running PBT in place of contract tests or golden-path examples.** PBT finds unknowns; example tests document known behavior. A roundtrip property does not replace a test that `serialize(Order(id=1, amount=9.99))` produces the exact expected JSON. Both are needed.

**Ignoring the shrunk counterexample.** When PBT reports a failure, the shrunk input is the *minimal* failure. Debugging the original large random input instead of the shrunk one wastes time. Always work from the shrunk case.

**Making stateful tests too complex.** A stateful test with 15 rules is as hard to reason about as the system it tests. Start with 3–4 operations, verify the model is correct for those, then expand. A wrong model produces false positives — the test fails even on correct code.

## Related BEEs

- [BEE-15001](testing-pyramid.md) -- The Testing Pyramid: where PBT fits — it augments unit tests at the base; it is not a replacement for integration or contract tests
- [BEE-15002](integration-testing-for-backend-services.md) -- Integration Testing for Backend Services: PBT can drive integration tests by generating realistic request sequences for stateful API testing
- [BEE-15003](contract-testing.md) -- Contract Testing: both PBT and contract testing validate interface invariants; contract tests fix the schema, PBT generates inputs within it
- [BEE-15005](test-doubles-mocks-stubs-fakes.md) -- Test Doubles: Mocks, Stubs, Fakes: in stateful PBT, the model plays the role of an in-memory fake for the real system

## References

- [Koen Claessen, John Hughes. QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs — ACM SIGPLAN ICFP 2000](https://dl.acm.org/doi/10.1145/351240.351266)
- [John Hughes. How to Specify It! A Guide to Writing Properties of Pure Functions — Springer, 2020](https://link.springer.com/chapter/10.1007/978-3-030-47147-7_4)
- [David R. MacIver. In Praise of Property-Based Testing — Increment Issue 10, August 2019](https://increment.com/testing/in-praise-of-property-based-testing/)
- [David R. MacIver. What is Property Based Testing? — hypothesis.works](https://hypothesis.works/articles/what-is-property-based-testing/)
- [David R. MacIver, Zac Hatfield-Dodds et al. Hypothesis: A new approach to property-based testing — Journal of Open Source Software, 2019](https://doi.org/10.21105/joss.01891)
- [David R. MacIver. Integrated vs Type Based Shrinking — hypothesis.works](https://hypothesis.works/articles/integrated-shrinking/)
- [John Hughes, Benjamin Pierce et al. Mysteries of DropBox: Property-Based Testing of a Distributed Synchronization Service — IEEE ICST 2016](https://ieeexplore.ieee.org/document/7515466/)
- [Isaac Goldberg. Testing Sync at Dropbox — Dropbox Tech Blog, April 2020](https://dropbox.tech/infrastructure/-testing-our-new-sync-engine)
- [Scott Wlaschin. Choosing Properties for Property-Based Testing — F# for Fun and Profit, December 2014](https://fsharpforfunandprofit.com/posts/property-based-testing-2/)
- [fast-check — Nicolas Dubien](https://fast-check.dev/)
- [jqwik — Johannes Link](https://jqwik.net/)
