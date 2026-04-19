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

// Special: small overflow folders are merged into their canonical category
// per spec §3 special handling. MERGED_FOLDERS maps a source folder that
// should be absorbed into another to its destination block slug.
//
// Overflow folders discovered during migration (each contains a single
// article that topically belongs in the canonical sibling folder):
//   Databases (481)  → data-storage
//   CI-CD (483)      → cicd-devops
//   Messaging (480)  → messaging
//   Security (482)   → security-fundamentals
export const MERGED_FOLDERS = {
  'Databases': 'data-storage',
  'CI-CD': 'cicd-devops',
  'Messaging': 'messaging',
  'Security': 'security-fundamentals',
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

// assignNewIds: given a source folder name and an array of articles
// (each with { current_id, title }), return new array with new_id assigned
// in current_id ascending order starting from the block's start.
//
// Throws if the source folder has no block allocation, or if the article
// count exceeds the block's size.
export function assignNewIds(sourceFolder, articles) {
  const block = blockForSource(sourceFolder);
  if (!block) {
    throw new Error(`no block allocation for source: ${sourceFolder}`);
  }

  const blockSize = block.end - block.start + 1;
  if (articles.length > blockSize) {
    throw new Error(
      `${articles.length} articles exceeds block size ${blockSize} for ${block.slug}`
    );
  }

  const sorted = [...articles].sort((a, b) => a.current_id - b.current_id);
  return sorted.map((article, i) => ({
    ...article,
    new_id: block.start + i,
  }));
}
