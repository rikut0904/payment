(function () {
    // カードページのフォーム/一覧の挙動。
    const cardTypeSelect = document.getElementById('cardType');
    const creditFields = document.querySelectorAll('[data-credit-field]');
    const debitFields = document.querySelectorAll('[data-debit-field]');
    function toggleFields(elements, enabled) {
        // 入力グループの表示/無効を切り替える。
        elements.forEach((field) => {
            field.style.display = enabled ? '' : 'none';
            field
                .querySelectorAll('input, select, textarea')
                .forEach((input) => {
                input.disabled = !enabled;
            });
        });
    }
    function updateCardTypeFields() {
        // カード種別に応じて入力欄を切り替える。
        const type = cardTypeSelect ? cardTypeSelect.value : 'credit';
        const isCredit = type === 'credit';
        toggleFields(creditFields, isCredit);
        toggleFields(debitFields, !isCredit);
    }
    function initCardMenuClose() {
        // 画面外クリックでメニューを閉じる。
        document.addEventListener('click', (event) => {
            document.querySelectorAll('.card-menu[open]').forEach((menu) => {
                if (!menu.contains(event.target)) {
                    menu.removeAttribute('open');
                }
            });
        });
    }

    function initPaymentMonthPagination() {
        // 支払予定の月切り替えUIを制御する。
        const panelsContainer = document.querySelector('[data-payment-panels]');
        if (!panelsContainer) {
            return;
        }
        const panels = Array.from(panelsContainer.querySelectorAll('[data-payment-panel]'));
        if (!panels.length) {
            return;
        }
        const prevBtn = document.querySelector('[data-payment-prev]');
        const nextBtn = document.querySelector('[data-payment-next]');
        const tabs = Array.from(document.querySelectorAll('[data-payment-index]'));
        const currentLabel = document.querySelector('[data-payment-current]');
        const summaries = Array.from(document.querySelectorAll('[data-month-summary]'));
        let activeIndex = 0;
        const clampIndex = (index) => Math.max(0, Math.min(index, panels.length - 1));
        function updateView() {
            // パネル/タブ/サマリー表示を更新する。
            panels.forEach((panel, idx) => {
                panel.classList.toggle('is-active', idx === activeIndex);
            });
            tabs.forEach((tab, idx) => {
                const isActive = idx === activeIndex;
                tab.classList.toggle('is-active', isActive);
                tab.setAttribute('aria-pressed', String(isActive));
            });
            if (prevBtn) {
                prevBtn.disabled = activeIndex === 0;
            }
            if (nextBtn) {
                nextBtn.disabled = activeIndex === panels.length - 1;
            }
            if (currentLabel) {
                const label = panels[activeIndex]?.dataset?.monthLabel || '';
                currentLabel.textContent = label;
            }
            if (summaries.length) {
                const activeKey = panels[activeIndex]?.dataset?.monthKey;
                summaries.forEach((item) => {
                    const matches = item.dataset.monthKey === activeKey;
                    item.style.display = matches ? '' : 'none';
                });
            }
        }
        function setActive(index) {
            // 表示中の月を切り替える。
            const nextIndex = clampIndex(index);
            if (nextIndex === activeIndex) {
                return;
            }
            activeIndex = nextIndex;
            updateView();
        }
        prevBtn?.addEventListener('click', () => {
            setActive(activeIndex - 1);
        });
        nextBtn?.addEventListener('click', () => {
            setActive(activeIndex + 1);
        });
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const targetIndex = Number(tab.dataset.paymentIndex);
                if (Number.isNaN(targetIndex)) {
                    return;
                }
                setActive(targetIndex);
            });
        });
        updateView();
    }
    if (cardTypeSelect) {
        updateCardTypeFields();
        cardTypeSelect.addEventListener('change', updateCardTypeFields);
    }
    initCardMenuClose();
    initPaymentMonthPagination();
})();
