import { defineConfig } from 'vitepress';
import { withPwa } from '@vite-pwa/vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

import { shared } from './shared';
import { en } from './en';
import { zhTW } from './zh-tw';

// withMermaid must wrap the base config BEFORE withPwa,
// because withPwa returns a Promise and withMermaid cannot
// inject its vite plugins into a Promise object.
const baseConfig = defineConfig({
  ...shared,
  rewrites: {
    'en/:path+/:page': ':page',
    'en/list.md': 'list.md',
    'en/faq.md': 'faq.md',
    'zh-tw/:path+/:page': 'zh-tw/:page',
  },
  locales: {
    root: { label: 'English', ...en },
    'zh-tw': { label: '繁體中文', ...zhTW },
  },
});

const withMermaidConfig = withMermaid(baseConfig);

export default withPwa(withMermaidConfig);
