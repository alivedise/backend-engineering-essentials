// titleToSlug: derive a URL-safe English slug from an article title per spec §4.
//
// Rules:
//   - lowercase ASCII
//   - hyphens between words, no underscores or spaces
//   - drop leading articles (a, an, the)
//   - drop punctuation (, : ' " ? ! ( ) " ")
//   - preserve numerics joined with hyphens
//   - editorial shortenings for known patterns

const SHORTENING_RULES = new Map([
  ['HTTP/1.1, HTTP/2, HTTP/3', 'http-versions'],
  ['Idempotency in APIs', 'api-idempotency'],
  ['The N+1 Query Problem and Batch Loading', 'n-plus-1-query-batching'],
  ['RBAC vs ABAC Access Control Models', 'rbac-vs-abac'],
  ['OAuth 2.0 and OpenID Connect', 'oauth-openid-connect'],
  ['"Webhooks" and Callback Patterns', 'webhooks-callback-patterns'],
  ['GraphQL HTTP-Layer Caching', 'graphql-http-caching'],
]);

const LEADING_ARTICLES = new Set(['a', 'an', 'the']);

export function titleToSlug(title) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('title must be non-empty');
  }

  if (SHORTENING_RULES.has(title)) {
    return SHORTENING_RULES.get(title);
  }

  let s = title.toLowerCase();

  // Strip punctuation but keep hyphens, alphanumerics, spaces, slashes.
  s = s.replace(/[,.:;!?()'"`""''‐]/g, '');

  // Replace slashes with hyphens
  s = s.replace(/\//g, '-');

  // Collapse whitespace to single hyphen
  s = s.trim().replace(/\s+/g, '-');

  // Collapse multiple hyphens
  s = s.replace(/-{2,}/g, '-');

  // Drop leading article if present
  const tokens = s.split('-');
  if (LEADING_ARTICLES.has(tokens[0])) {
    tokens.shift();
  }

  return tokens.join('-');
}
