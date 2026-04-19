import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewriteCrossRefs } from './crossref.mjs';

const fixtureMapping = [
  {
    current_id: 70,
    new_id: 4001,
    slug: 'rest-api-design-principles',
    category_new: 'api-design',
  },
  {
    current_id: 75,
    new_id: 4006,
    slug: 'api-error-handling-problem-details',
    category_new: 'api-design',
  },
  {
    current_id: 205,
    new_id: 9006,
    slug: 'http-caching-conditional-requests',
    category_new: 'caching',
  },
];

test('rewrites simple intra-category link', () => {
  const md = 'See [BEE-70](70.md) for details.';
  const result = rewriteCrossRefs(md, fixtureMapping, 'api-design');
  assert.equal(result, 'See [BEE-4001](rest-api-design-principles.md) for details.');
});

test('rewrites cross-category link with relative path', () => {
  const md = 'See [BEE-205](../Caching/205.md) for caching context.';
  const result = rewriteCrossRefs(md, fixtureMapping, 'api-design');
  assert.match(result, /\[BEE-9006\]\(\.\.\/caching\/http-caching-conditional-requests\.md\)/);
});

test('rewrites multiple links in one string', () => {
  const md = 'See [BEE-70](70.md) and [BEE-75](75.md) for context.';
  const result = rewriteCrossRefs(md, fixtureMapping, 'api-design');
  assert.match(result, /\[BEE-4001\]\(rest-api-design-principles\.md\)/);
  assert.match(result, /\[BEE-4006\]\(api-error-handling-problem-details\.md\)/);
});

test('leaves non-BEE links untouched', () => {
  const md = 'See [external](https://example.com) for context.';
  const result = rewriteCrossRefs(md, fixtureMapping, 'api-design');
  assert.equal(result, md);
});

test('leaves intact when target id not in mapping', () => {
  const md = 'See [BEE-9999](9999.md) — does not exist.';
  const result = rewriteCrossRefs(md, fixtureMapping, 'api-design');
  assert.match(result, /\[BEE-9999\]\(9999\.md\)/);
});

test('rewrites link with literal directory name (with spaces)', () => {
  const md = 'See [BEE-205](../Caching/205.md) for context.';
  const result = rewriteCrossRefs(md, fixtureMapping, 'api-design');
  assert.match(result, /\[BEE-9006\]\(\.\.\/caching\/http-caching-conditional-requests\.md\)/);
});
