#!/usr/bin/env node
// Strip redundant mid-document horizontal-rule (`---`) lines from BEE
// articles. VitePress already renders visible separation at every H2/H3,
// so the body HRs add no signal.
//
// Preserved:
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
  let fenceChar = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

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
      frontmatterDone = true;
    }

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
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    if (trimmed === '---') {
      continue;
    }

    out.push(line);
  }

  return out.join('\n');
}

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
