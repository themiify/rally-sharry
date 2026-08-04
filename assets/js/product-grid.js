/**
 * product-grid.js — Glamour Pro v2.5
 *
 * Drives the product-grid section for category and search surfaces.
 * Mirrors the GoSharryTheme Vue component lifecycle but as plain JS:
 *   - Reads surface context from data-* attributes on the section element
 *   - Reads translations from #gl-pg-i18n JSON script block
 *   - Fetches products from /api/products with all active filter/sort params
 *   - Fetches attribute filters from /api/categories/attributes[?category_id=X]
 *   - Fetches price max from /api/categories/max-price/{categoryId}
 *   - Syncs sort + filter state back to the browser URL via history.pushState
 *   - Supports Load More (append) pagination
 *   - Calls storefrontActions.hydrateActionButtons() after each render
 */

// ── Sort option definitions (value matches Bagisto Toolbar param) ──────────

var SORT_OPTIONS = [
  { value: "created_at-desc", i18nKey: "sort_newest" },
  { value: "price-asc", i18nKey: "sort_price_low" },
  { value: "price-desc", i18nKey: "sort_price_high" },
  { value: "name-asc", i18nKey: "sort_name_az" },
];

// ── Public entry point ─────────────────────────────────────────────────────

export function initProductGrid(apiClient, showToast, storefrontActions) {
  var section = document.querySelector("[data-gl-product-grid]");
  if (!section) {
    return;
  }

  // Guard against double-init (called from both sync + dynamic event)
  if (section.dataset.productGridInitialized) {
    return;
  }
  section.dataset.productGridInitialized = "true";

  // ── Read config from DOM ───────────────────────────────────────────────

  var surface = section.dataset.surface || "category"; // 'category' | 'search'
  var categoryId = section.dataset.categoryId || "";
  var searchQuery = decodeURIComponent(section.dataset.searchQuery || "");
  var apiProducts = section.dataset.apiProducts;
  var apiProductCardHtml = section.dataset.apiProductCardHtml || "";
  var apiAttributes = section.dataset.apiAttributes;
  var apiMaxPrice = section.dataset.apiMaxPrice;
  var productCardOrientation =
    section.dataset.productCardOrientation === "horizontal"
      ? "horizontal"
      : "vertical";
  var productCardActions =
    section.dataset.productCardActions || "view,addToCart,wishlist,compare";

  // ── Read i18n strings from embedded JSON block ─────────────────────────

  var i18n = {};
  var i18nScript = document.getElementById("gl-pg-i18n");
  if (i18nScript) {
    try {
      i18n = JSON.parse(i18nScript.textContent);
    } catch (e) {
      console.warn("product-grid: failed to parse i18n JSON", e);
    }
  }

  function t(key, fallback) {
    return i18n[key] || fallback || key;
  }

  // ── DOM references ─────────────────────────────────────────────────────

  function dom(id) {
    return document.getElementById(id);
  }

  // ── State ──────────────────────────────────────────────────────────────

  var state = {
    sort: "", // e.g. 'created_at-desc'
    limit: 12,
    filters: {}, // { color: [11, 12], size: [5] }
    searchQuery: searchQuery,
    priceMin: 0,
    priceMax: 0, // 0 = unrestricted until fetched
    priceMaxCap: 0, // absolute max from API
    nextUrl: null,
    totalCount: 0,
    loadedCount: 0,
    isLoading: false,
  };

  // Debounce timer for price slider
  var priceDebounceTimer = null;
  var searchDebounceTimer = null;

  // Incremented on every replace-mode fetch so stale responses are discarded.
  var fetchSeq = 0;

  // ── Bootstrap ─────────────────────────────────────────────────────────

  initFromUrlParams();
  populateSortSelect();
  fetchFilters();
  fetchProducts(false); // initial replace-mode fetch
  wireSortSelect();
  wireProductSearch();
  wireLoadMore();
  wireClearFilters();
  wireMobileFilter();
  wireOrientationToggle();

  // Set initial grid orientation attribute
  var grid = dom("gl-products-grid");
  if (grid) {
    grid.dataset.orientation = productCardOrientation;
  }

  // ──────────────────────────────────────────────────────────────────────
  // URL param helpers
  // ──────────────────────────────────────────────────────────────────────

  function initFromUrlParams() {
    var params = new URLSearchParams(window.location.search);

    if (params.get("sort")) {
      state.sort = params.get("sort");
    }

    if (params.get("limit")) {
      var lim = parseInt(params.get("limit"), 10);
      if (!isNaN(lim) && lim > 0) {
        state.limit = lim;
      }
    }

    if (params.get("query")) {
      state.searchQuery = params.get("query");
    }

    if (params.get("orientation")) {
      productCardOrientation =
        params.get("orientation") === "horizontal" ? "horizontal" : "vertical";
    }

    if (params.get("price")) {
      var priceParts = params.get("price").split(",");
      if (priceParts.length === 2) {
        state.priceMin = parseFloat(priceParts[0]) || 0;
        state.priceMax = parseFloat(priceParts[1]) || 0;
      }
    }

    // Attribute filters — any key that isn't a reserved param
    var reserved = [
      "sort",
      "limit",
      "price",
      "query",
      "orientation",
      "new",
      "featured",
      "mode",
      "page",
      "locale",
      "suggest",
      "image-search",
    ];
    params.forEach(function (value, key) {
      if (reserved.indexOf(key) === -1 && value) {
        state.filters[key] = value
          .split(",")
          .map(function (v) {
            return parseInt(v, 10);
          })
          .filter(function (v) {
            return !isNaN(v);
          });
      }
    });
  }

  function buildQueryParams(append) {
    var params = new URLSearchParams();

    // Preserve existing non-filter URL keys (e.g. new=1, featured=1, locale)
    var existing = new URLSearchParams(window.location.search);
    var filterKeys = Object.keys(state.filters);
    var filterReserved = ["sort", "limit", "price", "page"];

    existing.forEach(function (value, key) {
      // Keep structural params that aren't filter/sort overrides
      if (
        filterReserved.indexOf(key) === -1 &&
        filterKeys.indexOf(key) === -1 &&
        key !== "price"
      ) {
        params.set(key, value);
      }
    });

    // Surface context
    if (surface === "category" && categoryId) {
      params.set("category_id", categoryId);
    }

    if (state.searchQuery) {
      params.set("query", state.searchQuery);
    }

    // Orientation
    if (productCardOrientation) {
      params.set("orientation", productCardOrientation);
    }

    // Sort
    if (state.sort) {
      params.set("sort", state.sort);
    }

    // Limit
    params.set("limit", String(state.limit));

    // Price range
    if (state.priceMax > 0 && state.priceMin >= 0) {
      params.set("price", state.priceMin + "," + state.priceMax);
    }

    // Attribute filters
    Object.keys(state.filters).forEach(function (code) {
      var ids = state.filters[code];
      if (ids && ids.length > 0) {
        params.set(code, ids.join(","));
      }
    });

    return params;
  }

  function syncUrl() {
    var params = buildQueryParamsForUrl();
    history.pushState(
      {},
      "",
      window.location.pathname +
        (params.toString() ? "?" + params.toString() : ""),
    );
  }

  function buildQueryParamsForUrl() {
    // URL-facing params (no category_id — that comes from the route slug)
    // Also strip params injected by GoSharryTheme's v-toolbar (mode, limit)
    // so they don't pollute our URL after Vue mounts on the same page.
    var params = new URLSearchParams();
    var existing = new URLSearchParams(window.location.search);
    var filterKeys = Object.keys(state.filters);
    var stripAlways = [
      "sort",
      "limit",
      "price",
      "mode",
      "category_id",
      "query",
    ];

    existing.forEach(function (value, key) {
      var managed = stripAlways.concat(filterKeys);
      if (managed.indexOf(key) === -1) {
        params.set(key, value);
      }
    });

    if (state.sort) {
      params.set("sort", state.sort);
    }

    if (state.searchQuery) {
      params.set("query", state.searchQuery);
    }

    if (productCardOrientation) {
      params.set("orientation", productCardOrientation);
    }

    if (state.priceMax > 0) {
      params.set("price", state.priceMin + "," + state.priceMax);
    }

    filterKeys.forEach(function (code) {
      var ids = state.filters[code];
      if (ids && ids.length > 0) {
        params.set(code, ids.join(","));
      }
    });

    return params;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Sort select
  // ──────────────────────────────────────────────────────────────────────

  function populateSortSelect() {
    var sortSelect = dom("gl-sort-select");
    if (!sortSelect) {
      return;
    }

    sortSelect.innerHTML = "";
    SORT_OPTIONS.forEach(function (opt) {
      var el = document.createElement("option");
      el.value = opt.value;
      el.textContent = t(opt.i18nKey, opt.value);
      if (state.sort === opt.value) {
        el.selected = true;
      }
      sortSelect.appendChild(el);
    });

    // Default to first option if no sort in URL
    if (!state.sort && SORT_OPTIONS.length > 0) {
      state.sort = SORT_OPTIONS[0].value;
      sortSelect.value = state.sort;
    }
  }

  function wireSortSelect() {
    var sortSelect = dom("gl-sort-select");
    if (!sortSelect) {
      return;
    }

    sortSelect.addEventListener("change", function () {
      state.sort = this.value;
      syncUrl();
      fetchProducts(false);
    });
  }

  function wireProductSearch() {
    var searchForm = dom("gl-product-search-form");
    var searchInput = dom("gl-product-search");
    if (!searchInput) {
      return;
    }

    searchInput.value = state.searchQuery || "";

    if (searchForm) {
      searchForm.addEventListener("submit", function (event) {
        event.preventDefault();
        applySearchQuery(searchInput.value);
      });
    }

    searchInput.addEventListener("input", function () {
      clearTimeout(searchDebounceTimer);
      var value = this.value;
      searchDebounceTimer = setTimeout(function () {
        applySearchQuery(value);
      }, 350);
    });
  }

  function applySearchQuery(value) {
    state.searchQuery = String(value || "").trim();
    state.nextUrl = null;
    syncUrl();
    fetchProducts(false);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Fetch products
  // ──────────────────────────────────────────────────────────────────────

  function fetchProducts(append) {
    // Append (Load More) blocks if already loading; replace always proceeds.
    if (append && state.isLoading) {
      return;
    }

    var mySeq = append ? fetchSeq : ++fetchSeq;
    state.isLoading = true;
    setGridLoading(true);

    var targetUrl = append && state.nextUrl ? state.nextUrl : null;
    var params = append && state.nextUrl ? null : buildQueryParams(append);

    var fetchPromise = targetUrl
      ? apiClient.get(targetUrl)
      : apiClient.get(apiProducts, paramsToObject(params));

    fetchPromise
      .then(function (response) {
        if (!append && mySeq !== fetchSeq) {
          return;
        } // stale — discard

        var products = response && response.data ? response.data : [];
        var links = response && response.links ? response.links : {};
        var meta = response && response.meta ? response.meta : {};

        state.nextUrl = links.next || null;
        state.totalCount = meta.total || 0;

        if (append) {
          state.loadedCount += products.length;
          return appendProductCards(products);
        } else {
          state.loadedCount = products.length;
          return replaceProductCards(products);
        }
      })
      .then(function () {
        if (!append && mySeq !== fetchSeq) {
          return;
        }

        updateToolbarCount();
        updateLoadMoreBtn();
      })
      .catch(function (err) {
        if (!append && mySeq !== fetchSeq) {
          return;
        }
        console.error("product-grid: fetch products failed", err);
        if (!append) {
          showEmptyState();
        }
      })
      .finally(function () {
        if (!append && mySeq !== fetchSeq) {
          return;
        }
        state.isLoading = false;
        setGridLoading(false);
        if (storefrontActions && storefrontActions.hydrateActionButtons) {
          storefrontActions.hydrateActionButtons();
        }
        if (storefrontActions && storefrontActions.loadWishlistState) {
          storefrontActions.loadWishlistState();
        }
        if (storefrontActions && storefrontActions.loadCompareState) {
          storefrontActions.loadCompareState();
        }
      });
  }

  function paramsToObject(urlSearchParams) {
    if (!urlSearchParams) {
      return {};
    }
    var obj = {};
    urlSearchParams.forEach(function (value, key) {
      obj[key] = value;
    });
    return obj;
  }

  function setGridLoading(loading) {
    var gridEl = dom("gl-products-grid");
    if (!gridEl) {
      return;
    }
    gridEl.dataset.loading = loading ? "true" : "false";
    gridEl.setAttribute("aria-busy", loading ? "true" : "false");
  }

  function replaceProductCards(products) {
    var gridEl = dom("gl-products-grid");
    if (!gridEl) {
      return Promise.resolve();
    }

    if (!products || products.length === 0) {
      showEmptyState();
      return Promise.resolve();
    }

    return fetchProductCardHtml(products).then(function (htmlList) {
      gridEl.innerHTML = htmlList.join("");
    });
  }

  function appendProductCards(products) {
    var gridEl = dom("gl-products-grid");
    if (!gridEl || !products || products.length === 0) {
      return Promise.resolve();
    }

    return fetchProductCardHtml(products).then(function (htmlList) {
      htmlList.forEach(function (html) {
        var div = document.createElement("div");
        div.innerHTML = html;
        var card = div.firstElementChild;
        if (card) {
          gridEl.appendChild(card);
        }
      });
    });
  }

  function fetchProductCardHtml(products) {
    if (!apiProductCardHtml) {
      return Promise.resolve([]);
    }

    var ids = products
      .map(function (product) {
        return product && (product.id || product.product_id);
      })
      .filter(Boolean);

    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    var query = {};
    ids.forEach(function (id, index) {
      query["ids[" + index + "]"] = id;
    });
    query.orientation = productCardOrientation;
    query.actions = productCardActions;

    return apiClient.get(apiProductCardHtml, query).then(function (response) {
      var map = response && response.data ? response.data : {};

      return ids
        .map(function (id) {
          return map[String(id)] || "";
        })
        .filter(function (html) {
          return html && html.trim();
        });
    });
  }

  function showEmptyState() {
    var gridEl = dom("gl-products-grid");
    if (!gridEl) {
      return;
    }
    gridEl.innerHTML =
      '<div class="gl-no-products">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>' +
      '<path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' +
      "</svg>" +
      "<p>" +
      t("no_products", "No products found.") +
      "</p>" +
      "</div>";
  }

  function updateToolbarCount() {
    var toolbarCount = dom("gl-toolbar-count");
    if (!toolbarCount) {
      return;
    }
    var showing = t("showing", "Showing");
    var of = t("of", "of");
    var products = t("products", "Products");
    toolbarCount.textContent =
      showing +
      " " +
      state.loadedCount +
      " " +
      of +
      " " +
      state.totalCount +
      " " +
      products;
    toolbarCount.style.visibility = "visible";
  }

  function updateLoadMoreBtn() {
    var loadMoreBtn = dom("gl-load-more");
    if (!loadMoreBtn) {
      return;
    }
    if (state.nextUrl && state.loadedCount < state.totalCount) {
      loadMoreBtn.style.display = "inline-flex";
      loadMoreBtn.disabled = false;
    } else {
      loadMoreBtn.style.display = "none";
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Fetch filters
  // ──────────────────────────────────────────────────────────────────────

  function fetchFilters() {
    if (!dom("gl-filter-groups") || !apiAttributes) {
      return;
    }

    // Never filter attributes by category_id — the API returns empty when
    // attributes are not explicitly linked to a category in the backend.
    // Fetch the global filterable attribute set instead.
    apiClient
      .get(apiAttributes, {})
      .then(function (response) {
        var attributes = response && response.data ? response.data : [];

        if (attributes.length === 0) {
          renderNoFilters();
          return;
        }

        // Fetch options for each attribute in parallel, then render
        var promises = attributes.map(function (attr) {
          if (attr.type === "price") {
            return fetchPriceMax(attr);
          }
          return fetchAttributeOptions(attr);
        });

        Promise.all(promises)
          .then(function (results) {
            renderFilterGroups(results);
          })
          .catch(function () {
            renderNoFilters();
          });
      })
      .catch(function () {
        renderNoFilters();
      });
  }

  function fetchAttributeOptions(attr) {
    var optionsUrl = apiAttributes + "/" + attr.id + "/options";
    return apiClient
      .get(optionsUrl, { page: 1 })
      .then(function (response) {
        var options = response && response.data ? response.data : [];
        var meta = response && response.meta ? response.meta : {};
        return {
          attr: attr,
          options: options,
          hasMore: meta.last_page && meta.last_page > 1,
          nextPage: 2,
          type: "select",
        };
      })
      .catch(function () {
        return { attr: attr, options: [], hasMore: false, type: "select" };
      });
  }

  function fetchPriceMax(attr) {
    var maxUrl = apiMaxPrice + (categoryId ? "/" + categoryId : "");
    return apiClient
      .get(maxUrl)
      .then(function (response) {
        var maxPrice =
          response && response.data && response.data.max_price
            ? parseFloat(response.data.max_price)
            : 0;
        state.priceMaxCap = maxPrice;

        // If no price filter in URL yet, set max from API
        if (state.priceMax === 0 && maxPrice > 0) {
          state.priceMax = maxPrice;
        }

        return {
          attr: attr,
          maxPrice: maxPrice,
          type: "price",
        };
      })
      .catch(function () {
        return { attr: attr, maxPrice: 0, type: "price" };
      });
  }

  function renderFilterGroups(groups) {
    var filterGroups = dom("gl-filter-groups");
    var clearFiltersBtn = dom("gl-clear-filters");
    if (!filterGroups) {
      return;
    }

    var hasActiveFilters =
      Object.keys(state.filters).length > 0 || state.priceMax > 0;
    if (clearFiltersBtn) {
      clearFiltersBtn.style.display = hasActiveFilters ? "inline" : "none";
    }

    filterGroups.innerHTML = "";

    groups.forEach(function (group) {
      if (!group || !group.attr) {
        return;
      }

      var groupEl = document.createElement("div");
      groupEl.className = "gl-filter-group all-group";

      if (group.type === "price") {
        groupEl.innerHTML = renderPriceFilterGroup(group);
        filterGroups.appendChild(groupEl);
        wirePriceSlider(groupEl, group);
      } else {
        groupEl.innerHTML = renderCheckboxFilterGroup(group);
        filterGroups.appendChild(groupEl);
        wireCheckboxGroup(groupEl, group);
        wireShowMore(groupEl, group);
      }

      // Wire toggle functionality for all filter groups
      wireFilterToggle(groupEl);
    });
  }

  function renderNoFilters() {
    var filterGroups = dom("gl-filter-groups");
    if (!filterGroups) {
      return;
    }
    filterGroups.innerHTML =
      '<div class="gl-filter-empty"><p>' +
      escHtml(t("no_filters", "No filters available.")) +
      "</p></div>";
  }

  // ── Checkbox filter group ──────────────────────────────────────────────

  function renderCheckboxFilterGroup(group) {
    var attr = group.attr;
    var options = group.options || [];
    var activeIds = state.filters[attr.code] || [];

    var optionsHtml = options
      .map(function (opt) {
        var checked = activeIds.indexOf(opt.id) !== -1 ? " checked" : "";
        return (
          '<li class="gl-filter-option">' +
          '<label class="gl-filter-label">' +
          '<input type="checkbox" class="gl-filter-checkbox"' +
          ' data-attr-code="' +
          escHtml(attr.code) +
          '"' +
          ' data-option-id="' +
          opt.id +
          '"' +
          checked +
          ">" +
          "<span>" +
          escHtml(opt.name) +
          "</span>" +
          "</label>" +
          "</li>"
        );
      })
      .join("");

    var showMoreHtml = group.hasMore
      ? '<button type="button" class="gl-filter-show-more" data-attr-id="' +
        attr.id +
        '" data-next-page="2">' +
        escHtml(t("show_more_options", "Show more")) +
        "</button>"
      : "";

    return (
      '<div class="gl-filter-group-header">' +
      '<h3 class="gl-filter-group-title">' +
      escHtml(attr.name) +
      "</h3>" +
      '<button type="button" class="gl-filter-toggle" aria-label="Toggle filter group">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M6 9l6 6 6-6"></path>' +
      "</svg>" +
      "</button>" +
      "</div>" +
      '<ul class="gl-filter-group-list">' +
      optionsHtml +
      "</ul>" +
      showMoreHtml
    );
  }

  function wireCheckboxGroup(groupEl, group) {
    groupEl
      .querySelectorAll(".gl-filter-checkbox")
      .forEach(function (checkbox) {
        checkbox.addEventListener("change", function () {
          var code = this.dataset.attrCode;
          var optionId = parseInt(this.dataset.optionId, 10);
          var current = state.filters[code] ? state.filters[code].slice() : [];

          if (this.checked) {
            if (current.indexOf(optionId) === -1) {
              current.push(optionId);
            }
          } else {
            current = current.filter(function (id) {
              return id !== optionId;
            });
          }

          if (current.length > 0) {
            state.filters[code] = current;
          } else {
            delete state.filters[code];
          }

          updateClearFiltersVisibility();
          syncUrl();
          fetchProducts(false);
        });
      });
  }

  function wireShowMore(groupEl, group) {
    var btn = groupEl.querySelector(".gl-filter-show-more");
    if (!btn) {
      return;
    }

    btn.addEventListener("click", function () {
      var attrId = this.dataset.attrId;
      var nextPage = parseInt(this.dataset.nextPage, 10) || 2;
      var btnEl = this;

      var optionsUrl = apiAttributes + "/" + attrId + "/options";
      apiClient
        .get(optionsUrl, { page: nextPage })
        .then(function (response) {
          var newOptions = response && response.data ? response.data : [];
          var meta = response && response.meta ? response.meta : {};
          var activeIds = state.filters[group.attr.code] || [];
          var list = groupEl.querySelector(".gl-filter-group-list");

          newOptions.forEach(function (opt) {
            var checked = activeIds.indexOf(opt.id) !== -1 ? " checked" : "";
            var li = document.createElement("li");
            li.className = "gl-filter-option";
            li.innerHTML =
              '<label class="gl-filter-label">' +
              '<input type="checkbox" class="gl-filter-checkbox"' +
              ' data-attr-code="' +
              escHtml(group.attr.code) +
              '"' +
              ' data-option-id="' +
              opt.id +
              '"' +
              checked +
              ">" +
              "<span>" +
              escHtml(opt.name) +
              "</span>" +
              "</label>";
            wireCheckboxGroup(li, group);
            if (list) {
              list.appendChild(li);
            }
          });

          var hasMore = meta.last_page && nextPage < meta.last_page;
          if (hasMore) {
            btnEl.dataset.nextPage = String(nextPage + 1);
          } else {
            btnEl.remove();
          }
        })
        .catch(function () {
          btnEl.remove();
        });
    });
  }

  function wireFilterToggle(groupEl) {
    var toggleBtn = groupEl.querySelector(".gl-filter-toggle");
    if (!toggleBtn) {
      return;
    }

    toggleBtn.addEventListener("click", function () {
      var isExpanded = groupEl.classList.contains("expanded");
      var list = groupEl.querySelector(".gl-filter-group-list");
      var priceWrap = groupEl.querySelector(".gl-price-slider-wrap");
      var showMoreBtn = groupEl.querySelector(".gl-filter-show-more");
      var arrow = toggleBtn.querySelector("svg");

      // Toggle expanded state
      if (isExpanded) {
        groupEl.classList.remove("expanded");
        groupEl.classList.add("collapsed");

        // Hide content
        if (list) list.style.display = "none";
        if (priceWrap) priceWrap.style.display = "none";
        if (showMoreBtn) showMoreBtn.style.display = "none";

        // Rotate arrow up
        if (arrow) arrow.style.transform = "rotate(-90deg)";
      } else {
        groupEl.classList.remove("collapsed");
        groupEl.classList.add("expanded");

        // Show content
        if (list) list.style.display = "block";
        if (priceWrap) priceWrap.style.display = "block";
        if (showMoreBtn) showMoreBtn.style.display = "inline-block";

        // Rotate arrow down
        if (arrow) arrow.style.transform = "rotate(0deg)";
      }
    });
  }

  // ── Price range filter ─────────────────────────────────────────────────

  function renderPriceFilterGroup(group) {
    var cap = group.maxPrice || 1000;
    var cMin = state.priceMin || 0;
    var cMax = state.priceMax || cap;

    return (
      '<div class="gl-filter-group-header">' +
      '<h3 class="gl-filter-group-title">' +
      escHtml(t("price_range", "Price Range")) +
      "</h3>" +
      '<button type="button" class="gl-filter-toggle" aria-label="Toggle filter group">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M6 9l6 6 6-6"></path>' +
      "</svg>" +
      "</button>" +
      "</div>" +
      '<div class="gl-price-slider-wrap">' +
      '<div class="gl-price-slider-values">' +
      '<span id="gl-price-val-min">' +
      formatPrice(cMin) +
      "</span>" +
      '<span id="gl-price-val-max">' +
      formatPrice(cMax) +
      "</span>" +
      "</div>" +
      '<div class="gl-price-slider" id="gl-price-slider" dir="ltr"' +
      ' data-cap="' +
      cap +
      '">' +
      '<div class="gl-price-slider-track">' +
      '<div class="gl-price-slider-fill" id="gl-price-slider-fill"></div>' +
      "</div>" +
      '<input type="range" id="gl-range-min" min="0" max="' +
      cap +
      '" value="' +
      cMin +
      '" step="1">' +
      '<input type="range" id="gl-range-max" min="0" max="' +
      cap +
      '" value="' +
      cMax +
      '" step="1">' +
      "</div>" +
      "</div>"
    );
  }

  function formatPrice(val) {
    // Simple formatting — mirrors formatted_price from the API (no currency symbol here)
    return Math.round(val);
  }

  function wirePriceSlider(groupEl, group) {
    var sliderEl = groupEl.querySelector("#gl-price-slider");
    var rangeMin = groupEl.querySelector("#gl-range-min");
    var rangeMax = groupEl.querySelector("#gl-range-max");
    var valMinEl = groupEl.querySelector("#gl-price-val-min");
    var valMaxEl = groupEl.querySelector("#gl-price-val-max");
    var fillEl = groupEl.querySelector("#gl-price-slider-fill");

    if (!rangeMin || !rangeMax || !sliderEl) {
      return;
    }

    var cap = parseFloat(sliderEl.dataset.cap) || 1000;

    function updateFill() {
      var lo = parseFloat(rangeMin.value);
      var hi = parseFloat(rangeMax.value);
      var pctLo = (lo / cap) * 100;
      var pctHi = (hi / cap) * 100;
      if (fillEl) {
        fillEl.style.left = pctLo + "%";
        fillEl.style.width = pctHi - pctLo + "%";
      }
      if (valMinEl) {
        valMinEl.textContent = formatPrice(lo);
      }
      if (valMaxEl) {
        valMaxEl.textContent = formatPrice(hi);
      }
    }

    updateFill();

    rangeMin.addEventListener("input", function () {
      var lo = parseFloat(rangeMin.value);
      var hi = parseFloat(rangeMax.value);
      if (lo > hi) {
        rangeMin.value = hi;
        lo = hi;
      }
      updateFill();
      debouncePriceChange(lo, hi);
    });

    rangeMax.addEventListener("input", function () {
      var lo = parseFloat(rangeMin.value);
      var hi = parseFloat(rangeMax.value);
      if (hi < lo) {
        rangeMax.value = lo;
        hi = lo;
      }
      updateFill();
      debouncePriceChange(lo, hi);
    });
  }

  function debouncePriceChange(priceMin, priceMax) {
    clearTimeout(priceDebounceTimer);
    priceDebounceTimer = setTimeout(function () {
      state.priceMin = priceMin;
      state.priceMax = priceMax;
      updateClearFiltersVisibility();
      syncUrl();
      fetchProducts(false);
    }, 400);
  }

  // ── Clear filters ──────────────────────────────────────────────────────

  function wireClearFilters() {
    var clearFiltersBtn = dom("gl-clear-filters");
    if (!clearFiltersBtn) {
      return;
    }

    clearFiltersBtn.addEventListener("click", function () {
      // Reset filter state
      state.filters = {};
      state.priceMin = 0;
      state.priceMax = state.priceMaxCap;

      // Uncheck all checkboxes
      var filterGroups = dom("gl-filter-groups");
      if (filterGroups) {
        filterGroups
          .querySelectorAll(".gl-filter-checkbox")
          .forEach(function (cb) {
            cb.checked = false;
          });
      }

      // Reset price slider
      var rangeMin = document.getElementById("gl-range-min");
      var rangeMax = document.getElementById("gl-range-max");
      var sliderEl = document.getElementById("gl-price-slider");
      var cap = sliderEl
        ? parseFloat(sliderEl.dataset.cap) || state.priceMaxCap
        : state.priceMaxCap;

      if (rangeMin) {
        rangeMin.value = 0;
      }
      if (rangeMax) {
        rangeMax.value = String(cap);
      }

      // Re-trigger fill update
      if (rangeMin) {
        rangeMin.dispatchEvent(new Event("input"));
      }

      updateClearFiltersVisibility();
      syncUrl();
      fetchProducts(false);
    });
  }

  function wireLoadMore() {
    var loadMoreBtn = dom("gl-load-more");
    if (!loadMoreBtn) {
      return;
    }

    loadMoreBtn.addEventListener("click", function () {
      if (state.isLoading || !state.nextUrl) {
        return;
      }
      fetchProducts(true);
    });
  }

  // ── Mobile Filter ──────────────────────────────────────────────────────

  function wireMobileFilter() {
    var mobileFilterToggle = dom("gl-mobile-filter-toggle");
    var mobileClose = dom("gl-mobile-close");
    var filterOverlay = dom("gl-filter-overlay");
    var filterSidebar = dom("gl-filter-sidebar");

    if (
      !mobileFilterToggle ||
      !mobileClose ||
      !filterOverlay ||
      !filterSidebar
    ) {
      return;
    }

    // Open mobile filter
    mobileFilterToggle.addEventListener("click", function () {
      openMobileFilter();
    });

    // Close mobile filter
    mobileClose.addEventListener("click", function () {
      closeMobileFilter();
    });

    // Close on overlay click
    filterOverlay.addEventListener("click", function () {
      closeMobileFilter();
    });

    // Close on escape key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && filterSidebar.classList.contains("active")) {
        closeMobileFilter();
      }
    });
  }

  function openMobileFilter() {
    var filterSidebar = dom("gl-filter-sidebar");
    var filterOverlay = dom("gl-filter-overlay");
    var body = document.body;

    if (filterSidebar && filterOverlay) {
      filterSidebar.classList.add("active");
      filterOverlay.classList.add("active");
      body.style.overflow = "hidden"; // Prevent body scroll
    }
  }

  function closeMobileFilter() {
    var filterSidebar = dom("gl-filter-sidebar");
    var filterOverlay = dom("gl-filter-overlay");
    var body = document.body;

    if (filterSidebar && filterOverlay) {
      filterSidebar.classList.remove("active");
      filterOverlay.classList.remove("active");
      body.style.overflow = ""; // Restore body scroll
    }
  }

  function updateClearFiltersVisibility() {
    var clearFiltersBtn = dom("gl-clear-filters");
    if (!clearFiltersBtn) {
      return;
    }
    var hasFilters =
      Object.keys(state.filters).length > 0 ||
      state.priceMin > 0 ||
      (state.priceMax > 0 && state.priceMax < state.priceMaxCap);
    clearFiltersBtn.style.display = hasFilters ? "inline" : "none";
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────────────

  function wireOrientationToggle() {
    var verticalBtn = dom("gl-orientation-vertical");
    var horizontalBtn = dom("gl-orientation-horizontal");

    if (!verticalBtn || !horizontalBtn) {
      return;
    }

    verticalBtn.addEventListener("click", function () {
      setOrientation("vertical");
    });

    horizontalBtn.addEventListener("click", function () {
      setOrientation("horizontal");
    });
  }

  function setOrientation(orientation) {
    if (productCardOrientation === orientation) {
      return;
    }

    productCardOrientation = orientation;

    // Update button states
    var verticalBtn = dom("gl-orientation-vertical");
    var horizontalBtn = dom("gl-orientation-horizontal");

    if (verticalBtn && horizontalBtn) {
      if (orientation === "vertical") {
        verticalBtn.classList.add("active");
        horizontalBtn.classList.remove("active");
      } else {
        horizontalBtn.classList.add("active");
        verticalBtn.classList.remove("active");
      }
    }

    // Update section data attribute
    var section = document.querySelector("[data-gl-product-grid]");
    if (section) {
      section.dataset.productCardOrientation = orientation;
    }

    // Update grid data attribute (for CSS selector)
    var grid = dom("gl-products-grid");
    if (grid) {
      grid.dataset.orientation = orientation;
    }

    // Sync URL and refetch products
    syncUrl();
    fetchProducts(false);
  }

  function escHtml(str) {
    if (str === null || str === undefined) {
      return "";
    }
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
