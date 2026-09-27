'use strict';

/**
 * Mirrors Webkul\GoSharryTheme\Support\CurrencyLabel for local preview.
 * SAR uses U+00EA (SaudiRiyalSymbol font) with LRI/PDI isolates.
 */

const SAR_SYMBOL = '\u00EA';
const BIDI_LRI = '\u2066';
const BIDI_PDI = '\u2069';

/**
 * Format a money amount the same way production core()->currency() does for SAR.
 *
 * @param {number|string} amount
 * @param {string} [currencyCode='SAR']
 * @returns {string}
 */
function formatMoney(amount, currencyCode) {
    const code = String(currencyCode || 'SAR').toUpperCase();
    const numeric = Number.parseFloat(amount);
    const value = Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';

    if (code !== 'SAR') {
        return `${value} ${code}`;
    }

    return `${BIDI_LRI}${SAR_SYMBOL} ${value}${BIDI_PDI}`;
}

module.exports = {
    SAR_SYMBOL,
    BIDI_LRI,
    BIDI_PDI,
    formatMoney,
};
