import matter from 'gray-matter';

// updateFrontmatter: given raw markdown text, a new integer id, and a slug,
// return new markdown text with frontmatter id replaced and slug added.
// All other frontmatter fields preserved. Body untouched.
//
// Throws if input has no frontmatter.
export function updateFrontmatter(rawMd, newId, slug) {
  const parsed = matter(rawMd);
  // Note: parsed.matter is unreliable when gray-matter's content cache is hot
  // (a second matter() call on the same raw string returns parsed.matter as
  // undefined). Use parsed.data + parsed.isEmpty (always preserved) to detect
  // missing frontmatter.
  if (parsed.isEmpty || !parsed.data || Object.keys(parsed.data).length === 0) {
    throw new Error('no frontmatter found in input');
  }

  const newData = {
    ...parsed.data,
    id: newId,
    slug,
  };

  return matter.stringify(parsed.content, newData);
}
