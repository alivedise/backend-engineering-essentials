#!/usr/bin/env node
// One-shot follow-up to the BEE numbering restructure: rewrite stale BEE-XXX
// mentions in article body content (H1 lines, prose mentions) to use the
// new IDs from migration/bee-id-mapping.json.
//
// The main migration script handled inline markdown link cross-references
// (`[BEE-XXX](XXX.md)`) but did not touch body content like:
//   - H1 lines: `# [BEE-596] Title`
//   - Prose mentions in non-link form: `as discussed in BEE-205, ...`
//
// This script rewrites both patterns:
//   1. `[BEE-{old}]` → `[BEE-{new}]` (handles H1s and bracketed mentions)
//   2. `BEE-{old}` (word-boundary) → `BEE-{new}` (handles bare prose mentions)
//
// Operates on every article under docs/en/ and docs/zh-tw/. Skips
// docs/superpowers/ (historical artifacts retain old IDs).

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const MAPPING_PATH = join(REPO_ROOT, 'migration/bee-id-mapping.json');

const mapping = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'));
const idMap = new Map(mapping.map(m => [m.current_id, m.new_id]));

let filesScanned = 0;
let filesChanged = 0;
let mentionsRewritten = 0;

function processFile(path) {
  filesScanned++;
  const raw = readFileSync(path, 'utf-8');
  let text = raw;
  let localCount = 0;

  // Pattern: BEE-<digits> with word boundary — but skip markdown link targets
  // (e.g., `(slug.md)` after `[BEE-X]` should not be touched; the link target
  // was already handled by the migration script).
  // We rewrite BEE-X anywhere, but only when X is in our mapping.
  text = text.replace(/\bBEE-(\d+)\b/g, (match, idStr) => {
    const oldId = parseInt(idStr, 10);
    const newId = idMap.get(oldId);
    if (newId !== undefined && newId !== oldId) {
      localCount++;
      return `BEE-${newId}`;
    }
    return match;
  });

  if (text !== raw) {
    writeFileSync(path, text);
    filesChanged++;
    mentionsRewritten += localCount;
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '.vitepress' || name === 'superpowers') continue;
      walk(p);
    } else if (p.endsWith('.md')) {
      if (name === 'list.md' || name === 'faq.md' || name === 'index.md') continue;
      processFile(p);
    }
  }
}

walk(join(REPO_ROOT, 'docs/en'));
walk(join(REPO_ROOT, 'docs/zh-tw'));

console.log(`[h1-update] scanned ${filesScanned} files`);
console.log(`[h1-update] modified ${filesChanged} files`);
console.log(`[h1-update] rewrote ${mentionsRewritten} BEE-X mentions`);
