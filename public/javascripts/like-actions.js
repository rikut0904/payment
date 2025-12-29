(function () {
  // おすすめ一覧の編集/削除を制御する。
  async function handleEditLinkClick(event) {
    // 編集権限を確認してから遷移する。
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
    // 編集リンクのイベントを設定する。
    document.querySelectorAll('.edit-link').forEach((link) => {
      link.removeEventListener('click', handleEditLinkClick);
      link.addEventListener('click', handleEditLinkClick);
    });
  }

  async function handleDeleteLinkClick(event) {
    // 削除確認後に削除リクエストを送る。
    event.preventDefault();
    const link = event.currentTarget;
    const id = link.dataset.id;
    if (!id) return;
    const message = 'このおすすめを削除しますか？';
    if (!window.confirm(message)) {
      return;
    }
    try {
      const response = await fetch(`/like/delete/${id}`, {
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
  }

  function setupDeleteLinks() {
    // 削除リンクのイベントを設定する。
    document.querySelectorAll('.delete-link').forEach((link) => {
      link.removeEventListener('click', handleDeleteLinkClick);
      link.addEventListener('click', handleDeleteLinkClick);
    });
  }

  function init() {
    // 初期化処理。
    setupEditLinks();
    setupDeleteLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
