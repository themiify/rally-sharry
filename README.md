# Glamour PRO Theme

A luxurious makeup & cosmetics storefront theme — pink/white palette, full RTL support, bilingual Arabic/English.

---

## Quick Start

```bash
# From this directory (v2.4.5/)
npm install
npm run dev          # starts preview server + JS watcher
```

Open **http://localhost:3060** — use the toolbar to switch pages and locales.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | **Daily development** — preview server (`http://localhost:3060`) + JS watcher in parallel. Edit `.liquid` / `.css` / `.js` and the browser auto-refreshes. |
| `npm run build` | **One-shot JS build** — bundles `assets/js/index.js` → `assets/js/glamour-pro.js` (minified). Use after pulling changes or to test the bundle. |
| `npm run pack` | **Release** — production JS build + creates `glamour-pro.zip` (flat, upload-ready). Only the files the platform needs are included. |

---

## Project Structure

```
v2.4.5/
├── package.json                   ← single package.json — run npm install here
├── build.mjs                      ← JS bundler + pack script (esbuild)
├── theme.json                     ← theme manifest, settings schema, css_tokens
├── layout.liquid                  ← ignored by platform (Bagisto uses its own shell)
├── sections/                      ← ALL UI lives here — one .liquid file per section
├── locales/
│   ├── en.json                    ← English translation strings
│   └── ar.json                    ← Arabic translation strings
├── assets/
│   ├── css/
│   │   ├── glamour-pro.css           ← theme stylesheet — edit directly, ships in zip
│   │   └── sharry.css                ← platform bridge file — commit as-is, ships in zip
│   └── js/
│       ├── index.js                  ← entry point (ES6 source, dev only, excluded from zip)
│       ├── state.js, api.js, ui.js, actions.js, ...  ← source modules
│       └── glamour-pro.js            ← COMPILED IIFE bundle — commit this, ships in zip
└── preview/                       ← local dev server (excluded from zip)
    ├── server.js
    └── mock/
        ├── context.js             ← mirrors DataContextBuilder.php
        └── api.js                 ← mock API endpoints
```

**What ships in the zip** (everything else is excluded):
`theme.json`, `layout.liquid`, `sections/`, `locales/`, `assets/css/glamour-pro.css`, `assets/css/sharry.css`, `assets/js/glamour-pro.js`

---

## CSS Variables — `--gl-*` Contract

The platform injects a `:root { ... }` block **before** `glamour-pro.css`. This block is built from `theme.json` by `ThemeConfigReader.php`.

**Rule: CSS never declares `--gl-*` variables. It only uses them via `var(--gl-primary)` etc.**

### Tenant-settable (from `theme.json` settings, overridable via the admin panel)

| CSS Variable | Setting ID | Default |
|---|---|---|
| `--gl-primary` | `primary_color` | `#E91E63` |
| `--gl-secondary` | `secondary_color` | — |
| `--gl-accent` | `accent_color` | — |
| `--gl-bg` | `background_color` | `#FFFFFF` |
| `--gl-text` | `text_color` | — |
| `--gl-heading` | `heading_color` | — |
| `--gl-header-bg` | `header_bg` | — |
| `--gl-font-heading` | `heading_font` | `'Cairo', serif` |
| `--gl-font-body` | `body_font` | `'Cairo', sans-serif` |
| `--gl-font-arabic` | `arabic_font` | — |
| `--gl-font-size` | `base_font_size` | `16px` |
| `--gl-radius` | `border_radius` | — |
| `--gl-container` | `container_width` | — |

### Computed from `primary_color` (auto-generated, not settable)

| CSS Variable | Derivation |
|---|---|
| `--gl-primary-light` | primary +20% brightness |
| `--gl-primary-dark` | primary −15% brightness |
| `--gl-box-shadow` | primary −5% brightness |
| `--gl-box-shadow-light` | primary +10% brightness |

### Fixed design tokens (from `theme.json` `css_tokens` — edit there to change)

