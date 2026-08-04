export function initThemeUi() {
  var header = document.querySelector(".gl-header");
  var announcementClose = document.querySelector(".gl-announcement-close");
  var menuToggle = document.querySelector(".gl-menu-toggle");
  var mobileMenu = document.querySelector(".gl-mobile-menu");
  var menuClose = document.querySelector(".gl-mobile-menu-close");
  var searchBtn = document.querySelector("[data-search-toggle]");
  var searchOverlay = document.querySelector(".gl-search-overlay");
  var animateElements = document.querySelectorAll(".gl-animate-in");

  // Initialize quick view modal
  initQuickViewModal();

  if (header) {
    var ticking = false;
    var updateHeaderScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 20);
      ticking = false;
    };

    window.addEventListener("scroll", function () {
      if (!ticking) {
        window.requestAnimationFrame(updateHeaderScroll);
        ticking = true;
      }
    }, { passive: true });

    updateHeaderScroll();
  }

  if (announcementClose) {
    announcementClose.addEventListener("click", function () {
      var bar = this.closest(".gl-announcement");

      if (bar) {
        bar.style.display = "none";
        sessionStorage.setItem("glamour_announcement_closed", "1");
      }
    });

    if (sessionStorage.getItem("glamour_announcement_closed") === "1") {
      var bar = document.querySelector(".gl-announcement");

      if (bar) {
        bar.style.display = "none";
      }
    }
  }

  // Mobile side drawer toggle & close with event delegation
  document.addEventListener("click", function (e) {
    var toggle = e.target.closest(".gl-menu-toggle");
    if (toggle) {
      e.preventDefault();
      var mobileMenu = document.querySelector(".gl-mobile-menu");
      var backdrop = document.querySelector(".gl-mobile-menu-backdrop");
      if (mobileMenu) {
        mobileMenu.classList.add("is-active");
        if (backdrop) backdrop.classList.add("is-active");
        document.body.style.overflow = "hidden";
      }
      return;
    }

    var closeBtn = e.target.closest(".gl-mobile-menu-close");
    var isBackdrop = e.target.classList.contains("gl-mobile-menu-backdrop");
    if (closeBtn || isBackdrop) {
      var mobileMenu = document.querySelector(".gl-mobile-menu");
      var backdrop = document.querySelector(".gl-mobile-menu-backdrop");
      if (mobileMenu) {
        mobileMenu.classList.remove("is-active");
        if (backdrop) backdrop.classList.remove("is-active");
        document.body.style.overflow = "";
      }
      return;
    }

    // Close mobile menu if clicked outside content
    var activeMenu = document.querySelector(".gl-mobile-menu.is-active");
    if (activeMenu && !activeMenu.contains(e.target) && !e.target.closest(".gl-menu-toggle")) {
      activeMenu.classList.remove("is-active");
      var backdrop = document.querySelector(".gl-mobile-menu-backdrop");
      if (backdrop) backdrop.classList.remove("is-active");
      document.body.style.overflow = "";
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      var mobileMenu = document.querySelector(".gl-mobile-menu.is-active");
      var backdrop = document.querySelector(".gl-mobile-menu-backdrop");
      if (mobileMenu) {
        mobileMenu.classList.remove("is-active");
        if (backdrop) backdrop.classList.remove("is-active");
        document.body.style.overflow = "";
      }
    }
  });

  if (searchBtn && searchOverlay) {
    searchBtn.addEventListener("click", function () {
      searchOverlay.classList.add("is-active");

      var input = searchOverlay.querySelector("input");

      if (input) {
        input.focus();
      }
    });

    searchOverlay.addEventListener("click", function (event) {
      if (event.target === searchOverlay) {
        searchOverlay.classList.remove("is-active");
      }
    });

    document.addEventListener("keydown", function (event) {
      if (
        event.key === "Escape" &&
        searchOverlay.classList.contains("is-active")
      ) {
        searchOverlay.classList.remove("is-active");
      }
    });
  }

  document.querySelectorAll(".gl-faq-question").forEach(function (button) {
    button.addEventListener("click", function () {
      var item = this.closest(".gl-faq-item");
      var isOpen = item.classList.contains("is-open");

      document
        .querySelectorAll(".gl-faq-item.is-open")
        .forEach(function (openItem) {
          openItem.classList.remove("is-open");
        });

      if (!isOpen) {
        item.classList.add("is-open");
      }
    });
  });

  /* Mobile nav dropdown accordion */
  document.addEventListener("click", function (e) {
    if (window.innerWidth > 767) return;

    var chevron = e.target.closest(".gl-nav-has-children > .gl-nav-link");

    if (!chevron) return;

    var li = chevron.closest(".gl-nav-has-children");

    if (!li) return;

    var href = chevron.getAttribute("href");

    if (!href || href === "#" || href === "") {
      e.preventDefault();
    }

    li.classList.toggle("open");
  });

  if (animateElements.length > 0 && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 },
    );

    animateElements.forEach(function (element) {
      observer.observe(element);
    });
  }
}

