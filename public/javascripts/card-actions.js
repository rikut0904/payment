(function () {
    const cardTypeSelect = document.getElementById('cardType');
    const creditFields = document.querySelectorAll('[data-credit-field]');
    const debitFields = document.querySelectorAll('[data-debit-field]');
    function toggleFields(elements, enabled) {
        elements.forEach((field) => {
            field.style.display = enabled ? '' : 'none';
            field.querySelectorAll('input, select, textarea').forEach((input) => {
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
    if (cardTypeSelect) {
        updateCardTypeFields();
        cardTypeSelect.addEventListener('change', updateCardTypeFields);
    }
})();