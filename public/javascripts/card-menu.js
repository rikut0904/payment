(() => {
  const menus = document.querySelectorAll('.card-menu');
  const mobileQuery = window.matchMedia('(max-width: 600px)');

  const clearStyles = (list) => {
    list.style.position = '';
    list.style.left = '';
    list.style.top = '';
    list.style.right = '';
    list.style.transform = '';
    list.style.maxWidth = '';
  };

  const positionMenu = (menu) => {
    const list = menu.querySelector('.card-menu__list');
    const summary = menu.querySelector('summary');
    if (!list || !summary) return;
    if (!mobileQuery.matches) {
      clearStyles(list);
      return;
    }

    const summaryRect = summary.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const padding = 16;
    const MENU_OFFSET = 8;
    const maxLeft = window.innerWidth - listRect.width - padding;
    const centeredLeft = (window.innerWidth - listRect.width) / 2;
    const left = Math.max(padding, Math.min(maxLeft, centeredLeft));
    const maxTop = window.innerHeight - listRect.height - padding;
    const top = Math.min(maxTop, summaryRect.bottom + MENU_OFFSET);

    list.style.position = 'fixed';
    list.style.left = `${left}px`;
    list.style.top = `${Math.max(padding, top)}px`;
    list.style.right = 'auto';
    list.style.transform = 'none';
    list.style.maxWidth = `${window.innerWidth - padding * 2}px`;
  };

  menus.forEach((menu) => {
    menu.addEventListener('toggle', () => {
      const list = menu.querySelector('.card-menu__list');
      if (!list) return;
      if (!menu.open) {
        clearStyles(list);
        return;
      }
      requestAnimationFrame(() => positionMenu(menu));
    });
  });

  const debounce = (fn, delay) => {
    let timerId;
    return (...args) => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(() => fn(...args), delay);
    };
  };

  const handleResize = debounce(() => {
    menus.forEach((menu) => {
      const list = menu.querySelector('.card-menu__list');
      if (!list) return;
      if (menu.open) {
        positionMenu(menu);
      } else {
        clearStyles(list);
      }
    });
  }, 120);

  window.addEventListener('resize', handleResize);
})();