export function showToast(type, message) {
  if (!message) {
    return;
  }

  var container = document.querySelector(".gl-toast-stack");

  if (!container) {
    container = document.createElement("div");
    container.className = "gl-toast-stack";
    container.style.position = "fixed";
    container.style.top = "100px";
    container.style.right = "20px";
    container.style.zIndex = "9999999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "12px";
    container.style.maxWidth = "380px";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);
  }

  var toast = document.createElement("div");
  toast.style.pointerEvents = "auto";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "12px";
  toast.style.padding = "16px 20px";
  toast.style.borderRadius = "16px";
  toast.style.color = "#ffffff";
  toast.style.fontSize = "14px";
  toast.style.fontWeight = "500";
  toast.style.lineHeight = "1.4";
  toast.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.15), 0 8px 16px rgba(0, 0, 0, 0.1)";
  toast.style.backdropFilter = "blur(10px)";
  toast.style.border = "1px solid rgba(255, 255, 255, 0.1)";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(-20px) scale(0.95)";
  toast.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";

  // Set background and icon based on type
  var iconSvg = "";
  if (type === "error") {
    toast.style.background = "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
    iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else if (type === "warning") {
    toast.style.background = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)";
    iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  } else {
    toast.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
    iconSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  }

  // Create icon container
  var iconContainer = document.createElement("div");
  iconContainer.style.flexShrink = "0";
  iconContainer.style.width = "24px";
  iconContainer.style.height = "24px";
  iconContainer.style.display = "flex";
  iconContainer.style.alignItems = "center";
  iconContainer.style.justifyContent = "center";
  iconContainer.innerHTML = iconSvg;

  // Create message container
  var messageContainer = document.createElement("div");
  messageContainer.textContent = message;
  messageContainer.style.flex = "1";

  // Assemble toast
  toast.appendChild(iconContainer);
  toast.appendChild(messageContainer);

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(function () {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0) scale(1)";
  });

  // Animate out and remove
  window.setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-20px) scale(0.95)";

    window.setTimeout(function () {
      toast.remove();

      if (!container.children.length) {
        container.remove();
      }
    }, 300);
  }, 4000);
}

export function setButtonLoading(button, isLoading) {
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.style.pointerEvents = isLoading ? "none" : "";

  const isIconButton = button.getAttribute('data-gl-action') === 'wishlist-toggle' ||
                       button.getAttribute('data-gl-action') === 'compare-toggle' ||
                       button.getAttribute('aria-label') === 'favorite' ||
                       button.classList.contains('gl-header-action-btn') ||
                       button.classList.contains('icon-only') ||
                       (button.querySelector('svg') && !button.textContent.trim());

  if (isLoading) {
    button.classList.add('gl-loading');
    if (isIconButton) {
      button.style.opacity = '0.6';
    } else {
      if (!button.hasAttribute('data-original-text')) {
        button.setAttribute('data-original-text', button.innerHTML);
      }

      const lang = document.documentElement.lang || 'en';
      button.innerHTML = `
        <span class="gl-spinnerr"></span>
        <span class="gl-loading-text">${lang === 'ar' ? 'جاري الإضافة...' : 'Adding...'}</span>
      `;
    }
  } else {
    button.classList.remove('gl-loading');
    button.style.opacity = '';
    if (!isIconButton) {
      const originalText = button.getAttribute('data-original-text');
      if (originalText) {
        button.innerHTML = originalText;
      }
    }
  }
}

