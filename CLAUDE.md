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

- Each BEE file uses frontmatter: `id` (number), `title`, `state` (draft/reviewing/approved), `overview` (boolean)
- File names match the BEE id: e.g., `100.md` for BEE-100
- BEE articles follow a template: Context, Principle, Visual, Example, Common Mistakes, Related BEPs, References
- Sections after "Principle" are optional
- Uses RFC 2119 keywords (MUST, SHOULD, MAY) for guidance levels
- EN and zh-TW content are parallel -- every EN file has a zh-TW counterpart

## Content Quality

Every article MUST be researched against authoritative sources. AI internal knowledge alone is insufficient. References must contain real, verified URLs.

## Content Neutrality

This project is vendor-neutral. Do not include company-specific references, internal URLs, or product names.
