if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const intervalMS = 60 * 60 * 1000;
    registerSW({
      immediate: true,
      onRegistered(r) {
        r && setInterval(() => { r.update(); }, intervalMS);
      },
    });
  });
}
