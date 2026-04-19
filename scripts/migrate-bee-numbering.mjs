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

  log('Step 2: building mapping table');
  const mapping = buildMapping(articles);
  log(`  built mapping for ${mapping.length} articles`);

  log('Step 3: validating unique slugs per category');
  validateUniqueSlugs(mapping);
  log(`  all slugs unique within their categories`);

  log('Step 4: writing mapping to migration/bee-id-mapping.json');
  if (!DRY_RUN) {
    mkdirSync(dirname(MAPPING_PATH), { recursive: true });
    writeFileSync(MAPPING_PATH, JSON.stringify(mapping, null, 2) + '\n');
  } else {
    log(`  (dry-run: would write to ${MAPPING_PATH})`);
  }

  log('Step 5: renaming files (git mv)');
  let renameCount = 0;
  for (const entry of mapping) {
    const enOldRel = entry.old_path_en;
    const enNewRel = entry.new_path_en;
    const zhOldRel = entry.old_path_zh;
    const zhNewRel = entry.new_path_zh;

    if (DRY_RUN) {
      // Just verify all old paths exist
      if (!existsSync(enOldRel)) fail(`old EN path missing: ${enOldRel}`);
      if (!existsSync(zhOldRel)) fail(`old zh-TW path missing: ${zhOldRel}`);
    } else {
      mkdirSync(dirname(enNewRel), { recursive: true });
      mkdirSync(dirname(zhNewRel), { recursive: true });
      // Use git mv with relative paths for cleaner output
      execSync(`git mv "${enOldRel}" "${enNewRel}"`, { cwd: REPO_ROOT });
      execSync(`git mv "${zhOldRel}" "${zhNewRel}"`, { cwd: REPO_ROOT });
    }
    renameCount += 2;
  }
  log(`  ${DRY_RUN ? 'would rename' : 'renamed'} ${renameCount} files (${mapping.length} EN + ${mapping.length} zh-TW)`);

  log('Step 6: updating frontmatter on renamed files');
  let frontmatterCount = 0;
  for (const entry of mapping) {
    const paths = DRY_RUN
      ? [entry.old_path_en, entry.old_path_zh]
      : [entry.new_path_en, entry.new_path_zh];

    if (!DRY_RUN) {
      for (const path of paths) {
        const raw = readFileSync(path, 'utf-8');
        const updated = updateFrontmatter(raw, entry.new_id, entry.slug);
        writeFileSync(path, updated);
      }
    }
    frontmatterCount += 2;
  }
  log(`  ${DRY_RUN ? 'would update' : 'updated'} frontmatter on ${frontmatterCount} files`);

  log('Step 7: rewriting inline cross-references');
  let xrefFiles = 0;
  let xrefChanged = 0;
  for (const entry of mapping) {
    const paths = DRY_RUN
      ? [entry.old_path_en, entry.old_path_zh]
      : [entry.new_path_en, entry.new_path_zh];

    for (const path of paths) {
      const raw = readFileSync(path, 'utf-8');
      const rewritten = rewriteCrossRefs(raw, mapping, entry.category_new);
      if (rewritten !== raw) {
        if (!DRY_RUN) {
          writeFileSync(path, rewritten);
        }
        xrefChanged++;
      }
      xrefFiles++;
    }
  }
  log(`  ${DRY_RUN ? 'would rewrite' : 'rewrote'} cross-references in ${xrefChanged} of ${xrefFiles} files`);

  log('Step 8: writing MIGRATION-NOTE.md');
  const migrationNoteContent = `# Migration Note: BEE ID Restructure

The historical specs and plans in this directory reference old BEE numeric IDs (BEE-70, BEE-205, BEE-485, BEE-596, BEE-597, BEE-598, BEE-599, etc.) that predate the category-blocked restructure performed on 2026-04-19.

These historical artifacts are intentionally NOT rewritten. They are session-time-stamped records of what the project state looked like at brainstorm/plan time. Rewriting them would obscure history.

To translate an old BEE ID to its new ID and URL, consult [\`migration/bee-id-mapping.json\`](../../migration/bee-id-mapping.json) at the repo root. Each entry in the mapping has:

- \`current_id\` (old integer)
- \`new_id\` (new category-blocked integer)
- \`slug\` (URL slug)
- \`category_new\` (new category folder slug)
- \`new_path_en\` and \`new_path_zh\` (new file paths)

Example: BEE-596 ("GraphQL HTTP-Layer Caching") in older specs is now BEE-4010 at \`/api-design/graphql-http-caching\` in the live site.

The redirect stubs ensure old URLs (\`/596\`) continue to resolve via HTML meta-refresh, but in-prose references to BEE numeric IDs in older specs/plans must be translated manually if linking to the live site is required.
`;

  if (DRY_RUN) {
    log(`  (dry-run: would write ${MIGRATION_NOTE_PATH})`);
  } else {
    writeFileSync(MIGRATION_NOTE_PATH, migrationNoteContent);
  }

  log('Step 9: validating build');
  if (DRY_RUN) {
    log(`  (dry-run: would run pnpm docs:build)`);
  } else {
    log('  running pnpm docs:build (may take ~75s)');
    try {
      execSync('pnpm docs:build', { cwd: REPO_ROOT, stdio: 'inherit' });
      log('  build succeeded');
    } catch (err) {
      fail('build failed; aborting migration. Investigate dist/ output and fix before retrying.');
    }
  }

  log('migration steps complete; commit not yet performed');
  log('to commit, run: git add -A && git commit -m "chore: restructure BEE numbering and category-based URLs"');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
