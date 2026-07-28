---
title: BEE Harden Harness — Port from FEE
date: 2026-07-29
status: Approved
source-spec: frontend-engineering-essentials docs/superpowers/specs/2026-07-13-fee-harness-workflow-design.md
---

# BEE Harden Harness — Port from FEE

## Problem

BEE articles are written in expansion waves and never systematically
re-audited. FEE built a repeatable harden process (spec 2026-07-13, refined
through three production runs); BEE adopts the harden half of that harness.
The discover half is not ported yet.

## What is ported unchanged

- Ledger-driven batch selection (never-audited first, then stalest).
- Reader-first audit across five lenses: tone > organization > references >
  factual, with template compliance as a mechanical checklist.
- Reviser and verifier as separate agents; up to three verify+fix rounds;
  severity-aware verdicts (minor-only residuals land with notes, blocking
  residuals revert the article).
- Model split: judgment stages (audit, verify) inherit the session model;
  execution stages (revise, fix, sync) run on sonnet.
- zh-only findings routed through the sync stage.
- Build gate (`pnpm docs:build`), per-category commits, autonomous PR landing
  on `harness/harden-<date>` branches, ledger-union conflict recipe.
- Committed run state (git-scraping pattern): `audit-ledger.json` and
  `reports/` live under `docs/superpowers/harness/`.

## BEE-specific adaptations

- Reader persona: senior backend engineer; neutrality lens checks vendor
  neutrality (BEE is vendor-neutral) instead of framework neutrality.
- Selection excludes `bee-overall` (meta articles: overview, how-to-read,
  glossary do not follow the article template), plus `overview: true` pages
  and `list.md` / `faq.md` / `index.md`, mirroring FEE's exclusion of its
  Web Platform Proposals category.
- Tone blacklist extended with BEE-calibrated banned patterns from owner
  feedback: importance-announcement preambles ("The core insight:" and its
  zh equivalents, the bare 「核心」 emphasis modifier), the zh
  worthiness-framing pattern (「值」+「得」 followed by a verb, all variants),
  precision puffery, and undefined vague adjectives. The full list with
  examples lives in the TONE_BLACKLIST constant of the workflow script.
- zh sync uses each zh file's existing translated section headings as the
  heading map; BEE's CLAUDE.md does not carry a central header table.

## Out of scope

- `bee-discover` (source-driven new-article sweep). Port later if the harden
  loop proves out; `sources.yaml` would need a backend-specific registry
  (database release notes, IETF drafts, cloud-neutral engineering blogs).
- Article state promotion (draft → reviewing → approved).
- Scheduling. Manual trigger only, same as FEE v1.
