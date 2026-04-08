import { fileURLToPath, URL } from 'node:url';

export const shared = {
  transformPageData(pageData) {
    pageData.frontmatter.head ??= [];
    if (pageData.frontmatter.id != null) {
      pageData.title = `BEP-${pageData.frontmatter.id}: ${pageData.frontmatter.title}`;
    } else if (pageData.frontmatter.title != null) {
      pageData.title = `${pageData.frontmatter.title}`;
    }
    pageData.frontmatter.head.push([
      'meta',
      {
        name: 'og:title',
        content: pageData.frontmatter.id != null
          ? `BEP-${pageData.frontmatter.id}: ${pageData.frontmatter.title}`
          : pageData.frontmatter.title || 'Backend Engineering Principles',
      },
    ]);
  },
  cleanUrls: true,
  base: '/backend-engineering-principles/',
  lastUpdated: true,
  themeConfig: {
    logo: 'favicon.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/alivedise/backend-engineering-principles' },
    ],
    search: {
      provider: 'local',
    },
  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^.*\/VPNavBarTitle\.vue$/,
          replacement: fileURLToPath(
            new URL('../theme/VPNavBarTitle.vue', import.meta.url)
          ),
        },
      ],
    },
    optimizeDeps: {
      include: ['mermaid'],
    },
    ssr: {
      noExternal: ['mermaid'],
    },
  },
  head: [
    ['link', { rel: 'icon', href: 'favicon.svg' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700' }],
  ],
  pwa: {
    registerType: 'autoUpdate',
    workbox: {
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
    manifest: {
      name: 'Backend Engineering Principles',
      short_name: 'BEP',
      description: 'Backend Engineering Principles documentation',
      theme_color: '#e67e22',
      icons: [
        {
          src: 'favicon.svg',
          sizes: '192x192',
          type: 'image/svg+xml',
        },
      ],
    },
  },
  ignoreDeadLinks: true,
  mermaid: {},
  mermaidPlugin: {
    class: 'mermaid my-class',
  },
};
