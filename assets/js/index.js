import { createStorefrontState } from './state.js';
import { createApiClient, unwrapPayload } from './api.js';
import {
    initThemeUi,
    showToast,
    setButtonLoading,
    updateCartCount,
    updateWishlistCount,
    updateQuantityInput,
    activateProductTab,
    activateGalleryThumb,
} from './ui.js';
import { validateProductForm } from './product-form.js';
import { initializeBookingForms } from './booking.js';
import { createStorefrontActions } from './actions.js';
import { initConfigurableProduct } from './configurable.js';
import { initCartPage } from './cart-page.js';
import { initCrossSell } from './cross-sell.js';
import { initPriceTotals } from './price-totals.js';
import { initProductGrid } from './product-grid.js';
import { initProductCardHydrator } from './product-card.js';
import { initCategoryCarousels } from './category-carousel.js';

// ── bootstrap ────────────────────────────────────────────────────────────

var storefrontState = createStorefrontState();
var apiClient = createApiClient();

var storefrontActions = createStorefrontActions({
    state: storefrontState,
    apiClient: apiClient,
    showToast: showToast,
    setButtonLoading: setButtonLoading,
    updateCartCount: updateCartCount,
    updateWishlistCount: updateWishlistCount,
    validateProductForm: function (form) {
        return validateProductForm(form, showToast);
    },
});

initThemeUi();
initHeaderDropdowns();

if (window.__themeMarketplaceDynamic && window.__themeMarketplaceDynamic.auth) {
    storefrontState.auth = window.__themeMarketplaceDynamic.auth;
    hydrateHeaderAuth(window.__themeMarketplaceDynamic.auth);
}

window.addEventListener('theme-marketplace:dynamic', function (event) {
    var detail = event.detail || {};

    if (detail.auth) {
        storefrontState.auth = detail.auth;
        hydrateHeaderAuth(detail.auth);
    }

    // Skip updating the cart badge when the cart page itself is open —
    // initCartPage() calls loadCart() which calls updateCartCount() after
    // fetching live data. Updating here would race and could reset the badge to 0.
    if (detail.cart && detail.cart.items_count !== undefined && !document.getElementById('gl-cart-page')) {
        updateCartCount(Number(detail.cart.items_count));
    }

    if (detail.wishlist && detail.wishlist.items_count !== undefined) {
        updateWishlistCount(Number(detail.wishlist.items_count));
    }

    storefrontActions.hydrateActionButtons();
    storefrontActions.loadWishlistState();
    storefrontActions.loadCompareState();
    initializeBookingForms(apiClient, showToast, unwrapPayload);
    initConfigurableProduct();
    initCartPage(apiClient, showToast, updateCartCount);
    initCrossSell(apiClient, showToast, updateCartCount);
    initPriceTotals();
    initProductGrid(apiClient, showToast, storefrontActions);
    initCategoryCarousels();
    initProductCardHydrator();
});

storefrontActions.hydrateActionButtons();
storefrontActions.loadWishlistState();
storefrontActions.loadCompareState();
initializeBookingForms(apiClient, showToast, unwrapPayload);
initConfigurableProduct();
initCartPage(apiClient, showToast, updateCartCount);
initCrossSell(apiClient, showToast, updateCartCount);
initPriceTotals();
initProductGrid(apiClient, showToast, storefrontActions);
initCategoryCarousels();
initProductCardHydrator();

function hydrateHeaderAuth(auth) {
    var isLoggedIn = !!(auth && auth.is_logged_in);
    var customer = auth && auth.customer ? auth.customer : {};
    var name = customer.name || (auth && auth.name) || '';

    document.querySelectorAll('[data-gl-auth-menu]').forEach(function (menu) {
        var guestEl = menu.querySelector('[data-gl-auth-guest]');
        var customerEl = menu.querySelector('[data-gl-auth-customer]');
        var nameEl = menu.querySelector('[data-gl-auth-customer-name]');

        if (guestEl) {
            guestEl.style.display = isLoggedIn ? 'none' : '';
        }

        if (customerEl) {
            customerEl.style.display = isLoggedIn ? '' : 'none';
        }

        if (nameEl) {
            nameEl.textContent = name ? ', ' + name : '';
        }
    });

    document.querySelectorAll('[data-gl-auth-href]').forEach(function (link) {
        var guestHref = link.getAttribute('data-auth-href-guest') || link.getAttribute('href') || '#';
        var authHref = link.getAttribute('data-auth-href-auth') || guestHref;
        link.setAttribute('href', isLoggedIn ? authHref : guestHref);
    });
}

