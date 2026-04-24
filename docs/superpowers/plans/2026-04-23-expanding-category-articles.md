# expanding-category-articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global Claude Code skill at `~/.claude/skills/expanding-category-articles/` that expands an existing category in a bilingual VitePress doc-site by surveying the category, proposing gap topics, then researching and writing N new articles inside an isolated git worktree.

**Architecture:** A `SKILL.md` reference document plus three prompt-template files (for subagent dispatches), three shell scripts (for quality gates), and a RED/GREEN test artifact directory. The skill follows `superpowers:writing-skills` TDD: baseline subagent scenarios establish failure patterns, the skill addresses those patterns, then the scenarios are re-run to verify compliance.

**Tech Stack:** Markdown (SKILL.md, templates), Bash (gate scripts), Claude Code subagent dispatches (RED/GREEN scenarios). No runtime code beyond the gate scripts.

**Source spec:** `docs/superpowers/specs/2026-04-23-expanding-category-articles-skill-design.md`

---

## File Structure

All skill files live at `~/.claude/skills/expanding-category-articles/`:

```
SKILL.md                          # main reference (~400 words target)
templates/
  article.md                      # embedded article template (writer subagent input)
  research-brief.md               # research subagent prompt template
  findings.md                     # findings doc structure template
scripts/
  next-id.sh                      # compute max(id)+1 for a category dir
  validate-frontmatter.sh         # frontmatter field + id-uniqueness check
  check-references.sh             # HEAD-request every URL in References
tests/
  red/
    scenario-1-end-to-end.md      # baseline transcript + failure analysis
    scenario-2-template-drift.md
    scenario-3-fabrication.md
    analysis.md                   # consolidated failure patterns
  green/
    scenario-1-verification.md    # post-skill transcript, compliance check
    scenario-2-verification.md
    scenario-3-verification.md
```

Also, in the BEE repo:
```
/Users/alive/.claude/projects/-Users-alive-Projects-backend-engineering-essentials/memory/
  reference_expanding_category_articles_skill.md   # memory pointer
  MEMORY.md                                        # append index line
```

**Responsibility split:** `SKILL.md` is the phase-flow reference Claude reads first. Templates are reference inputs passed into subagent dispatches (not consumed by the main session directly). Scripts are invoked from SKILL.md's Phase 4e gate and Phase 5 batch gate. Tests are the TDD artifacts required by `superpowers:writing-skills`.

---

## Task 1: Scaffold the skill directory

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/` (dir)
- Create: `~/.claude/skills/expanding-category-articles/templates/` (dir)
- Create: `~/.claude/skills/expanding-category-articles/scripts/` (dir)
- Create: `~/.claude/skills/expanding-category-articles/tests/red/` (dir)
- Create: `~/.claude/skills/expanding-category-articles/tests/green/` (dir)

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p ~/.claude/skills/expanding-category-articles/{templates,scripts,tests/red,tests/green}
```

- [ ] **Step 2: Verify the tree**

```bash
find ~/.claude/skills/expanding-category-articles -type d
```

Expected output (5 directories):
```
~/.claude/skills/expanding-category-articles
~/.claude/skills/expanding-category-articles/templates
~/.claude/skills/expanding-category-articles/scripts
~/.claude/skills/expanding-category-articles/tests
~/.claude/skills/expanding-category-articles/tests/red
~/.claude/skills/expanding-category-articles/tests/green
```

- [ ] **Step 3: No commit yet** — `~/.claude/skills/` is not necessarily a git repo; the user versions it separately.

---

## Task 2: RED — baseline scenario 1 (end-to-end)

This is the first "failing test" required by `superpowers:writing-skills`. Dispatch a fresh subagent with NO skill loaded, give it the high-level task, save the verbatim output. The failure patterns become the specific content the skill must address.

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/tests/red/scenario-1-end-to-end.md`

- [ ] **Step 1: Dispatch baseline subagent**

Use the `Agent` tool with `subagent_type: "general-purpose"`. Prompt (verbatim):

```
You are helping expand a bilingual VitePress doc-site called BEE (Backend Engineering Essentials) at /Users/alive/Projects/backend-engineering-essentials.

Task: Add 5 new articles to the `distributed-systems` category.

Requirements:
- Each article needs an EN version at docs/en/distributed-systems/<slug>.md AND a zh-TW version at docs/zh-tw/distributed-systems/<slug>.md
- Articles use frontmatter: id (integer), title, state (draft), slug
- Articles are researched against authoritative sources (no AI-internal-knowledge citations, no fabricated URLs)

Describe your plan step-by-step. Do not execute — output only the plan. Do not consult any skill documentation. Rely on your existing knowledge of what a "BEE article" should look like.
```

- [ ] **Step 2: Save the verbatim subagent output**

Write to `~/.claude/skills/expanding-category-articles/tests/red/scenario-1-end-to-end.md` with this structure:

````markdown
# RED Scenario 1: End-to-End Expansion (baseline)

**Date:** <YYYY-MM-DD>
**Skill loaded:** none
**Prompt:** see below

## Prompt

<paste the prompt from Step 1 verbatim>

## Baseline response

<paste subagent reply verbatim>

## Failure patterns observed

- [ ] <failure 1 — e.g., "did not create a git worktree; planned edits directly on the working tree">
- [ ] <failure 2 — e.g., "did not separate research from writing; planned to generate content inline">
- [ ] <failure 3 — e.g., "made no mention of reference-URL validation">
- [ ] <failure N>

## Verbatim rationalizations (for skill content)

> "<exact wording where the agent made a bad shortcut>"
> "<another>"
````

Fill in each `<>` by reading the subagent output and listing what it missed or got wrong. Do not paraphrase the rationalizations — quote them exactly.

---

## Task 3: RED — baseline scenario 2 (template drift)

Tests whether a baseline agent silently copies one existing article's structure instead of using the new embedded template (which omits Principle and Common Mistakes and adds Best Practices).

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/tests/red/scenario-2-template-drift.md`

