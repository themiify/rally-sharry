/**
 * Live price-total calculation for bundle, grouped, and customizable products.
 *
 * Each calculator reads data-price attributes set in Liquid and updates
 * a total display element whenever the user changes selections or quantities.
 */

function fmt(amount, currency) {
    return parseFloat(amount).toFixed(2) + ' ' + (currency || 'SAR');
}

// ── Bundle ────────────────────────────────────────────────────────────────

function initBundleTotal() {
    var container = document.querySelector('.gl-bundle-options');
    if (!container) return;

    var totalEl  = container.querySelector('[data-bundle-total-value]');
    var currency = container.getAttribute('data-bundle-currency') || 'SAR';

    function calculate() {
        var total = 0;
        var optionDivs = container.querySelectorAll('[data-bundle-option-id]');

        optionDivs.forEach(function (optDiv) {
            var qtyInput = optDiv.querySelector('[data-bundle-qty]');
            var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
            var price = 0;

            // Collect price from selected inputs in this option
            var inputs = optDiv.querySelectorAll('[data-bundle-input]');
            inputs.forEach(function (input) {
                if (input.tagName === 'SELECT') {
                    if (input.multiple) {
                        Array.from(input.selectedOptions).forEach(function (opt) {
                            price += parseFloat(opt.getAttribute('data-price') || 0);
                        });
                    } else {
                        var selected = input.options[input.selectedIndex];
                        if (selected) price += parseFloat(selected.getAttribute('data-price') || 0);
                    }
                } else if (input.type === 'radio') {
                    if (input.checked) price += parseFloat(input.getAttribute('data-price') || 0);
                } else if (input.type === 'checkbox') {
                    if (input.checked) price += parseFloat(input.getAttribute('data-price') || 0);
                }
            });

            total += price * qty;
        });

        if (totalEl) totalEl.textContent = fmt(total, currency);
    }

    container.addEventListener('change', calculate);
    container.addEventListener('input', function (e) {
        if (e.target.hasAttribute('data-bundle-qty')) calculate();
    });

    calculate();
}

// ── Grouped ───────────────────────────────────────────────────────────────

function initGroupedTotal() {
    var container = document.querySelector('.gl-grouped-products');
    if (!container) return;

    var totalEl  = container.querySelector('[data-grouped-total-value]');
    var currency = container.getAttribute('data-grouped-currency') || 'SAR';

    function calculate() {
        var total = 0;
        var qtyInputs = container.querySelectorAll('[data-grouped-qty]');

        qtyInputs.forEach(function (input) {
            var qty   = parseInt(input.value, 10) || 0;
            var price = parseFloat(input.getAttribute('data-grouped-price') || 0);
            total += price * qty;
        });

        if (totalEl) totalEl.textContent = fmt(total, currency);
    }

    container.addEventListener('change', calculate);
    container.addEventListener('input', calculate);

    calculate();
}

// ── Customizable Options ──────────────────────────────────────────────────

function initCustomTotal() {
    var container = document.querySelector('.gl-product-custom-options');
    if (!container) return;

    var totalEl  = container.querySelector('[data-custom-total-value]');
    var currency = container.getAttribute('data-custom-currency') || 'SAR';

    function calculate() {
        var total = 0;
        var inputs = container.querySelectorAll('[data-custom-input]');

        inputs.forEach(function (input) {
            if (input.tagName === 'SELECT') {
                if (input.multiple) {
                    Array.from(input.selectedOptions).forEach(function (opt) {
                        total += parseFloat(opt.getAttribute('data-price') || 0);
                    });
                } else {
                    var selected = input.options[input.selectedIndex];
                    if (selected) total += parseFloat(selected.getAttribute('data-price') || 0);
                }
            } else if (input.type === 'radio') {
                if (input.checked) total += parseFloat(input.getAttribute('data-price') || 0);
            } else if (input.type === 'checkbox') {
                if (input.checked) total += parseFloat(input.getAttribute('data-price') || 0);
            }
        });

        if (totalEl) totalEl.textContent = fmt(total, currency);
    }

    container.addEventListener('change', calculate);
    calculate();
}

// ── Public API ────────────────────────────────────────────────────────────

export function initPriceTotals() {
    initBundleTotal();
    initGroupedTotal();
    initCustomTotal();
}
