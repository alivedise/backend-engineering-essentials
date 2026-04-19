import { defineConfig } from 'vitepress';
import { withPwa } from '@vite-pwa/vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { shared } from './shared';
import { en } from './en';
import { zhTW } from './zh-tw';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const MAPPING_PATH = join(REPO_ROOT, 'migration/bee-id-mapping.json');
const BASE_PATH = '/backend-engineering-essentials';

function renderRedirectStubInline(destPath, title) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=${destPath}">
<link rel="canonical" href="${destPath}">
<title>Redirecting to ${title}</title>
</head>
<body>
<p>This page has moved to <a href="${destPath}">${destPath}</a>.</p>
</body>
</html>
`;
}

function emitRedirectStubs(siteConfig) {
  if (!existsSync(MAPPING_PATH)) {
    console.warn('[buildEnd] no mapping file at', MAPPING_PATH, '— skipping redirect stubs');
    return;
  }
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, 'utf-8'));
  const distRoot = siteConfig.outDir;
  let stubCount = 0;
  for (const entry of mapping) {
    const newSemanticPath = `/${entry.category_new}/${entry.slug}`;
    // EN stub
    const enStubDir = join(distRoot, String(entry.current_id));
    mkdirSync(enStubDir, { recursive: true });
    writeFileSync(
      join(enStubDir, 'index.html'),
      renderRedirectStubInline(`${BASE_PATH}${newSemanticPath}`, entry.title)
    );
    // zh-TW stub
    const zhStubDir = join(distRoot, 'zh-tw', String(entry.current_id));
    mkdirSync(zhStubDir, { recursive: true });
    writeFileSync(
      join(zhStubDir, 'index.html'),
      renderRedirectStubInline(`${BASE_PATH}/zh-tw${newSemanticPath}`, entry.title)
    );
    stubCount += 2;
  }
  console.log(`[buildEnd] wrote ${stubCount} redirect stubs to ${distRoot}`);
}

// withMermaid must wrap the base config BEFORE withPwa,
// because withPwa returns a Promise and withMermaid cannot
// inject its vite plugins into a Promise object.
const baseConfig = defineConfig({
  ...shared,
  rewrites: {
    'en/:category/:page': ':category/:page',
    'en/list.md': 'list.md',
    'en/faq.md': 'faq.md',
    'zh-tw/:category/:page': 'zh-tw/:category/:page',
  },
  locales: {
    root: { label: 'English', ...en },
    'zh-tw': { label: '繁體中文', ...zhTW },
  },
  buildEnd: (siteConfig) => {
    emitRedirectStubs(siteConfig);
  },
});

const withMermaidConfig = withMermaid(baseConfig);

export default withPwa(withMermaidConfig);