| CSS Variable | Default Value |
|---|---|
| `--gl-bg-alt` | `#FFF8FA` |
| `--gl-bg-dark` | `#1A1A2E` |
| `--gl-border` | `#F0E6EA` |
| `--gl-text-light` | `#777777` |
| `--gl-radius-sm` | `8px` |
| `--gl-radius-lg` | `20px` |
| `--gl-radius-full` | `999px` |

### RTL font override (auto-injected)

```css
[dir="rtl"] {
    --gl-font-body:    '<arabic_font>', sans-serif;
    --gl-font-heading: '<arabic_font>', sans-serif;
}
```

To change any fixed token value, edit the `css_tokens` block in `theme.json` — no PHP changes needed.

---

## Adding Tailwind CSS (Optional)

Tailwind is not included by default. If the Themify team wants to use utility classes (`flex`, `gap-4`, `rounded-lg`, etc.) in `.liquid` files, follow these steps.

### 1. Install

```bash
npm install --save-dev tailwindcss autoprefixer postcss
```

### 2. Create config files

**`tailwind.config.js`** — tells Tailwind which files to scan for used classes:
```js
module.exports = {
    content: [
        './layout.liquid',
        './sections/**/*.liquid',
        './assets/js/*.js',
    ],
    theme: { extend: {} },
    plugins: [],
};
```

**`postcss.config.js`**:
```js
module.exports = {
    plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

### 3. Create the source CSS file

Create `assets/css/src/glamour-pro.src.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* paste the full contents of assets/css/glamour-pro.css here */
```

### 4. Update `package.json` scripts

```json
"dev":   "concurrently ... \"tailwindcss -i assets/css/src/glamour-pro.src.css -o assets/css/glamour-pro.css --watch\" \"node build.mjs --watch\"",
"build": "tailwindcss -i assets/css/src/glamour-pro.src.css -o assets/css/glamour-pro.css --minify && node build.mjs",
"pack":  "npm run build && node build.mjs --pack"
```

The zip still ships only `assets/css/glamour-pro.css` (the compiled output) — `assets/css/src/` is excluded automatically.

---

### Tailwind utilities vs `--gl-*` variables — how they interact

Tailwind and `--gl-*` variables serve **different purposes** and do not conflict:

| | Tailwind utilities | `--gl-*` variables |
|---|---|---|
| **What they control** | Layout, spacing, typography scale, responsive breakpoints | Brand colors, fonts, radius, container width |
| **Set by** | You (hard-coded in markup) | Platform at runtime from `theme.json` + tenant admin panel |
| **Customizable per tenant** | No | Yes (colors, fonts) / No (fixed tokens) |
| **When resolved** | Build time (static CSS classes) | Runtime (injected `:root` block before your CSS) |

**Rules when using both:**

- **Never use Tailwind color utilities** (`bg-pink-500`, `text-red-600`) for brand colors — use `var(--gl-primary)` etc. via inline styles or custom CSS classes. Tailwind colors are static; `--gl-*` colors change per tenant.
- **Use Tailwind freely** for layout (`flex`, `grid`, `gap-*`, `p-*`, `rounded-*`) and responsive breakpoints — these don't overlap with `--gl-*`.
- **`--gl-radius`** (tenant-settable) vs Tailwind `rounded-*` (static) — pick one per element. If the tenant should control the radius, use `style="border-radius: var(--gl-radius)"` or a custom CSS class. If it's always fixed, Tailwind `rounded-lg` is fine.
- **`--gl-container`** controls `max-width` for the main container. If you use Tailwind's `container` class, it will conflict — use `.gl-container` (already defined in `glamour-pro.css`) instead.

**Example — correct pattern:**
```html
<!-- ✅ Layout via Tailwind, brand color via --gl-* -->
<div class="flex items-center gap-4 p-6">
    <button class="px-6 py-3 font-semibold rounded-full"
            style="background: var(--gl-primary); color: #fff;">
        Shop Now
    </button>
</div>

