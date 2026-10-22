'use strict';

/**
 * Format a money amount using the currency code used by the preview context.
 *
 * @param {number|string} amount
 * @param {string} [currencyCode='SAR']
 * @returns {string}
 */
function formatMoney(amount, currencyCode) {
    const code = String(currencyCode || 'SAR').toUpperCase();
    const numeric = Number.parseFloat(amount);
    const value = Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';

    return `${value} ${code}`;
}

module.exports = {
    formatMoney,
};
