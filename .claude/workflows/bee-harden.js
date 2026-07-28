export const meta = {
  name: 'bee-harden',
  description: 'Reader-first audit, revise, adversarially verify, and zh-sync existing BEE articles',
  phases: [
    { title: 'Audit', detail: 'reader-first four-lens audit per article' },
    { title: 'Revise', detail: 'apply findings, lens-priority order' },
    { title: 'Verify', detail: 'independent adversarial verification, max 3 rounds' },
    { title: 'Sync', detail: 'mirror final EN state to zh-TW' },
  ],
}

// args may arrive as a JSON string depending on the invoking harness
const input = typeof args === 'string' ? JSON.parse(args) : (args || {})
const batch = input.batch || []
if (!batch.length) return { results: [] }

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['findings', 'summary'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lens', 'severity', 'location', 'statement', 'suggestedFix'],
        properties: {
          lens: { type: 'string', enum: ['tone', 'organization', 'references', 'factual', 'template'] },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          location: { type: 'string', description: 'file:line or section name' },
          statement: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
      },
    },
    summary: { type: 'string', description: 'reader verdict: would you trust this article? what does it do well?' },
  },
}

const REVISE_SCHEMA = {
  type: 'object',
  required: ['changed', 'editsSummary'],
  properties: {
    changed: { type: 'boolean' },
    editsSummary: { type: 'string' },
    declined: { type: 'string', description: 'findings you chose not to apply, with reasons' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['verdict', 'notes'],
  properties: {
    verdict: { type: 'string', enum: ['clean', 'issues'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['statement', 'location', 'fix', 'severity'],
        properties: {
          statement: { type: 'string' }, location: { type: 'string' }, fix: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'minor'], description: 'blocking = factual error, misleading claim, or structural damage; minor = cosmetic (tone, phrasing, polish)' },
        },
      },
    },
    notes: { type: 'string' },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  required: ['applied'],
  properties: { applied: { type: 'string', description: 'what was fixed' } },
}

const SYNC_SCHEMA = {
  type: 'object',
  required: ['zhPath', 'passagesUpdated'],
  properties: {
    zhPath: { type: 'string' },
    passagesUpdated: { type: 'number' },
    zhFixes: { type: 'string', description: 'zh-specific fixes applied beyond mirroring the EN diff' },
  },
}

const TONE_BLACKLIST = `
Named AI-tone patterns to hunt (both languages):
- Negation tricolon: "the cache does not invalidate, replicas do not converge,
  clients do not retry" / 「快取不會失效、副本不會收斂、客戶端不會重試」
- "not X but Y" contrast framing: "The question is not whether to cache, but..."
  / 「不是X，而是Y」
- Em-dash sentences ("X — Y", "X -- Y", zh 「X——Y」): the reflexive
  dash-appositive that bolts a gloss, example, or consequence onto a sentence
  is this model's strongest tell, even one dash at a time. Rewrite as two
  sentences, a comma, a colon, or parentheses. DENSITY RULE: more than ~3
  em-dashes in an article's prose is a finding in itself (code, tables, and
  frontmatter do not count). A dash marking a genuine interruption may stay.
- Importance-announcement preambles: "The core insight:" / 「核心洞見：」 and
  the bare 「核心」 modifier used as emphasis. State the content directly.
- "值得X" framing in zh (值得注意、值得一提、值得參考 and all variants):
  delete the frame, state the content.
- Precision puffery: "說得很清楚"、"精確地定義了" and self-congratulatory
  clarity claims; undefined vague adjectives (「很重」 heavy by what measure?).
- Paragraph-final summary flourishes that restate the paragraph
Fix rule: replace the pattern with ONE concrete example or a plain statement.
Rewording the pattern into a fresh tricolon or contrast is a failed fix.`

const SCOPE_RULE = `
Scope discipline (hard rule): edit ONLY the file(s) named in this prompt.
Do not touch docs/en/list.md, docs/zh-tw/list.md, other articles, configs,
or anything else, even if you notice problems there — report them in your
notes instead.`

function opNote(a) {
  return a.note ? `
OPERATOR NOTE for this article (binding, overrides generic rules where they conflict):
${a.note}
` : ''
}

function auditPrompt(a) {
  return `You are auditing one documentation article, reader-first. Article:
${a.enPath} (EN) and its mirror ${a.zhPath} (zh-TW). Read CLAUDE.md first for
the canonical template and conventions.
${opNote(a)}

Step 1 — READ AS A READER. Read the EN article start to finish once, as a
senior backend engineer trying to learn from it. Record where you stumble,
every term used before it is introduced, and every question the text provokes
but does not answer. Skim the zh-TW mirror for parity and translated-AI-tone.

Step 2 — VERIFY. Go back and check load-bearing claims against the article's
own References plus official docs (WebFetch/WebSearch). Flag claims the cited
sources contradict, stale version claims (today's world, not the world at
writing time), and dead URLs. Check whether cited sources contain concepts
the body should absorb, and whether references use terms the body never defines.

Step 3 — SWEEP THE ECOSYSTEM. Search beyond the article's own References:
what would a practitioner in today's ecosystem expect this article to cover?
Flag as findings (a) major implementations, systems, or spec developments
the article omits entirely, and (b) widely-cited, high-quality community
articles on this topic whose insights the article should absorb — name the
specific source and the specific insight worth folding in. An article that
only restates official docs is under-researched by this repo's standards.

Report findings in these lenses, priority order: tone (highest), organization
(dependency check / provoked-question check / vendor neutrality /
MOTIVATING-PREMISE check: is the audience or scenario the article claims as
its reason to exist real, or invented to justify the content? A comparison
or mechanism study is allowed to exist for its own sake — if the premise is
fiction, the finding's fix is to reframe the article around its genuine
motivation, not to delete one sentence), references (mining + terminology
alignment), factual, template (mechanical checklist: section order vs
CLAUDE.md, frontmatter, Vue template safety).
${TONE_BLACKLIST}
Read-only: do NOT edit any file. Severity: blocker = misleads the reader on
the article's core promise; major = a reader acting on it gets burned; minor
= polish.`
}

function revisePrompt(a, audit) {
  return `You are revising the article ${a.enPath} (EN ONLY — the zh-TW mirror
is synced by a later agent). Read CLAUDE.md first.
${opNote(a)} Apply the audit findings
below in lens-priority order: tone, organization, references, factual,
template. Preserve what the audit praised; do not rewrite untouched sections.
${TONE_BLACKLIST}
${SCOPE_RULE}
For organization findings, answer the reader's provoked questions in place
(add the missing paragraph or gloss); introduce every proper noun at first
substantive use. For factual findings, base corrections only on the sources
the audit cites — do not add new unsourced claims. You may decline a finding
you believe is wrong; record it in "declined" with a reason.

Audit findings:
${JSON.stringify(audit.findings, null, 2)}

Audit reader summary (what to preserve):
${audit.summary}

Edit the file now with Edit/Write.`
}

function verifyPrompt(a) {
  return `You are an adversarial verifier with no stake in the revision. The
article ${a.enPath} was just revised by another agent (its uncommitted diff:
run \`git diff -- "${a.enPath}"\`).
${opNote(a)}Your job is to REFUTE the revision:
assume every ADDED claim is wrong until a primary source proves otherwise
(WebFetch/WebSearch official docs — never blogs echoing each other), and
check whether the edits introduced NEW tone violations or reader-model
regressions (a term now used before introduction, a new unanswered question).
${TONE_BLACKLIST}
Also check internal consistency: does any unedited sentence now contradict an
edited one? The zh-TW mirror (${a.zhPath}) is synced by a LATER stage of this
pipeline — EN/zh parity mismatch is expected at this point and MUST NOT be
reported as a finding against the EN revision. Read-only: do NOT edit any
file. Verdict "clean" only if no finding survives your honest effort to
refute.`
}

function fixPrompt(a, findings) {
  return `You are fixing verified defects in ${a.enPath}. Apply EXACTLY these
fixes, nothing else. Read the file, make the edits with Edit, confirm each.
${SCOPE_RULE}

Defects:
${JSON.stringify(findings, null, 2)}`
}

function syncPrompt(a, audit) {
  return `You are syncing a revised EN article into its zh-TW mirror.
EN (final state): ${a.enPath}. Its uncommitted changes: run
\`git diff -- "${a.enPath}"\`. zh-TW mirror to update: ${a.zhPath}.
Read CLAUDE.md first (bilingual parity rules, Vue template safety). The zh
file's existing translated section headings are the heading map — keep them.
${opNote(a)}
Apply every EN change at the corresponding location in the zh file,
translated naturally into Traditional Chinese (Taiwan). Match the zh file's
existing terminology and punctuation conventions. Do NOT reintroduce AI-tone
patterns the EN edits removed (no negation tricolons, no 「不是X，而是Y」,
no 「核心洞見」, no 「值得一提」).

In addition to mirroring the EN diff: the audit findings below may include
issues specific to the zh-TW file (zh-only tone violations, translation
drift). Fix those in the zh file too, and report each of them in the
zhFixes field of your structured output.

Audit findings:
${JSON.stringify((audit && audit.findings) || [], null, 2)}
${SCOPE_RULE.replace('file(s) named in this prompt', `zh-TW file ${a.zhPath} only`)}
After editing, re-read the changed zh sections once and confirm section count
and order still parallel the EN file. Full orthographic correctness for
Traditional Chinese is required.`
}

function shortName(p) {
  const m = p.match(/([^/]+)\.md$/)
  return m ? m[1] : p
}

function hasZhFinding(findings) {
  return (findings || []).some(f => /zh/i.test(`${f.location} ${f.statement}`))
}

phase('Audit')
const results = await pipeline(
  batch,
  a => agent(auditPrompt(a), { label: `audit:${shortName(a.enPath)}`, phase: 'Audit', schema: AUDIT_SCHEMA }),
  async (audit, a) => {
    if (!audit) return { status: 'failed', notes: 'audit agent failed' }
    const counts = { tone: 0, organization: 0, references: 0, factual: 0, template: 0 }
    for (const f of audit.findings) counts[f.lens] = (counts[f.lens] || 0) + 1
    if (!audit.findings.length) {
      return { status: 'clean', findings: counts, notes: audit.summary }
    }
    // Model split: judgment stages (audit, verify) inherit the session model;
    // execution stages (revise, fix, sync) run on sonnet — they act on
    // structured findings, and the verify loop catches execution slips.
    const revised = await agent(revisePrompt(a, audit), {
      label: `revise:${shortName(a.enPath)}`, phase: 'Revise', schema: REVISE_SCHEMA, model: 'sonnet',
    })
    if (!revised) return { status: 'failed', findings: counts, notes: 'revise agent failed after audit found issues' }
    if (!revised.changed) {
      if (hasZhFinding(audit.findings)) {
        return { status: 'zh-only', findings: counts, audit, revised }
      }
      return { status: 'clean', findings: counts, notes: `audit findings all declined: ${revised.declined || 'no reason given'}` }
    }
    return { status: 'revised-unverified', findings: counts, audit, revised }
  },
  async (prev, a) => {
    if (!prev || prev.status !== 'revised-unverified') return prev
    // Up to 3 verify rounds with a fix pass between rounds. Round two can
    // surface NEW findings (FEE observation, 2026-07-14); a two-round cap
    // discarded an otherwise-verified revision. PR review is the final human gate.
    const MAX_ROUNDS = 3
    let verdict = null
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      verdict = await agent(verifyPrompt(a), {
        label: `verify${round > 1 ? round : ''}:${shortName(a.enPath)}`, phase: 'Verify', schema: VERIFY_SCHEMA,
      })
      if (!verdict) return { ...prev, status: 'failed', notes: `verify agent failed (round ${round}); treat article as dirty` }
      if (verdict.verdict === 'issues' && !(verdict.findings || []).length) {
        verdict = { verdict: 'clean', notes: `${verdict.notes} (issues verdict named no findings — treated as clean)` }
      }
      if (verdict.verdict === 'clean' || round === MAX_ROUNDS) break
      const fixed = await agent(fixPrompt(a, verdict.findings), {
        label: `fix${round}:${shortName(a.enPath)}`, phase: 'Verify', schema: FIX_SCHEMA, model: 'sonnet',
      })
      if (!fixed) return { ...prev, status: 'failed', notes: `fix agent failed after verify round ${round}; treat article as dirty` }
    }
    if (verdict.verdict !== 'clean') {
      // Minor-only residuals do not condemn the article (FEE observation,
      // 2026-07-15: a single cosmetic tricolon triggered a revert of a
      // revision that had corrected blocker-class hallucinations). The PR
      // is the human gate.
      const residuals = verdict.findings || []
      const blocking = residuals.filter(f => f.severity !== 'minor')
      if (!blocking.length) {
        const listed = residuals.map(f => `${f.location}: ${f.statement}`).join(' | ')
        log(`${a.enPath}: only minor residuals after ${MAX_ROUNDS} rounds — landing with notes`)
        return { ...prev, status: 'verified', verifyNotes: `${verdict.notes} | minor residuals (listed in report/PR for reviewer): ${listed}` }
      }
      log(`${a.enPath}: blocking findings still unresolved after ${MAX_ROUNDS} rounds — marking for revert`)
      return { ...prev, status: 'reverted', notes: `unresolved blocking findings after ${MAX_ROUNDS} verify rounds: ${verdict.notes}` }
    }
    return { ...prev, status: 'verified', verifyNotes: verdict.notes }
  },
  async (prev, a) => {
    if (!prev || (prev.status !== 'verified' && prev.status !== 'zh-only')) return prev
    const lead = prev.status === 'zh-only'
      ? `EN clean; zh-only findings routed to sync${prev.revised.declined ? ` | declined: ${prev.revised.declined}` : ''}`
      : `${prev.revised.editsSummary}${prev.revised.declined ? ` | declined: ${prev.revised.declined}` : ''} | ${prev.verifyNotes}`
    const synced = await agent(syncPrompt(a, prev.audit), {
      label: `sync:${shortName(a.enPath)}`, phase: 'Sync', schema: SYNC_SCHEMA, model: 'sonnet',
    })
    if (!synced) {
      if (prev.status === 'zh-only') {
        log(`${a.enPath}: zh-only sync failed — zh findings unresolved`)
        return { ...prev, status: 'failed', notes: `${lead} | zh-only sync agent failed; zh findings unresolved` }
      }
      log(`${a.enPath}: zh sync failed — EN revision stands, zh needs manual sync`)
      return { ...prev, status: 'revised', notes: `${lead} | WARNING: zh-TW sync agent failed, mirror not updated` }
    }
    return { ...prev, status: 'revised', notes: `${lead} | zh synced (${synced.passagesUpdated} passages${synced.zhFixes ? `; zh fixes: ${synced.zhFixes}` : ''})` }
  }
)

return {
  results: batch.map((a, i) => {
    const r = results[i] || { status: 'failed', notes: 'pipeline dropped this article' }
    return {
      enPath: a.enPath, zhPath: a.zhPath, id: a.id || null,
      status: r.status, findings: r.findings || null, notes: r.notes || '',
    }
  }),
}