export function updateQuantityInput(button) {
  var wrapper = button.closest(".gl-product-quantity");

  if (!wrapper) {
    return;
  }

  var input = wrapper.querySelector('input[name="quantity"]');

  if (!input) {
    return;
  }

  var step = parseInt(input.getAttribute("step") || "1", 10) || 1;
  var min = parseInt(input.getAttribute("min") || "1", 10) || 1;
  var max = parseInt(input.getAttribute("max") || "9999", 10) || 9999;
  var value = parseInt(input.value, 10) || min;
  var nextValue = button.hasAttribute("data-qty-minus")
    ? value - step
    : value + step;

  nextValue = Math.min(max, Math.max(min, nextValue));

  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function activateProductTab(button) {
  var nav = button.closest(".gl-product-tabs-nav");
  var tabs = button.closest(".gl-product-tabs");

  if (!nav || !tabs) {
    return;
  }

  nav.querySelectorAll("button").forEach(function (item) {
    item.classList.remove("active");
    item.setAttribute("aria-selected", "false");
  });

  button.classList.add("active");
  button.setAttribute("aria-selected", "true");

  tabs.querySelectorAll(".gl-product-tab-content").forEach(function (panel) {
    panel.hidden = true;
  });

  var targetPanelId =
    button.getAttribute("aria-controls") || button.getAttribute("data-tab");
  var targetPanel = targetPanelId
    ? tabs.querySelector("#" + targetPanelId)
    : null;

  if (targetPanel) {
    targetPanel.hidden = false;
  }
}

export function activateGalleryThumb(thumb) {
  var gallery = thumb.closest(".gl-product-gallery");

  if (!gallery) {
    return;
  }

  var mainImg = gallery.querySelector(".gl-product-gallery-main img");

  if (mainImg) {
    mainImg.src = thumb.getAttribute("data-full") || thumb.src;
  }

  var thumbs = thumb.closest(".gl-product-gallery-thumbs");

  if (thumbs) {
    thumbs.querySelectorAll("img").forEach(function (image) {
      image.classList.remove("active");
    });
  }

  thumb.classList.add("active");
}

export function updateCartCount(count) {
  document.querySelectorAll('[data-cart-count]').forEach(function (element) {
    element.textContent = String(count);
    element.style.display = count > 0 ? '' : 'none';
  });
}

export function updateWishlistCount(count) {
  document.querySelectorAll('[data-wishlist-count]').forEach(function (element) {
    element.textContent = String(count);
    element.style.display = count > 0 ? "" : "none";
  });
}

export function initQuickViewModal() {
  var modal = document.getElementById("quickViewModal");
  var closeBtn = modal ? modal.querySelector(".gl-quick-view-close") : null;

  if (!modal || !closeBtn) {
    return;
  }

  // Close modal when clicking the close button
  closeBtn.addEventListener("click", function () {
    closeQuickViewModal();
  });

  // Close modal when clicking the overlay background
  modal.addEventListener("click", function (event) {
    if (event.target === modal) {
      closeQuickViewModal();
    }
  });

  // Close modal when pressing Escape key
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal.classList.contains("is-active")) {
      closeQuickViewModal();
    }
  });

  // Handle quick view button clicks
  document.addEventListener("click", function (event) {
    var button = event.target.closest('[data-gl-action="quick-view"]');
    if (button) {
      event.preventDefault();
      openQuickViewModal(button);
    }
  });
}