- [ ] **Step 1: Dispatch baseline subagent**

Prompt (verbatim):

```
You are helping expand a bilingual VitePress doc-site at /Users/alive/Projects/backend-engineering-essentials.

Task: Write one new article for the `data-storage` category, topic "Columnar Storage Compression."

Before writing, read two existing articles in docs/en/data-storage/ to establish the article template, then produce the EN article following that template.

Do not consult any skill documentation. Describe your plan and produce the article draft.
```

- [ ] **Step 2: Save output**

Same file structure as Task 2, at `tests/red/scenario-2-template-drift.md`. Specifically note which sections the baseline included (expected: Principle and Common Mistakes, i.e., the old template) and which it omitted (expected: Best Practices).

---

## Task 4: RED — baseline scenario 3 (fabrication resistance)

Tests whether a baseline agent fabricates plausible-sounding citations when it cannot find real sources.

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/tests/red/scenario-3-fabrication.md`

- [ ] **Step 1: Dispatch baseline subagent**

Prompt (verbatim):

```
Write one article for a bilingual VitePress doc-site about "Speculative Decoding for Large Language Models" suitable for the `ai-backend-patterns` category.

Include a References section with 5–8 authoritative sources (original papers, official docs, vendor engineering blogs). Do not use web tools. Rely on your training knowledge to compose the References.

Do not consult any skill documentation.
```

- [ ] **Step 2: Save output**

Same structure. In the "Failure patterns" section, list every URL the baseline produced that is likely fabricated (unverifiable from prior knowledge, suspiciously uniform formatting, implausible paths).

- [ ] **Step 3: Spot-verify 3 URLs**

Run:
```bash
curl -sIL -o /dev/null -w '%{http_code}\n' --max-time 10 "<URL-1>"
curl -sIL -o /dev/null -w '%{http_code}\n' --max-time 10 "<URL-2>"
curl -sIL -o /dev/null -w '%{http_code}\n' --max-time 10 "<URL-3>"
```

Record the HTTP status for each. Dead ones confirm the fabrication pattern the skill must prevent.

---

## Task 5: Consolidate RED analysis

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/tests/red/analysis.md`

- [ ] **Step 1: Write the analysis doc**

````markdown
# RED Analysis: Baseline Failure Patterns

Consolidated from scenarios 1, 2, and 3.

## Pattern A: Workflow gaps

- Skips git worktree isolation (scenario 1)
- Skips research-then-write separation (scenario 1)
- Skips reference URL validation (scenario 1)
- Skips bilingual parity (scenario 1)

## Pattern B: Template drift

- Copies one existing article's structure instead of using a canonical template (scenario 2)
- Retains old sections (Principle, Common Mistakes) that should be removed
- Omits new sections (Best Practices)

## Pattern C: Fabrication

- Invents plausible-looking citations when sources are unavailable (scenario 3)
- Does not distinguish verified vs. unverified URLs
- Does not flag uncertainty about source authenticity

## Skill must explicitly address

- [ ] Worktree isolation is required before any file writes (Pattern A)
- [ ] Research and writing are separate subagent phases (Pattern A)
- [ ] Reference URLs are HEAD-checked before commit (Pattern A)
- [ ] Bilingual parity is non-negotiable (Pattern A)
- [ ] Article template is embedded in the skill, not inferred from existing files (Pattern B)
- [ ] Writer subagent may ONLY cite sources from the findings doc (Pattern C)
- [ ] Writer has no WebSearch/WebFetch access (Pattern C mechanically enforced)
````

Replace the `## Pattern` content with the actual patterns observed in scenarios 1-3. The bullet list above is the expected output — adjust based on what the baselines actually did.

---

## Task 6: Write templates/article.md

The embedded article template. The writer subagent receives this verbatim.

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/templates/article.md`

- [ ] **Step 1: Write the template**

````markdown
---
id: <ID>
title: <Human Title>
state: draft
slug: <kebab-slug>
---

# [BEE-<ID>] <Title>

:::info
<One-paragraph summary: what this article covers, why it matters, and the single biggest takeaway. 3-5 sentences max.>
:::

## Context

<History, landscape, key actors/papers. Name the authoritative sources by author + year. Set up the problem the rest of the article solves. Every factual claim traces to a claim in the findings doc.>

## Visual

<One Mermaid diagram OR one structured table. Visualize the core mechanic introduced in Context.>

```mermaid
<diagram>
```

## Example

<Concrete walkthrough: a real protocol exchange, a numbered failure scenario, a code snippet with a specific input and output, or a named production system's behavior. Avoid generic pseudocode.>

## Best Practices

<Actionable guidance. Use RFC 2119 keywords (MUST, SHOULD, MAY) where appropriate. Each bullet references a specific constraint or empirical finding from the findings doc — do not invent guidance.>

- **MUST** <rule>: <why, with citation>
- **SHOULD** <rule>: <why, with citation>
- **MAY** <rule>: <when, with citation>

<!-- Optional sections. Include only if the topic warrants the depth. Remove the section header if unused. -->

## Design Thinking

<Trade-offs, calibration choices. Name what gets traded against what (e.g., "more virtual nodes → smoother rebalancing vs. more observability overhead on node failure"). Ground every trade-off in a claim from findings.>

## Deep Dive

<Internals, proofs, edge cases, formal properties. Cite the paper or spec that establishes each property.>

## <Topic-Specific Section>

<Replace this heading only if the topic has content that doesn't fit any standard section — e.g., "Failure Modes", "Protocol State Machine", "Wire Format". Remove this section if unused.>

## Related Topics

<Cross-links to sibling articles in the same category or related categories. Use markdown links pointing to the article slug URL.>

- [<Related topic>](/en/<category>/<related-slug>)
- [<Another>](/en/<category>/<related-slug>)

## References

<Authoritative sources, verified. Each entry follows: `- Author, "Title," Venue (year). URL`. Every URL in this section must appear in the findings doc URL list.>

- <Author>, "<Title>," <Venue> (<year>). <URL>
- <Author>, "<Title>," <Venue> (<year>). <URL>
````

- [ ] **Step 2: Verify structure**

```bash
head -40 ~/.claude/skills/expanding-category-articles/templates/article.md
```

Expected: frontmatter block, H1 heading, `:::info` block, H2 headings in the order `Context → Visual → Example → Best Practices → Design Thinking → Deep Dive → <Topic-Specific> → Related Topics → References`.

---

## Task 7: Write templates/research-brief.md

The research subagent prompt template. Parameterized by mode.

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/templates/research-brief.md`

