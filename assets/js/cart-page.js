// Parsed ONCE at bundle-load time while the Liquid HTML is still in the DOM
// (the inline script runs synchronously, before Vue's window.load mount fires).
var _cartI18n = (function () {
  var el = document.getElementById("gl-cart-i18n");
  try {
    return el ? JSON.parse(el.textContent) : {};
  } catch (e) {
    return {};
  }
})();

// Document-level listeners attached exactly once; survive Vue DOM replacement.
var _docListenersAttached = false;
// Stable reference to loadCart() so subsequent initCartPage calls can trigger it.
var _cartLoadFn = null;

export function initCartPage(apiClient, showToastFn, updateCartCountFn) {
  var page = document.getElementById("gl-cart-page");
  if (!page) return;

  // Subsequent calls (e.g. from theme-marketplace:dynamic handler in index.js)
  // must NOT re-initialise — only reload if Vue reset the loading state.
  if (_docListenersAttached) {
    if (_cartLoadFn) {
      var lEl = document.getElementById("gl-cart-loading");
      if (lEl && lEl.style.display !== "none") _cartLoadFn();
    }
    return;
  }

  // Read routes from whichever #gl-cart-page is live at the moment of each call.
  // Vue may replace the element, but the URLs are identical—still correct to re-read.
  function getRoutes() {
    var el = document.getElementById("gl-cart-page");
    return el
      ? {
          index: el.dataset.apiCart,
          update: el.dataset.apiCartUpdate,
          destroy: el.dataset.apiCartDestroy,
          couponApply: el.dataset.apiCouponApply,
          couponRemove: el.dataset.apiCouponRemove,
        }
      : {};
  }

  // i18n captured at module load time — always present, unaffected by Vue hydration.
  var t = _cartI18n;
  var debounceTimers = {};
  var showOptions = t.show_options !== "false";

  // ── Always query fresh to avoid stale references after Vue hydration ──
  function loadingEl() {
    return document.getElementById("gl-cart-loading");
  }
  function contentEl() {
    return document.getElementById("gl-cart-content");
  }
  function emptyEl() {
    return document.getElementById("gl-cart-empty");
  }

  function esc(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function getImageUrl(baseImage) {
    if (!baseImage) return "";
    if (typeof baseImage === "string") return baseImage;
    return (
      baseImage.medium_image_url ||
      baseImage.large_image_url ||
      baseImage.small_image_url ||
      baseImage.original_image_url ||
      ""
    );
  }

  function unwrapCart(response) {
    var payload =
      response && response.data !== undefined ? response.data : response;
    if (
      payload &&
      typeof payload === "object" &&
      payload.data !== undefined &&
      payload.items === undefined
    ) {
      return payload.data;
    }
    return payload;
  }

  function show(el) {
    if (el) el.style.display = "";
  }
  function hide(el) {
    if (el) el.style.display = "none";
  }

  function renderCart(cart) {
    // Re-query every time so we always operate on the live DOM
    var loading = loadingEl();
    var content = contentEl();
    var empty = emptyEl();

    // Normalize items — handle both plain array and ResourceCollection-wrapped {data:[...]}
    var items = [];

    if (cart && cart.items) {
      items = Array.isArray(cart.items)
        ? cart.items
        : Array.isArray(cart.items.data)
          ? cart.items.data
          : [];
    }

    if (!cart || items.length === 0) {
      hide(content);
      hide(loading);
      show(empty);
      updateCartCountFn(0);
      return;
    }

    hide(loading);
    hide(empty);
    show(content);
    updateCartCountFn(cart.items_count || items.length);

    var itemsHtml = items
      .map(function (item) {
        var optionsHtml = "";

        if (showOptions && item.options && item.options.length > 0) {
          optionsHtml =
            '<div style="font-size:0.8rem;color:var(--gl-text-light);margin-top:0.25rem;">' +
            item.options
              .map(function (opt) {
                return (
                  esc(opt.attribute_name) +
                  ": " +
                  esc(opt.option_label || opt.option_value)
                );
              })
              .join(" · ") +
            "</div>";
        }

        var imgUrl = getImageUrl(item.base_image);

        return (
            '<tr data-cart-item-id="' + item.id + '">' +
            "<td>" +
            '<div class="gl-cart-item-info">' +
            '<div class="gl-cart-item-image">' +
            (imgUrl
                ? '<img src="' + esc(imgUrl) + '" alt="' + esc(item.name) + '" loading="lazy">'
                : '<div style="width:80px;height:80px;background:var(--gl-bg-soft);border-radius:12px;"></div>') +
            "</div>" +
            "<div>" +
            '<a href="/' + esc(item.product_url_key) + '" style="font-weight:600;color:var(--gl-heading);text-decoration:none;">' + esc(item.name) + "</a>" +
            '<div class="price-cart" style="font-weight:700;color:var(--gl-primary);margin-top:0.25rem;">' + esc(item.formatted_price) + "</div>" +
            optionsHtml +
            "</div>" +
            "</div>" +
            "</td>" +
            "<td>" +
            '<div class="gl-cart-qty-total">' +
            '<div class="gl-product-quantity" style="margin-bottom:0;">' +
            '<button type="button" data-cart-qty-minus="' + item.id + '">−</button>' +
            '<input type="number" value="' + item.quantity + '" min="1" data-cart-qty-input="' + item.id + '" style="width:50px;text-align:center;">' +
            '<button type="button" data-cart-qty-plus="' + item.id + '">+</button>' +
            "</div>" +
            '<span class="gl-cart-item-total-mobile" style="font-weight:700;">' + esc(item.formatted_total) + "</span>" +
            "</div>" +
            "</td>" +
            '<td class="gl-cart-item-total-desktop" style="font-weight:700;">' + esc(item.formatted_total) + "</td>" +
            "<td>" +
            '<button class="btn-remove" type="button" data-cart-remove="' + item.id + '" style="border:none;cursor:pointer;font-size:1.1rem;" title="' + esc(t.remove_item) + '">✕</button>' +
            "</td>" +
            "</tr>"
            );
      })
      .join("");

    var discountRow = "";

    if (cart.discount_amount && cart.discount_amount !== 0) {
      discountRow =
        '<div class="gl-cart-summary-row" style="color:var(--gl-success);">' +
        "<span>" +
        esc(t.discount) +
        "</span>" +
        "<span>" +
        esc(cart.formatted_discount_amount) +
        "</span>" +
        "</div>";
    }

    var taxRow = "";

    if (cart.tax_total && cart.tax_total > 0) {
      taxRow =
        '<div class="gl-cart-summary-row">' +
        "<span>" +
        esc(t.tax) +
        "</span>" +
        "<span>" +
        esc(cart.formatted_tax_total) +
        "</span>" +
        "</div>";
    }

    var shippingValue =
      cart.shipping_amount > 0
        ? esc(cart.formatted_shipping_amount)
        : esc(t.shipping_at_checkout);

    var couponHtml = "";
    var showCoupon = t.show_coupon !== "false";

    if (showCoupon) {
      if (cart.coupon_code) {
        couponHtml =
          '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem;background:var(--gl-bg-soft);border-radius:12px;margin-bottom:1rem;">' +
          '<span style="flex:1;font-size:0.9rem;">🎟 <strong>' +
          esc(cart.coupon_code) +
          "</strong></span>" +
          '<button type="button" data-coupon-remove style="color:var(--gl-error);background:none;border:none;cursor:pointer;font-size:0.85rem;">' +
          esc(t.remove) +
          "</button>" +
          "</div>";
      } else {
        couponHtml =
          '<div style="display:flex;gap:0.5rem;margin-bottom:1rem;">' +
          '<input type="text" id="gl-coupon-input" placeholder="' +
          esc(t.coupon_placeholder) +
          '" class="gl-input" style="flex:1;">' +
          '<button type="button" data-coupon-apply class="gl-btn gl-btn-outline btn-coupon" style="white-space:nowrap;">' +
          esc(t.apply) +
          "</button>" +
          "</div>";
      }
    }

    if (content) {
      content.innerHTML =
        '<div class="gl-cart-layout">' +
        "<div>" +
        '<table class="gl-cart-table">' +
        "<thead><tr>" +
        "<th>" +
        esc(t.product) +
        "</th>" +
        "<th>" +
        esc(t.qty) +
        "</th>" +
        "<th>" +
        esc(t.total) +
        "</th>" +
        "<th></th>" +
        "</tr></thead>" +
        "<tbody>" +
        itemsHtml +
        "</tbody>" +
        "</table>" +
        "</div>" +
        '<div class="gl-cart-summary">' +
        '<h3 style="font-size:1.1rem;margin-bottom:1rem;">' +
        esc(t.order_summary) +
        "</h3>" +
             '<div class="gl-cart-summary-row">' +
        "<span>" +
        esc(t.subtotal) +
        "</span>" +
        "<span>" +
        esc(cart.formatted_sub_total) +
        "</span>" +
        "</div>" +
        couponHtml +
        discountRow +
        taxRow +
        '<div class="gl-cart-summary-row">' +
        "<span>" +
        esc(t.shipping) +
        "</span>" +
        "<span>" +
        shippingValue +
        "</span>" +
        "</div>" +
        '<div class="gl-cart-summary-row total">' +
        "<span>" +
        esc(t.grand_total) +
        "</span>" +
        "<span>" +
        esc(cart.formatted_grand_total) +
        "</span>" +
        "</div>" +
        '<a href="/checkout/onepage" class="gl-btn gl-checkout" style="width:100%;margin-top:1.5rem;">' +
        esc(t.proceed_checkout) +
        "</a>" +
        "</div>" +
        "</div>";
    }
  }

  // When silent=true, the existing content stays visible while the fetch runs
  // (no spinner flash). Use this for in-place mutations (qty, remove, coupon).
  function loadCart(options) {
    var silent = options && options.silent;

    if (!silent) {
      show(loadingEl());
      hide(contentEl());
      hide(emptyEl());
    }

    apiClient
      .get(getRoutes().index)
      .then(function (response) {
        renderCart(unwrapCart(response));
      })
      .catch(function (err) {
        console.error("[cart-page] loadCart failed", err);
        if (!silent) hide(loadingEl());
        show(emptyEl());
      });
  }

  // Try to apply a mutation response directly as the new cart state.
  // Returns true if the response contained a valid cart (skips the extra GET).
  // Falls back to a silent reload when the API doesn't return full cart data.
  function applyCartResponse(response) {
    var cart = unwrapCart(response);

    // A valid cart payload has items array or an explicit items_count field.
    if (
      cart &&
      typeof cart === "object" &&
      (Array.isArray(cart.items) || cart.items_count !== undefined)
    ) {
      renderCart(cart);
      return true;
    }

    // null / empty → cart is now empty (e.g. last item removed)
    if (cart === null || cart === undefined) {
      renderCart(null);
      return true;
    }

    return false; // unknown shape — fall back to silent GET
  }

  function updateQuantity(itemId, qty) {
    if (qty < 1) return;

    var qtyPayload = {};
    qtyPayload[itemId] = qty;

    apiClient
      .sendJson(getRoutes().update, { qty: qtyPayload }, { method: "PUT" })
      .then(function (response) {
        if (response && response.message)
          showToastFn("success", response.message);
        // Use the updated cart from the response if available — avoids an
        // extra GET and prevents the loading-spinner re-render blink.
        if (!applyCartResponse(response)) loadCart({ silent: true });
      })
      .catch(function (err) {
        console.error("[cart-page] updateQuantity failed", err);
        showToastFn("error", t.update_error || "Unable to update cart");
        loadCart({ silent: true }); // revert input to actual server state
      });
  }

  function removeItem(itemId) {
    // Optimistically remove the row so the user sees instant feedback,
    // then reconcile with the server response for the updated totals.
    var row = document.querySelector('[data-cart-item-id="' + itemId + '"]');
    if (row) row.style.opacity = "0.4";

    apiClient
      .sendJson(
        getRoutes().destroy,
        { cart_item_id: Number(itemId) },
        { method: "DELETE" },
      )
      .then(function (response) {
        if (response && response.message)
          showToastFn("success", response.message);
        if (!applyCartResponse(response)) loadCart({ silent: true });
      })
      .catch(function (err) {
        console.error("[cart-page] removeItem failed", err);
        showToastFn("error", t.remove_error || "Unable to remove item");
        if (row) row.style.opacity = ""; // restore on failure
      });
  }

  function applyCoupon(code) {
    apiClient
      .sendJson(getRoutes().couponApply, { code: code }, { method: "POST" })
      .then(function (response) {
        if (response && response.message)
          showToastFn("success", response.message);
        if (!applyCartResponse(response)) loadCart({ silent: true });
      })
      .catch(function (error) {
        console.error("[cart-page] applyCoupon failed", error);
        var msg =
          (error && error.data && error.data.message) ||
          t.update_error ||
          "Unable to apply coupon";
        showToastFn("error", msg);
      });
  }

  function removeCoupon() {
    apiClient
      .sendJson(getRoutes().couponRemove, {}, { method: "DELETE" })
      .then(function (response) {
        if (response && response.message)
          showToastFn("success", response.message);
        if (!applyCartResponse(response)) loadCart({ silent: true });
      })
      .catch(function (error) {
        console.error("[cart-page] removeCoupon failed", error);
        var msg =
          (error && error.data && error.data.message) ||
          t.update_error ||
          "Unable to remove coupon";
        showToastFn("error", msg);
      });
  }

  // ── Event delegation at document level ────────────────────────────────
  // We delegate on document (not on `page`) so that these listeners survive
  // Vue's app.mount('#app') replacing the #gl-cart-page DOM node entirely.
  // The _docListenersAttached flag (module scope) ensures we only add once.
  if (!_docListenersAttached) {
    _docListenersAttached = true;

    document.addEventListener("click", function (event) {
      // Ignore events that didn't originate inside the cart page
      if (!event.target.closest("#gl-cart-page")) return;

      var target = event.target;

      // Qty minus
      var minusBtn = target.closest("[data-cart-qty-minus]");
      if (minusBtn) {
        var itemId = minusBtn.dataset.cartQtyMinus;
        var input = document.querySelector(
          '[data-cart-qty-input="' + itemId + '"]',
        );
        if (input) {
          var newQty = Math.max(1, parseInt(input.value, 10) - 1);
          input.value = newQty;
          clearTimeout(debounceTimers[itemId]);
          debounceTimers[itemId] = setTimeout(function () {
            updateQuantity(itemId, newQty);
          }, 600);
        }
        return;
      }

      // Qty plus
      var plusBtn = target.closest("[data-cart-qty-plus]");
      if (plusBtn) {
        var itemId = plusBtn.dataset.cartQtyPlus;
        var input = document.querySelector(
          '[data-cart-qty-input="' + itemId + '"]',
        );
        if (input) {
          var newQty = parseInt(input.value, 10) + 1;
          input.value = newQty;
          clearTimeout(debounceTimers[itemId]);
          debounceTimers[itemId] = setTimeout(function () {
            updateQuantity(itemId, newQty);
          }, 600);
        }
        return;
      }

      // Remove item
      var removeBtn = target.closest("[data-cart-remove]");
      if (removeBtn) {
        removeItem(removeBtn.dataset.cartRemove);
        return;
      }

      // Apply coupon
      if (target.closest("[data-coupon-apply]")) {
        var couponInput = document.getElementById("gl-coupon-input");
        if (couponInput && couponInput.value.trim()) {
          applyCoupon(couponInput.value.trim());
        }
        return;
      }

      // Remove coupon
      if (target.closest("[data-coupon-remove]")) {
        removeCoupon();
      }
    });

    // Qty direct-input change
    document.addEventListener("change", function (event) {
      if (!event.target.closest("#gl-cart-page")) return;

      var input = event.target.closest("[data-cart-qty-input]");
      if (!input) return;

      var itemId = input.dataset.cartQtyInput;
      var newQty = Math.max(1, parseInt(input.value, 10) || 1);
      input.value = newQty;
      clearTimeout(debounceTimers[itemId]);
      debounceTimers[itemId] = setTimeout(function () {
        updateQuantity(itemId, newQty);
      }, 400);
    });

    // External reload trigger (e.g. from cross-sell quick-add).
    // Dispatched on document so it always reaches this listener.
    document.addEventListener("gl:reload-cart", function () {
      if (_cartLoadFn && document.getElementById("gl-cart-page")) _cartLoadFn();
    });

    // After theme-marketplace:dynamic fires, Vue may have re-set the cart DOM
    // (loading spinner visible again). Only reload in that case — not blindly.
    window.addEventListener("theme-marketplace:dynamic", function () {
      if (_cartLoadFn) {
        var dynLEl = document.getElementById("gl-cart-loading");
        if (dynLEl && dynLEl.style.display !== "none") _cartLoadFn();
      }
    });
  }

  _cartLoadFn = loadCart;
  loadCart();
}