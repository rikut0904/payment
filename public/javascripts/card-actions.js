(function () {
    const cardTypeSelect = document.getElementById('cardType');
    const creditFields = document.querySelectorAll('[data-credit-field]');
    const debitFields = document.querySelectorAll('[data-debit-field]');
    function toggleFields(elements, enabled) {
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
        const type = cardTypeSelect ? cardTypeSelect.value : 'credit';
        const isCredit = type === 'credit';
        toggleFields(creditFields, isCredit);
        toggleFields(debitFields, !isCredit);
    }
    function initCardMenuClose() {
        document.addEventListener('click', (event) => {
            document.querySelectorAll('.card-menu[open]').forEach((menu) => {
                if (!menu.contains(event.target)) {
                    menu.removeAttribute('open');
                }
            });
        });
    }

    function initPaymentMonthPagination() {
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
        let activeIndex = 0;
        const clampIndex = (index) => Math.max(0, Math.min(index, panels.length - 1));
        function updateView() {
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
        }
        function setActive(index) {
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
