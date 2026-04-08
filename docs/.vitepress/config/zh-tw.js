import matter from 'gray-matter';
import { resolve } from 'path';
import fs from 'fs';

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
          let title = `${data.id}.${data.title}` || file.replace('.md', '');
          if (data && data.placeholder) {
            title = `<span class="VPBadge danger">暫定</span> ${title}`;
          }

          mdFileList.push({
            listItem: `- [${title}](${data.id})`,
            id: data.id,
          });
          result.push({
            text: title,
            link: `/zh-tw/${data.id}`,
          });
        }
      }
    });

    return result;
  }

  const sidebar = getFilesRecursively(docsPath);
  mdFileList = mdFileList
    .sort((a, b) => a.id - b.id)
    .map((item) => item.listItem);
  const listMdContent = `---\ntitle: BEE 全列表\n---\n# BEE 全列表\n\n${mdFileList.join('\n')}\n`;
  fs.writeFileSync(resolve(docsPath, 'list.md'), listMdContent);
  return sidebar;
}

export const zhTW = {
  title: '後端工程精要',
  description: '後端工程精要與最佳實踐',
  lang: 'zh-tw',
  lastUpdated: {
    text: '最後更新於',
    formatOptions: {
      dateStyle: 'short',
      timeStyle: 'medium',
    },
  },
  themeConfig: {
    nav: [
      { text: '首頁', link: '/zh-tw' },
      { text: '常見問題', link: '/zh-tw/faq' },
      { text: '列表', link: '/zh-tw/list' },
    ],
    sidebar: getSidebar('../zh-tw'),
  },
};
