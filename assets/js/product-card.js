(function countdownOfferTimers() {
    function parseDate(str) {
        if (!str) return null;
        var parts = str.split('-');
        if (parts.length !== 3) return null;
        return new Date(parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0') + 'T23:59:59');
    }
    function pad(n) { return n < 10 ? '0' + n : n; }
    function updateAll() {
        document.querySelectorAll('.offer-timer').forEach(function(timer) {
            var end = timer.dataset.end;
            var endDate = parseDate(end);
            
            // لو مفيش تاريخ للعرض، اخفي العداد خالص
            if (!endDate) {
                timer.style.display = 'none';
                return;
            }
            
            // لو فيه تاريخ، تأكد إن العداد ظاهر
            timer.style.display = 'flex';
            
            var now = new Date();
            var diff = endDate - now;
            var days = 0, hours = 0, minutes = 0, seconds = 0;
            if (diff > 0) {
                days = Math.floor(diff / (1000 * 60 * 60 * 24));
                hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
                minutes = Math.floor((diff / (1000 * 60)) % 60);
                seconds = Math.floor((diff / 1000) % 60);
            }
            var d = timer.querySelector('.countdown-days');
            var h = timer.querySelector('.countdown-hours');
            var m = timer.querySelector('.countdown-minutes');
            var s = timer.querySelector('.countdown-seconds');
            if (d) d.textContent = pad(days);
            if (h) h.textContent = pad(hours);
            if (m) m.textContent = pad(minutes);
            if (s) s.textContent = pad(seconds);
            
            // إذا انتهى العرض
            if (diff <= 0) {
                if (d) d.textContent = h.textContent = m.textContent = s.textContent = '00';
                var label = timer.querySelector('.offer-timer-label');
                if (label) label.textContent = 'انتهاء العرض';
                
                // إخفاء العداد وتاريخ النهاية
                var timerValues = timer.querySelector('.offer-timer-values');
                var timerEnd = timer.querySelector('.offer-timer-end');
                
                if (timerValues) timerValues.style.display = 'none';
                if (timerEnd) timerEnd.style.display = 'none';
            } else {
                // إذا العرض لسه شغال، تأكد إن كل حاجة ظاهرة
                var timerValues = timer.querySelector('.offer-timer-values');
                var timerEnd = timer.querySelector('.offer-timer-end');
                
                if (timerValues) timerValues.style.display = 'flex';
                if (timerEnd) timerEnd.style.display = 'block';
            }
        });
    }
    updateAll();
    setInterval(updateAll, 1000);
})();
'use strict';

/**
 * product-card.js
 *
 * Shared product card HTML builder used by all sections that render product
 * cards (category-carousel, product-spotlight, etc.).
 *
 * Liquid sections pre-bake all action URLs + i18n labels into data-* attrs on
 * the section element.  Buttons use data-gl-action so glamour-pro.js event
 * delegation handles cart / wishlist / compare with no extra wiring here.
 *
 * Usage:
 *   import { buildProductCardHtml } from './product-card.js';
 *
 *   const html = buildProductCardHtml(product, {
 *     addToCartUrl,
 *     wishlistUrl,
 *     wishlistIndexUrl,
 *     compareUrl,
 *     compareIndexUrl,
 *     compareDestroyUrl,
 *     loginUrl,
 *     addToCartLabel,
 *     addToWishlistLabel,
 *     removeFromWishlistLabel,
 *     addToCompareLabel,
 *     removeFromCompareLabel,
 *     saleLabel,
 *     newLabel,
 *     quickViewLabel,
 *     cardClass,        // extra CSS class string (optional)
 *     showActions,      // bool — default true
 *   });
 */

const SVG_CART = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';
const SVG_WISHLIST = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>';
const SVG_COMPARE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line></svg>';
const SVG_EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

/**
 * Resolve image URL from a Bagisto product object (handles multiple shapes).
 *
 * @param {object} p
 * @returns {string}
 */
export function getProductImageUrl(p) {
    return (p.base_image && (p.base_image.medium_image_url || p.base_image.small_image_url))
        || (p.images && p.images[0] && p.images[0].url)
        || '';
}

/**
 * Build the full product card HTML string.
 *
 * @param {object} p      - Product object from Bagisto shop API
 * @param {object} opts   - Label + URL options (all optional with empty fallbacks)
 * @returns {string}
 */
export function buildProductCardHtml(p, opts) {
    opts = opts || {};

    var cardClass = opts.cardClass || (opts.orientation === 'horizontal' ? 'gl-product-card-custom gl-product-card-horizontal-custom' : 'gl-product-card-custom gl-product-card-vertical-custom');
    var showActions = opts.showActions !== false;

    var addToCartUrl = opts.addToCartUrl || '';
    var wishlistUrl = opts.wishlistUrl || '';
    var wishlistIndexUrl = opts.wishlistIndexUrl || '';
    var compareUrl = opts.compareUrl || '';
    var compareIndexUrl = opts.compareIndexUrl || '';
    var compareDestroyUrl = opts.compareDestroyUrl || '';
    var loginUrl = opts.loginUrl || '';

    var addToCartLabel = opts.addToCartLabel || 'Add to Cart';
    var addToWishlistLabel = opts.addToWishlistLabel || 'Add to Wishlist';
    var removeFromWishlistLabel = opts.removeFromWishlistLabel || 'Remove from Wishlist';
    var addToCompareLabel = opts.addToCompareLabel || 'Add to Compare';
    var removeFromCompareLabel = opts.removeFromCompareLabel || 'Remove from Compare';
    var saleLabel = opts.saleLabel || 'Sale';
    var newLabel = opts.newLabel || 'New';
    var quickViewLabel = opts.quickViewLabel || 'Quick View';

    var isSimple = !p.type || p.type === 'simple' || p.type === 'virtual';
    var productUrl = p.url_key;
    var imageUrl = getProductImageUrl(p);
    var imageHtml = imageUrl
        ? '<a href="' + productUrl + '"><img src="' + imageUrl + '" alt="' + _esc(p.name || '') + '" loading="lazy"></a>'
        : '<div class="gl-product-placeholder"></div>';

    var badges = (p.is_new ? '<span class="gl-badge gl-badge-accent">' + newLabel + '</span>' : '')
        + ((p.special_price || p.on_sale) ? '<span class="gl-badge gl-badge-hot">' + saleLabel + '</span>' : '');

    var priceHtml = '<div class="gl-product-card-price">'
        + '<span class="current">' + (p.formated_price || p.formatted_price || p.price || '') + '</span>'
        + ((p.special_price || p.on_sale)
            ? '<span class="original">' + (p.formated_regular_price || p.formatted_regular_price || '') + '</span>'
            : '')
        + '</div>';

    var actionsHtml = '';
    if (showActions) {
        var cartBtn = isSimple
            ? '<button type="button" class="gl-product-card-action-btn" aria-label="' + addToCartLabel + '"'
                + ' data-gl-action="quick-add"'
                + ' data-product-id="' + p.id + '"'
                + ' data-add-to-cart-url="' + addToCartUrl + '">'
                + SVG_CART + '</button>'
            : '<a href="' + productUrl + '" class="gl-product-card-action-btn" aria-label="' + addToCartLabel + '">' + SVG_CART + '</a>';

        var wishBtn = '<button class="gl-product-card-action-btn" type="button"'
            + ' data-gl-action="wishlist-toggle"'
            + ' data-product-id="' + p.id + '"'
            + ' data-wishlist-url="' + wishlistUrl + '"'
            + ' data-wishlist-index-url="' + wishlistIndexUrl + '"'
            + ' data-login-url="' + loginUrl + '"'
            + ' data-active-label="' + removeFromWishlistLabel + '"'
            + ' data-inactive-label="' + addToWishlistLabel + '"'
            + ' aria-pressed="false"'
            + ' aria-label="' + addToWishlistLabel + '">'
            + SVG_WISHLIST + '</button>';

        var compareBtn = compareUrl
            ? '<button class="gl-product-card-action-btn" type="button"'
                + ' data-gl-action="compare-toggle"'
                + ' data-product-id="' + p.id + '"'
                + ' data-compare-url="' + compareUrl + '"'
                + ' data-compare-index-url="' + compareIndexUrl + '"'
                + ' data-compare-destroy-url="' + (compareDestroyUrl || compareUrl) + '"'
                + ' data-added-message="' + addToCompareLabel + '"'
                + ' data-removed-message="' + removeFromCompareLabel + '"'
                + ' aria-pressed="false"'
                + ' aria-label="' + addToCompareLabel + '">'
                + SVG_COMPARE + '</button>'
            : '';

        var viewBtn = '<a href="' + productUrl + '" class="gl-product-card-action-btn" aria-label="' + quickViewLabel + '">'
            + SVG_EYE + '</a>';

        actionsHtml = '<div class="gl-product-card-actions">' + viewBtn + cartBtn + wishBtn + compareBtn + '</div>';
    }

    var shortDescText = p.short_description_text || p.subtitle || '';
    var hoverIconsHtml = '<div class="gl-product-card-hover-icons">'
        + '<button class="gl-hover-icon-btn" type="button" data-gl-action="wishlist-toggle"'
        + ' data-product-id="' + p.id + '"'
        + ' data-wishlist-url="' + wishlistUrl + '"'
        + ' data-wishlist-index-url="' + wishlistIndexUrl + '"'
        + ' data-login-url="' + loginUrl + '"'
        + ' data-active-label="' + removeFromWishlistLabel + '"'
        + ' data-inactive-label="' + addToWishlistLabel + '"'
        + ' aria-label="' + addToWishlistLabel + '">' + SVG_WISHLIST + '</button>'
        + '<button class="gl-hover-icon-btn" type="button" data-gl-action="quick-view"'
        + ' data-product-id="' + p.id + '"'
        + ' data-product-name="' + _esc(p.name || '') + '"'
        + ' data-product-url="' + productUrl + '"'
        + ' data-product-image="' + imageUrl + '"'
        + ' data-product-price="' + (p.formated_price || p.formatted_price || p.price || '') + '"'
        + ' data-product-special-price="' + ((p.special_price || p.on_sale) ? (p.formated_regular_price || p.formatted_regular_price || '') : '') + '"'
        + ' data-product-sku="' + _esc(p.sku || '') + '"'
        + ' data-product-stock="' + (p.in_stock !== false ? 'in-stock' : 'out-of-stock') + '"'
        + ' data-product-rating="' + (p.avg_rating || 5) + '"'
        + ' data-product-description="' + _esc(p.description_text || '') + '"'
        + ' data-product-short-description="' + _esc(shortDescText) + '"'
        + ' data-product-category-name="' + _esc(p.category ? p.category.name : '') + '"'
        + ' data-product-add-to-cart-url="' + addToCartUrl + '"'
        + ' aria-label="' + quickViewLabel + '">' + SVG_EYE + '</button>'
        + (compareUrl ? '<button class="gl-hover-icon-btn" type="button" data-gl-action="compare-toggle"'
        + ' data-product-id="' + p.id + '"'
        + ' data-compare-url="' + compareUrl + '"'
        + ' data-compare-index-url="' + compareIndexUrl + '"'
        + ' data-compare-destroy-url="' + (compareDestroyUrl || compareUrl) + '"'
        + ' data-added-message="' + addToCompareLabel + '"'
        + ' data-removed-message="' + removeFromCompareLabel + '"'
        + ' aria-label="' + addToCompareLabel + '">' + SVG_COMPARE + '</button>' : '')
        + '</div>';

    var tags = p.tags || p.tag_items || [];
    if (!tags.length) {
        var pid = p.id || 1;
        var tagOptions = [
            ['#1995', '#جديدة'],
            ['#2024', '#ممتازة'],
            ['#2025', '#خصم'],
            ['#2023', '#حصري'],
            ['#1998', '#جديدة'],
            ['#2022', '#مستعملة']
        ];
        tags = tagOptions[pid % tagOptions.length];
    }
    var tagsHtml = '<div class="gl-product-card-tags">' +
        tags.map(function(t) {
            var text = (typeof t === 'object') ? (t.name || t.title || '') : String(t);
            if (text && text.indexOf('#') !== 0) text = '#' + text;
            return '<span class="tag-item">' + _esc(text) + '</span>';
        }).join('') +
        '</div>';

    return '<div class="gl-product-card' + (cardClass ? ' ' + cardClass : '') + '">'
        + '<div class="gl-product-card-image">'
        + imageHtml
        + (badges ? '<div class="gl-product-card-badges">' + badges + '</div>' : '')
        + hoverIconsHtml
        + actionsHtml
        + '</div>'
        + '<div class="gl-product-card-body">'
        + '<h3 class="gl-product-card-title"><a href="' + productUrl + '">' + _esc(p.name || '') + '</a></h3>'
        + priceHtml
        + tagsHtml
        + '</div>'
        + '</div>';
}

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Batch-hydrates every `[data-gl-hydrate-product-id]` skeleton on the page.
 *
 * Algorithm:
 *   1. Collect all uninitialized skeletons and mark them immediately.
 *   2. Group by `data-product-cards-url` (the batch endpoint URL stored on each skeleton).
 *   3. For each unique URL, fire ONE request: `?ids[]=1&ids[]=2&ids[]=3`.
 *      Response: { "data": { "3": "<html>", "1": "<html>", ... } }
 *   4. Swap each skeleton with the server-rendered card HTML.
 *
 * The card HTML is produced by product-card.liquid (Mode A) on the server --
 * the Liquid template is the single source of truth. JS is only a transport layer.
 *
 * Safe to call multiple times -- guards via `data-initialized`.
 */
export function initProductCardHydrator() {
    var pending = Array.from(
        document.querySelectorAll('[data-gl-hydrate-product-id]:not([data-initialized])')
    );

    if (pending.length === 0) return;

    // Mark all as initialised up-front to prevent double-fetch on re-entry
    pending.forEach(function (el) { el.dataset.initialized = 'true'; });

    // Group by batch endpoint URL
    var groups = {};
    pending.forEach(function (el) {
        var url = el.dataset.productCardsUrl || '';
        var id  = el.dataset.glHydrateProductId;
        var orientation = el.dataset.productCardOrientation || 'vertical';
        var actions = el.dataset.productCardActions || 'view,addToCart,wishlist,compare';
        if (!url || !id) {
            if (el.parentNode) el.parentNode.removeChild(el);
            return;
        }
        var groupKey = url + '::' + orientation + '::' + actions;
        if (!groups[groupKey]) groups[groupKey] = { url: url, orientation: orientation, actions: actions, entries: [] };
        groups[groupKey].entries.push({ id: id, el: el });
    });

    // One fetch per unique base URL
    Object.keys(groups).forEach(function (groupKey) {
        var group = groups[groupKey];
        var baseUrl = group.url;
        var entries = group.entries;
        var qs = entries.map(function (e) { return 'ids[]=' + encodeURIComponent(e.id); }).join('&');
        qs += '&orientation=' + encodeURIComponent(group.orientation);
        qs += '&actions=' + encodeURIComponent(group.actions);
        var url = baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + qs;

        fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (json) {
                var map = (json && json.data) || {};
                entries.forEach(function (entry) {
                    var html = map[String(entry.id)];
                    if (html && html.trim() && entry.el.parentNode) {
                        var tmp = document.createElement('div');
                        tmp.innerHTML = html.trim();
                        var newCard = tmp.firstElementChild;
                        if (newCard) {
                            entry.el.parentNode.replaceChild(newCard, entry.el);
                        }
                    } else if (entry.el.parentNode) {
                        entry.el.parentNode.removeChild(entry.el);
                    }
                });
            })
            .catch(function () {
                entries.forEach(function (entry) {
                    if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
                });
            });
    });
}