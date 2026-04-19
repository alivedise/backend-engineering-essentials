import { titleToSlug } from './slug.mjs';
import { blockForSource } from './blocks.mjs';

// buildMapping: given a flat array of articles, return mapping with
// new_id, slug, category_new, new_path_en, new_path_zh.
//
// Articles grouped by destination block (honoring merged Databases →
// data-storage), renumbered in current_id ascending order.
export function buildMapping(articles) {
  // Group by destination block slug (after merge resolution)
  const idsByBlock = new Map();
  for (const a of articles) {
    const block = blockForSource(a.source_folder);
    if (!block) {
      throw new Error(`no block for source folder: ${a.source_folder}`);
    }
    if (!idsByBlock.has(block.slug)) {
      idsByBlock.set(block.slug, { block, items: [] });
    }
    idsByBlock.get(block.slug).items.push(a);
  }

  const mapping = [];
  for (const [blockSlug, { block, items }] of idsByBlock) {
    const sorted = [...items].sort((a, b) => a.current_id - b.current_id);
    const blockSize = block.end - block.start + 1;
    if (sorted.length > blockSize) {
      throw new Error(
        `${sorted.length} articles exceed block size ${blockSize} for ${blockSlug}`
      );
    }
    sorted.forEach((article, i) => {
      const slug = titleToSlug(article.title);
      const newId = block.start + i;
      mapping.push({
        current_id: article.current_id,
        new_id: newId,
        title: article.title,
        slug,
        category_old: article.source_folder,
        category_new: blockSlug,
        old_path_en: article.en_path,
        new_path_en: `docs/en/${blockSlug}/${slug}.md`,
        old_path_zh: article.zh_path,
        new_path_zh: `docs/zh-tw/${blockSlug}/${slug}.md`,
      });
    });
  }

  return mapping;
}

// validateUniqueSlugs: throw if any (category_new, slug) pair is duplicated.
export function validateUniqueSlugs(mapping) {
  const seen = new Set();
  for (const entry of mapping) {
    const key = `${entry.category_new}/${entry.slug}`;
    if (seen.has(key)) {
      throw new Error(`duplicate slug in ${entry.category_new}: ${entry.slug}`);
    }
    seen.add(key);
  }
}
