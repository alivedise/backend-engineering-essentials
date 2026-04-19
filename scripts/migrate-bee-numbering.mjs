#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import matter from 'gray-matter';

import { BLOCK_ALLOCATION, blockForSource, MERGED_FOLDERS } from './lib/blocks.mjs';
import { titleToSlug } from './lib/slug.mjs';
import { buildMapping, validateUniqueSlugs } from './lib/mapping.mjs';
import { rewriteCrossRefs } from './lib/crossref.mjs';
import { updateFrontmatter } from './lib/frontmatter.mjs';
import { renderRedirectStub } from './lib/redirects.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const DOCS_EN = join(REPO_ROOT, 'docs/en');
const DOCS_ZH = join(REPO_ROOT, 'docs/zh-tw');
const MAPPING_PATH = join(REPO_ROOT, 'migration/bee-id-mapping.json');
const MIGRATION_NOTE_PATH = join(REPO_ROOT, 'docs/superpowers/MIGRATION-NOTE.md');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

function fail(msg) {
  console.error(`[migrate] ERROR: ${msg}`);
  process.exit(1);
}

// Step 1: enumerate articles in EN tree, validate frontmatter, find zh-TW counterparts.
function enumerateArticles() {
  const articles = [];
  const enFolders = readdirSync(DOCS_EN).filter(name => {
    const p = join(DOCS_EN, name);
    return statSync(p).isDirectory();
  });

  for (const folder of enFolders) {
    const folderPath = join(DOCS_EN, folder);
    const files = readdirSync(folderPath).filter(f => f.endsWith('.md') && !f.startsWith('index'));
    for (const file of files) {
      const enPath = join(folderPath, file);
      const raw = readFileSync(enPath, 'utf-8');
      const { data } = matter(raw);
      if (typeof data.id === 'undefined') {
        fail(`missing id in frontmatter: ${enPath}`);
      }
      if (typeof data.title === 'undefined') {
        fail(`missing title in frontmatter: ${enPath}`);
      }

      const zhPath = join(DOCS_ZH, folder, file);
      if (!existsSync(zhPath)) {
        fail(`missing zh-TW counterpart for ${enPath} (expected ${zhPath})`);
      }

      articles.push({
        source_folder: folder,
        current_id: data.id,
        title: data.title,
        en_path: enPath,
        zh_path: zhPath,
      });
    }
  }

  return articles;
}

async function main() {
  log(`mode: ${DRY_RUN ? 'dry-run' : 'live'}`);

  log('Step 1: enumerating articles');
  const articles = enumerateArticles();
  const folderCount = new Set(articles.map(a => a.source_folder)).size;
  log(`  found ${articles.length} articles in ${folderCount} folders`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
