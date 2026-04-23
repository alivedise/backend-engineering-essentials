---
title: expanding-category-articles skill — design
date: 2026-04-23
status: approved
---

# Design: `expanding-category-articles` Skill

## Purpose

A reusable global skill that expands an existing category in any of the user's bilingual VitePress doc-sites (BEE and sister projects AEE / ADE / FEE / DEE) by surveying the category, proposing gap topics, then researching and writing new articles inside an isolated git worktree.

The skill replaces the current manual workflow — one article at a time, hand-composed research, ad-hoc worktree setup — with a single invocation that produces a batch of review-ready articles on an isolated branch.

## Skill Identity

| Field | Value |
|---|---|
| Name | `expanding-category-articles` |
| Location | `~/.claude/skills/expanding-category-articles/` |
| Type | Technique skill (how-to workflow) |
| Creation methodology | `superpowers:writing-skills` TDD (RED / GREEN / REFACTOR) |

**Frontmatter (per `writing-skills` rules; description is triggering conditions only, no workflow summary):**

```yaml
---
name: expanding-category-articles
description: Use when adding multiple new articles to an existing BEE/AEE/ADE/FEE/DEE category — surveys the category, proposes gap topics, then researches and writes bilingual articles in an isolated git worktree
---
```

## File Layout

```
~/.claude/skills/expanding-category-articles/
  SKILL.md
  templates/
    article.md           # embedded article template (shown in Template section below)
    research-brief.md    # prompt template for research subagent
    findings.md          # structured findings-doc template
  scripts/
    next-id.sh           # compute max(id)+1 for a category directory
    validate-frontmatter.sh
    check-references.sh  # HEAD-request every URL in References section
  tests/
    red/                 # baseline-failure transcripts (RED phase)
    green/               # verification logs (GREEN phase)
```

## Input / Output Contract

### Invocation

From inside the target doc-repo:

```
/expanding-category-articles <category-slug>
```

**Optional flags:**
- `--count=N` — how many gap topics to propose (default: 5).
- `--topics="a,b,c"` — bypass gap-discovery; user supplies the topic list directly.

### Preconditions (skill verifies before starting)

1. CWD is a git repository with a clean working tree.
2. Repo has both `docs/en/<category-slug>/` and `docs/zh-tw/<category-slug>/`. Missing zh-TW is a hard failure (bilingual is non-negotiable).
3. The target category has at least one existing article (so the skill has a reference for ID scheme and slug conventions).

### Output

On success:
- A new git worktree at `../<repo>-expand-<category>-<date>/` on branch `expand/<category>-<YYYY-MM-DD>`.
- N new EN articles at `docs/en/<category>/<slug>.md`.
- N new zh-TW articles at `docs/zh-tw/<category>/<slug>.md`.
- N research findings docs at `docs/superpowers/research/<slug>.md` (committed alongside the article).
- One design spec at `docs/superpowers/specs/<date>-expand-<category>-design.md` (the gap analysis and confirmed topic list).
- One commit per article, each containing the article's EN file, zh-TW file, and findings doc.

### Terminal State

Skill prints the worktree path and branch name, then exits. No auto-push, no auto-PR. The user reviews in the worktree and decides how to ship.

## Embedded Article Template

Drawn from current BEE articles, with Principle and Common Mistakes removed, Best Practices and two optional sections added.

```markdown
---
id: <next-available-in-category>
title: <Human Title>
state: draft
slug: <kebab-slug>
---

# [BEE-<id>] <Title>

:::info
<one-paragraph summary>
:::

## Context               <!-- required: history, landscape, key actors/papers -->
## Visual                <!-- required: mermaid or table -->
## Example               <!-- required: concrete walkthrough -->
## Best Practices        <!-- required: actionable guidance -->
## Design Thinking       <!-- optional: trade-offs, calibration -->
## Deep Dive             <!-- optional: internals, proofs, edge cases -->
## <Topic-specific>      <!-- optional: e.g., "Failure Modes", "Protocol State Machine" -->
## Related Topics        <!-- required: cross-links to sibling articles -->
## References            <!-- required: authoritative URLs, verified -->
```

**Section rationale:** high-level framing (Context) → show it (Visual) → make it concrete (Example) → actionable guidance (Best Practices) → optional depth → connective tissue.

The template is embedded in the skill, not read from each repo's `CLAUDE.md`. This makes the skill opinionated and identical across all five doc-sites.

## Phase Flow

Six sequential phases. Each announces entry and exit.

```
1. Survey  →  2. Propose  →  3. Worktree  →  4. Research+Write (loop N)  →  5. Validate  →  6. Handoff
```

### Phase 1: Survey

- Read 3–5 existing articles in the target category (sample, not exhaustive).
- Extract: the category's scope, recurring themes, authoritative sources already cited, the category's voice.
- Compute the ID block from `max(id)` in the category directory.

### Phase 2: Propose

