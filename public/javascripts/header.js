(function () {
  const header = document.querySelector('.app-header');
  if (!header) {
    return;
  }
  const toggleBtn = header.querySelector('.header-menu-toggle');
  const drawer = document.querySelector('.header-drawer');
  const overlay = drawer ? drawer.querySelector('.header-drawer__overlay') : null;
  const closeBtn = drawer ? drawer.querySelector('.header-menu-close') : null;
  if (!toggleBtn || !drawer || !overlay || !closeBtn) {
    return;
  }

  const setExpanded = (expanded) => {
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    header.classList.toggle('is-menu-open', expanded);
    drawer.setAttribute('aria-hidden', String(!expanded));
    document.body.classList.toggle('is-menu-open', expanded);
  };

  toggleBtn.addEventListener('click', () => {
    const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    setExpanded(!expanded);
  });

  overlay.addEventListener('click', () => {
    setExpanded(false);
  });

  closeBtn.addEventListener('click', () => {
    setExpanded(false);
  });

  drawer.addEventListener('click', (event) => {
    if (event.target && event.target.closest('a')) {
      setExpanded(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setExpanded(false);
    }
  });
})();
