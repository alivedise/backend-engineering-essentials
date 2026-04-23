#!/usr/bin/env node
// Rewrite stale numeric.md links missed by the migration's crossref pass.
//
// The migration's crossref regex required the link text to be `[BEE-N]`.
// Many real links in the docs use other text:
//   [Pagination Patterns](72.md)
//   [OAuth 2.0](../auth/12.md)
//   [Indexing](./124.md)
//
// This script uses migration/bee-id-mapping.json to rewrite every link
// whose target's final segment is `N.md` (where N is digits) to the
// corresponding slug-based path with correct relative directory
// traversal.
//
// Also rewrites bare `](/N)` markdown links and `link: /N` frontmatter
// values to the new semantic URL.
//
// Locales: docs/en and docs/zh-tw, lockstep.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MAPPING_PATH = join(REPO_ROOT, 'migration/bee-id-mapping.json');

const mapping = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'));
const idMap = new Map(mapping.map(m => [m.current_id, m]));

const DRY_RUN = process.argv.includes('--dry-run');

let filesScanned = 0;
let filesChanged = 0;
let linksRewritten = 0;
let bareLinkRewritten = 0;
let frontmatterRewritten = 0;
let unmatched = 0;

function rewriteFile(path) {
  filesScanned++;
  const raw = readFileSync(path, 'utf-8');

  const fileDir = dirname(path);
  // Determine current category slug from the file's parent folder name
  const currentCategory = basename(fileDir);

  let changed = raw;
  let localChanges = 0;

  // Pattern 1: ](<optional-path>/?N.md[#anchor])
  // Match the full link target, identify if final segment is N.md
  changed = changed.replace(/\]\(([^)]+)\)/g, (match, target) => {
    // Skip URLs with a scheme
    if (/^[a-z]+:/i.test(target)) return match;
    const [pathPart, anchor] = target.split('#', 2);
    const last = pathPart.split('/').pop() || '';
    const numericMatch = /^(\d{1,4})\.md$/.exec(last);
    if (!numericMatch) return match;
    const oldId = parseInt(numericMatch[1], 10);
    const entry = idMap.get(oldId);
    if (!entry) {
      unmatched++;
      return match;
    }
    let newPath;
    if (entry.category_new === currentCategory) {
      newPath = `${entry.slug}.md`;
    } else {
      newPath = `../${entry.category_new}/${entry.slug}.md`;
    }
    if (anchor) newPath += `#${anchor}`;
    localChanges++;
    return `](${newPath})`;
  });

  // Pattern 2: ](/N) or ](/N/) bare numeric URL links (with leading slash)
  changed = changed.replace(/\]\(\/(\d{1,4})\/?\)/g, (match, idStr) => {
    const oldId = parseInt(idStr, 10);
    const entry = idMap.get(oldId);
    if (!entry) {
      unmatched++;
      return match;
    }
    bareLinkRewritten++;
    const localePrefix = path.includes('/zh-tw/') ? '/zh-tw' : '';
    return `](${localePrefix}/${entry.category_new}/${entry.slug})`;
  });

  // Pattern 2b: ](N) bare digits with no slash, no .md — used in faq.md
  // Resolve as absolute URL with locale prefix.
  changed = changed.replace(/\](\((\d{1,4})\))/g, (match, group, idStr) => {
    // Skip if this looks like part of a larger URL (preceded by digits/letters)
    const oldId = parseInt(idStr, 10);
    const entry = idMap.get(oldId);
    if (!entry) {
      unmatched++;
      return match;
    }
    bareLinkRewritten++;
    const localePrefix = path.includes('/zh-tw/') ? '/zh-tw' : '';
    return `](${localePrefix}/${entry.category_new}/${entry.slug})`;
  });

  // Pattern 3: link: /N in frontmatter (homepage actions)
  changed = changed.replace(/(link:\s*["']?)\/(\d{1,4})(["']?)(?=\s*$)/gm, (match, prefix, idStr, suffix) => {
    const oldId = parseInt(idStr, 10);
    const entry = idMap.get(oldId);
    if (!entry) {
      unmatched++;
      return match;
    }
    frontmatterRewritten++;
    return `${prefix}/${entry.category_new}/${entry.slug}${suffix}`;
  });

  if (changed !== raw) {
    if (!DRY_RUN) writeFileSync(path, changed);
    filesChanged++;
    linksRewritten += localChanges;
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '.vitepress' || name === 'superpowers') continue;
      walk(p);
    } else if (p.endsWith('.md')) {
      if (name === 'list.md') continue;
      rewriteFile(p);
    }
  }
}

walk(join(REPO_ROOT, 'docs/en'));
walk(join(REPO_ROOT, 'docs/zh-tw'));

console.log(`[fix-stale-links] mode: ${DRY_RUN ? 'dry-run' : 'live'}`);
console.log(`[fix-stale-links] scanned: ${filesScanned} files`);
console.log(`[fix-stale-links] changed: ${filesChanged} files`);
console.log(`[fix-stale-links] numeric.md links rewritten: ${linksRewritten}`);
console.log(`[fix-stale-links] bare /N links rewritten:    ${bareLinkRewritten}`);
console.log(`[fix-stale-links] frontmatter /N rewritten:   ${frontmatterRewritten}`);
console.log(`[fix-stale-links] unmatched IDs (left alone): ${unmatched}`);
