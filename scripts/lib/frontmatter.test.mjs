import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateFrontmatter } from './frontmatter.mjs';

const sampleEN = `---
id: 596
title: "GraphQL HTTP-Layer Caching"
state: draft
---

# [BEE-596] GraphQL HTTP-Layer Caching

Some content.
`;

test('updates id and adds slug, preserving other fields', () => {
  const result = updateFrontmatter(sampleEN, 4010, 'graphql-http-caching');
  assert.match(result, /id: 4010/);
  assert.match(result, /title: ['"]?GraphQL HTTP-Layer Caching['"]?/);
  assert.match(result, /slug: graphql-http-caching/);
  assert.match(result, /state: draft/);
  assert.match(result, /# \[BEE-596\] GraphQL HTTP-Layer Caching/);
  assert.match(result, /Some content\./);
});

test('preserves other frontmatter fields beyond id/title/state', () => {
  const withExtra = `---
id: 200
title: "Caching Fundamentals"
state: approved
overview: true
custom_field: hello
---

Body.
`;
  const result = updateFrontmatter(withExtra, 9001, 'cache-fundamentals');
  assert.match(result, /id: 9001/);
  assert.match(result, /slug: cache-fundamentals/);
  assert.match(result, /overview: true/);
  assert.match(result, /custom_field: hello/);
  assert.match(result, /state: approved/);
});

test('throws if frontmatter is missing', () => {
  const noFm = `# No frontmatter\n\nBody.\n`;
  assert.throws(() => updateFrontmatter(noFm, 1, 'test'), /no frontmatter/);
});
