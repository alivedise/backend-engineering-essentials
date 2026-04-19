# BEE Overview Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `bee-overview.md` for the post-restructure category scheme, fix stale BEE-1 links and BEPs/BEE terminology in `how-to-read-bee.md` + `glossary.md`, and strip 275 redundant mid-document `---` separator lines per locale.

**Architecture:** Three coordinated commits. Commit 1 ships an audited single-purpose Node script that mechanically removes redundant HRs (TDD'd against synthetic markdown fixtures so fence/frontmatter/blockquote handling is provable). Commit 2 hand-edits `bee-overview.md` (EN + zh-TW lockstep) for the new Categories tables and Context prose. Commit 3 hand-edits the two sibling docs for stale link IDs and "Related BEPs" → "Related BEEs".

**Tech Stack:** Node 20+ ESM scripts, built-in `node:test` runner, VitePress 1.3.x build, gray-matter (already present), `polish-documents` skill on every modified content file before commit.

---

## File Structure

| File | Responsibility | Created/Modified |
|------|---------------|------------------|
| `scripts/cleanup-redundant-hrs.mjs` | Pure function `cleanRedundantHrs(text): string` plus thin CLI wrapper that walks `docs/en/` and `docs/zh-tw/` | Create |
| `scripts/cleanup-redundant-hrs.test.mjs` | Unit tests for the pure function (5 cases) | Create |
| `docs/en/bee-overall/bee-overview.md` | Categories tables + Context prose + BEPs→BEE inline | Modify |
| `docs/zh-tw/bee-overall/bee-overview.md` | Same edits, zh-TW translation | Modify |
| `docs/en/bee-overall/how-to-read-bee.md` | BEE-2→BEE-1 link, "Related BEPs" → "Related BEEs" | Modify |
| `docs/zh-tw/bee-overall/how-to-read-bee.md` | Same edits, zh-TW | Modify |
| `docs/en/bee-overall/glossary.md` | BEE-2→BEE-1 link, "Related BEPs" → "Related BEEs" | Modify |
| `docs/zh-tw/bee-overall/glossary.md` | Same edits, zh-TW | Modify |
| ~70 articles across `docs/en/` and `docs/zh-tw/` | HR lines stripped by Task 5 script run | Modify |

---

## Task 1: Pre-flight

**Files:** none (verification only)

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: `working tree clean` and branch is `main`.

- [ ] **Step 2: Verify baseline build passes**

Run: `pnpm docs:build`
Expected: `build complete in ~75s` with no errors. (Confirms we're starting from a known-good state.)

- [ ] **Step 3: Capture baseline HR count**

Run:

```bash
python3 -c "
import os
def count(base):
    n = 0; files = set()
    for root, _, fs in os.walk(base):
        if '.vitepress' in root: continue
        for f in fs:
            if not f.endswith('.md'): continue
            p = os.path.join(root, f)
            with open(p) as fh: lines = fh.readlines()
            fm = 0
            for line in lines:
                if line.rstrip() == '---':
                    fm += 1
                    if fm > 2: n += 1; files.add(p)
    return n, len(files)
print('EN:', count('docs/en'))
print('zh-TW:', count('docs/zh-tw'))
"
```

Expected: `EN: (275, 35)` and `zh-TW: (275, 35)`. Record these numbers — Task 5 will diff against them.

---

## Task 2: Write failing unit test for `cleanRedundantHrs`

**Files:**
- Create: `scripts/cleanup-redundant-hrs.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `scripts/cleanup-redundant-hrs.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRedundantHrs } from './cleanup-redundant-hrs.mjs';

test('strips body HR but preserves frontmatter delimiters', () => {
  const input = `---
title: Foo
id: 1
---

# Heading

Some text.

---

## Section

More text.
`;
  const expected = `---
title: Foo
id: 1
---

# Heading

Some text.


## Section

More text.
`;
  assert.equal(cleanRedundantHrs(input), expected);
});

test('preserves HR-like lines inside backtick code fence', () => {
  const input = `---
title: Foo
---

Body.

\`\`\`yaml
key: value
---
other: value
\`\`\`

After fence.
`;
  // The --- inside the yaml fence must survive.
  const result = cleanRedundantHrs(input);
  assert.match(result, /---\nother: value/);
});

test('preserves HR-like lines inside tilde code fence', () => {
  const input = `---
title: Foo
---

~~~markdown
Section A
---
Section B
~~~
`;
  const result = cleanRedundantHrs(input);
  assert.match(result, /Section A\n---\nSection B/);
});

test('strips HR with trailing whitespace', () => {
  const input = `---
title: Foo
---

Body.

---   

## Heading
`;
  const result = cleanRedundantHrs(input);
  assert.ok(!result.includes('---   '), 'trailing-whitespace HR should be stripped');
  assert.ok(!result.match(/\n---\s*\n/), 'no body HR should survive');
});

test('handles document with no HRs (identity)', () => {
  const input = `---
title: Foo
---

# Heading

Body without separators.
`;
  assert.equal(cleanRedundantHrs(input), input);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/cleanup-redundant-hrs.test.mjs`
Expected: 5 tests fail with `Cannot find package` or `cleanRedundantHrs is not a function` — the implementation file does not exist yet.

---

## Task 3: Implement `cleanRedundantHrs` to pass the test

**Files:**
- Create: `scripts/cleanup-redundant-hrs.mjs`

- [ ] **Step 1: Write the implementation**

Create `scripts/cleanup-redundant-hrs.mjs` with the pure function only (CLI wrapper added in Task 4):

```javascript
#!/usr/bin/env node
// Strip redundant mid-document horizontal-rule (`---`) lines from BEE
// articles. VitePress already renders visible separation at every H2/H3,
// so the body HRs add no signal.
//
// The function preserves:
//   - YAML frontmatter delimiters (the first two `---` lines if the first
//     non-empty line is `---`)
//   - HR-like lines inside fenced code blocks (``` or ~~~)
//
// Blockquoted lines (`> ---`) are not candidates because the trimmed
// text is `> ---`, not `---`, so the equality check excludes them.

export function cleanRedundantHrs(text) {
  const lines = text.split('\n');
  const out = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inFence = false;
  let fenceChar = null; // '`' or '~'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Frontmatter handling: opens at line 0 if first non-empty line is `---`,
    // closes at the next `---`. Keep both delimiters intact.
    if (!frontmatterDone) {
      if (i === 0 && trimmed === '---') {
        inFrontmatter = true;
        out.push(line);
        continue;
      }
      if (inFrontmatter) {
        out.push(line);
        if (trimmed === '---') {
          inFrontmatter = false;
          frontmatterDone = true;
        }
        continue;
      }
      // No frontmatter present — proceed to body processing.
      frontmatterDone = true;
    }

    // Code fence tracking. A fence opens with three or more `` ` `` or `~`
    // characters at the start of the line (allowing leading whitespace).
    // It closes on the next line that starts with the same character
    // repeated at least three times.
    const fenceOpen = /^\s*(```+|~~~+)/.exec(line);
    if (fenceOpen) {
      const ch = fenceOpen[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
        out.push(line);
        continue;
      }
      if (ch === fenceChar) {
        inFence = false;
        fenceChar = null;
        out.push(line);
        continue;
      }
      // Different fence char inside an open fence — treat as content.
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    // Body context: strip the HR if the trimmed line is exactly `---`.
    if (trimmed === '---') {
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `node --test scripts/cleanup-redundant-hrs.test.mjs`
Expected: `# pass 5` and exit code 0.

---

## Task 4: Add CLI wrapper to walk both locales

**Files:**
- Modify: `scripts/cleanup-redundant-hrs.mjs`

- [ ] **Step 1: Append CLI wrapper to the script**

Append below the `cleanRedundantHrs` function:

```javascript
// CLI: walks docs/en/ and docs/zh-tw/, applies the cleaner to each .md
// file. Reports per-locale removed-line counts and asserts parity (EN and
// zh-TW must yield the same total — bilingual lockstep).
//
// Usage:
//   node scripts/cleanup-redundant-hrs.mjs [--dry-run]

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const DRY_RUN = process.argv.includes('--dry-run');
  const REPO_ROOT = resolve(import.meta.dirname, '..');

  function walk(dir, acc = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === '.vitepress') continue;
        walk(p, acc);
      } else if (p.endsWith('.md')) {
        acc.push(p);
      }
    }
    return acc;
  }

  function processLocale(localeDir) {
    const files = walk(localeDir);
    let totalRemoved = 0;
    let filesChanged = 0;
    for (const path of files) {
      const before = readFileSync(path, 'utf-8');
      const after = cleanRedundantHrs(before);
      if (after !== before) {
        const removed = before.split('\n').length - after.split('\n').length;
        totalRemoved += removed;
        filesChanged++;
        if (!DRY_RUN) writeFileSync(path, after);
      }
    }
    return { totalRemoved, filesChanged, fileCount: files.length };
  }

  const en = processLocale(join(REPO_ROOT, 'docs/en'));
  const zh = processLocale(join(REPO_ROOT, 'docs/zh-tw'));

  console.log(`[hr-cleanup] mode: ${DRY_RUN ? 'dry-run' : 'live'}`);
  console.log(`[hr-cleanup] EN:    removed ${en.totalRemoved} lines from ${en.filesChanged}/${en.fileCount} files`);
  console.log(`[hr-cleanup] zh-TW: removed ${zh.totalRemoved} lines from ${zh.filesChanged}/${zh.fileCount} files`);

  if (en.totalRemoved !== zh.totalRemoved) {
    console.error(`[hr-cleanup] ERROR: bilingual drift — EN removed ${en.totalRemoved}, zh-TW removed ${zh.totalRemoved}`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Run dry-run against the live tree**

Run: `node scripts/cleanup-redundant-hrs.mjs --dry-run`

Expected output (numbers may differ slightly from the baseline if fence-tracking finds protected HRs):

```
[hr-cleanup] mode: dry-run
[hr-cleanup] EN:    removed 275 lines from 35/<N> files
[hr-cleanup] zh-TW: removed 275 lines from 35/<N> files
```

The two `removed` numbers MUST be equal. If they differ, stop and inspect the files where they diverge.

- [ ] **Step 3: Verify tree is still clean**

Run: `git status`
Expected: `working tree clean` (the dry-run did not write).

- [ ] **Step 4: Commit the script and tests**

```bash
git add scripts/cleanup-redundant-hrs.mjs scripts/cleanup-redundant-hrs.test.mjs
git commit -m "$(cat <<'EOF'
chore: add scripts/cleanup-redundant-hrs.mjs

Pure function cleanRedundantHrs(text) strips mid-document `---`
separator lines while preserving frontmatter delimiters and
HR-like content inside fenced code blocks. CLI wrapper walks
docs/en and docs/zh-tw and asserts bilingual parity.

Tested with node:test against five synthetic-markdown cases
covering frontmatter, backtick fences, tilde fences, trailing
whitespace, and the no-op identity case.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Run HR cleanup live and commit the deletions

**Files:**
- Modify: ~70 articles across `docs/en/` and `docs/zh-tw/`

- [ ] **Step 1: Run live**

Run: `node scripts/cleanup-redundant-hrs.mjs`
Expected: same line counts as the dry-run (275 + 275), no error message about drift.

- [ ] **Step 2: Verify diff is purely deletions**

Run: `git diff --stat`
Expected: ~70 files changed, ~550 deletions, 0 insertions (or insertions only inside fenced blocks if a previously-touched fence was reformatted; if any insertion appears, inspect that hunk before continuing).

Run: `git diff --shortstat`
Expected output of the form: `~70 files changed, 0 insertions(+), 550 deletions(-)`.

- [ ] **Step 3: Spot-check three diffs**

Run:

```bash
git diff docs/en/security-fundamentals/cors-and-same-origin-policy.md | head -40
git diff docs/en/api-design/graphql-http-caching.md | head -20
git diff docs/zh-tw/security-fundamentals/cors-and-same-origin-policy.md | head -40
```

Expected: each hunk shows `-` lines whose content is exactly `---`, surrounded by unchanged blank lines and headings. No code-fence content touched.

- [ ] **Step 4: Build to confirm no rendering breakage**

Run: `pnpm docs:build`
Expected: build succeeds in ~75s with no errors.

- [ ] **Step 5: Commit**

```bash
git add docs/en docs/zh-tw
git commit -m "$(cat <<'EOF'
chore: remove redundant horizontal-rule separators in article bodies

VitePress already renders visible section breaks at every H2/H3, so the
mid-document `---` lines were doubling the separator. 275 lines per
locale removed mechanically by scripts/cleanup-redundant-hrs.mjs.
Frontmatter delimiters and HR-like content inside fenced code blocks
are preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Refresh `bee-overview.md` (EN)

**Files:**
- Modify: `docs/en/bee-overall/bee-overview.md`

- [ ] **Step 1: Replace the Context paragraph (single → two new paragraphs)**

Edit `docs/en/bee-overall/bee-overview.md`. Replace:

```markdown
Backend engineering spans a vast landscape -- from authentication and networking to distributed systems and observability. Engineers often learn these concepts piecemeal, through scattered blog posts, tribal knowledge, or painful production incidents. BEE provides a structured, numbered set of principles that build a coherent mental model of backend engineering.
```

With:

```markdown
Backend engineering spans a wide surface area: authentication, networking, data, distributed systems, observability, and increasingly machine-learning workloads. Engineers learn these topics piecemeal, from blog posts, tribal knowledge, and production incidents. BEE collects them into a numbered, vendor-neutral catalogue with two depth levels: short essentials articles for the foundations, and longer deep-dive series (GraphQL HTTP-layer caching, AI backend patterns) where the topic warrants extended treatment.

Article IDs cluster by category in 1000-id blocks (auth = 1xxx, security = 2xxx, and so on) and URLs are semantic slugs (`/auth/oauth-openid-connect`, not `/1003`). Old numeric URLs continue to resolve via redirect stubs.
```

- [ ] **Step 2: Rename the "How to Read BEPs" heading**

In the same file, replace:

```markdown
## How to Read BEPs
```

With:

```markdown
## How to Read BEE Articles
```

- [ ] **Step 3: Replace the Categories section**

Replace the entire block from the `## Categories` heading through the end of the `### Engineering Practices Layer (300-379)` table (the four-table block) with the five-table block below.

Find the block that starts with:

```markdown
## Categories

### Foundation Layer (0-89)
```

and ends with the row:

```markdown
| 360-379 | CI/CD & DevOps | CI, deployment strategies, IaC, feature flags |
```

Replace it with:

```markdown
## Categories

> Each category occupies a 1000-id block; `1xxx` means BEE-1001 through BEE-1999. `BEE Overall` is an exception (1-99) because it predates the block scheme. `AI Backend Patterns` is a deliberate exception (30001-39999, 10000 wide).

### Foundation Layer (1xxx-4xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 1-99   | BEE Overall | `/bee-overall` | Purpose, glossary, meta |
| 1xxx   | Authentication & Authorization | `/auth` | Identity, access control, tokens, sessions |
| 2xxx   | Security Fundamentals | `/security-fundamentals` | OWASP, input validation, secrets, cryptography |
| 3xxx   | Networking Fundamentals | `/networking-fundamentals` | TCP/IP, DNS, HTTP, TLS, load balancing |
| 4xxx   | API Design & Communication Protocols | `/api-design` | REST, gRPC, GraphQL, versioning, pagination |

### Architecture & Data Layer (5xxx-8xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 5xxx   | Architecture Patterns | `/architecture-patterns` | Monolith, microservices, DDD, CQRS, hexagonal |
| 6xxx   | Data Storage & Database Fundamentals | `/data-storage` | SQL vs NoSQL, indexing, replication, sharding |
| 7xxx   | Data Modeling & Schema Design | `/data-modeling` | ER modeling, normalization, serialization |
| 8xxx   | Transactions & Data Integrity | `/transactions` | ACID, isolation levels, sagas, idempotency |

### Runtime Layer (9xxx-12xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 9xxx   | Caching | `/caching` | Invalidation, eviction, distributed cache, HTTP caching |
| 10xxx  | Messaging & Event-Driven | `/messaging` | Queues, pub/sub, delivery guarantees, event sourcing |
| 11xxx  | Concurrency & Async | `/concurrency` | Threads, locks, async I/O, worker pools |
| 12xxx  | Resilience & Reliability | `/resilience` | Circuit breakers, retries, timeouts, rate limiting |

### Engineering Practices Layer (13xxx-16xxx)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 13xxx  | Performance & Scalability | `/performance-scalability` | Estimation, scaling, profiling, CDN |
| 14xxx  | Observability | `/observability` | Logs, metrics, traces, SLOs, alerting |
| 15xxx  | Testing Strategies | `/testing` | Test pyramid, integration, contract, load testing |
| 16xxx  | CI/CD & DevOps | `/cicd-devops` | CI, deployment strategies, IaC, feature flags |

### Specialized Domains (17xxx+)

| Prefix | Category | Slug | Focus |
|--------|----------|------|-------|
| 17xxx  | Search | `/search` | Inverted indexes, ranking, query parsing, vector search |
| 18xxx  | Multi-Tenancy | `/multi-tenancy` | Tenant isolation, noisy-neighbour, per-tenant limits |
| 19xxx  | Distributed Systems | `/distributed-systems` | Consensus, replication, partition tolerance, time |
| 30xxx  | AI Backend Patterns | `/ai-backend-patterns` | LLM serving, embeddings, RAG, ML pipelines, MLOps |

> **Why is AI Backend Patterns in the 30xxx block?** It is the only category with a 10000-wide allocation (30001-39999) instead of 1000-wide. The block reflects intentionally deeper coverage of AI-system patterns and reserves room for the topic to grow without colliding with future foundational categories.
```

- [ ] **Step 4: Rename the "Related BEPs" footer heading**

Replace:

```markdown
## Related BEPs

- [BEE-2](how-to-read-bee.md) How to Read BEE
- [BEE-3](glossary.md) Glossary
```

With:

```markdown
## Related BEEs

- [BEE-2](how-to-read-bee.md) How to Read BEE
- [BEE-3](glossary.md) Glossary
```

- [ ] **Step 5: Verify file parses**

Run: `node -e "const m=require('gray-matter'); const fs=require('fs'); const r=m(fs.readFileSync('docs/en/bee-overall/bee-overview.md','utf-8')); console.log('id:',r.data.id,'title:',r.data.title);"`

Expected: `id: 1 title: BEE Overview` (frontmatter survived edits intact).

---

## Task 7: Refresh `bee-overview.md` (zh-TW)

**Files:**
- Modify: `docs/zh-tw/bee-overall/bee-overview.md`

- [ ] **Step 1: Replace the 背景 paragraph**

Edit `docs/zh-tw/bee-overall/bee-overview.md`. Replace:

```markdown
後端工程涵蓋廣闊的領域 -- 從認證和網路到分散式系統和可觀測性。工程師通常零散地學習這些概念，透過散落的部落格文章、口耳相傳的知識，或痛苦的生產事故。BEE 提供一組結構化、編號的原則，幫助建立連貫的後端工程心智模型。
```

With:

```markdown
後端工程涵蓋廣泛的範圍：認證、網路、資料、分散式系統、可觀測性，以及日益增加的機器學習工作負載。工程師零散地學習這些主題，透過部落格文章、口耳相傳的知識和生產事故。BEE 將它們收錄為一份編號的、廠商中立的目錄，分為兩個深度層級：基礎主題的精要短文，以及主題值得延伸處理時的長篇深入系列（GraphQL HTTP 層快取、AI 後端模式）。

文章 ID 依類別聚集成 1000 個 ID 為一組的區塊（auth = 1xxx、security = 2xxx，依此類推），URL 採用語意化的 slug（`/auth/oauth-openid-connect`，而非 `/1003`）。舊的數字 URL 透過重新導向 stub 繼續解析。
```

- [ ] **Step 2: Rename the 「如何閱讀 BEE」 heading (already correct in zh-TW — verify)**

Run: `grep -n "如何閱讀" docs/zh-tw/bee-overall/bee-overview.md`
Expected: a single match at the heading line (around L26). The zh-TW file already uses 「如何閱讀 BEE」 with no BEP terminology — no change needed for this step.

- [ ] **Step 3: Replace the Categories (類別) section**

Replace the entire block from `## 類別` through the row ending in `| 360-379 | CI/CD 與 DevOps | CI、部署策略、IaC、功能旗標 |` with:

```markdown
## 類別

> 每個類別佔用一個 1000-id 區塊；`1xxx` 代表 BEE-1001 到 BEE-1999。「BEE 總覽」是例外（1-99），因為早於區塊機制。「AI Backend Patterns」是有意的例外（30001-39999，寬 10000）。

### 基礎層 (1xxx-4xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 1-99   | BEE 總覽 | `/bee-overall` | 目的、術語表、後設 |
| 1xxx   | 認證與授權 | `/auth` | 身份、存取控制、令牌、會話 |
| 2xxx   | 安全基礎 | `/security-fundamentals` | OWASP、輸入驗證、密鑰、密碼學 |
| 3xxx   | 網路基礎 | `/networking-fundamentals` | TCP/IP、DNS、HTTP、TLS、負載平衡 |
| 4xxx   | API 設計與通訊協定 | `/api-design` | REST、gRPC、GraphQL、版本控制、分頁 |

### 架構與資料層 (5xxx-8xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 5xxx   | 架構模式 | `/architecture-patterns` | 單體、微服務、DDD、CQRS、六角形 |
| 6xxx   | 資料儲存與資料庫基礎 | `/data-storage` | SQL vs NoSQL、索引、複製、分片 |
| 7xxx   | 資料建模與結構設計 | `/data-modeling` | ER 建模、正規化、序列化 |
| 8xxx   | 交易與資料完整性 | `/transactions` | ACID、隔離等級、saga、冪等性 |

### 執行時期層 (9xxx-12xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 9xxx   | 快取 | `/caching` | 失效、淘汰、分散式快取、HTTP 快取 |
| 10xxx  | 訊息與事件驅動 | `/messaging` | 佇列、發布/訂閱、交付保證、事件溯源 |
| 11xxx  | 並行與非同步 | `/concurrency` | 執行緒、鎖、非同步 I/O、工作池 |
| 12xxx  | 韌性與可靠性 | `/resilience` | 斷路器、重試、逾時、限流 |

### 工程實踐層 (13xxx-16xxx)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 13xxx  | 效能與可擴展性 | `/performance-scalability` | 估算、擴展、剖析、CDN |
| 14xxx  | 可觀測性 | `/observability` | 日誌、指標、追蹤、SLO、告警 |
| 15xxx  | 測試策略 | `/testing` | 測試金字塔、整合、契約、負載測試 |
| 16xxx  | CI/CD 與 DevOps | `/cicd-devops` | CI、部署策略、IaC、功能旗標 |

### 專門領域 (17xxx+)

| 前綴 | 類別 | Slug | 焦點 |
|------|------|------|------|
| 17xxx  | 搜尋 | `/search` | 倒排索引、排序、查詢解析、向量搜尋 |
| 18xxx  | 多租戶 | `/multi-tenancy` | 租戶隔離、吵鬧鄰居、每租戶限制 |
| 19xxx  | 分散式系統 | `/distributed-systems` | 共識、複製、分區容錯、時間 |
| 30xxx  | AI 後端模式 | `/ai-backend-patterns` | LLM 服務、嵌入、RAG、ML 管線、MLOps |

> **為什麼 AI 後端模式在 30xxx 區塊？** 它是唯一分配 10000 寬區塊（30001-39999）而非 1000 寬的類別。此區塊反映 AI 系統模式的有意深入涵蓋，並為主題成長保留空間，避免與未來的基礎類別衝突。
```

- [ ] **Step 4: Rename the 「相關 BEP」 footer heading (verify and rename if needed)**

Run: `grep -n "相關" docs/zh-tw/bee-overall/bee-overview.md`
Expected: matches show 「相關 BEE」 (already correct) — no edit needed. If the file actually shows 「相關 BEP」, rename to 「相關 BEE」.

- [ ] **Step 5: Verify file parses**

Run: `node -e "const m=require('gray-matter'); const fs=require('fs'); const r=m(fs.readFileSync('docs/zh-tw/bee-overall/bee-overview.md','utf-8')); console.log('id:',r.data.id,'title:',r.data.title);"`
Expected: `id: 1 title: BEE Overview`.

---

## Task 8: Polish, build, commit (Change 2)

**Files:**
- Polish: `docs/en/bee-overall/bee-overview.md`, `docs/zh-tw/bee-overall/bee-overview.md`

- [ ] **Step 1: Polish the EN file**

Invoke the `polish-documents` skill on `docs/en/bee-overall/bee-overview.md`. The skill enforces the user's writing-style rules and reports any rule hits. Apply suggested edits if any are non-fabricating.

- [ ] **Step 2: Polish the zh-TW file**

Invoke `polish-documents` on `docs/zh-tw/bee-overall/bee-overview.md`. Apply non-fabricating edits if any.

- [ ] **Step 3: Build**

Run: `pnpm docs:build`
Expected: build succeeds.

- [ ] **Step 4: Spot-check rendered output**

The build wrote redirect stubs and the rendered site. Confirm the new categories block by inspecting the rendered HTML:

Run: `grep -l "Specialized Domains" docs/.vitepress/dist/bee-overall/bee-overview.html`
Expected: file path printed (the new layer heading made it through render).

Run: `grep -l "專門領域" docs/.vitepress/dist/zh-tw/bee-overall/bee-overview.html`
Expected: file path printed for the zh-TW counterpart.

- [ ] **Step 5: Commit**

```bash
git add docs/en/bee-overall/bee-overview.md docs/zh-tw/bee-overall/bee-overview.md
git commit -m "$(cat <<'EOF'
docs(bee-overall): refresh BEE Overview to reflect 1000-block restructure

The Categories section listed the legacy 0-379 numbering across 17
categories grouped into 4 layers. Replace with prefix-based tables
covering 21 categories across 5 layers (adding Specialized Domains
for Search, Multi-Tenancy, Distributed Systems, AI Backend Patterns).
Refresh the Context prose to acknowledge BEE now spans both essentials
and deep-dive series, and document the semantic-URL invariant. Rename
the "How to Read BEPs" and "Related BEPs" headings to use the BEE
project name consistently.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Fix sibling docs (`how-to-read-bee.md` + `glossary.md`)

**Files:**
- Modify: `docs/en/bee-overall/how-to-read-bee.md`
- Modify: `docs/zh-tw/bee-overall/how-to-read-bee.md`
- Modify: `docs/en/bee-overall/glossary.md`
- Modify: `docs/zh-tw/bee-overall/glossary.md`

- [ ] **Step 1: Fix `docs/en/bee-overall/how-to-read-bee.md`**

Replace:

```markdown
## Related BEPs

- [BEE-2](bee-overview.md) BEE Overview
```

With:

```markdown
## Related BEEs

- [BEE-1](bee-overview.md) BEE Overview
```

- [ ] **Step 2: Fix `docs/zh-tw/bee-overall/how-to-read-bee.md`**

Replace:

```markdown
- [BEE-2](bee-overview.md) BEE 總覽
```

With:

```markdown
- [BEE-1](bee-overview.md) BEE 總覽
```

Then check for the heading: `grep -n "相關" docs/zh-tw/bee-overall/how-to-read-bee.md`. If the heading reads 「相關 BEP」, rename to 「相關 BEE」. If it already reads 「相關 BEE」, no change needed.

- [ ] **Step 3: Fix `docs/en/bee-overall/glossary.md`**

Replace:

```markdown
## Related BEPs

- [BEE-2](bee-overview.md) BEE Overview
- [BEE-2](how-to-read-bee.md) How to Read BEE
```

With:

```markdown
## Related BEEs

- [BEE-1](bee-overview.md) BEE Overview
- [BEE-2](how-to-read-bee.md) How to Read BEE
```

- [ ] **Step 4: Fix `docs/zh-tw/bee-overall/glossary.md`**

Replace:

```markdown
- [BEE-2](bee-overview.md) BEE 總覽
- [BEE-2](how-to-read-bee.md) 如何閱讀 BEE
```

With:

```markdown
- [BEE-1](bee-overview.md) BEE 總覽
- [BEE-2](how-to-read-bee.md) 如何閱讀 BEE
```

Then check for the heading: `grep -n "相關" docs/zh-tw/bee-overall/glossary.md`. If the heading reads 「相關 BEP」, rename to 「相關 BEE」. If it already reads 「相關 BEE」, no change needed.

- [ ] **Step 5: Verify all four files parse**

Run:

```bash
for f in docs/en/bee-overall/how-to-read-bee.md docs/zh-tw/bee-overall/how-to-read-bee.md docs/en/bee-overall/glossary.md docs/zh-tw/bee-overall/glossary.md; do
  node -e "const m=require('gray-matter'); const fs=require('fs'); const r=m(fs.readFileSync('$f','utf-8')); console.log('$f','id:',r.data.id);"
done
```

Expected: each file prints `id: 2` or `id: 3` matching its frontmatter.

---

## Task 10: Polish, build, commit (Change 3)

**Files:**
- Polish: all four sibling files modified in Task 9.

- [ ] **Step 1: Polish each modified file**

Invoke `polish-documents` on each:

- `docs/en/bee-overall/how-to-read-bee.md`
- `docs/zh-tw/bee-overall/how-to-read-bee.md`
- `docs/en/bee-overall/glossary.md`
- `docs/zh-tw/bee-overall/glossary.md`

Apply only non-fabricating suggestions. The edits in Task 9 were minimal (link IDs and heading rename), so polish pass should usually be no-op or surface-level only.

- [ ] **Step 2: Build**

Run: `pnpm docs:build`
Expected: build succeeds.

- [ ] **Step 3: Spot-check rendered links**

Run: `grep -o 'href="[^"]*bee-overview[^"]*"' docs/.vitepress/dist/bee-overall/glossary.html | head -3`
Expected: at least one `href` pointing at the bee-overview page (link text BEE-1 will be rendered).

- [ ] **Step 4: Commit**

```bash
git add docs/en/bee-overall/how-to-read-bee.md docs/zh-tw/bee-overall/how-to-read-bee.md docs/en/bee-overall/glossary.md docs/zh-tw/bee-overall/glossary.md
git commit -m "$(cat <<'EOF'
docs(bee-overall): fix stale BEE-1 links and unify BEE/BEP terminology

how-to-read-bee.md and glossary.md both linked to BEE Overview as
"BEE-2" — its real ID is 1. They also used "Related BEPs" inconsistent
with the project name. Fix the link labels and rename the heading to
"Related BEEs", EN + zh-TW.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: User-gate before push

**Files:** none (interaction only)

- [ ] **Step 1: Summarise the three commits to the user**

Report:

- Commit 1 (`chore: add scripts/cleanup-redundant-hrs.mjs`) — script + tests
- Commit 2 (`chore: remove redundant horizontal-rule separators...`) — ~70 files, ~550 deletions
- Commit 3 (`docs(bee-overall): refresh BEE Overview...`) — bilingual overview rewrite
- Commit 4 (`docs(bee-overall): fix stale BEE-1 links...`) — sibling docs

(Commit 1 is the script artifact, separate from the live HR run in commit 2.)

- [ ] **Step 2: Confirm push**

Ask the user: "Ready to push 4 commits to origin/main?"

- [ ] **Step 3: Push only on explicit confirmation**

If confirmed, run: `git push origin main`
Expected: push succeeds, four commit hashes shown.

If declined, report the local commit hashes and stop. Do not amend or rebase.

---

## Self-Review

**Spec coverage:**

- ✅ Change 1 (HR cleanup): Tasks 2-5
- ✅ Change 2 (bee-overview refresh): Tasks 6-8 (Categories tables, Context prose, BEPs→BEE)
- ✅ Change 3 (sibling fixes): Tasks 9-10 (BEE-2→BEE-1 links + heading rename)
- ✅ Verification (build, polish, spot-check): woven into each commit's task block
- ✅ Bilingual lockstep: every content task has explicit zh-TW step
- ✅ User gate before push: Task 11

**Placeholder scan:**

- No "TBD", "TODO", "implement later" anywhere.
- Every code/edit step shows the exact text to find and the exact replacement.
- Every command shows expected output.

**Type consistency:**

- `cleanRedundantHrs(text)` signature is consistent across Tasks 2 (test), 3 (impl), and 4 (CLI usage).
- File paths are absolute-style (relative to repo root) consistently.

**Spec correction noted in plan:**

The spec said "Replace the current second paragraph of `## Context`" but `## Context` only has one paragraph. Task 6 Step 1 replaces the single paragraph with two new paragraphs (the rewritten one + the new URL/numbering one), which matches the spec's intent.
