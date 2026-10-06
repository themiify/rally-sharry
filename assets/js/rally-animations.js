/**
 * ============================================================================
 * Rally Theme — Scroll Animations & Repeater Stagger Engine (rally-animations.js)
 * ============================================================================
 */

export function initRallyAnimations() {
  if (typeof window === 'undefined') return;
  if (window.__rallyAnimInitialized) return;
  window.__rallyAnimInitialized = true;

  var sectionSelectors = [
    '[data-ra-section]',
    '.sf-main-banner',
    '.sfa-about-us',
    '.sf-categories',
    '.rac-cinema',
    '.rab-brands',
    '.ras-statistics',
    '.raf-feature',
    '.ral-locations',
    '.rafaq-section',
    '.rar-reviews',
    '.ralo-limited-offers',
    '.rablog-section',
    '.RA_product_taps'
  ];

  var repeaterSelectors = [
    '.sfc__card',
    '.sfc__slide',
    '.rac__slide',
    '.rab__item',
    '.ras__card',
    '.raf__col--left .raf__text',
    '.raf__col--right .raf__text',
    '.ral__tab-btn',
    '.rafaq__item',
    '.rar__slide',
    '.ralo__slide',
    '.ralo__count-item',
    '.rablog__slide',
    '.ra-tab-btn',
    '.s-product-card-entry',
    '.ra-mobile-card-item'
  ];

  function setupRepeaters(sectionEl) {
    if (!sectionEl) return;
    repeaterSelectors.forEach(function (sel) {
      var items = sectionEl.querySelectorAll(sel);
      if (items.length > 0) {
        items.forEach(function (item, idx) {
          if (!item.style.getPropertyValue('--ra-idx')) {
            item.style.setProperty('--ra-idx', idx);
          }
        });
      }
    });
  }

  function activateSection(sectionEl) {
    if (!sectionEl || sectionEl.classList.contains('ra-animate-in')) return;
    setupRepeaters(sectionEl);
    sectionEl.classList.add('ra-animate-in');
  }

  function setupObserver() {
    var rawList = document.querySelectorAll(sectionSelectors.join(', '));
    if (!rawList.length) return;

    // Deduplicate
    var sections = [];
    rawList.forEach(function (el) {
      if (sections.indexOf(el) === -1) {
        sections.push(el);
      }
    });

    var vh = window.innerHeight || document.documentElement.clientHeight || 800;

    sections.forEach(function (sec) {
      setupRepeaters(sec);

      var isBanner = sec.classList.contains('sf-main-banner') ||
                     sec.getAttribute('data-ra-section') === 'main-banner';

      if (isBanner) {
        // Hero banner is never hidden; text animates smoothly via CSS
        activateSection(sec);
        return;
      }

      var rect = sec.getBoundingClientRect();
      var inView = rect.top < vh && rect.bottom > 0;

      if (inView) {
        // Already visible on screen — reveal immediately
        activateSection(sec);
      } else {
        // Below the fold — prepare for elegant scroll entrance
        sec.classList.add('ra-anim-init');
      }
    });

    if (!('IntersectionObserver' in window)) {
      sections.forEach(function (sec) {
        activateSection(sec);
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          activateSection(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, {
      root: null,
      rootMargin: '0px 0px -30px 0px',
      threshold: 0.05
    });

    sections.forEach(function (sec) {
      var isBanner = sec.classList.contains('sf-main-banner') ||
                     sec.getAttribute('data-ra-section') === 'main-banner';
      if (!isBanner && !sec.classList.contains('ra-animate-in')) {
        observer.observe(sec);
      }
    });

    // Fallback on scroll
    function onScrollCheck() {
      var currentVh = window.innerHeight || document.documentElement.clientHeight || 800;
      sections.forEach(function (sec) {
        if (!sec.classList.contains('ra-animate-in')) {
          var rect = sec.getBoundingClientRect();
          if (rect.top < currentVh - 20 && rect.bottom > 0) {
            activateSection(sec);
            try { observer.unobserve(sec); } catch (e) {}
          }
        }
      });
    }
    window.addEventListener('scroll', onScrollCheck, { passive: true });

    // Safety timeout: guarantee all sections are revealed
    setTimeout(function () {
      sections.forEach(function (sec) {
        activateSection(sec);
      });
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObserver, { once: true });
  } else {
    setupObserver();
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRallyAnimations, { once: true });
  } else {
    initRallyAnimations();
  }
}
