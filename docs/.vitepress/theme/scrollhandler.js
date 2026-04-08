const createScrollHandler = (router) => {
  const calculateNavigationOffset = () => {
    const mainNav = document.querySelector('.VPNav');
    const sideNav = document.querySelector('.VPLocalNav');
    const PADDING = 24;
    return (mainNav?.offsetHeight || 0) + (sideNav?.offsetHeight || 0) + PADDING;
  };

  const formatHash = (hash) => {
    return hash.startsWith('#') ? hash : `#${hash}`;
  };

  const calculateScrollPosition = (element) => {
    const elementTop = element.getBoundingClientRect().top + window.scrollY;
    const offset = calculateNavigationOffset();
    return Math.max(0, elementTop - offset);
  };

  const scrollToElement = (hash) => {
    const formattedHash = formatHash(hash);
    const targetElement = document.querySelector(formattedHash);
    if (!targetElement) return;
    const targetPosition = calculateScrollPosition(targetElement);
    window.scrollTo({ top: targetPosition, behavior: 'smooth' });
  };

  const handleRouteChange = (to) => {
    if (!to.hash) return;
    requestAnimationFrame(() => {
      scrollToElement(decodeURIComponent(to.hash));
    });
  };

  const handleInitialLoad = () => {
    const hash = decodeURIComponent(window.location.hash);
    if (!hash) return;
    requestAnimationFrame(() => {
      scrollToElement(hash);
    });
  };

  if (!window) return;
  router.onAfterRouteChanged = handleRouteChange;
  window.onload = handleInitialLoad;

  return scrollToElement;
};

export default createScrollHandler;
