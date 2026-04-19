import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_ALLOCATION, blockForSource, assignNewIds } from './blocks.mjs';

test('BLOCK_ALLOCATION has expected count', () => {
  assert.equal(BLOCK_ALLOCATION.length, 21);
});

test('blockForSource resolves api-design', () => {
  const block = blockForSource('API Design and Communication Protocols');
  assert.equal(block.slug, 'api-design');
  assert.equal(block.start, 4001);
});

test('blockForSource resolves merged Databases to data-storage', () => {
  const block = blockForSource('Databases');
  assert.equal(block.slug, 'data-storage');
  assert.equal(block.start, 6001);
});

test('blockForSource returns undefined for unknown source', () => {
  const block = blockForSource('Nonexistent Folder');
  assert.equal(block, undefined);
});

test('assignNewIds assigns sequential IDs starting from block start, ordered by current id', () => {
  const articles = [
    { current_id: 76, title: 'Webhooks and Callback Patterns' },
    { current_id: 70, title: 'REST API Design Principles' },
    { current_id: 485, title: 'GraphQL Federation' },
    { current_id: 596, title: 'GraphQL HTTP-Layer Caching' },
  ];
  const result = assignNewIds('API Design and Communication Protocols', articles);
  assert.equal(result[0].current_id, 70);
  assert.equal(result[0].new_id, 4001);
  assert.equal(result[1].current_id, 76);
  assert.equal(result[1].new_id, 4002);
  assert.equal(result[2].current_id, 485);
  assert.equal(result[2].new_id, 4003);
  assert.equal(result[3].current_id, 596);
  assert.equal(result[3].new_id, 4004);
});

test('assignNewIds for AI Backend Patterns uses 30001 block start', () => {
  const articles = [
    { current_id: 503, title: 'LLM API Integration Patterns' },
    { current_id: 504, title: 'AI Agent Architecture Patterns' },
  ];
  const result = assignNewIds('AI Backend Patterns', articles);
  assert.equal(result[0].new_id, 30001);
  assert.equal(result[1].new_id, 30002);
});

test('assignNewIds throws if article count exceeds block size', () => {
  const overflow = Array.from({ length: 100 }, (_, i) => ({ current_id: i, title: `t${i}` }));
  assert.throws(() => assignNewIds('BEE Overall', overflow), /exceeds block size/);
});

test('assignNewIds throws on unknown source folder', () => {
  assert.throws(
    () => assignNewIds('Nonexistent', [{ current_id: 1, title: 't' }]),
    /no block allocation for source/
  );
});
