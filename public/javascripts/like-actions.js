(function () {
  async function handleEditLinkClick(event) {
    event.preventDefault();
    const link = event.currentTarget;
    const href = link.getAttribute('href');
    if (!href) return;
    try {
      const response = await fetch(href, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        alert(body?.error || '編集画面を開けませんでした。');
        return;
      }
      const result = await response.json().catch(() => null);
      if (!result?.success) {
        alert(result?.error || '編集画面を開けませんでした。');
        return;
      }
      window.location.href = href;
    } catch (err) {
      alert('通信エラーが発生しました。時間をおいてから再度お試しください。');
    }
  }

  function setupEditLinks() {
    document.querySelectorAll('.edit-link').forEach((link) => {
      link.removeEventListener('click', handleEditLinkClick);
      link.addEventListener('click', handleEditLinkClick);
    });
  }

  function setupDeleteForms() {
    document.querySelectorAll('.delete-form').forEach((form) => {
      const handler = async function (event) {
        const message = 'このおすすめを削除しますか？';
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }
        if (form.dataset.ajax !== 'true') {
          return;
        }
        event.preventDefault();
        try {
          const response = await fetch(form.getAttribute('action'), {
            method: 'POST',
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            alert(body?.error || '削除に失敗しました。');
            return;
          }
          const result = await response.json().catch(() => null);
          if (!result?.success) {
            alert(result?.error || '削除に失敗しました。');
            return;
          }
          window.location.reload();
        } catch (err) {
          alert('通信エラーが発生しました。時間をおいてから再度お試しください。');
        }
      };
      const existingHandler = form._deleteHandler;
      if (existingHandler) {
        form.removeEventListener('submit', existingHandler);
      }
      form._deleteHandler = handler;
      form.addEventListener('submit', handler);
    });
  }

  function init() {
    setupEditLinks();
    setupDeleteForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
