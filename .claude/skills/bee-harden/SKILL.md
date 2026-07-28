---
name: bee-harden
description: Use when the user runs /bee-harden or asks to harden, sharpen, or audit existing BEE articles. Selects the stalest articles from the audit ledger, runs the reader-first audit/revise/verify/sync workflow, lands results on a run branch, updates the ledger, and opens a PR.
---

# /bee-harden — Harden Existing BEE Articles

Manually triggered. Audits a ledger-selected batch reader-first across four
calibrated lenses (tone > organization > references > factual), revises,
adversarially verifies with a separate agent, syncs zh-TW, opens a PR.
Ported from the FEE content harness (frontend-engineering-essentials,
spec 2026-07-13) with BEE-calibrated tone rules.

Argument: optional batch size (default 5). `/bee-harden 2`.

## Steps

### 1. Select the batch

- Read `docs/superpowers/harness/audit-ledger.json`.
- Confirm the working tree has NO uncommitted changes (staged or unstaged) under
  `docs/en/` and `docs/zh-tw/` — the workflow runs `git checkout --` on batch
  articles and attributes their `git diff` to the reviser, so pre-existing
  edits would be destroyed or misattributed. If not clean, ABORT the run with
  a clear message (this command runs unattended; do not ask questions).
- Determine today's date as YYYY-MM-DD.
- Create the run branch from up-to-date main:
  `git fetch origin && git checkout -b harness/harden-<today> origin/main`
  (if the branch already exists from a same-day run, suffix `-2`, `-3`, ...).
  All commits in this run land on this branch, never on main.
- Enumerate candidates and pick the batch with:

```bash
node -e "
const fs = require('fs'), path = require('path');
const N = Number(process.argv[1] || 5);
const ledger = JSON.parse(fs.readFileSync('docs/superpowers/harness/audit-ledger.json', 'utf8'));
const files = [];
// bee-overall holds meta articles (overview, how-to-read, glossary) that do
// not follow the article template; excluded from harden v1.
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'bee-overall') walk(p); }
    else if (e.name.endsWith('.md') && !['list.md', 'faq.md', 'index.md'].includes(e.name)) files.push(p);
  }
})('docs/en');
const never = files.filter(f => !ledger[f]).sort();
const stale = files.filter(f => ledger[f]).sort((a, b) => ledger[a].lastAudited.localeCompare(ledger[b].lastAudited));
const batch = never.concat(stale).map(enPath => {
  const src = fs.readFileSync(enPath, 'utf8');
  if (/^overview: true/m.test(src)) return null; // overview pages aggregate their category; harden targets articles
  const m = src.match(/^id:\s*(\d+)/m);
  return { enPath, zhPath: enPath.replace('docs/en/', 'docs/zh-tw/'), id: m ? Number(m[1]) : null };
}).filter(Boolean).filter(e => {
  if (fs.existsSync(e.zhPath)) return true;
  console.error('dropped (missing zh mirror): ' + e.enPath);
  return false;
}).slice(0, N);
console.log(JSON.stringify(batch, null, 2));
" <N>
```

- Entries dropped for a missing zh mirror are printed to stderr — list them in
  the report as "missing zh mirror — needs creation, not harden".
- Overview pages (`overview: true` frontmatter) are permanently excluded:
  they aggregate their category, so the reader-first lenses do not apply.

### 2. Run the workflow

Invoke the Workflow tool:
- `scriptPath`: `.claude/workflows/bee-harden.js`
- `args`: `{ "batch": <the selected array> }`

Wait for completion. The return value is `{ results: [...] }` with per-article
`status`: `clean` / `revised` / `reverted` / `failed`.

### 3. Revert what the workflow condemned

- For each result with `status: "reverted"`: `git checkout -- "<enPath>"`
  (zh is untouched at that stage).
- For each `status: "failed"`: check `git status` for that article pair; if
  either file is dirty, `git checkout --` both. A failed article must land
  nothing.

### 4. Build gate

Run `pnpm docs:build`. It MUST pass. On failure: identify the offending file;
fix trivial violations (Vue template safety) yourself; if unsalvageable,
revert that article pair, downgrade its status to `reverted`, re-run until green.

### 5. Sanity review

For each `revised` article, read the EN diff (`git diff -- "<enPath>"`) once:
confirm edits stay inside the article, tone fixes did not reword the pattern
into a new pattern, and the zh mirror was actually updated when the notes say
it was. Structural surprises send the pair to the revert path with a note.

### 6. Update harness state

- For every article in the batch, upsert `audit-ledger.json`:
  `{"<enPath>": {"id": <id>, "lastAudited": "<today>", "findings": <findings counts or zeros>, "notes": "<status>: <notes, truncated to one line>"}}`
  (`clean`, `revised`, and `reverted`/`failed` all get ledger entries —
  a reverted article records what went wrong; keep the entry so the next run
  moves on, and list it in the report for manual attention.)
- Write `docs/superpowers/harness/reports/<today>-harden.md`:

```markdown
# Harden Run — <today>

## Revised
- BEE-<id> <enPath> — findings {tone: n, ...}. <notes>

## Clean
- BEE-<id> <enPath> — <notes>

## Reverted / Failed (needs manual attention)
- BEE-<id> <enPath> — <notes>

## zh desync (needs manual attention)
- BEE-<id> <enPath> — EN revised and verified but the zh sync agent failed; mirror is stale.
```

If the report file already exists (same-day rerun), append a `## Run N` section.

A `revised` result whose notes contain 'zh-TW sync agent failed' goes under
`## zh desync`, and its ledger notes must start with `revised (zh sync FAILED): `.

### 7. Commit (on the run branch)

Order, matching repo conventions (no emojis, no AI attribution):

1. Per category with revised articles: `git add` that category's revised
   EN+zh pairs, then
   `docs(<category-kebab>): harden BEE-<ids> (<dominant lenses, e.g. "tone, reader gaps, facts">)`.
   Commit zh-desync articles' EN files too (the revision is verified), but
   naming them in the commit body is not needed — the report and ledger
   carry the flag.
2. Harness state + report: `chore(harness): record harden run <today>`.

### 8. Open the PR

- Confirm `git status` is clean; investigate and report anything left over —
  stray modifications mean an agent violated scope.
- Push the branch: `git push -u origin harness/harden-<today>`.
- Open the PR against main:
  `gh pr create --title "Harden run <today>: BEE-<ids>" --body <body>`
  where the body contains: per-status groups (revised with dominant lenses,
  clean, reverted/failed, zh desync) with one line per article, a
  needs-attention callout, and a pointer to the committed report file.
  No emojis, no AI attribution in the body.
- Switch back to main: `git checkout main` (leave main untouched).
- Report to the user: the PR URL plus a one-paragraph summary. The PR is the
  human review surface — do not merge it yourself.
- If the PR later reports a conflict on `audit-ledger.json` (another run's PR
  merged first), merge origin/main into the run branch and resolve the ledger
  as a UNION of entries: keep every article key from both sides; where both
  sides carry the same key, the entry with the newer `lastAudited` (or, if
  equal, the more advanced status — revised beats reverted) wins. Validate
  with JSON.parse, commit the merge, push.