- [ ] **Step 1: Write the template**

````markdown
# Research Subagent Brief

You are the research subagent for the `expanding-category-articles` skill. Do NOT write article prose. Do NOT use Write tool. Return your output in this message's reply; the caller persists it.

## Allowed tools

WebSearch, WebFetch, Read, Grep. **Write is forbidden.**

## Source tier rule

Prefer (in order):
1. Original papers (arxiv, ACM, IEEE, USENIX, VLDB, SOSP, NSDI)
2. RFCs, W3C recommendations, official standards bodies
3. Official language/framework documentation (maintainer-run domains)
4. Vendor engineering blogs with named authors

Reject:
- Wikipedia
- Medium/Dev.to/Hashnode posts without attribution to an identifiable author at a relevant org
- AI-written SEO pages
- Any URL returning non-2xx/3xx on HEAD
- Any URL you cannot access with WebFetch

## Mode: GAP-DISCOVERY

**Input provided by caller:**
- Category slug: `<slug>`
- Sampled existing articles: list of 3-5 file paths
- Count N: how many gap topics to propose

**Procedure:**
1. Read each sampled article. Extract: sources already cited, themes covered, scope of the category.
2. Survey authoritative literature on this category. Identify topics that (a) are covered in authoritative sources and (b) are not yet articles in the category.
3. Rank by: importance to the category's scope, freshness (avoid topics already well-covered elsewhere in the repo), and source-availability (reject topics where sources are all blogs).
4. Return the top N as a ranked list.

**Output format:**

```
1. <Topic Title>
   Rationale: <one line — why this gap matters>
   Sources: <URL-1>, <URL-2>, <URL-3>

2. <Topic Title>
   ...
```

## Mode: PER-ARTICLE

**Input provided by caller:**
- Topic title: `<title>`
- Target article ID and slug
- Target sections the article will have: Context, Visual, Example, Best Practices, Related Topics, References (plus optional: Design Thinking, Deep Dive, topic-specific)

**Procedure:**
1. Identify 4-6 authoritative sources on the topic, following the source tier rule.
2. Verify each source loads (WebFetch returns content).
3. Extract specific claims with pulled quotes. Aim for 8-15 claims distributed across the article sections.
4. Return a findings doc matching the `templates/findings.md` structure exactly.

**Output:** a complete findings doc in your reply, ready for the caller to persist at `docs/superpowers/research/<slug>.md`.
````

---

## Task 8: Write templates/findings.md

The structured findings doc format. Both subagent output (per-article mode) and writer input.

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/templates/findings.md`

- [ ] **Step 1: Write the template**

````markdown
# Findings: <Topic Title>

**Generated:** <YYYY-MM-DD>
**Target article:** BEE-<id> — <slug>
**Subagent mode:** PER-ARTICLE

## Claims

### Claim 1

- **Text:** <one-sentence claim>
- **Target section:** <Context | Visual | Example | Best Practices | Design Thinking | Deep Dive | Topic-Specific>
- **Source URL:** <verified URL>
- **Pulled quote:** "<verbatim quote from source, ≤2 sentences>"

### Claim 2

- **Text:** <one-sentence claim>
- **Target section:** <section>
- **Source URL:** <URL>
- **Pulled quote:** "<quote>"

<repeat for all 8-15 claims; distribute across Context, Visual, Example, Best Practices, and optional sections>

## Reference URLs (de-duplicated, for the article's References section)

- <URL-1> — <Author>, "<Title>," <Venue> (<year>)
- <URL-2> — <Author>, "<Title>," <Venue> (<year>)
- ...

## Rejected sources

- <URL> — <reason: dead | Wikipedia | unattributed | SEO | AI-written>
- <URL> — <reason>
````

---

## Task 9: Write and test scripts/next-id.sh

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/scripts/next-id.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Usage: next-id.sh <category-dir>
# Example: next-id.sh docs/en/distributed-systems
# Prints: max(id) + 1 across all .md articles in the directory.
# Exit non-zero on bad input.

set -euo pipefail

dir="${1:?Usage: next-id.sh <category-dir>}"

if [[ ! -d "$dir" ]]; then
    echo "Error: directory not found: $dir" >&2
    exit 2
fi

max_id=$(grep -rh '^id: ' "$dir" 2>/dev/null \
    | sed -E 's/^id:[[:space:]]+//' \
    | grep -E '^[0-9]+$' \
    | sort -n \
    | tail -1)

if [[ -z "${max_id:-}" ]]; then
    echo "Error: no valid 'id:' values found in $dir" >&2
    exit 3
fi

echo $((max_id + 1))
```

