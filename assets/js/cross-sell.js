export function initCrossSell(apiClient, showToastFn, updateCartCountFn) {
    var section = document.getElementById('gl-cross-sell');

    if (!section || section.dataset.csInitialized) {
        return;
    }

    section.dataset.csInitialized = 'true';

    var crossSellUrl = section.dataset.apiCrossSell;
    var cartStoreUrl = section.dataset.apiCartStore;
    var productCardHtmlUrl = section.dataset.apiProductCardHtml;
    var productCardOrientation = section.dataset.productCardOrientation === 'horizontal' ? 'horizontal' : 'vertical';
    var productCardActions = section.dataset.productCardActions || 'view,addToCart,wishlist,compare';

    if (!crossSellUrl || !productCardHtmlUrl) {
        return;
    }

    var i18nEl = document.getElementById('gl-cross-sell-i18n');
    var t = {};

    try {
        t = i18nEl ? JSON.parse(i18nEl.textContent) : {};
    } catch (e) {
        t = {};
    }

    var loadingEl = document.getElementById('gl-cross-sell-loading');
    var gridEl = document.getElementById('gl-cross-sell-grid');

    function show(el) { if (el) el.style.display = ''; }
    function hide(el) { if (el) el.style.display = 'none'; }

    function renderProducts(products) {
        if (!products || products.length === 0) {
            // Keep section hidden if no cross-sell products
            hide(section);
            return;
        }

        var ids = products
            .map(function (product) {
                return product && (product.id || product.product_id);
            })
            .filter(Boolean);

        if (ids.length === 0) {
            hide(section);
            return;
        }

        var query = {
            orientation: productCardOrientation,
            actions: productCardActions,
        };

        ids.forEach(function (id, index) {
            query['ids[' + index + ']'] = id;
        });

        apiClient.get(productCardHtmlUrl, query)
            .then(function (response) {
                var payload = response && response.data !== undefined ? response.data : response;
                var cards = payload && payload.data !== undefined ? payload.data : payload;
                var html = ids.map(function (id) {
                    return cards && cards[String(id)] ? cards[String(id)] : '';
                }).join('');

                if (!html.trim()) {
                    hide(section);
                    return;
                }

                gridEl.innerHTML = html;
                show(section);
                hide(loadingEl);
                show(gridEl);
            })
            .catch(function () {
                hide(section);
            });
    }

    function loadCrossSell() {
        apiClient.get(crossSellUrl)
            .then(function (response) {
                // Bagisto returns ProductResource::collection wrapped in JsonResource
                var payload = response && response.data !== undefined ? response.data : response;
                var products = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.data) ? payload.data : []);
                renderProducts(products);
            })
            .catch(function () {
                hide(section);
            });
    }

    loadCrossSell();
}
