// rewriteCrossRefs: given markdown text, a mapping array, and the
// current article's category slug, return new markdown text with all
// [BEE-X](path/X.md) links rewritten to [BEE-NEW](relative-path/new-slug.md).
//
// Pattern matched: [BEE-<digits>](<path-prefix>/?<digits>.md)
// Path-prefix can be empty (intra-category) or include a relative
// directory traversal containing the source folder name.
// Unknown IDs (not in mapping) are left unchanged.
export function rewriteCrossRefs(markdownText, mapping, currentCategorySlug) {
  const idToEntry = new Map(mapping.map(m => [m.current_id, m]));

  // Match [BEE-<id>](<path>) where <path> ends in <id>.md
  const pattern = /\[BEE-(\d+)\]\(([^)]*?)(\d+)\.md\)/g;

  return markdownText.replace(pattern, (match, beeId, pathPrefix, fileId) => {
    const id = parseInt(beeId, 10);
    const fileIdInt = parseInt(fileId, 10);
    if (id !== fileIdInt) {
      return match;
    }

    const entry = idToEntry.get(id);
    if (!entry) {
      return match;
    }

    let newPath;
    if (entry.category_new === currentCategorySlug) {
      newPath = `${entry.slug}.md`;
    } else {
      newPath = `../${entry.category_new}/${entry.slug}.md`;
    }

    return `[BEE-${entry.new_id}](${newPath})`;
  });
}
