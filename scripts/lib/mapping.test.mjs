import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapping, validateUniqueSlugs } from './mapping.mjs';

const fixtureArticles = [
  {
    source_folder: 'API Design and Communication Protocols',
    current_id: 70,
    title: 'REST API Design Principles',
    en_path: 'docs/en/API Design and Communication Protocols/70.md',
    zh_path: 'docs/zh-tw/API Design and Communication Protocols/70.md',
  },
  {
    source_folder: 'API Design and Communication Protocols',
    current_id: 596,
    title: 'GraphQL HTTP-Layer Caching',
    en_path: 'docs/en/API Design and Communication Protocols/596.md',
    zh_path: 'docs/zh-tw/API Design and Communication Protocols/596.md',
  },
  {
    source_folder: 'Caching',
    current_id: 200,
    title: 'Caching Fundamentals and Cache Hierarchy',
    en_path: 'docs/en/Caching/200.md',
    zh_path: 'docs/zh-tw/Caching/200.md',
  },
  {
    source_folder: 'Databases',
    current_id: 481,
    title: 'Database Connection Proxy and Pooler Architecture',
    en_path: 'docs/en/Databases/481.md',
    zh_path: 'docs/zh-tw/Databases/481.md',
  },
];

test('buildMapping produces one entry per article with new_id and slug', () => {
  const mapping = buildMapping(fixtureArticles);
  assert.equal(mapping.length, 4);
  const apiRest = mapping.find(m => m.current_id === 70);
  assert.equal(apiRest.new_id, 4001);
  assert.equal(apiRest.category_new, 'api-design');
  assert.equal(apiRest.slug, 'rest-api-design-principles');
  assert.equal(
    apiRest.new_path_en,
    'docs/en/api-design/rest-api-design-principles.md'
  );
  assert.equal(
    apiRest.new_path_zh,
    'docs/zh-tw/api-design/rest-api-design-principles.md'
  );
});

test('buildMapping renumbers GraphQL caching as 4002 (after BEE-70)', () => {
  const mapping = buildMapping(fixtureArticles);
  const gqlCache = mapping.find(m => m.current_id === 596);
  assert.equal(gqlCache.new_id, 4002);
});

test('buildMapping merges Databases into data-storage', () => {
  const mapping = buildMapping(fixtureArticles);
  const db = mapping.find(m => m.current_id === 481);
  assert.equal(db.category_new, 'data-storage');
  assert.match(db.new_path_en, /^docs\/en\/data-storage\//);
  assert.equal(db.new_id, 6001);
});

test('buildMapping starts Caching at 9001', () => {
  const mapping = buildMapping(fixtureArticles);
  const caching = mapping.find(m => m.current_id === 200);
  assert.equal(caching.new_id, 9001);
  assert.equal(caching.category_new, 'caching');
});

test('validateUniqueSlugs accepts no duplicates', () => {
  const mapping = buildMapping(fixtureArticles);
  validateUniqueSlugs(mapping);
});

test('validateUniqueSlugs throws on duplicate slug within category', () => {
  const dup = [
    { category_new: 'caching', slug: 'cache-basics' },
    { category_new: 'caching', slug: 'cache-basics' },
  ];
  assert.throws(() => validateUniqueSlugs(dup), /duplicate slug/);
});