<!-- ❌ Wrong — static color, breaks tenant customization -->
<button class="bg-pink-500 text-white px-6 py-3 rounded-full">Shop Now</button>
```

---

## theme.json

The theme manifest controls everything the platform reads at install and runtime:

- **`settings`** — tenant-configurable settings (colors, fonts, layout). Rendered as UI controls in the admin panel. Defaults are injected as `--gl-*` CSS variables.
- **`css_tokens`** — fixed design tokens not exposed to tenants. Also injected as `--gl-*` CSS variables.
- **`sections`** — registry of all sections with their settings schema. Each entry maps to a `sections/{slug}.liquid` file.
- **`page_types`** — declares which page types the theme supports (home, product, category, etc.)

---

## Sections

All UI lives in `sections/*.liquid`. No `templates/` folder — this is a sections-only architecture.

Access data in sections:
```liquid
{{ theme.primary_color }}          ← theme-level settings
{{ section.settings.show_title }}  ← section-level settings
{{ shop.name }}                    ← store data
{{ product.name }}                 ← page-specific data
{{ translations.product.add_to_cart }}  ← translated string from locales/
```

---

## Adding a New Section — Complete Checklist

Follow these steps every time you add a section. Skip none — each one is required for the section to work in preview **and** in production.

### Step 1 — Create the Liquid file

Create `sections/{your-slug}.liquid`. Use an existing section as a reference (`featured-products.liquid` for product grids, `hero-banner.liquid` for full-width banners).

Minimum skeleton:
```liquid
{% assign is_rtl = request.is_rtl %}
{% assign heading = section.settings.heading | default: 'My Section' %}

<section
  class="gl-section gl-my-section"
  data-section="your-slug"
  data-add-to-cart-url="{{ api_routes.cart_store }}"
  data-wishlist-url="{{ api_routes.wishlist_store }}"
  style="..."
>
  <div class="gl-container">
    <h2>{{ heading }}</h2>
    <!-- section content here -->
  </div>
</section>
```
CSS goes in `assets/css/glamour-pro.css`. JS goes in `assets/js/your-slug.js` (see Step 4).

**Rules for the `.liquid` file:**
- **No `<style>` blocks in Liquid.** All CSS must live in `assets/css/glamour-pro.css`. Inline styles in Liquid are stripped or deduped by the platform and break when the section is rendered multiple times.
- **No `<script>` blocks in Liquid.** All JS must live in a dedicated `assets/js/{section-slug}.js` module, exported as a named `init*` function, and imported + called in `assets/js/index.js`. Inline scripts don't benefit from the IIFE bundle, run before the theme is initialized, and cannot use shared utilities.
- Always wrap content in `<div class="gl-container">` for consistent max-width.
- Use `{% if is_rtl %}` / `{% else %}` for Arabic/English text variants.
- Use `var(--gl-primary)`, `var(--gl-bg)`, etc. — **never** hard-code brand colors.
- For cart/wishlist buttons, use `data-gl-action="quick-add"` / `data-gl-action="wishlist-toggle"` — the compiled `glamour-pro.js` handles them via document-level event delegation (no extra JS needed).
- For sections that fetch product/category data at runtime, pre-bake all API URLs and label strings into `data-*` attributes on the root `<section>` element using Liquid (e.g. `data-add-to-cart-url="{{ api_routes.cart_store }}"`). JS reads these from `sectionEl.dataset.*` — never hard-codes URLs or translatable strings.

### Step 2 — Register in `theme.json`

Add an entry to the `sections` array in `theme.json`. Every key is required:

```json
{
  "slug": "your-slug",
  "name": { "en": "My Section", "ar": "القسم الجديد" },
  "category": "products",
  "template": "sections/your-slug.liquid",
  "sort_order": 27,
  "reusable": true,
  "page_types": ["home", "cms", "custom"],
  "settings": [
    {
      "type": "text",
      "id": "heading",
      "label": "Heading",
      "default": "My Section"
    }
  ],
  "defaults": {
    "heading": "My Section"
  }
}
```

**Setting types available:**

| `type` | UI widget | Notes |
|---|---|---|
| `text` | Text input | — |
| `textarea` | Multi-line input | — |
| `number` | Number input | — |
| `range` | Slider | Requires `min`, `max`, `step`, `unit` |
| `checkbox` | Toggle | `default: true/false` |
| `select` | Dropdown | Requires `options: [{value, label}]` |
| `color` | Color picker | — |
| `image` | Image uploader | — |
| `spacing` | Padding editor | `default: {top, right, bottom, left}` |
| `product` | Product picker | Set `"multiple": true` for multi-select; Liquid receives a single ID or array of IDs |
| `category` | Category picker | Same as `product` |

### Step 3 — Add translation keys

Add any new user-facing strings to both locale files:

**`locales/en.json`** — add under the appropriate key group:
```json
"sections": {
  "your_section": "My Section",
  "your_section_desc": "Description here"
}
```

**`locales/ar.json`** — matching Arabic:
```json
"sections": {
  "your_section": "القسم",
  "your_section_desc": "الوصف هنا"
}
```

Access in Liquid as `{{ translations.sections.your_section }}`.

### Step 4 — Create the JS module and add to preview

**4a. Create `assets/js/{your-slug}.js`** with a named export:

```js
export function initMySection() {
    document.querySelectorAll('[data-section="your-slug"]').forEach(function (sectionEl) {
        // Read everything from sectionEl.dataset.*
        // Build/hydrate DOM, wire events
    });
}
```

**4b. Import and call it in `assets/js/index.js`:**

```js
import { initMySection } from './your-slug.js';

// Call on initial load:
initMySection();

// Call again inside the theme-marketplace:dynamic listener so it also runs
// after dynamic data is ready (same pattern as initProductGrid, initCartPage etc.):
window.addEventListener('theme-marketplace:dynamic', function (event) {
    // ...existing calls...
    initMySection();
});
```

**4c. Add to preview** — open `preview/mock/context.js` and add your section slug to the `defaultPageSections` map for each page type it should appear on:

```js
const defaultPageSections = {
    home:     [..., 'your-slug'],
    category: [..., 'your-slug'],   // only if page_types includes "category"
    // ...
};
```

This mirrors what the platform renders for a fresh install and ensures hot-reload works during development.

The `buildSectionSettingsMap()` function in `context.js` auto-reads your section's `settings` from `theme.json` and injects defaults — **including mock IDs** for `type: product` and `type: category` fields. No manual mock data is needed unless you want specific values.

### Step 5 — Preview locally

```bash
# From the theme root (v2.4.5/)
npm run dev
```

Open **http://localhost:3060** and navigate to the page type your section targets (e.g. `/?page=home`). Test both locales:
- `http://localhost:3060/?page=home&locale=en`
- `http://localhost:3060/?page=home&locale=ar`

The preview server hot-reloads on every save to `sections/`, `assets/`, `locales/`, or `theme.json` — no manual restart needed.

**Debugging:**
- Liquid render errors appear as red inline blocks directly on the page.
- JS errors appear in the browser console.
- Server errors (file not found, etc.) appear in the terminal running `npm run dev`.

### Step 6 — Sync to platform (local dev)

After verifying in the preview server, sync to the running Bagisto instance so the section appears in the admin customizer:

```bash
php artisan theme:sync glamour-pro
```

This reads `theme.json`, upserts `ThemeSection` records, and re-registers section settings.

### Step 7 — Build & upload for production

```bash
npm run pack
```

This:
1. Bundles `assets/js/index.js` → `assets/js/glamour-pro.js` (minified IIFE)
2. Creates `glamour-pro.zip` containing only the files the platform needs

Upload `glamour-pro.zip` via the Developer Portal. Required files in the zip:
`theme.json`, `layout.liquid`, `sections/*.liquid`, `locales/en.json`, `locales/ar.json`, `assets/css/glamour-pro.css`, `assets/css/sharry.css`, `assets/js/glamour-pro.js`

---

### Quick reference — `api_routes` keys available in Liquid

These are injected by `DataContextBuilder::buildApiRoutesData()` and available in every section as `{{ api_routes.* }}`:

| Key | Real Bagisto route |
|---|---|
| `api_routes.products_index` | `shop.api.products.index` |
| `api_routes.categories_index` | `shop.api.categories.index` |
| `api_routes.cart_store` | `shop.api.checkout.cart.store` |
| `api_routes.cart_index` | `shop.api.checkout.cart.index` |
| `api_routes.cart_update` | `shop.api.checkout.cart.update` |
| `api_routes.cart_destroy` | `shop.api.checkout.cart.destroy` |
| `api_routes.wishlist_store` | `shop.api.customers.account.wishlist.store` |
| `api_routes.wishlist_index` | `shop.api.customers.account.wishlist.index` |
| `api_routes.compare_store` | `shop.api.compare.store` |
| `api_routes.compare_index` | `shop.api.compare.index` |
| `api_routes.compare_destroy` | `shop.api.compare.destroy` |

**In preview**, these resolve to `http://localhost:3060/api/...` mock endpoints registered in `preview/mock/api.js`.

---

### Quick reference — `data-gl-action` values

Wire interactive buttons by setting `data-gl-action` — `glamour-pro.js` handles everything via document-level event delegation:

| `data-gl-action` | What it does | Required `data-*` attributes |
|---|---|---|
| `quick-add` | Adds a simple product to cart (qty 1) | `data-product-id`, `data-add-to-cart-url` |
| `buy-now` | Add to cart + redirect to checkout | Must be inside a `<form data-gl-action="add-to-cart">` |
| `add-to-cart` | Full form submit (configurable etc.) | On the `<form>` element; button is `type="submit"` |
| `wishlist-toggle` | Add/remove wishlist | `data-product-id`, `data-wishlist-url`, `data-wishlist-index-url`, `data-active-label`, `data-inactive-label` |
| `compare-toggle` | Add/remove compare | `data-product-id`, `data-compare-url`, `data-compare-index-url`, `data-compare-destroy-url` |

Wishlist buttons **must** contain an SVG child — `hydrateActionButtons()` toggles `fill` on `button.querySelector('svg')` to show active state.

---

## RTL & Translations

- **Direction**: `{% if request.is_rtl %}` — true when locale is `ar`
- **Translations**: `{{ 'key' | t }}` — reads from `locales/en.json` or `locales/ar.json`
- **Arabic font override**: automatically applied by platform to `--gl-font-body` and `--gl-font-heading` when `[dir="rtl"]`
- **Layout flipping**: use `[dir="rtl"]` CSS selectors or `{% if request.is_rtl %}` in Liquid

---

## How the Platform Loads the Theme

On every storefront page request:

1. `ThemeConfigReader` reads `theme.json` → builds `--gl-*` CSS variables → injects as `<style>` block
2. Google Fonts loaded from `heading_font` / `body_font` / `arabic_font` settings
3. `glamour-pro.css` inlined as `<style>` tag
4. `sharry.css` inlined as `<style>` tag (platform bridge overrides)
5. Sections rendered as Liquid → injected into the page
6. `glamour-pro.js` inlined as `<script>` tag (NOT `type="module"`)
7. `theme-marketplace:dynamic` CustomEvent fired after auth/cart data fetched

**`layout.liquid` is NOT used** — the platform uses its own Blade shell. Do not put critical logic there.

---

## JavaScript

The runtime bundle is `assets/js/glamour-pro.js` — a single IIFE, built from `assets/js/index.js` (source modules live flat in `assets/js/`).

```js
// Listen for dynamic data (auth, cart) — fires once per page load
window.addEventListener('theme-marketplace:dynamic', (e) => {
    const { auth, cart } = e.detail;
    // update cart count, show/hide account links, etc.
});
```

CSRF token is available at: `document.querySelector('meta[name="csrf-token"]').content`

---

## Production Upload

```bash
npm run pack           # builds CSS + JS + creates glamour-pro.zip
```

Upload `glamour-pro.zip` via the Developer Portal. The platform extracts it flat (no wrapping folder needed).

Required files in zip: `theme.json`, `layout.liquid`, at least one `sections/*.liquid`, `locales/en.json`, `locales/ar.json`