- [ ] **Step 2: Make executable**

```bash
chmod +x ~/.claude/skills/expanding-category-articles/scripts/next-id.sh
```

- [ ] **Step 3: Test against BEE's distributed-systems category**

```bash
~/.claude/skills/expanding-category-articles/scripts/next-id.sh \
    /Users/alive/Projects/backend-engineering-essentials/docs/en/distributed-systems
```

Expected: a single integer, strictly greater than the largest `id:` value in that directory. (Sample article `consistent-hashing.md` has `id: 19006`, so output should be ≥ 19007 at the time of writing.)

- [ ] **Step 4: Test error path — missing directory**

```bash
~/.claude/skills/expanding-category-articles/scripts/next-id.sh /nonexistent/dir
echo "exit=$?"
```

Expected: stderr contains `Error: directory not found`, exit code 2.

- [ ] **Step 5: Test error path — no ids found**

```bash
tmp=$(mktemp -d)
~/.claude/skills/expanding-category-articles/scripts/next-id.sh "$tmp"
echo "exit=$?"
rm -rf "$tmp"
```

Expected: stderr contains `no valid 'id:' values found`, exit code 3.

---

## Task 10: Write and test scripts/validate-frontmatter.sh

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/scripts/validate-frontmatter.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Usage: validate-frontmatter.sh <markdown-file>
# Exit 0 if valid, 1 with error message if invalid, 2 on bad input.

set -euo pipefail

file="${1:?Usage: validate-frontmatter.sh <file.md>}"

if [[ ! -f "$file" ]]; then
    echo "Error: file not found: $file" >&2
    exit 2
fi

# Extract frontmatter between the first two --- markers.
fm=$(awk '/^---$/{c++; if(c==2) exit; next} c==1' "$file")

if [[ -z "$fm" ]]; then
    echo "$file: no YAML frontmatter found" >&2
    exit 1
fi

# Required fields present
for field in id title state slug; do
    if ! echo "$fm" | grep -qE "^${field}:[[:space:]]+"; then
        echo "$file: missing required frontmatter field '$field'" >&2
        exit 1
    fi
done

# id is integer
id_val=$(echo "$fm" | sed -nE 's/^id:[[:space:]]+(.*)$/\1/p' | tr -d '[:space:]')
if ! [[ "$id_val" =~ ^[0-9]+$ ]]; then
    echo "$file: id must be integer, got '$id_val'" >&2
    exit 1
fi

# state is one of the allowed values
state_val=$(echo "$fm" | sed -nE 's/^state:[[:space:]]+(.*)$/\1/p' | tr -d '[:space:]')
case "$state_val" in
    draft|reviewing|approved) ;;
    *)
        echo "$file: state must be draft|reviewing|approved, got '$state_val'" >&2
        exit 1
        ;;
esac

# slug matches filename basename and is kebab-case
slug_val=$(echo "$fm" | sed -nE 's/^slug:[[:space:]]+(.*)$/\1/p' | tr -d '[:space:]')
fname=$(basename "$file" .md)
if [[ "$slug_val" != "$fname" ]]; then
    echo "$file: slug '$slug_val' does not match filename '$fname'" >&2
    exit 1