function initHeaderDropdowns() {
    document.querySelectorAll('.gl-lang-dropdown').forEach(function (dropdown) {
        var toggle = dropdown.querySelector('.gl-lang-dropdown-toggle');
        if (!toggle || toggle.dataset.dropdownInitialized) return;
        toggle.dataset.dropdownInitialized = 'true';

        toggle.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();

            var expanded = toggle.getAttribute('aria-expanded') === 'true';
            closeHeaderDropdowns();
            toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        });
    });

    document.querySelectorAll('.user-dropdown-wrapper').forEach(function (wrapper) {
        var toggle = wrapper.querySelector('.user-dropdown-toggle');
        var menu = wrapper.querySelector('.user-dropdown-menu');
        if (!toggle || !menu || toggle.dataset.dropdownInitialized) return;
        toggle.dataset.dropdownInitialized = 'true';

        toggle.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();

            var isOpen = menu.classList.contains('show');
            closeHeaderDropdowns();
            menu.classList.toggle('show', !isOpen);
        });
    });

    if (!document.documentElement.dataset.headerDropdownsInitialized) {
        document.documentElement.dataset.headerDropdownsInitialized = 'true';
        document.addEventListener('click', closeHeaderDropdowns);
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeHeaderDropdowns();
            }
        });
    }
}

function closeHeaderDropdowns() {
    document.querySelectorAll('.gl-lang-dropdown-toggle[aria-expanded="true"]').forEach(function (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
    });

    document.querySelectorAll('.user-dropdown-menu.show').forEach(function (menu) {
        menu.classList.remove('show');
    });
}

document.addEventListener('submit', function (event) {
    var form = event.target.closest('form[data-gl-action="add-to-cart"]');

    if (!form) {
        return;
    }

    event.preventDefault();
    storefrontActions.submitCartForm(form, false);
});

document.addEventListener('click', function (event) {
    var actionElement = event.target.closest('[data-gl-action]');

    if (!actionElement) {
        return;
    }

    var action = actionElement.getAttribute('data-gl-action');

    if (action === 'buy-now') {
        var form = actionElement.closest('form[data-gl-action="add-to-cart"]');

        if (!form) {
            return;
        }

        event.preventDefault();
        storefrontActions.submitCartForm(form, true);

        return;
    }

    if (action === 'wishlist-toggle') {
        event.preventDefault();
        storefrontActions.toggleWishlist(actionElement);

        return;
    }

    if (action === 'compare-toggle') {
        event.preventDefault();
        storefrontActions.toggleCompare(actionElement);

        return;
    }

    if (action === 'quick-add') {
        event.preventDefault();
        var productId = actionElement.getAttribute('data-product-id');
        var addToCartUrl = actionElement.getAttribute('data-add-to-cart-url');

        if (!productId || !addToCartUrl) {
            return;
        }

        // Get quantity from data-quantity attribute (set by quick view modal)
        var quantity = actionElement.getAttribute('data-quantity') || '1';

        var formData = new FormData();
        formData.set('product_id', productId);
        formData.set('quantity', quantity);

        setButtonLoading(actionElement, true);

        apiClient.sendForm(addToCartUrl, formData)
            .then(function (responseData) {
                var payload = unwrapPayload(responseData) || {};
                var cartPayload = unwrapPayload(payload.data) || payload.data || {};
                var message = payload.message || responseData.message;

                if (message) {
                    showToast('success', message);
                }

                if (cartPayload && cartPayload.items_count !== undefined) {
                    updateCartCount(Number(cartPayload.items_count));
                } else if (payload && payload.items_count !== undefined) {
                    updateCartCount(Number(payload.items_count));
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
                setButtonLoading(actionElement, false);
            });
    }
});

document.addEventListener('click', function (event) {
    var quantityButton = event.target.closest('[data-qty-minus], [data-qty-plus]');

    if (quantityButton) {
        event.preventDefault();
        updateQuantityInput(quantityButton);

        return;
    }

    var tabButton = event.target.closest('.gl-product-tabs-nav button');

    if (tabButton) {
        event.preventDefault();
        activateProductTab(tabButton);

        return;
    }

    var galleryThumb = event.target.closest('.gl-product-gallery-thumbs img');

    if (galleryThumb) {
        event.preventDefault();
        activateGalleryThumb(galleryThumb);
    }
});
