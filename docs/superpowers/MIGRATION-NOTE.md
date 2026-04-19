# Migration Note: BEE ID Restructure

The historical specs and plans in this directory reference old BEE numeric IDs (BEE-70, BEE-205, BEE-485, BEE-596, BEE-597, BEE-598, BEE-599, etc.) that predate the category-blocked restructure performed on 2026-04-19.

These historical artifacts are intentionally NOT rewritten. They are session-time-stamped records of what the project state looked like at brainstorm/plan time. Rewriting them would obscure history.

To translate an old BEE ID to its new ID and URL, consult [`migration/bee-id-mapping.json`](../../migration/bee-id-mapping.json) at the repo root. Each entry in the mapping has:

- `current_id` (old integer)
- `new_id` (new category-blocked integer)
- `slug` (URL slug)
- `category_new` (new category folder slug)
- `new_path_en` and `new_path_zh` (new file paths)

Example: BEE-596 ("GraphQL HTTP-Layer Caching") in older specs is now BEE-4010 at `/api-design/graphql-http-caching` in the live site.

The redirect stubs ensure old URLs (`/596`) continue to resolve via HTML meta-refresh, but in-prose references to BEE numeric IDs in older specs/plans must be translated manually if linking to the live site is required.