- Dispatch a research subagent (gap-discovery mode) with the survey output.
- Subagent returns the top N gap topics, ranked, each with a one-line rationale and 2–3 authoritative sources.
- Skill presents the list to the user. **The user must confirm or edit the list before Phase 3.** This is the only mid-run human checkpoint.

### Phase 3: Worktree

- Invoke `superpowers:using-git-worktrees` to create `../<repo>-expand-<category>-<date>/` on branch `expand/<category>-<YYYY-MM-DD>`.
- Verify clean state. `cd` into the worktree for the rest of the run.
- **Assign all N IDs up front** by running `scripts/next-id.sh` once and numbering the confirmed topics sequentially from there (topic 1 = max+1, topic 2 = max+2, …). IDs are fixed for the remainder of the batch. This avoids any edge case where a later topic gets assigned an ID that a concurrently-written earlier topic already claimed.
- Also assign each topic its `slug` (kebab-case of the title) at this point.
- Write the confirmed topic list (with assigned IDs and slugs) to `docs/superpowers/specs/<date>-expand-<category>-design.md` and commit it as the first commit on the branch.

### Phase 4: Research + Write Loop (per topic, N iterations)

For each topic:

- **4a. Research subagent** — dispatched with the research-brief template. Returns the findings content in its reply (structured claims, each with a verified URL citation and a pulled quote). The main session writes that content to `docs/superpowers/research/<slug>.md`.
- **4b. Writer subagent** — given only the findings doc, the embedded template, locale=en, target ID, target slug. Produces the EN article. **Hard rule: any claim not in the findings doc must not appear in the article.**
- **4c. Translator subagent** — given the completed EN article. Produces the parallel zh-TW file. Same structure, same citations, translated prose.
- **4d. Polish** — run `polish-documents` skill on both the EN and zh-TW files.
- **4e. Per-article gates** — frontmatter validity, reference URL check, findings coverage (detailed below).
- **4f. Commit** — one commit: `docs(<category>): add <title> (BEE-<id>)`, containing the EN file, zh-TW file, and findings doc.

### Phase 5: Validate (batch)

After all N articles are committed:
- Cross-article ID uniqueness: scan every `id:` value across the whole category directory; require each to appear exactly once.
- Re-list the N commits on the expansion branch for the handoff summary.

### Phase 6: Handoff

Skill prints:
- Worktree path and branch name
- Commit count and article list with assigned IDs
- Reminder: user runs `pnpm docs:build` during their own review (the skill deliberately does not run the VitePress build)
- Next-step hint: `cd <path> && git log`, then push / PR / discard

## Subagent Contracts

Three single-purpose subagent roles. Each has a narrow prompt template. The separation is the quality mechanism: the writer never touches the web (no hallucinated citations), the translator never sees the research brief (no re-interpretation of claims), the researcher never writes final prose (no skipped structured-findings step).

### Research Subagent

Single prompt template, parameterized by mode.

**Gap-discovery mode** (Phase 2):
- Input: category slug, sampled existing articles, count N.
- Output: ranked list of N topics. Per topic: title, one-line rationale, 2–3 authoritative sources.

**Per-article mode** (Phase 4a):
- Input: one topic, the embedded template's required sections.
- Output: a `findings.md` doc with structured claims. Per claim: claim text, source URL, pulled quote (verbatim, ≤2 sentences), target article section (Context / Visual / Example / Best Practices / …).

**Tools allowed:** WebSearch, WebFetch, Read, Grep. Write is not allowed — the subagent returns its output in its reply and the main session persists it.

**Source tier rule** (enforced in the subagent prompt): prefer original papers, RFCs, official language/framework documentation, vendor engineering blogs with named authors. Reject Wikipedia, unattributed Medium posts, AI-written SEO pages, dead links.

### Writer Subagent

