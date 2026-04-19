import matter from 'gray-matter';

// updateFrontmatter: given raw markdown text, a new integer id, and a slug,
// return new markdown text with frontmatter id replaced and slug added.
// All other frontmatter fields preserved. Body untouched.
//
// Throws if input has no frontmatter.
export function updateFrontmatter(rawMd, newId, slug) {
  const parsed = matter(rawMd);
  if (!parsed.matter || parsed.matter.trim().length === 0) {
    throw new Error('no frontmatter found in input');
  }

  const newData = {
    ...parsed.data,
    id: newId,
    slug,
  };

  return matter.stringify(parsed.content, newData);
}
