import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRedirectStub } from './redirects.mjs';

test('renders EN redirect with base path and canonical link', () => {
  const html = renderRedirectStub({
    oldId: 596,
    newPath: '/api-design/graphql-http-caching',
    basePath: '/backend-engineering-essentials',
    locale: 'en',
    title: 'GraphQL HTTP-Layer Caching',
  });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /content="0; url=\/backend-engineering-essentials\/api-design\/graphql-http-caching"/);
  assert.match(html, /<link rel="canonical" href="\/backend-engineering-essentials\/api-design\/graphql-http-caching">/);
  assert.match(html, /<title>Redirecting to GraphQL HTTP-Layer Caching<\/title>/);
});

test('renders zh-TW redirect with locale prefix', () => {
  const html = renderRedirectStub({
    oldId: 596,
    newPath: '/api-design/graphql-http-caching',
    basePath: '/backend-engineering-essentials',
    locale: 'zh-tw',
    title: 'GraphQL 的 HTTP 層快取',
  });
  assert.match(html, /content="0; url=\/backend-engineering-essentials\/zh-tw\/api-design\/graphql-http-caching"/);
});

test('handles empty base path (root deployment)', () => {
  const html = renderRedirectStub({
    oldId: 1,
    newPath: '/bee-overall/overview',
    basePath: '',
    locale: 'en',
    title: 'BEE Overview',
  });
  assert.match(html, /content="0; url=\/bee-overall\/overview"/);
});