- Input: findings doc path, embedded template, locale=en, target ID, target slug.
- Output: the full EN article file, written to disk.
- Hard rule in the prompt: "If a claim is not in the findings doc, it does not go in the article. No internal-knowledge additions. No invented citations. No filler."
- Tools allowed: Read (findings doc + template), Write (the article file only).
- Style constraints (from user's global `CLAUDE.md`): forbid contrastive negation ("not X but Y"), em-dash chains, unanchored superlatives, puffery phrasings like "核心洞見" / "the core insight."

### Translator Subagent

- Input: the completed EN article.
- Output: the zh-TW parallel file.
- Rules:
  - Structural parity: same heading hierarchy, same number of Mermaid diagrams in the same positions, same URLs in References.
  - Translate prose paragraphs and Mermaid diagram node labels.
  - Preserve programming-language code blocks (anything in ``` blocks other than `mermaid`) verbatim — variable names, function names, error messages stay in English.
  - Preserve all URLs verbatim; translate the anchor text if the URL is in an inline link.
  - Preserve frontmatter `id` and `slug`; translate `title`.
- Tools allowed: Read (EN file), Write (zh-TW file).

## Validation & Quality Gates

Gate failures stop that article's commit. The article stays on disk in the worktree for the user to fix; the skill does not commit broken work.

### Per-Article Gates (Phase 4e)

1. **Frontmatter validity** (`scripts/validate-frontmatter.sh`)
   - Parse YAML frontmatter from the EN and zh-TW files.
   - Required fields: `id` (integer), `title` (non-empty string), `state` (one of `draft`/`reviewing`/`approved`), `slug` (kebab-case, matches filename without `.md`).
   - `id` uniqueness: grep all `id:` values under `docs/en/<category>/` — the new id must appear exactly once.
   - EN and zh-TW files must share identical `id` and `slug`.

2. **Reference URL validation** (`scripts/check-references.sh`)
   - Extract every URL from the `## References` section (markdown link syntax and bare URLs).
   - HEAD request each URL with a 10-second timeout, follow redirects.
   - Accept 2xx and 3xx. Reject 4xx, 5xx, timeouts, connection errors.
   - Failure output lists each dead URL so the user can fix or remove it.

3. **Findings-to-article coverage check**
   - Grep every URL appearing in the article's `findings.md`.
   - Require at least 3 of those URLs to appear in the article's `## References` section.
   - Prevents the writer from silently ignoring the research.

### Per-Batch Gate (Phase 5)

4. **Cross-article ID uniqueness** — one final scan across the category directory. Every `id:` value must be unique. Catches the edge case where a manual mid-run intervention (user editing a file directly, an earlier retry keeping a stale id) left two articles sharing an id.

### Not Gated (by user's explicit choice)

- `pnpm docs:build` — skipped. User runs it during their own review. Rationale: slow, pulls node_modules state into the worktree, catches a narrower class of issues than expected, and the user's review-and-push workflow already includes it.

### Failure Handling

On gate failure, the skill:
- Does not commit the article.
- Leaves both files on disk in the worktree.
- Prints the specific failure (example: "BEE-19050: 2 dead URLs in References: <url1>, <url2>").
- Asks the user: "fix and retry this article, skip it, or abort the batch?"

## Testing Plan (`writing-skills` Compliance)

This is a technique skill, so the test shape per `superpowers:writing-skills` guidance is application scenarios, variation scenarios, and missing-information tests — not pressure scenarios.

### RED Phase — Baseline (before writing SKILL.md)

Three subagent scenarios are run **without** the skill loaded. Their verbatim rationalizations, template drifts, and missing steps become the specific content the skill must address.

1. *"Add 5 articles to the `distributed-systems` category in this repo."* — baseline subagent picks some shape. Expected failures: skips worktree isolation, skips research-separation rule, may fabricate citations.
2. *"Add articles to the `data-storage` category."* — a different category. Tests whether the subagent adapts the template or silently copies one existing article's structure.
3. *"Add articles on `<topic>` to this AI docsite."* — a sister site with a different category layout. Tests cross-site portability.

### GREEN Phase — Write the Skill

Every section in `SKILL.md` traces to a specific baseline failure. No aspirational content.

### REFACTOR Phase — Close Loopholes

Re-run the three baseline scenarios with the skill loaded. Identify new rationalizations or leaks. Tighten. Iterate until all three scenarios comply.

### Test Artifact Storage

`~/.claude/skills/expanding-category-articles/tests/red/` and `.../tests/green/`. Not committed to any doc-repo.

## Decision Summary

| Area | Decision |
|---|---|
| Name | `expanding-category-articles` |
| Location | `~/.claude/skills/expanding-category-articles/` |
| Input | category slug only; optional `--count`, `--topics` |
| Output | worktree with N articles (EN + zh-TW) + findings + per-article commits; no push, no PR |
| Template | embedded in the skill: Context / Visual / Example / Best Practices / (Design Thinking) / (Deep Dive) / (topic-specific) / Related Topics / References |
| Template omissions | no Principle, no Common Mistakes |
| ID scheme | `max(id) + 1` in the target category directory |
| Bilingual | always both EN and zh-TW, non-negotiable |
| Research | structured two-phase: research subagent produces findings doc, writer uses only findings; 3 distinct subagents (researcher / writer / translator) |
| Worktree | created via `superpowers:using-git-worktrees`; one commit per article; skill stops at commit |
| Per-article gates | frontmatter validity + reference URL HEAD check + findings-coverage (≥3 URLs reused) |
| Batch gate | cross-article ID uniqueness |
| Skipped | `pnpm docs:build` (user runs it during review) |
| Testing | `writing-skills` RED / GREEN / REFACTOR with 3 baseline scenarios |

## Open Questions

None. All ten brainstorming questions are resolved.

## Out of Scope

- Editing existing articles (this skill only adds new ones).
- Creating new categories (the target category must already exist).
- Pushing, opening PRs, or merging (user decides post-review).
- Running the VitePress build (user runs it during review).
- Creating an English-only variant for sister sites that lack `docs/zh-tw/` (bilingual is non-negotiable; the skill fails fast on such repos).
