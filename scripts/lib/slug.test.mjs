import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleToSlug } from './slug.mjs';

test('lowercases and hyphenates basic title', () => {
  assert.equal(titleToSlug('GraphQL HTTP-Layer Caching'), 'graphql-http-caching');
});

test('drops leading articles', () => {
  assert.equal(titleToSlug('The N+1 Query Problem and Batch Loading'), 'n-plus-1-query-batching');
});

test('drops punctuation', () => {
  assert.equal(titleToSlug('OAuth 2.0 and OpenID Connect'), 'oauth-openid-connect');
});

test('handles vs separator naturally', () => {
  assert.equal(titleToSlug('RBAC vs ABAC Access Control Models'), 'rbac-vs-abac');
});

test('shortens trailing in-APIs phrases', () => {
  assert.equal(titleToSlug('Idempotency in APIs'), 'api-idempotency');
});

test('preserves numerics with hyphens', () => {
  assert.equal(titleToSlug('HTTP/1.1, HTTP/2, HTTP/3'), 'http-versions');
});

test('handles colons by dropping the punctuation', () => {
  assert.equal(titleToSlug('GraphQL vs REST: Request-Side HTTP Trade-offs'), 'graphql-vs-rest-request-side-http-trade-offs');
});

test('strips trailing whitespace and quotes', () => {
  assert.equal(titleToSlug('"Webhooks" and Callback Patterns'), 'webhooks-callback-patterns');
});

test('handles single word', () => {
  assert.equal(titleToSlug('Caching'), 'caching');
});

test('handles empty string by throwing', () => {
  assert.throws(() => titleToSlug(''), /title must be non-empty/);
});
