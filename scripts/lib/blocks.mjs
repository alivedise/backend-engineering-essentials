// Category block allocation per spec §3.
// Each entry maps the new folder slug to its block range.
// Source folder names match the current docs/en/ subdirectory names.
export const BLOCK_ALLOCATION = [
  { slug: 'bee-overall', source: 'BEE Overall', start: 1, end: 99 },
  { slug: 'auth', source: 'Authentication and Authorization', start: 1001, end: 1999 },
  { slug: 'security-fundamentals', source: 'Security Fundamentals', start: 2001, end: 2999 },
  { slug: 'networking-fundamentals', source: 'Networking Fundamentals', start: 3001, end: 3999 },
  { slug: 'api-design', source: 'API Design and Communication Protocols', start: 4001, end: 4999 },
  { slug: 'architecture-patterns', source: 'Architecture Patterns', start: 5001, end: 5999 },
  { slug: 'data-storage', source: 'Data Storage and Database Fundamentals', start: 6001, end: 6999 },
  { slug: 'data-modeling', source: 'Data Modeling and Schema Design', start: 7001, end: 7999 },
  { slug: 'transactions', source: 'Transactions and Data Integrity', start: 8001, end: 8999 },
  { slug: 'caching', source: 'Caching', start: 9001, end: 9999 },
  { slug: 'messaging', source: 'Messaging and Event-Driven', start: 10001, end: 10999 },
  { slug: 'concurrency', source: 'Concurrency and Async', start: 11001, end: 11999 },
  { slug: 'resilience', source: 'Resilience and Reliability', start: 12001, end: 12999 },
  { slug: 'performance-scalability', source: 'Performance and Scalability', start: 13001, end: 13999 },
  { slug: 'observability', source: 'Observability', start: 14001, end: 14999 },
  { slug: 'testing', source: 'Testing Strategies', start: 15001, end: 15999 },
  { slug: 'cicd-devops', source: 'CI CD and DevOps', start: 16001, end: 16999 },
  { slug: 'search', source: 'Search', start: 17001, end: 17999 },
  { slug: 'multi-tenancy', source: 'Multi-Tenancy', start: 18001, end: 18999 },
  { slug: 'distributed-systems', source: 'Distributed Systems', start: 19001, end: 19999 },
  { slug: 'ai-backend-patterns', source: 'AI Backend Patterns', start: 30001, end: 39999 },
];

// Special: Databases/ is merged into data-storage per spec §3 special handling.
// MERGED_FOLDERS maps a source folder that should be absorbed into another
// to its destination block slug.
export const MERGED_FOLDERS = {
  'Databases': 'data-storage',
};

// Source-name lookup: returns the block slug for a given source folder name,
// honoring MERGED_FOLDERS.
export function blockForSource(sourceFolder) {
  if (MERGED_FOLDERS[sourceFolder]) {
    const targetSlug = MERGED_FOLDERS[sourceFolder];
    return BLOCK_ALLOCATION.find(b => b.slug === targetSlug);
  }
  return BLOCK_ALLOCATION.find(b => b.source === sourceFolder);
}
