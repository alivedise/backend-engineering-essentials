import { test } from 'node:test';
import assert from 'node:assert/strict';

import { titleToSlug } from './lib/slug.mjs';
import { buildMapping, validateUniqueSlugs } from './lib/mapping.mjs';
import { rewriteCrossRefs } from './lib/crossref.mjs';
import { updateFrontmatter } from './lib/frontmatter.mjs';

// Integration test: exercises the same pure-function composition the orchestrator
// uses. End-to-end orchestrator behavior (filesystem ops, git mv, build) is
// covered by the live --dry-run check.

test('integration: full pipeline produces expected mapping and rewrites for a tiny fixture', () => {
  const fixture = [
    {
      source_folder: 'API Design and Communication Protocols',
      current_id: 70,
      title: 'REST API Design Principles',
      en_path: '/fake/docs/en/API Design and Communication Protocols/70.md',
      zh_path: '/fake/docs/zh-tw/API Design and Communication Protocols/70.md',
    },
    {
      source_folder: 'API Design and Communication Protocols',
      current_id: 596,
      title: 'GraphQL HTTP-Layer Caching',
      en_path: '/fake/docs/en/API Design and Communication Protocols/596.md',
      zh_path: '/fake/docs/zh-tw/API Design and Communication Protocols/596.md',
    },
    {
      source_folder: 'Caching',
      current_id: 205,
      title: 'HTTP Caching and Conditional Requests',
      en_path: '/fake/docs/en/Caching/205.md',
      zh_path: '/fake/docs/zh-tw/Caching/205.md',
    },
  ];

  const mapping = buildMapping(fixture);
  validateUniqueSlugs(mapping);

  assert.equal(mapping.length, 3);
  const rest = mapping.find(m => m.current_id === 70);
  const gql = mapping.find(m => m.current_id === 596);
  const cache = mapping.find(m => m.current_id === 205);
  assert.equal(rest.new_id, 4001);
  assert.equal(gql.new_id, 4002);
  assert.equal(cache.new_id, 9001);

  // Cross-ref rewriting from gql article (api-design) to cache article (caching)
  // Note: slug for "HTTP Caching and Conditional Requests" preserves "and"
  // because the slug rule is deterministic; editorial shortening only applies
  // via SHORTENING_RULES.
  const gqlBody = `Read [BEE-205](../Caching/205.md) for caching context.`;
  const rewritten = rewriteCrossRefs(gqlBody, mapping, 'api-design');
  assert.match(rewritten, /\[BEE-9001\]\(\.\.\/caching\/http-caching-and-conditional-requests\.md\)/);

  // Frontmatter update on REST article
  const restRaw = `---
id: 70
title: "REST API Design Principles"
state: draft
---

Body content.
`;
  const updated = updateFrontmatter(restRaw, rest.new_id, rest.slug);
  assert.match(updated, /id: 4001/);
  assert.match(updated, /slug: rest-api-design-principles/);
  assert.match(updated, /state: draft/);
  assert.match(updated, /Body content\./);
});
