import matter from 'gray-matter';
import { resolve, basename, dirname } from 'path';
import fs from 'fs';

function getMinId(node) {
  if (node.link) {
    const id = parseInt(node.link.replace(/^\//, ''), 10);
    return isNaN(id) ? Infinity : id;
  }
  if (node.items && node.items.length) {
    return Math.min(...node.items.map(getMinId));
  }
  return Infinity;
}

function sortByMinId(nodes) {
  nodes.forEach((node) => {
    if (node.items && node.items.length) {
      sortByMinId(node.items);
    }
  });
  nodes.sort((a, b) => {
    const aIsOverall = a.text && a.text.toLowerCase().includes('overall');
    const bIsOverall = b.text && b.text.toLowerCase().includes('overall');
    if (aIsOverall && !bIsOverall) return -1;
    if (!aIsOverall && bIsOverall) return 1;
    return getMinId(a) - getMinId(b);
  });
}

function getSidebar(dir) {
  const docsPath = resolve(__dirname, `../${dir}`);
  let mdFileList = [];

  function getFilesRecursively(directory) {
    const files = fs.readdirSync(directory);
    const result = [];

    files.forEach((file) => {
      const fullPath = resolve(directory, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        const subDirFiles = getFilesRecursively(fullPath);
        if (subDirFiles.length) {
          result.push({
            text: file,
            collapsed: true,
            items: subDirFiles,
          });
        }
      } else {
        if (file.endsWith('.md') && !file.startsWith('index')) {
          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          const { data } = matter(fileContent);
          if (data && typeof data.id === 'undefined') {
            return;
          }
          const categorySlug = basename(dirname(fullPath));
          const articleSlug = data.slug || file.replace(/\.md$/, '');
          if (!data.slug) {
            console.warn(`[sidebar] missing slug in frontmatter: ${fullPath}; falling back to file basename`);
          }
          let title = `BEE-${data.id} ${data.title}` || file.replace('.md', '');
          if (data && data.placeholder) {
            title = `<span class="VPBadge danger">PLACE</span> ${title}`;
          }

          const semanticUrl = `/${categorySlug}/${articleSlug}`;
          mdFileList.push({
            listItem: `- [${title}](${semanticUrl})`,
            id: data.id,
          });
          result.push({
            text: title,
            link: semanticUrl,
          });
        }
      }
    });

    return result;
  }

  const sidebar = getFilesRecursively(docsPath);
  sortByMinId(sidebar);
  mdFileList = mdFileList
    .sort((a, b) => a.id - b.id)
    .map((item) => item.listItem);
  const listMdContent = `---\ntitle: BEE list\n---\n# BEE Document List\n\n${mdFileList.join('\n')}\n`;
  fs.writeFileSync(resolve(docsPath, 'list.md'), listMdContent);
  return sidebar;
}

export const en = {
  title: 'Backend Engineering Essentials',
  description: 'Backend Engineering Essentials documentation',
  lang: 'en',
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'FAQ', link: '/faq' },
      { text: 'LIST', link: '/list' },
    ],
    sidebar: [
      ...getSidebar('../en/'),
      {
        text: 'Related Sites',
        items: [
          { text: 'ADE -- API Design Essentials', link: 'https://alivedise.github.io/api-design-essentials/' },
          { text: 'DEE -- Database Engineering Essentials', link: 'https://alivedise.github.io/database-engineering-essentials/' },
        ],
      },
    ],
  },
};
