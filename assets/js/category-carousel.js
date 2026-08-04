'use strict';

import { initProductCardHydrator } from './product-card.js';

/**
 * category-carousel.js
 *
 * Hydrates the Category Carousel section: fetches products from
 * api_routes.products_index filtered by the selected category_id, renders
 * product card skeletons hydrated by product-card.liquid, and runs the carousel
 * (autoplay, arrows, dots, RTL-aware transform).
 *
 * The tenant picks ONE category in the customizer (type: category).
 * All products in that category are fetched client-side via ?category_id=X.
 * All API URLs come from data-* attributes pre-baked by Liquid.
 * Cart/wishlist/compare buttons use data-gl-action — handled by glamour-pro.js.
 */

export function initCategoryCarousels() {
    document.querySelectorAll('[data-section="category-carousel"]').forEach(function (sectionEl) {
        initSingleCarousel(sectionEl);
    });
}

function initSingleCarousel(sectionEl) {
    if (sectionEl.dataset.categoryCarouselInitialized) return;
    sectionEl.dataset.categoryCarouselInitialized = 'true';

    var carouselId = sectionEl.dataset.carouselId;
    var productsUrl = sectionEl.dataset.productsUrl;
    var categoryId = parseInt(sectionEl.dataset.categoryId, 10) || 0;
    var autoplay = sectionEl.dataset.autoplay !== 'false';
    var speed = parseInt(sectionEl.dataset.autoplaySpeed, 10) || 3000;
    var isRtl = sectionEl.dataset.isRtl === 'true';

    var productCardHtmlUrl = sectionEl.dataset.productCardHtmlUrl || '';
    var productCardOrientation = sectionEl.dataset.productCardOrientation === 'horizontal' ? 'horizontal' : 'vertical';
    var productCardActions = sectionEl.dataset.productCardActions || 'view,addToCart,wishlist,compare';

    var track = document.getElementById(carouselId + '-track');
    var dotsEl = document.getElementById(carouselId + '-dots');
    if (!track) return;

    var currentIndex = 0;
    var autoplayTimer;

    function getVisibleCount() {
        var vw = window.innerWidth;
        if (vw <= 640) return 1.5;
        if (vw <= 1024) return 3;
        return 4;
    }

    function renderDots(count) {
        if (!dotsEl) return;
        dotsEl.innerHTML = '';
        var pages = Math.max(1, Math.ceil(count - Math.floor(getVisibleCount()) + 1));
        for (var i = 0; i < pages; i++) {
            var btn = document.createElement('button');
            btn.className = 'gl-cc-dot' + (i === 0 ? ' active' : '');
            btn.dataset.index = i;
            btn.setAttribute('aria-label', 'Slide ' + (i + 1));
            btn.addEventListener('click', function () { goTo(parseInt(this.dataset.index, 10)); });
            dotsEl.appendChild(btn);
        }
    }

    function goTo(index) {
        clearTimeout(autoplayTimer);
        var totalCards = track.children.length;
        var visible = Math.floor(getVisibleCount());
        var maxIndex = Math.max(0, totalCards - visible);
        currentIndex = Math.min(Math.max(0, index), maxIndex);

        var firstCard = track.children[0];
        var cardWidth = firstCard ? firstCard.offsetWidth + 20 : 0; // 20px = gap
        var dir = isRtl ? 1 : -1;
        track.style.transform = 'translateX(' + (dir * currentIndex * cardWidth) + 'px)';

        if (dotsEl) {
            dotsEl.querySelectorAll('.gl-cc-dot').forEach(function (d, i) {
                d.classList.toggle('active', i === currentIndex);
            });
        }

        if (autoplay) {
            autoplayTimer = setTimeout(function () {
                goTo(currentIndex + 1 > maxIndex ? 0 : currentIndex + 1);
            }, speed);
        }
    }

    function wireArrows() {
        sectionEl.querySelectorAll('.gl-cc-arrow').forEach(function (btn) {
            if (btn.dataset.carouselArrowInitialized) return;
            btn.dataset.carouselArrowInitialized = 'true';
            btn.addEventListener('click', function () {
                goTo(currentIndex + (this.dataset.dir === 'prev' ? -1 : 1));
            });
        });
    }

    window.addEventListener('resize', function () { goTo(currentIndex); });

    function hydrateCards(products) {
        track.innerHTML = products.map(function (p) {
            var id = p && (p.id || p.product_id);
            if (!id) return '';
            return '<div class="gl-cc-card" style="flex:0 0 calc(25% - 1rem);min-width:200px;">'
                + '<div class="gl-product-card gl-product-card--' + productCardOrientation + ' gl-product-card--loading"'
                + ' data-gl-hydrate-product-id="' + id + '"'
                + ' data-product-cards-url="' + productCardHtmlUrl + '"'
                + ' data-product-card-orientation="' + productCardOrientation + '"'
                + ' data-product-card-actions="' + productCardActions + '">'
                + '<div class="gl-product-card-image"><div class="gl-product-placeholder gl-skeleton"></div></div>'
                + '<div class="gl-product-card-body">'
                + '<div class="gl-skeleton" style="height:1rem;border-radius:4px;margin-bottom:8px;"></div>'
                + '<div class="gl-skeleton" style="height:0.75rem;border-radius:4px;width:60%;"></div>'
                + '</div>'
                + '</div>'
                + '</div>';
        }).join('');
        renderDots(products.length);
        goTo(0);
        wireArrows();
        initProductCardHydrator();
    }

    if (categoryId && productsUrl) {
        fetch(productsUrl + '?category_id=' + categoryId, {
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        })
            .then(function (r) { return r.json(); })
            .then(function (json) {
                var list = (json.data && Array.isArray(json.data.data))
                    ? json.data.data
                    : (Array.isArray(json.data) ? json.data : []);
                if (list.length > 0) {
                    hydrateCards(list);
                } else {
                    renderDots(track.children.length);
                    goTo(0);
                    wireArrows();
                }
            })
            .catch(function () {
                renderDots(track.children.length);
                goTo(0);
                wireArrows();
            });
    } else {
        // No category selected — run carousel on Liquid-rendered placeholder cards
        renderDots(track.children.length);
        goTo(0);
        wireArrows();
    }
}
