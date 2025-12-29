(() => {
  // モバイルメニューに必要な要素を取得する。
  const header = document.querySelector('.app-header');
  const drawer = document.getElementById('headerDrawer');
  const openButton = document.querySelector('.header-menu-toggle');
  const overlay = drawer?.querySelector('.header-drawer__overlay');
  const closeButton = drawer?.querySelector('.header-menu-close');

  if (!header || !drawer || !openButton || !overlay || !closeButton) {
    return;
  }

  // ドロワーの表示/非表示とaria属性を切り替える。
  const setOpen = (isOpen) => {
    header.classList.toggle('is-menu-open', isOpen);
    document.body.classList.toggle('is-menu-open', isOpen);
    openButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    drawer.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  };

  openButton.addEventListener('click', () => setOpen(true));
  overlay.addEventListener('click', () => setOpen(false));
  closeButton.addEventListener('click', () => setOpen(false));

  // Escキーでドロワーを閉じる。
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });
})();