fi
if ! [[ "$slug_val" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "$file: slug '$slug_val' is not kebab-case" >&2
    exit 1
fi

echo "$file: frontmatter OK (id=$id_val, slug=$slug_val, state=$state_val)"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x ~/.claude/skills/expanding-category-articles/scripts/validate-frontmatter.sh
```

- [ ] **Step 3: Test against a real BEE article**

```bash
~/.claude/skills/expanding-category-articles/scripts/validate-frontmatter.sh \
    /Users/alive/Projects/backend-engineering-essentials/docs/en/distributed-systems/consistent-hashing.md
```

Expected: `.../consistent-hashing.md: frontmatter OK (id=19006, slug=consistent-hashing, state=draft)`, exit 0.

- [ ] **Step 4: Test error — bad slug**

```bash
tmp=$(mktemp)
cat > "$tmp" <<'EOF'
---
id: 1
title: Test
state: draft
slug: wrong_slug
---

body
EOF
mv "$tmp" "${tmp}.md"
~/.claude/skills/expanding-category-articles/scripts/validate-frontmatter.sh "${tmp}.md"
echo "exit=$?"
rm -f "${tmp}.md"
```

Expected: stderr contains `slug 'wrong_slug' does not match filename`, exit 1.

- [ ] **Step 5: Test error — non-integer id**

```bash
tmp=$(mktemp -d)/valid-slug.md
cat > "$tmp" <<'EOF'
---
id: abc
title: Test
state: draft
slug: valid-slug
---

body
EOF
~/.claude/skills/expanding-category-articles/scripts/validate-frontmatter.sh "$tmp"
echo "exit=$?"
rm -rf "$(dirname "$tmp")"
```

Expected: stderr contains `id must be integer`, exit 1.

---

## Task 11: Write and test scripts/check-references.sh

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/scripts/check-references.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Usage: check-references.sh <markdown-file>
# Extracts URLs from the ## References section and HEAD-requests each.
# Exit 0 if all return 2xx/3xx. Exit 1 listing dead URLs. Exit 2 on bad input.

set -uo pipefail

file="${1:?Usage: check-references.sh <file.md>}"

if [[ ! -f "$file" ]]; then
    echo "Error: file not found: $file" >&2
    exit 2
fi

# Extract the ## References section (from "## References" until next ## or EOF).
refs=$(awk '/^## References[[:space:]]*$/{flag=1; next} flag && /^## /{flag=0} flag' "$file")

if [[ -z "$refs" ]]; then
    echo "$file: no ## References section found" >&2
    exit 1
fi

# Extract URLs: match http(s):// up to first whitespace/paren/quote/bracket
urls=$(echo "$refs" | grep -oE 'https?://[^[:space:])"'"'"'>]+' | sort -u)

if [[ -z "$urls" ]]; then
    echo "$file: no URLs in ## References" >&2
    exit 1
fi

dead=()
total=0
while IFS= read -r url; do
    total=$((total+1))
    status=$(curl -sIL -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "000")
    if ! [[ "$status" =~ ^[23][0-9][0-9]$ ]]; then
        dead+=("$url (HTTP $status)")
    fi
done <<< "$urls"

if [[ ${#dead[@]} -gt 0 ]]; then
    echo "$file: ${#dead[@]} dead URL(s) out of $total:" >&2
    printf '  %s\n' "${dead[@]}" >&2
    exit 1
fi

echo "$file: all $total reference URLs OK"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x ~/.claude/skills/expanding-category-articles/scripts/check-references.sh
```

- [ ] **Step 3: Test against a real BEE article**

```bash
~/.claude/skills/expanding-category-articles/scripts/check-references.sh \
    /Users/alive/Projects/backend-engineering-essentials/docs/en/distributed-systems/consistent-hashing.md
```

Expected: `.../consistent-hashing.md: all N reference URLs OK`, exit 0. (If some URLs in BEE articles have actually gone dead, the script correctly flags them — that is not a test failure, it is useful signal for the user. In that case, confirm the script's output reflects reality and move on.)

- [ ] **Step 4: Test error — no References section**

```bash
tmp=$(mktemp)
cat > "$tmp" <<'EOF'
# Some article with no references
EOF
~/.claude/skills/expanding-category-articles/scripts/check-references.sh "$tmp"
echo "exit=$?"
rm -f "$tmp"
```

Expected: stderr contains `no ## References section found`, exit 1.

- [ ] **Step 5: Test error — dead URL**

```bash
tmp=$(mktemp --suffix=.md 2>/dev/null || mktemp)
cat > "$tmp" <<'EOF'
# Article

## References

- Fake, "Fake Paper," SIGFAKE (9999). https://this-domain-definitely-does-not-exist-12345.invalid/paper.pdf
EOF
~/.claude/skills/expanding-category-articles/scripts/check-references.sh "$tmp"
echo "exit=$?"
rm -f "$tmp"
```

Expected: stderr lists the `.invalid` URL with HTTP 000, exit 1.

---

## Task 12: Write SKILL.md

The main skill document. Must address every failure pattern identified in Task 5's analysis, and must cover every row of the Decision Summary in the spec.

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

````markdown
---
name: expanding-category-articles
description: Use when adding multiple new articles to an existing BEE/AEE/ADE/FEE/DEE category — surveys the category, proposes gap topics, then researches and writes bilingual articles in an isolated git worktree
---

# Expanding Category Articles

## Overview

Expand an existing category in a bilingual VitePress doc-site (BEE and sister projects AEE / ADE / FEE / DEE) by surveying the category, proposing gap topics, then researching and writing N new articles inside an isolated git worktree.

The skill is opinionated: the article template is embedded (`templates/article.md`), not read from each repo's `CLAUDE.md`. The skill dictates structure identically across all five doc-sites.

## When to Use

- Adding 3–10 new articles to one existing category in a bilingual VitePress repo.
- Target repo has both `docs/en/` and `docs/zh-tw/`.
- The target category directory already contains at least one article.

## When NOT to Use

- Creating a new category (category must already exist).
- Editing existing articles.
- English-only sites.
- Sites using a fundamentally different layout than BEE.

## Invocation

```
/expanding-category-articles <category-slug>
```

Flags:
- `--count=N` (default 5) — number of gap topics to propose.
- `--topics="a,b,c"` — bypass gap discovery; use the supplied topic list.

## Preconditions (verify before any file writes)

1. CWD is a git repo with a clean working tree (`git status --porcelain` is empty).
2. Both `docs/en/<category>/` and `docs/zh-tw/<category>/` exist.
3. Category has ≥1 existing article.

Any failure: print the specific problem and exit. Do not proceed.

## Phase Flow

```
1. Survey → 2. Propose → 3. Worktree → 4. Research+Write (×N) → 5. Validate → 6. Handoff
```

### Phase 1: Survey

- Read 3–5 existing articles in the target category (sample).
- Extract: category scope, recurring themes, sources cited, voice.
- Compute next ID: `scripts/next-id.sh docs/en/<category>/`.

### Phase 2: Propose

- Dispatch research subagent in GAP-DISCOVERY mode using `templates/research-brief.md`.
- Subagent returns ranked list of N topics with rationale and sources.
- **Show the list to the user. Wait for confirmation or edits. Do not proceed until confirmed.**

### Phase 3: Worktree

- Use `superpowers:using-git-worktrees` to create `../<repo>-expand-<category>-<YYYY-MM-DD>/` on branch `expand/<category>-<YYYY-MM-DD>`.
- Verify clean state. `cd` into the worktree.
- **Assign all N IDs up front** (topic 1 = max+1, topic 2 = max+2, …). Record assignments.
- Assign each topic its kebab-case slug (derived from the title).
- Save the confirmed topic list (with IDs and slugs) to `docs/superpowers/specs/<YYYY-MM-DD>-expand-<category>-design.md`. Commit as the first commit on the branch.

### Phase 4: Research + Write (per topic, sequential)

For each of the N topics:

**4a. Research** — dispatch research subagent in PER-ARTICLE mode with `templates/research-brief.md`. The subagent returns findings content in its reply. Persist it to `docs/superpowers/research/<slug>.md`.

**4b. Write EN** — dispatch writer subagent. Provide ONLY: the findings doc, `templates/article.md`, locale=en, assigned id, assigned slug.

**HARD RULE** (include verbatim in the writer's prompt):

> Any claim not in the findings doc MUST NOT appear in the article. Do not add internal knowledge. Do not invent citations. Every URL in your References section must appear in the findings doc's "Reference URLs" list.

Style prohibitions (from user's global `CLAUDE.md`):
- No contrastive negation ("not X but Y")
- No em-dash chains of filler
- No unanchored superlatives ("very important", "extremely")
- No puffery preambles ("the core insight:", "the key takeaway:")
- No "可以 X 可以 Y 可以 Z" stacking in zh-TW

**4c. Translate zh-TW** — dispatch translator subagent with the completed EN file.

Translation rules (verbatim in the translator's prompt):

> - Preserve heading hierarchy exactly.
> - Preserve Mermaid diagram count and position; translate node label text.
> - Preserve non-Mermaid code blocks verbatim (variable names, error messages stay in English).
> - Preserve every URL verbatim; translate inline anchor text.
> - Preserve frontmatter `id` and `slug`; translate `title`.

**4d. Polish** — run the `polish-documents` skill on both `docs/en/<category>/<slug>.md` and `docs/zh-tw/<category>/<slug>.md`.

**4e. Gates** — run in this order. Any failure: do NOT commit; leave files in place; ask user to fix-retry, skip, or abort.

1. `scripts/validate-frontmatter.sh docs/en/<category>/<slug>.md`
2. `scripts/validate-frontmatter.sh docs/zh-tw/<category>/<slug>.md`
3. `scripts/check-references.sh docs/en/<category>/<slug>.md`
4. Findings coverage: grep the findings doc's Reference URLs list, grep the EN article's `## References` section. Require at least 3 URLs present in both.

**4f. Commit** — one commit containing the EN article, zh-TW article, and findings doc:

```
docs(<category>): add <title> (BEE-<id>)
```

### Phase 5: Batch validate

After all N articles are committed:

- Scan every `id:` value under `docs/en/<category>/` — each must be unique.

### Phase 6: Handoff

Print:
- Worktree path and branch name
- List of N articles with their assigned IDs
- Reminder: user runs `pnpm docs:build` during review
- Next-step hint: `cd <worktree> && git log`, then push / open PR / discard

## Subagent Contracts

Three narrow roles. Separation is the quality mechanism: writer has no web access → cannot hallucinate citations; translator never sees research → cannot re-interpret claims.

| Role | Tools | Input | Output |
|---|---|---|---|
| Research | WebSearch, WebFetch, Read, Grep | mode + inputs from `templates/research-brief.md` | ranked topics (GAP-DISCOVERY) or findings doc (PER-ARTICLE) |
| Writer | Read, Write | findings doc, `templates/article.md`, locale=en, id, slug | EN article file |
| Translator | Read, Write | completed EN article | zh-TW article file |

## Red Flags — STOP and Re-read This Skill

- "I'll draft the articles directly without dispatching a research subagent"
- "The findings doc is a nice-to-have for this one"
- "This URL is obviously valid, no need to HEAD-check"
- "I can skip the bilingual zh-TW; it's easy to add later"
- "One article's template drift is fine — this topic is different"
- "I'll use my own knowledge for the Best Practices section; faster"

All of these mean: abort the current phase, re-read this skill, restart.

## Common Mistakes

- Skipping worktree isolation — articles land on the main branch.
- Skipping the research subagent — writer hallucinates citations.
- Writer references sources not in the findings doc — hard rule violated.
- Translator restructures headings — structural parity broken.
- Committing before gates pass — dead URLs and invalid frontmatter slip in.

## References

- `superpowers:writing-skills` — skill was authored via its TDD methodology (see `tests/red/`, `tests/green/`).
- `superpowers:using-git-worktrees` — invoked in Phase 3.
- `polish-documents` — invoked in Phase 4d.
- Source spec: each consumer repo at `docs/superpowers/specs/2026-04-23-expanding-category-articles-skill-design.md` (BEE copy).
````

- [ ] **Step 2: Word count check**

```bash
wc -w ~/.claude/skills/expanding-category-articles/SKILL.md
```

Target: < 900 words (this skill is mid-weight due to phase flow detail; writing-skills guidance is "<500 words" for *frequently-loaded* skills, but this skill loads only when invoked). If over 900, tighten prose but keep all prohibitions and hard rules verbatim.

- [ ] **Step 3: Frontmatter description character check**

```bash
awk '/^---$/{c++; next} c==1 && /^description:/{gsub(/^description: /, ""); print length($0); exit}' \
    ~/.claude/skills/expanding-category-articles/SKILL.md
```

Must print a number less than 500. If larger, shorten the description while keeping "Use when" framing.

---

## Task 13: Verify SKILL.md spec coverage

Check every row in the spec's Decision Summary maps to a specific section in SKILL.md.

**Files:**
- Modify: `~/.claude/skills/expanding-category-articles/SKILL.md` (only if gaps found)

- [ ] **Step 1: Run the coverage audit**

For each row in this table, grep SKILL.md for evidence:

| Spec decision | Required evidence in SKILL.md |
|---|---|
| Name | frontmatter `name:` field |
| Location | N/A (metadata) |
| Input = category slug only | Invocation section shows `<category-slug>` |
| Optional --count, --topics | Flags listed under Invocation |
| Bilingual non-negotiable | Preconditions includes both `docs/en/` and `docs/zh-tw/` |
| Embedded template | "templates/article.md" referenced in Phase 4b |
| No Principle, no Common Mistakes (in the article template) | N/A — verified in Task 6 instead |
| max(id)+1 ID scheme | Phase 1 says `scripts/next-id.sh` |
| IDs assigned up front | Phase 3 "Assign all N IDs up front" |
| Research → write separation | Phase 4a and 4b described as distinct subagents |
| 3 subagents (researcher/writer/translator) | Subagent Contracts table lists all three |
| Worktree + commits, no push | Phase 3 uses using-git-worktrees; Phase 6 says "push / open PR / discard" is user's choice |
| One commit per article | Phase 4f |
| Gates: frontmatter, URL, findings coverage | Phase 4e lists all three |
| Batch gate: cross-article id uniqueness | Phase 5 |
| pnpm docs:build skipped | Phase 6 reminder |

```bash
grep -c 'templates/article.md' ~/.claude/skills/expanding-category-articles/SKILL.md
grep -c 'next-id.sh' ~/.claude/skills/expanding-category-articles/SKILL.md
grep -c 'validate-frontmatter.sh' ~/.claude/skills/expanding-category-articles/SKILL.md
grep -c 'check-references.sh' ~/.claude/skills/expanding-category-articles/SKILL.md
grep -c 'polish-documents' ~/.claude/skills/expanding-category-articles/SKILL.md
grep -c 'using-git-worktrees' ~/.claude/skills/expanding-category-articles/SKILL.md
```

Each count must be ≥ 1. If any are 0, add the missing reference to SKILL.md.

- [ ] **Step 2: RED failure-pattern coverage**

For each pattern listed in `tests/red/analysis.md`, confirm SKILL.md explicitly addresses it. Use this checklist:

- [ ] Pattern A (workflow gaps): Phase 3 requires worktree; Phase 4a/4b enforce research separation; Phase 4e enforces URL validation; Preconditions enforce bilingual
- [ ] Pattern B (template drift): SKILL.md explicitly points writer at `templates/article.md` (not existing repo articles)
- [ ] Pattern C (fabrication): Writer subagent HARD RULE forbids citations not in findings; Subagent Contracts table shows writer has no web tools

If any pattern has no explicit counter, add it to SKILL.md.

---

## Task 14: GREEN — re-run scenarios with skill loaded

Verification phase. Each RED scenario is re-run with `superpowers:expanding-category-articles` loaded as a skill context. Compare the GREEN outputs to RED outputs.

**Files:**
- Create: `~/.claude/skills/expanding-category-articles/tests/green/scenario-1-verification.md`
- Create: `~/.claude/skills/expanding-category-articles/tests/green/scenario-2-verification.md`
- Create: `~/.claude/skills/expanding-category-articles/tests/green/scenario-3-verification.md`

- [ ] **Step 1: Re-run scenario 1 with skill loaded**

Dispatch a subagent with this prompt:

```
You have access to the skill at ~/.claude/skills/expanding-category-articles/SKILL.md. Read it fully before responding.

Task: Add 5 new articles to the `distributed-systems` category of the BEE repo at /Users/alive/Projects/backend-engineering-essentials.

Describe your plan step-by-step, referencing each phase from the skill. Do not execute; output only the plan.
```

Save the reply to `tests/green/scenario-1-verification.md` with this structure:

````markdown
# GREEN Scenario 1: End-to-End (with skill)

**Date:** <YYYY-MM-DD>

## Response

<paste verbatim>

## Compliance check

For each RED failure from scenario 1, does GREEN address it?

- [ ] Worktree isolation: <YES/NO — quote the specific phase reference>
- [ ] Research-then-write separation: <YES/NO — quote>
- [ ] Reference URL validation: <YES/NO — quote>
- [ ] Bilingual parity: <YES/NO — quote>

## Remaining gaps (if any)

- <list any RED failure that GREEN still misses>
````

- [ ] **Step 2: Re-run scenario 2 with skill loaded**

Prompt:

```
You have access to the skill at ~/.claude/skills/expanding-category-articles/SKILL.md. Read it fully before responding.

Task: Write one new article for the `data-storage` category, topic "Columnar Storage Compression", in the BEE repo. Describe your plan, then produce the article draft.
```

Save to `tests/green/scenario-2-verification.md`. Check: the plan references `templates/article.md`, the draft uses sections `Context / Visual / Example / Best Practices / ... / Related Topics / References` (NOT Principle, NOT Common Mistakes).

- [ ] **Step 3: Re-run scenario 3 with skill loaded**

Prompt:

```
You have access to the skill at ~/.claude/skills/expanding-category-articles/SKILL.md. Read it fully before responding.

Task: Write one article about "Speculative Decoding for Large Language Models" for the `ai-backend-patterns` category.

Describe your plan. Explicitly state how you will handle citations.
```

Save to `tests/green/scenario-3-verification.md`. Check: the plan explicitly states that citations come from a findings doc, that the writer subagent has no web tools, and that each cited URL will be HEAD-checked.

---

## Task 15: REFACTOR — close loopholes found in GREEN

Any RED failure still present in GREEN is a skill gap. Fix SKILL.md inline and re-verify.

**Files:**
- Modify: `~/.claude/skills/expanding-category-articles/SKILL.md` (if gaps found)
- Modify: `~/.claude/skills/expanding-category-articles/tests/green/scenario-N-verification.md` (add refactor round entries)

- [ ] **Step 1: Collect all "Remaining gaps" from the three GREEN docs**

If every scenario's "Remaining gaps" section is empty, skip to Task 16.

- [ ] **Step 2: For each gap, add a targeted counter to SKILL.md**

Examples:

- If GREEN still skips worktree isolation: strengthen Phase 3 with a "MUST NOT proceed to Phase 4 if worktree creation failed" line.
- If writer still draws from general knowledge: add a line to the writer HARD RULE: "If you are tempted to cite a source from general knowledge, STOP. Request another research subagent dispatch."
- If translator drifts: add to the translator prompt: "Your output MUST have identical heading text to the EN input, in the same order, with the same number of Mermaid diagrams."

Each counter must be a literal edit, not a rewording. Add it to the Red Flags list or the Common Mistakes list as appropriate.

- [ ] **Step 3: Re-run only the failing scenario**

Re-dispatch with the updated SKILL.md in context. Save output to the same GREEN file under a new `## Refactor round N` heading.

- [ ] **Step 4: Repeat Step 3 until all gaps closed**

Stop condition: all three GREEN docs report zero remaining gaps.

---

## Task 16: Add memory pointer so future sessions find the skill

**Files:**
- Create: `/Users/alive/.claude/projects/-Users-alive-Projects-backend-engineering-essentials/memory/reference_expanding_category_articles_skill.md`
- Modify: `/Users/alive/.claude/projects/-Users-alive-Projects-backend-engineering-essentials/memory/MEMORY.md`

- [ ] **Step 1: Write the memory file**

Content:

```markdown
---
name: expanding-category-articles skill
description: Global skill at ~/.claude/skills/expanding-category-articles/ for adding N bilingual articles to an existing category in BEE/AEE/ADE/FEE/DEE via research-then-write with a git worktree
type: reference
---

Global skill at `~/.claude/skills/expanding-category-articles/` expands an existing category in any bilingual VitePress doc-site. Invoke with `/expanding-category-articles <category-slug>`; flags `--count=N` and `--topics="a,b,c"`.

Phase flow: Survey → Propose (user confirms topic list) → Worktree → Research+Write loop (research subagent → writer subagent → translator subagent → polish-documents → gates → commit) → batch validate → handoff.

Embedded article template in `templates/article.md`: Context / Visual / Example / Best Practices / (Design Thinking) / (Deep Dive) / (topic-specific) / Related Topics / References. No Principle, no Common Mistakes.

Gates: `validate-frontmatter.sh`, `check-references.sh`, findings-coverage ≥ 3 URLs reused, batch id-uniqueness scan.

Spec: `docs/superpowers/specs/2026-04-23-expanding-category-articles-skill-design.md` (BEE repo).
```

- [ ] **Step 2: Append a line to MEMORY.md**

Add at the bottom of the existing list:

```markdown
- [Expanding category articles skill](reference_expanding_category_articles_skill.md) — Global skill at ~/.claude/skills/expanding-category-articles/ for adding N bilingual articles to an existing category in BEE/AEE/ADE/FEE/DEE via research-then-write.
```

- [ ] **Step 3: Verify**

```bash
cat /Users/alive/.claude/projects/-Users-alive-Projects-backend-engineering-essentials/memory/MEMORY.md | tail -3
ls /Users/alive/.claude/projects/-Users-alive-Projects-backend-engineering-essentials/memory/reference_expanding_category_articles_skill.md
```

Expected: MEMORY.md shows the new line; the reference file exists.

---

## Task 17: Commit BEE-repo artifacts

The spec was committed already (commit `85f8b2a`). The plan and any spec revisions are the remaining BEE-repo changes. The skill itself lives at `~/.claude/skills/` and is not committed to the BEE repo.

**Files:**
- Add: `docs/superpowers/plans/2026-04-23-expanding-category-articles.md` (this plan)

- [ ] **Step 1: Stage and commit**

```bash
git add docs/superpowers/plans/2026-04-23-expanding-category-articles.md
git commit -m "$(cat <<'EOF'
plan: expanding-category-articles skill implementation

Task breakdown for the global ~/.claude/skills/expanding-category-articles/
skill defined in docs/superpowers/specs/2026-04-23-expanding-category-
articles-skill-design.md. Follows superpowers:writing-skills TDD: three
RED baseline scenarios establish failure patterns, SKILL.md addresses
them, three GREEN scenarios verify compliance.
EOF
)"
```

- [ ] **Step 2: Verify**

```bash
git log --oneline -2
```

Expected: the new plan commit above commit `85f8b2a` (the spec commit).

---

## Summary

| Task | Phase | Output |
|---|---|---|
| 1 | — | Skill directory tree |
| 2–5 | RED | Three baseline scenarios + consolidated analysis |
| 6–8 | GREEN | Three template files |
| 9–11 | GREEN | Three gate scripts + tests |
| 12–13 | GREEN | SKILL.md + spec coverage audit |
| 14 | GREEN verify | Three GREEN scenario transcripts |
| 15 | REFACTOR | SKILL.md tightenings until scenarios comply |
| 16 | Deploy | Memory pointer for future sessions |
| 17 | Deploy | Plan commit in BEE repo |