export function openQuickViewModal(button) {
  var modal = document.getElementById("quickViewModal");
  if (!modal || !button) {
    return;
  }

  // Get product data from button attributes
  var productName = button.getAttribute("data-product-name") || "";
  var productUrl = button.getAttribute("data-product-url") || "";
  var productImage = button.getAttribute("data-product-image") || "";
  var productPrice = button.getAttribute("data-product-price") || "";
  var productSpecialPrice =
    button.getAttribute("data-product-special-price") || "";
  var productImages = button.getAttribute("data-product-images") || "";
  var productSku = button.getAttribute("data-product-sku") || "";
  var productStock = button.getAttribute("data-product-stock") || "";
  var productRating =
    parseFloat(button.getAttribute("data-product-rating")) || 0;
  var productReviews =
    parseInt(button.getAttribute("data-product-reviews")) || 0;
  var productDescription =
    button.getAttribute("data-product-description") || "";
  var productShortDescription =
    button.getAttribute("data-product-short-description") || "";
  var productCategory = button.getAttribute("data-product-category-name") || "";
  var productAddToCartUrl =
    button.getAttribute("data-product-add-to-cart-url") || "";
  var productType = button.getAttribute("data-product-type") || "";

  // Update modal content
  var titleEl = modal.querySelector("#quickViewTitle");
  var categoryEl = modal.querySelector("#quickViewCategory");
  var imageEl = modal.querySelector("#quickViewImage");
  var priceEl = modal.querySelector("#quickViewPrice");
  var originalPriceEl = modal.querySelector("#quickViewOriginalPrice");
  var linkEl = modal.querySelector("#quickViewLink");
  var thumbnailsEl = modal.querySelector("#quickViewThumbnails");
  var skuEl = modal.querySelector("#quickViewSku strong");
  var stockEl = modal.querySelector("#quickViewStock strong");
  var ratingEl = modal.querySelector("#quickViewRating");
  var descriptionEl = modal.querySelector("#quickViewDescription p");
  var descriptionContainer = modal.querySelector("#quickViewDescription");

  if (titleEl) titleEl.textContent = productName;
  if (categoryEl) categoryEl.textContent = productCategory;
  if (priceEl) priceEl.textContent = productPrice;
  if (originalPriceEl) {
    if (productSpecialPrice) {
      originalPriceEl.textContent = productSpecialPrice;
      originalPriceEl.style.display = "inline";
    } else {
      originalPriceEl.style.display = "none";
    }
  }
  if (linkEl) linkEl.href = productUrl;

  // Update Meta Info (Stock and SKU on one line)
  var metaInfoEl = modal.querySelector("#quickViewMetaInfo");
  if (metaInfoEl) {
    var metaInfo = [];

    // Add stock info
    if (productStock) {
      var stockText = productStock === "in-stock" ? "In Stock" : "Out of Stock";
      metaInfo.push(
        'Availability: <strong class="' +
        productStock +
        '">' +
        stockText +
        "</strong>",
      );
    }

    // Add SKU info
    if (productSku) {
      metaInfo.push("SKU: <strong>" + productSku + "</strong>");
    }

    // Display meta info on one line
    if (metaInfo.length > 0) {
      metaInfoEl.innerHTML = metaInfo.join(" | ");
      metaInfoEl.style.display = "block";
    } else {
      metaInfoEl.style.display = "none";
    }
  }

  // Update Rating
  var starsContainer = ratingEl.querySelector(".gl-stars");
  var reviewsLink = ratingEl.querySelector(".gl-quick-view-reviews-link");

  if (starsContainer) {
    starsContainer.innerHTML = "";
    for (var i = 1; i <= 5; i++) {
      var star = document.createElement("span");
      star.className = i <= productRating ? "gl-star filled" : "gl-star";
      star.textContent = i <= productRating ? "★" : "☆";
      starsContainer.appendChild(star);
    }
  }


  reviewsLink.textContent =
    "(" +
    productReviews +
    " Reviews)";
  reviewsLink.href = productUrl + "#product-reviews";
  reviewsLink.style.display = "inline";


  ratingEl.style.display = "block";


  // Update Description
  var productDescriptionText = [productShortDescription, productDescription]
    .filter(Boolean)
    .join("\n\n");
  if (descriptionContainer && descriptionEl && productDescriptionText) {
    descriptionEl.textContent = productDescriptionText;
    descriptionContainer.style.display = "block";
  } else if (descriptionContainer) {
    descriptionContainer.style.display = "none";
  }

  // Update Share Links
  var facebookLink = modal.querySelector(".gl-share-facebook");
  var twitterLink = modal.querySelector(".gl-share-twitter");
  var whatsappLink = modal.querySelector(".gl-share-whatsapp");

  if (facebookLink) {
    facebookLink.href =
      "https://www.facebook.com/sharer/sharer.php?u=" +
      encodeURIComponent(productUrl);
  }
  if (twitterLink) {
    twitterLink.href =
      "https://twitter.com/intent/tweet?url=" +
      encodeURIComponent(productUrl) +
      "&text=" +
      encodeURIComponent(productName);
  }
  if (whatsappLink) {
    whatsappLink.href =
      "https://wa.me/?text=" +
      encodeURIComponent(productName + " " + productUrl);
  }

  // Handle images
  var images = [];
  if (productImages) {
    try {
      // Try to parse as JSON first
      images = JSON.parse(productImages);
    } catch (e) {
      // If JSON parsing fails, try to handle as single-quoted JSON or string
      try {
        // Replace single quotes with double quotes for valid JSON
        var fixedJson = productImages
          .replace(/'/g, '"')
          .replace(/&quot;/g, '"');
        images = JSON.parse(fixedJson);
      } catch (e2) {
        // If still fails, treat as single image URL
        images = productImages ? [productImages] : [];
      }
    }
  }

  // Ensure images is an array and filter out empty values
  if (!Array.isArray(images)) {
    images = images ? [images] : [];
  }
  images = images.filter(Boolean);

  // Add main image if no other images provided
  if (images.length === 0 && productImage) {
    images = [productImage];
  }

  // Use placeholder if no images at all
  if (images.length === 0) {
    images = ["https://azzrk.dev.gosharry.com/themes/shop/default/build/assets/medium-product-placeholder-INODB-G2.webp"];
  }

  if (images.length > 0) {
    // Set main image
    if (imageEl) {
      imageEl.src = images[0];
      imageEl.alt = productName;
    }

    // Clear and populate thumbnails
    if (thumbnailsEl) {
      thumbnailsEl.innerHTML = "";

      images.forEach(function (imageSrc, index) {
        var thumb = document.createElement("img");
        thumb.src = imageSrc;
        thumb.alt = productName + " " + (index + 1);
        thumb.className =
          "gl-quick-view-thumbnail" + (index === 0 ? " active" : "");
        thumb.style.width = "90px";
        thumb.style.height = "90px";
        thumb.style.objectFit = "cover";
        thumb.style.cursor = "pointer";
        thumb.style.border =
          "1px solid " +
          (index === 0 ? "var(--gl-primary, #E91E63)" : "transparent");
        thumb.style.borderRadius = "8px";
        thumb.style.transition = "all 0.3s ease";

        // Add click event to change main image
        thumb.addEventListener("click", function () {
          // Update main image
          if (imageEl) {
            imageEl.src = imageSrc;
            imageEl.alt = productName + " " + (index + 1);
          }

          // Update active thumbnail
          var allThumbs = thumbnailsEl.querySelectorAll(
            ".gl-quick-view-thumbnail",
          );
          allThumbs.forEach(function (t) {
            t.classList.remove("active");
            t.style.borderColor = "transparent";
          });
          thumb.classList.add("active");
          thumb.style.borderColor = "var(--gl-primary, #E91E63)";
        });

        // Add hover effect
        thumb.addEventListener("mouseenter", function () {
          if (!thumb.classList.contains("active")) {
            thumb.style.borderColor = "var(--gl-primary-light, #F06292)";
            thumb.style.transform = "scale(1.05)";
          }
        });

        thumb.addEventListener("mouseleave", function () {
          if (!thumb.classList.contains("active")) {
            thumb.style.borderColor = "transparent";
            thumb.style.transform = "scale(1)";
          }
        });

        thumbnailsEl.appendChild(thumb);
      });
    }
  }

  // Setup quick-add button and quantity controls
  var quickAddBtn = modal.querySelector("#quickViewQuickAdd");
  var quantityInput = modal.querySelector('input[name="quantity"]');
  var minusBtn = modal.querySelector("[data-qty-minus]");
  var plusBtn = modal.querySelector("[data-qty-plus]");

  // Set quick-add data attributes
  if (quickAddBtn) {
    quickAddBtn.setAttribute(
      "data-product-id",
      button.getAttribute("data-product-id"),
    );
    quickAddBtn.setAttribute("data-add-to-cart-url", productAddToCartUrl);

    // Handle out of stock
    if (productStock !== "in-stock") {
      quickAddBtn.disabled = true;
      if (productStock !== "in-stock") {
        quickAddBtn.innerHTML =
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg> Out of Stock';
      }
    }
  }

  // Reset quantity to 1 when modal opens
  if (quantityInput) {
    quantityInput.value = 1;
  }

  // Update quick-add button to use quantity from input when clicked
  if (quickAddBtn && quantityInput) {
    quickAddBtn.addEventListener("click", function (e) {
      // Store the current quantity in a data attribute
      var currentQuantity = quantityInput.value || "1";
      quickAddBtn.setAttribute("data-quantity", currentQuantity);
    });
  }

  // Setup share dropdown functionality
  var shareTrigger = modal.querySelector(".gl-share-trigger");
  var shareDropdown = modal.querySelector(".gl-share-dropdown");

  if (shareTrigger && shareDropdown) {
    // امسح كل الـ listeners القديمة بـ cloneNode
    var newTrigger = shareTrigger.cloneNode(true);
    shareTrigger.parentNode.replaceChild(newTrigger, shareTrigger);
    shareTrigger = newTrigger;

    shareTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      shareDropdown.classList.toggle("is-active");
      shareTrigger.classList.toggle("is-active");
    });
  }

  // Close dropdown when clicking modal content (but not on the dropdown itself)
  modal.addEventListener("click", function (e) {
    var shareDropdown = modal.querySelector(".gl-share-dropdown");
    var shareTrigger = modal.querySelector(".gl-share-trigger");

    if (shareDropdown && shareDropdown.classList.contains("is-active")) {
      if (
        !shareDropdown.contains(e.target) &&
        !shareTrigger.contains(e.target)
      ) {
        shareDropdown.classList.remove("is-active");
        shareTrigger.classList.remove("is-active");
      }
    }
  });

  // Show modal
  modal.classList.add("is-active");
  document.body.style.overflow = "hidden";
}

export function closeQuickViewModal() {
  var modal = document.getElementById("quickViewModal");
  if (!modal) {
    return;
  }

  modal.classList.remove("is-active");
  document.body.style.overflow = "";
}
window.addEventListener('load', function () {
  var loader = document.getElementById('gl-page-loader');
  if (!loader) return;
  loader.classList.add('gl-hidden');
});
