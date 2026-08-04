import { storeCompareItems } from './state.js';

export function createStorefrontActions(config) {
    var state = config.state;
    var apiClient = config.apiClient;
    var showToast = config.showToast;
    var setButtonLoading = config.setButtonLoading;
    var updateCartCount = config.updateCartCount;
    var updateWishlistCount = config.updateWishlistCount;
    var validateProductForm = config.validateProductForm;

    return {
        submitCartForm: submitCartForm,
        toggleWishlist: toggleWishlist,
        toggleCompare: toggleCompare,
        loadWishlistState: loadWishlistState,
        loadCompareState: loadCompareState,
        hydrateActionButtons: hydrateActionButtons,
    };

    function submitCartForm(form, isBuyNow) {
        var formData = new FormData(form);
        var submitButton = form.querySelector('button[type="submit"]');

        if (!validateProductForm(form)) {
            return;
        }

        if (!formData.get('quantity')) {
            formData.set('quantity', '1');
        }

        if (isBuyNow) {
            formData.set('is_buy_now', '1');
        }

        setButtonLoading(submitButton, true);

        apiClient.sendForm(form.getAttribute('action'), formData)
            .then(function (responseData) {
                var payload = unwrapPayload(responseData) || {};
                var cartPayload = unwrapPayload(payload.data) || payload.data || {};
                var message = payload.message || responseData.message;

                if (message) {
                    showToast('success', message);
                }

                // Check both unwrap levels — Bagisto may return items_count at
                // payload level { items_count } or nested cartPayload level.
                var newCount = (cartPayload && cartPayload.items_count !== undefined)
                    ? cartPayload.items_count
                    : (payload && payload.items_count !== undefined ? payload.items_count : null);

                if (newCount !== null) {
                    updateCartCount(Number(newCount));
                }

                if (payload.redirect || responseData.redirect) {
                    window.location.href = payload.redirect || responseData.redirect;
                }
            })
            .catch(function (error) {
                var errorData = error && error.data ? error.data : {};
                var message = errorData.message || 'Unable to add product to cart.';

                showToast('error', message);

                if (errorData.redirect_uri) {
                    window.location.href = errorData.redirect_uri;
                }
            })
            .finally(function () {
                setButtonLoading(submitButton, false);
            });
    }

    function toggleWishlist(button) {
        var productId = parseInt(button.getAttribute('data-product-id'), 10);
        var wishlistUrl = button.getAttribute('data-wishlist-url');
        var loginUrl = button.getAttribute('data-login-url');

        if (!productId || !wishlistUrl) {
            return;
        }

        if (!state.auth.is_logged_in) {
            if (loginUrl) {
                window.location.href = loginUrl;
            }

            return;
        }

        var formData = new FormData();
        formData.set('product_id', String(productId));

        setButtonLoading(button, true);

        apiClient.sendForm(wishlistUrl, formData)
            .then(function (responseData) {
                var payload = unwrapPayload(responseData) || {};
                var message = payload.message || responseData.message;
                var isActive = !state.wishlistItems.has(productId);

                if (isActive) {
                    state.wishlistItems.add(productId);
                } else {
                    state.wishlistItems.delete(productId);
                }

                hydrateActionButtons();
                if (typeof updateWishlistCount === 'function') {
                    updateWishlistCount(state.wishlistItems.size);
                }
                showToast('success', message);
            })
            .catch(function (error) {
                var errorData = error && error.data ? error.data : {};

                showToast('error', errorData.message || 'Unable to update wishlist.');
            })
            .finally(function () {
                setButtonLoading(button, false);
            });
    }

    function toggleCompare(button) {
        var productId = parseInt(button.getAttribute('data-product-id'), 10);
        var compareUrl = button.getAttribute('data-compare-url');
        var compareDestroyUrl = button.getAttribute('data-compare-destroy-url') || compareUrl;
        var isActive = state.compareItems.has(productId);
        var addedMessage = button.getAttribute('data-added-message') || 'Product added to compare.';
        var removedMessage = button.getAttribute('data-removed-message') || 'Product removed from compare.';
        var duplicateMessage = button.getAttribute('data-duplicate-message') || addedMessage;

        if (!productId || !compareUrl) {
            return;
        }

        if (!state.auth.is_logged_in) {
            if (isActive) {
                state.compareItems.delete(productId);
                showToast('success', removedMessage);
            } else {
                state.compareItems.add(productId);
                showToast('success', addedMessage);
            }

            storeCompareItems(state.compareItems);
            hydrateActionButtons();

            return;
        }

        var formData = new FormData();
        formData.set('product_id', String(productId));

        if (isActive) {
            formData.set('_method', 'DELETE');
        }

        setButtonLoading(button, true);

        apiClient.sendForm(isActive ? compareDestroyUrl : compareUrl, formData, {
            method: 'POST',
        })
            .then(function (responseData) {
                var payload = unwrapPayload(responseData) || {};
                var message = payload.message || responseData.message || (isActive ? removedMessage : addedMessage);

                if (isActive) {
                    state.compareItems.delete(productId);
                } else {
                    state.compareItems.add(productId);
                }

                hydrateActionButtons();
                showToast('success', message);
            })
            .catch(function (error) {
                var errorData = error && error.data ? error.data : {};
                var message = errorData.message || duplicateMessage;

                if (error && error.status === 422 && /compare/i.test(message)) {
                    state.compareItems.add(productId);
                    hydrateActionButtons();
                    showToast('warning', message);

                    return;
                }

                showToast('error', message || 'Unable to update compare list.');
            })
            .finally(function () {
                setButtonLoading(button, false);
            });
    }

    function loadWishlistState() {
        var wishlistButtons = document.querySelectorAll('[data-gl-action="wishlist-toggle"]');

        if (!wishlistButtons.length || state.wishlistLoaded || !state.auth.is_logged_in) {
            return;
        }

        var sampleButton = wishlistButtons[0];
        var indexUrl = sampleButton.getAttribute('data-wishlist-index-url');

        if (!indexUrl) {
            return;
        }

        apiClient.get(indexUrl).then(function (responseData) {
            var payload = unwrapPayload(responseData) || [];
            var items = Array.isArray(payload) ? payload : [];

            state.wishlistItems = new Set(items.map(function (item) {
                return parseInt(item.product && item.product.id ? item.product.id : item.product_id, 10);
            }).filter(Boolean));

            state.wishlistLoaded = true;
            hydrateActionButtons();
        }).catch(function () {
            state.wishlistLoaded = true;
        });
    }

    function loadCompareState() {
        var compareButtons = document.querySelectorAll('[data-gl-action="compare-toggle"]');

        if (!compareButtons.length || state.compareLoaded) {
            return;
        }

        if (!state.auth.is_logged_in) {
            state.compareLoaded = true;
            hydrateActionButtons();

            return;
        }

        var sampleButton = compareButtons[0];
        var indexUrl = sampleButton.getAttribute('data-compare-index-url');

        if (!indexUrl) {
            state.compareLoaded = true;

            return;
        }

        apiClient.get(indexUrl).then(function (responseData) {
            var payload = unwrapPayload(responseData) || [];
            var items = Array.isArray(payload) ? payload : [];

            state.compareItems = new Set(items.map(function (item) {
                return parseInt(item.id || item.product_id, 10);
            }).filter(Boolean));

            state.compareLoaded = true;
            hydrateActionButtons();
        }).catch(function () {
            state.compareLoaded = true;
        });
    }

    function hydrateActionButtons() {
        document.querySelectorAll('[data-gl-action="wishlist-toggle"]').forEach(function (button) {
            var productId = parseInt(button.getAttribute('data-product-id'), 10);
            var isActive = state.wishlistItems.has(productId);
            var svg = button.querySelector('svg');
            var activeLabel = button.getAttribute('data-active-label') || button.getAttribute('aria-label') || 'Wishlist';
            var inactiveLabel = button.getAttribute('data-inactive-label') || button.getAttribute('aria-label') || 'Wishlist';

            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.setAttribute('aria-label', isActive ? activeLabel : inactiveLabel);
            button.style.color = isActive ? 'var(--gl-accent, #ff0000b2)' : '';

            if (svg) {
                svg.setAttribute('fill', isActive ? 'currentColor' : 'none');
            }
        });

        document.querySelectorAll('[data-gl-action="compare-toggle"]').forEach(function (button) {
            var productId = parseInt(button.getAttribute('data-product-id'), 10);
            var isActive = state.compareItems.has(productId);
            var svg = button.querySelector('svg');
            var activeLabel = button.getAttribute('data-active-label') || button.getAttribute('aria-label') || 'Compare';
            var inactiveLabel = button.getAttribute('data-inactive-label') || button.getAttribute('aria-label') || 'Compare';

            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.setAttribute('aria-label', isActive ? activeLabel : inactiveLabel);
            button.style.color = isActive ? 'var(--gl-primary, #0f766e)' : '';

            if (svg) {
                svg.setAttribute('fill', isActive ? 'currentColor' : 'none');
            }
        });
    }
}

function unwrapPayload(responseData) {
    if (!responseData || typeof responseData !== 'object') {
        return responseData;
    }

    return Object.prototype.hasOwnProperty.call(responseData, 'data') ? responseData.data : responseData;
}
