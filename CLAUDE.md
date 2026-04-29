# CLAUDE.md

## Repository Overview

This is a VitePress-based bilingual (EN + zh-TW) documentation site for Backend Engineering Essentials (BEE).

## Commands

- `pnpm docs:dev` -- Start VitePress development server
- `pnpm docs:build` -- Build documentation for production
- `pnpm docs:preview` -- Preview built documentation

## Architecture

- **VitePress 1.3.x** with custom theme (orange branding)
- **Bilingual**: EN content in `docs/en/`, zh-TW content in `docs/zh-tw/`
- **Dynamic sidebar**: Generated from markdown frontmatter at build time
- **Mermaid diagrams**: Used for architecture and flow diagrams
- **PWA support**: Offline-capable with service worker

## Content Conventions

- Each BEE file uses frontmatter: `id` (number), `title`, `state` (draft/reviewing/approved), `slug` (kebab-case). `overview: true` is set only on the category index article.
- File names match the slug, not the id: e.g., `graphql-http-caching.md`, not `4007.md`.
- BEE articles follow the canonical template enforced by the `expanding-category-articles` skill (`~/.claude/skills/expanding-category-articles/templates/article.md`):
  - **Required sections**: `## Context`, `## Visual`, `## Example`, `## Best Practices`, **at least one** topic-specific `## <Custom Section>` whose heading names a distinct angle the article adds, `## Related Topics`, `## References`. Add additional topic-specific sections when the topic has more than one distinct angle worth its own treatment; stop when there is nothing more to say.
  - **Optional sections**: `## Design Thinking`, `## Deep Dive`, `## Changelog`.
  - The topic-specific requirement may be waived only by setting `allow_no_custom_section: true` in the frontmatter with an inline `# reason: <prose>` comment.
- Use RFC 2119 keywords (MUST, SHOULD, MAY) for guidance in Best Practices.
- EN and zh-TW content are parallel — every EN file has a zh-TW counterpart with the same id, slug, section structure, and Mermaid diagram count.

## Content Quality

Every article MUST be researched against authoritative sources. AI internal knowledge alone is insufficient. References must contain real, verified URLs.

## Content Neutrality

This project is vendor-neutral. Do not include company-specific references, internal URLs, or product names.
