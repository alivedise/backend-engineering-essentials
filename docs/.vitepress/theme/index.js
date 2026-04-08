import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import './style.css';
import './index.css';
import './md.css';
import './sw';
import createScrollHandler from './scrollhandler';

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {});
  },
  enhanceApp({ router }) {
    if (!import.meta.env.SSR) {
      createScrollHandler(router);
    }
  },
};
