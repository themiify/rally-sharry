'use strict';

/**
 * context.js — Mirrors DataContextBuilder.php
 *
 * Builds the full Liquid rendering context from local theme files.
 * All data shapes match what the real platform injects, so sections
 * written for preview work unchanged when uploaded.
 */

const fs = require('fs');
const path = require('path');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return null;
    }
}

/** Deep-merge src into target (non-destructive on target) */
function deepMerge(target, src) {
    const out = Object.assign({}, target);
    for (const key of Object.keys(src)) {
        if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key]) &&
            target[key] && typeof target[key] === 'object') {
            out[key] = deepMerge(target[key], src[key]);
        } else {
            out[key] = src[key];
        }
    }
    return out;
}

/** Resolve a `{en, ar}` title object (or plain string) to a string */
function localize(value, locale) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value[locale] || value['en'] || Object.values(value)[0] || '';
}

// ─── Product card — dual-shape (DataContextBuilder + ProductResource) ─────────

function makeProductCard(i, locale) {
    const BASE_URL = '';
    const isAr = locale === 'ar';
    const price = parseFloat((49.99 + i * 10).toFixed(2));
    const regular = parseFloat((price + 20).toFixed(2));
    const imgBase = `https://picsum.photos/seed/prod${i}/600/600`;
    const name = isAr ? `منتج تجميلي ${i}` : `Beauty Product ${i}`;
    const slug = `beauty-product-${i}`;
    const url = `/products/${slug}`;

    // Base image object (ProductResource shape + normalized fields matching PHP normalizeImage)
    const baseImage = {
        small_image_url: `https://picsum.photos/seed/prod${i}/120/120`,
        medium_image_url: `https://picsum.photos/seed/prod${i}/400/400`,
        large_image_url: `https://picsum.photos/seed/prod${i}/600/600`,
        original_image_url: `https://picsum.photos/seed/prod${i}/800/800`,
        // Normalized shape (matches ProductContextService::normalizeImage)
        small_url: `https://picsum.photos/seed/prod${i}/120/120`,
        medium_url: `https://picsum.photos/seed/prod${i}/400/400`,
        large_url: `https://picsum.photos/seed/prod${i}/600/600`,
        original_url: `https://picsum.photos/seed/prod${i}/800/800`,
        url: `https://picsum.photos/seed/prod${i}/600/600`,
    };

    const description = isAr
        ? '<p>منتج تجميلي فاخر بجودة عالية. مناسب للاستخدام اليومي.</p>'
        : '<p>Premium beauty product with high quality. Suitable for daily use.</p>';
    const shortDescription = isAr
        ? '<p>منتج فاخر عالي الجودة.</p>'
        : '<p>Premium high-quality product.</p>';
    const categorySlug = 'lipsticks';
    const categoryName = isAr ? 'أحمر الشفاه' : 'Lipsticks';

    return {
        // ── DataContextBuilder fields ──────────────────────────────────────
        id: i,
        type: 'simple',
        sku: `SKU-${String(i).padStart(4, '0')}`,
        name,
        url,
        slug,
        image: imgBase,           // shorthand used by many sections
        price,
        regular_price: regular,
        special_price: price,
        special_price_from: null,
        special_price_to: null,
        formatted_price: `${price} SAR`,
        formatted_regular_price: `${regular} SAR`,
        avg_rating: 4.5,
        reviews_count: 10 + i,
        description,
        description_text: description.replace(/<[^>]+>/g, '').trim(),
        short_description: shortDescription,
        short_description_text: shortDescription.replace(/<[^>]+>/g, '').trim(),
        in_stock: true,
        is_new: i % 3 === 0,
        is_featured: i % 2 === 0,
        on_sale: true,
        category: {
            id: 1,
            name: categoryName,
            slug: categorySlug,
            url: `/${categorySlug}`,
        },
        wishlist_enabled: true,
        compare_enabled: true,
        actions: {
            add_to_cart_url: `${BASE_URL}/api/checkout/cart`,
            wishlist_url: `${BASE_URL}/api/customers/account/wishlist`,
            wishlist_index_url: `${BASE_URL}/api/customers/account/wishlist`,
            compare_url: `${BASE_URL}/api/compare`,
            compare_index_url: `${BASE_URL}/api/compare`,
            compare_destroy_url: `${BASE_URL}/api/compare`,
            login_url: '/customer/login',
        },

        // ── ProductResource fields ─────────────────────────────────────────
        url_key: slug,
        is_saleable: true,
        is_wishlist: false,
        min_price: `${price} SAR`,
        base_image: baseImage,
        images: [baseImage],
        prices: {
            regular_price: { price: regular, formatted_price: `${regular} SAR` },
            final_price: { price, formatted_price: `${price} SAR` },
        },
        ratings: { average: 4.5, total: 10 + i },
        reviews: { total: 10 + i },
    };
}

// ─── Menus ────────────────────────────────────────────────────────────────────

function buildMenus(locale) {
    const isAr = locale === 'ar';
    const link = (title, titleAr, url, children = []) => ({
        title: isAr ? titleAr : title, url, icon: '', new_tab: false, visible: true, children,
    });
    return {
        main: [
            link('Home', 'الرئيسية', '/'),
            link('Shop', 'المتجر', '/products', [
                link('Lipstick', 'أحمر الشفاه', '/products?cat=lipstick'),
                link('Foundation', 'كريم أساس', '/products?cat=foundation'),
                link('Skincare', 'العناية بالبشرة', '/products?cat=skincare'),
            ]),
            link('Collections', 'التشكيلات', '/collections'),
            link('About', 'عن المتجر', '/about-us'),
            link('Contact', 'تواصل معنا', '/contact'),
        ],
        footer_shop: [
            link('Lipstick', 'أحمر الشفاه', '/products?cat=lipstick'),
            link('Foundation', 'كريم أساس', '/products?cat=foundation'),
            link('Skincare', 'العناية بالبشرة', '/products?cat=skincare'),
            link('New Arrivals', 'وصل حديثاً', '/products?sort=newest'),
            link('Sale', 'تخفيضات', '/products?sale=1'),
        ],
        footer_help: [
            link('Contact Us', 'تواصل معنا', '/contact'),
            link('FAQ', 'الأسئلة الشائعة', '/faq'),
            link('Shipping Info', 'معلومات الشحن', '/shipping'),
            link('Returns', 'الإرجاع', '/returns'),
        ],
        footer_policies: [
            link('Privacy Policy', 'سياسة الخصوصية', '/privacy-policy'),
            link('Terms of Service', 'شروط الخدمة', '/terms'),
            link('Cookie Policy', 'سياسة الكوكيز', '/cookies'),
        ],
    };
}

// ─── Translations ─────────────────────────────────────────────────────────────

function loadTranslations(themeRoot, locale) {
    const enFile = readJson(path.join(themeRoot, 'locales', 'en.json')) || {};
    if (locale === 'en') return enFile;
    const localeFile = readJson(path.join(themeRoot, 'locales', `${locale}.json`)) || {};
    return deepMerge(enFile, localeFile);
}

// ─── Category card — mirrors CategoryContextService::resolveCategoryCards() ──

const MOCK_CATEGORIES = [
    { en: { name: 'Lipsticks', description: 'Premium lip color collection', meta_title: 'Lipsticks | Glamour Beauty', meta_description: 'Shop our premium lipstick range', meta_keywords: 'lipstick, lip color' }, ar: { name: 'أحمر الشفاه', description: 'مجموعة ألوان الشفاه الفاخرة', meta_title: 'أحمر الشفاه | جلامور بيوتي', meta_description: 'تسوقي مجموعتنا من أحمر الشفاه الفاخر', meta_keywords: 'أحمر شفاه' }, slug: 'lipsticks' },
    { en: { name: 'Skincare', description: 'Nourish and protect your skin', meta_title: 'Skincare | Glamour Beauty', meta_description: 'Best skincare products online', meta_keywords: 'skincare, moisturizer' }, ar: { name: 'العناية بالبشرة', description: 'غذّي بشرتك واحميها', meta_title: 'العناية بالبشرة | جلامور بيوتي', meta_description: 'أفضل منتجات العناية بالبشرة', meta_keywords: 'عناية بشرة، مرطب' }, slug: 'skincare' },
    { en: { name: 'Eyeshadow', description: 'Eye-catching shadow palettes', meta_title: 'Eyeshadow | Glamour Beauty', meta_description: 'Stunning eyeshadow palettes', meta_keywords: 'eyeshadow, eye makeup' }, ar: { name: 'ظلال العيون', description: 'باليتات ظلال العيون الساحرة', meta_title: 'ظلال العيون | جلامور بيوتي', meta_description: 'باليتات رائعة لظلال العيون', meta_keywords: 'ظلال عيون، مكياج عيون' }, slug: 'eyeshadow' },
    { en: { name: 'Foundation', description: 'Flawless base for every skin tone', meta_title: 'Foundation | Glamour Beauty', meta_description: 'Perfect foundation for all skin tones', meta_keywords: 'foundation, base makeup' }, ar: { name: 'كريم الأساس', description: 'قاعدة مثالية لكل درجات البشرة', meta_title: 'كريم الأساس | جلامور بيوتي', meta_description: 'كريم الأساس المثالي لجميع ألوان البشرة', meta_keywords: 'كريم أساس، مكياج' }, slug: 'foundation' },
    { en: { name: 'Fragrances', description: 'Luxury scents for every occasion', meta_title: 'Fragrances | Glamour Beauty', meta_description: 'Discover our luxury fragrance range', meta_keywords: 'fragrance, perfume' }, ar: { name: 'العطور', description: 'روائح فاخرة لكل مناسبة', meta_title: 'العطور | جلامور بيوتي', meta_description: 'اكتشفي مجموعتنا من العطور الفاخرة', meta_keywords: 'عطر، بخاخ' }, slug: 'fragrances' },
];

/**
 * Build a CategoryCard matching CategoryContextService::resolveCategoryCards() output.
 * @param {number} i  1-based index (wraps around MOCK_CATEGORIES)
 * @param {string} locale  'en' | 'ar'
 */
function makeCategoryCard(i, locale) {
    const isAr = locale === 'ar';
    const idx = ((i - 1) % MOCK_CATEGORIES.length + MOCK_CATEGORIES.length) % MOCK_CATEGORIES.length;
    const cat = MOCK_CATEGORIES[idx];
    const t = isAr ? cat.ar : cat.en;
    const slug = cat.slug;

    return {
        category_id: i,
        name: t.name,
        slug,
        url: `/${slug}`,
        image: `https://picsum.photos/seed/cat${i}/600/400`,
        description: t.description,
        meta_title: t.meta_title,
        meta_description: t.meta_description,
        meta_keywords: t.meta_keywords,
    };
}

/**
 * Resolve an array of category IDs to CategoryCard objects (mirrors PHP resolveCategoryCards).
 * Used by server.js to populate section.resolved for category_picker fields.
 */
function resolveCategoryCards(ids, locale) {
    if (!Array.isArray(ids)) ids = [ids];
    return ids.filter(Boolean).map(id => makeCategoryCard(parseInt(id, 10) || 1, locale));
}

// ─── Blog card — mirrors SectionSettingsEnricher::resolveBlogPickerField() ────

const MOCK_BLOGS = [
    { en: { title: 'Top 10 Skincare Tips', slug: 'top-10-skincare-tips', excerpt: 'Discover the best skincare routines for every skin type.' }, ar: { title: 'أفضل 10 نصائح للعناية بالبشرة', slug: 'top-10-skincare-tips', excerpt: 'اكتشفي أفضل روتين للعناية بالبشرة لكل أنواع البشرة.' } },
    { en: { title: 'How to Apply Foundation', slug: 'how-to-apply-foundation', excerpt: 'A step-by-step guide to a flawless base.' }, ar: { title: 'كيفية وضع كريم الأساس', slug: 'how-to-apply-foundation', excerpt: 'دليل خطوة بخطوة للحصول على قاعدة مثالية.' } },
    { en: { title: 'Best Lipstick Shades 2025', slug: 'best-lipstick-shades-2025', excerpt: 'This season\'s hottest lip color trends.' }, ar: { title: 'أفضل ألوان أحمر الشفاه 2025', slug: 'best-lipstick-shades-2025', excerpt: 'أبرز ألوان الشفاه لهذا الموسم.' } },
    { en: { title: 'Fragrance Guide for Beginners', slug: 'fragrance-guide-beginners', excerpt: 'Everything you need to know about choosing a perfume.' }, ar: { title: 'دليل العطور للمبتدئين', slug: 'fragrance-guide-beginners', excerpt: 'كل ما تحتاجين لمعرفته عند اختيار عطر.' } },
    { en: { title: 'Oud & Bakhoor at Home', slug: 'oud-bakhoor-at-home', excerpt: 'How to use oud and incense to fill your home with scent.' }, ar: { title: 'العود والبخور في البيت', slug: 'oud-bakhoor-at-home', excerpt: 'كيفية استخدام العود والبخور لتعطير منزلك.' } },
];

/**
 * Build a mock ArticleCard matching SectionSettingsEnricher::resolveBlogPickerField() output.
 * Shape: { id, title, slug, url, image, excerpt }
 * @param {number} i  1-based index (wraps around MOCK_BLOGS)
 * @param {string} locale  'en' | 'ar'
 */
function makeBlogCard(i, locale) {
    const isAr = locale === 'ar';
    const idx = ((i - 1) % MOCK_BLOGS.length + MOCK_BLOGS.length) % MOCK_BLOGS.length;
    const blog = MOCK_BLOGS[idx];
    const t = isAr ? blog.ar : blog.en;
    return {
        id: i,
        title: t.title,
        slug: t.slug,
        url: `/blogs/${t.slug}`,
        image: `https://picsum.photos/seed/blog${i}/800/450`,
        excerpt: t.excerpt,
        content: '',
        published_at: new Date(Date.now() - i * 7 * 24 * 3600 * 1000).toISOString(),
        author: null,
        categories: [],
        tags: [],
        meta_title: t.title,
        meta_description: t.excerpt,
    };
}

/**
 * Resolve an array of blog IDs to ArticleCard objects (mirrors PHP resolveBlogPickerField).
 * Used by server.js to populate section.resolved for blog_picker fields.
 */
function mockResolveBlogCards(ids, locale) {
    if (!Array.isArray(ids)) ids = [ids];
    return ids.filter(Boolean).map(id => makeBlogCard(parseInt(id, 10) || 1, locale));
}

// ─── Section settings map ─────────────────────────────────────────────────────

function buildSectionSettingsMap(themeJson) {
    const map = {};

    // Theme-level defaults from theme.json each section's settings schema
    for (const sectionDef of (themeJson.sections || [])) {
        const defaults = {};
        for (const field of (sectionDef.settings || [])) {
            if (field.id && field.default !== undefined) {
                defaults[field.id] = field.default;
            } else if (field.id && field.type === 'product') {
                // Inject mock product IDs so sections don't break in local preview
                defaults[field.id] = field.multiple === true ? [1, 2, 3, 4] : 1;
            } else if (field.id && field.type === 'category') {
                // Inject mock category IDs so sections don't break in local preview
                defaults[field.id] = field.multiple === true ? [1, 2] : 1;
            } else if (field.id && field.type === 'category_picker') {
                // Inject mock category IDs for the new category_picker type
                defaults[field.id] = field.multiple === false ? 1 : [1, 2, 3];
            }
        }
        map[sectionDef.slug] = defaults;
    }

    return map;
}

// ─── Surface-specific data  ───────────────────────────────────────────────────

/** Shared product detail fields added to every product type */
function productDetailBase(card, locale) {
    const isAr = locale === 'ar';
    return Object.assign({}, card, {
        description: isAr
            ? '<p>أحمر شفاه فاخر بتركيبة ترطيب طويلة الأمد. يدوم 24 ساعة.</p>'
            : '<p>Premium lipstick with long-lasting moisturizing formula. Lasts 24 hours.</p>',
        short_description: isAr
            ? '<p>أحمر شفاه فاخر يدوم طوال اليوم.</p>'
            : '<p>Premium long-lasting lipstick.</p>',
        url_key: card.slug,
        base_image: card.base_image,
        images: [
            { url: `https://picsum.photos/seed/pdp1/600/600`, small_url: `https://picsum.photos/seed/pdp1/120/120`, medium_url: `https://picsum.photos/seed/pdp1/400/400`, large_url: `https://picsum.photos/seed/pdp1/600/600`, original_url: `https://picsum.photos/seed/pdp1/800/800` },
            { url: `https://picsum.photos/seed/pdp2/600/600`, small_url: `https://picsum.photos/seed/pdp2/120/120`, medium_url: `https://picsum.photos/seed/pdp2/400/400`, large_url: `https://picsum.photos/seed/pdp2/600/600`, original_url: `https://picsum.photos/seed/pdp2/800/800` },
            { url: `https://picsum.photos/seed/pdp3/600/600`, small_url: `https://picsum.photos/seed/pdp3/120/120`, medium_url: `https://picsum.photos/seed/pdp3/400/400`, large_url: `https://picsum.photos/seed/pdp3/600/600`, original_url: `https://picsum.photos/seed/pdp3/800/800` },
        ],
        videos: [],
        price_html: `<span class="final-price">${card.formatted_price}</span>`,
        prices: {
            regular: { price: card.regular_price, formatted_price: card.formatted_regular_price },
            final: { price: card.price, formatted_price: card.formatted_price },
        },
        additional_info: [
            { id: 1, code: 'color_family', label: isAr ? 'اللون' : 'Color', type: 'text', value: isAr ? 'أحمر كلاسيكي' : 'Classic Red', download_url: null, image_url: null },
            { id: 2, code: 'weight', label: isAr ? 'الوزن' : 'Weight', type: 'text', value: '3.5g', download_url: null, image_url: null },
        ],
        ratings: { average: 4.5, total_reviews: 12, total_rating: 54, total_feedback: 12, percentage: [0, 0, 8, 25, 67] },
        reviews: [
            { id: 1, name: isAr ? 'سارة' : 'Sarah', title: isAr ? 'رائع' : 'Amazing', comment: isAr ? 'أفضل أحمر شفاه جربته!' : 'Best lipstick I have ever tried!', rating: 5, created_at: '2024-12-01' },
            { id: 2, name: isAr ? 'نورة' : 'Nora', title: isAr ? 'جيد' : 'Good quality', comment: isAr ? 'لون جميل ويدوم طويلاً' : 'Beautiful color and long-lasting', rating: 4, created_at: '2024-11-15' },
        ],
        reviews_count: 2,
        meta: { title: card.name, description: 'Premium beauty product', keywords: 'beauty, lipstick' },
        add_to_cart_url: '/api/checkout/cart',
        show_quantity_box: true,
        tax_inclusive: false,
        customer_group_pricing_offers: [],
        wishlist_enabled: true,
        compare_enabled: true,
        cart_page_enabled: true,
        buy_now_enabled: true,
        related_products: Array.from({ length: 4 }, (_, i) => makeProductCard(i + 10, locale)),
        up_sell_products: Array.from({ length: 4 }, (_, i) => makeProductCard(i + 20, locale)),
        cross_sell_products: [],
        // Type-specific defaults (overridden per type)
        configurable: null,
        configurable_json: null,
        grouped_products: [],
        bundle: null,
        downloadable: null,
        booking: null,
        customizable_options: [],
    });
}

// ── Configurable ──────────────────────────────────────────────────────────────

function makeConfigurableProduct(locale) {
    const isAr = locale === 'ar';
    const card = makeProductCard(100, locale);
    card.type = 'configurable';
    card.name = isAr ? 'أحمر شفاه متعدد الألوان' : 'Multi-Color Lipstick';
    card.slug = 'multi-color-lipstick';
    card.url = '/products/multi-color-lipstick';

    const colorAttrId = 23;
    const sizeAttrId = 24;

    // Options
    const redId = 1, blueId = 2, greenId = 3;
    const smallId = 10, mediumId = 11;

    // Variant IDs
    const variants = {
        '201': { [colorAttrId]: redId, [sizeAttrId]: smallId },
        '202': { [colorAttrId]: redId, [sizeAttrId]: mediumId },
        '203': { [colorAttrId]: blueId, [sizeAttrId]: smallId },
        '204': { [colorAttrId]: blueId, [sizeAttrId]: mediumId },
        '205': { [colorAttrId]: greenId, [sizeAttrId]: smallId },
        '206': { [colorAttrId]: greenId, [sizeAttrId]: mediumId },
    };

    const config = {
        index: variants,
        attributes: [
            {
                id: colorAttrId, code: 'color', label: isAr ? 'اللون' : 'Color', swatch_type: 'color',
                options: [
                    { id: redId, label: isAr ? 'أحمر' : 'Red', products: [201, 202], swatch_value: '#dc2626' },
                    { id: blueId, label: isAr ? 'أزرق' : 'Blue', products: [203, 204], swatch_value: '#2563eb' },
                    { id: greenId, label: isAr ? 'أخضر' : 'Green', products: [205, 206], swatch_value: '#16a34a' },
                ],
            },
            {
                id: sizeAttrId, code: 'size', label: isAr ? 'الحجم' : 'Size', swatch_type: 'text',
                options: [
                    { id: smallId, label: 'S', products: [201, 203, 205] },
                    { id: mediumId, label: 'M', products: [202, 204, 206] },
                ],
            },
        ],
        variant_prices: {},
        variant_images: {},
        variant_videos: {},
        regular: { price: card.regular_price, formatted_price: card.formatted_regular_price },
    };

    [201, 202, 203, 204, 205, 206].forEach(vid => {
        const p = 49.99 + (vid - 200) * 5;
        config.variant_prices[vid] = {
            regular: { price: p + 20, formatted_price: `${(p + 20).toFixed(2)} SAR` },
            final: { price: p, formatted_price: `${p.toFixed(2)} SAR` },
        };
        config.variant_images[vid] = [
            { small_image_url: `https://picsum.photos/seed/v${vid}/120/120`, medium_image_url: `https://picsum.photos/seed/v${vid}/400/400`, large_image_url: `https://picsum.photos/seed/v${vid}/600/600`, original_image_url: `https://picsum.photos/seed/v${vid}/800/800` },
        ];
        config.variant_videos[vid] = [];
    });

    const product = productDetailBase(card, locale);
    product.configurable = config;
    product.configurable_json = Buffer.from(JSON.stringify(config)).toString('base64');
    return product;
}

// ── Bundle ────────────────────────────────────────────────────────────────────

function makeBundleProduct(locale) {
    const isAr = locale === 'ar';
    const card = makeProductCard(110, locale);
    card.type = 'bundle';
    card.name = isAr ? 'طقم مكياج' : 'Makeup Bundle';
    card.slug = 'makeup-bundle';
    card.url = '/products/makeup-bundle';

    const product = productDetailBase(card, locale);
    product.show_quantity_box = false;
    product.bundle = {
        options: [
            {
                id: 1, label: isAr ? 'أحمر الشفاه' : 'Lipstick', type: 'select', is_required: true, sort_order: 1,
                products: [
                    { id: 1, qty: 1, name: isAr ? 'أحمر كلاسيكي' : 'Classic Red', product_id: 50, is_default: true, in_stock: true, inventory: 10, price: { regular: { price: 49.99, formatted_price: '49.99 SAR' }, final: { price: 49.99, formatted_price: '49.99 SAR' } } },
                    { id: 2, qty: 1, name: isAr ? 'وردي ناعم' : 'Soft Pink', product_id: 51, is_default: false, in_stock: true, inventory: 8, price: { regular: { price: 39.99, formatted_price: '39.99 SAR' }, final: { price: 39.99, formatted_price: '39.99 SAR' } } },
                ],
            },
            {
                id: 2, label: isAr ? 'كريم أساس' : 'Foundation', type: 'radio', is_required: true, sort_order: 2,
                products: [
                    { id: 3, qty: 1, name: isAr ? 'فاتح' : 'Light', product_id: 52, is_default: true, in_stock: true, inventory: 5, price: { regular: { price: 79.99, formatted_price: '79.99 SAR' }, final: { price: 59.99, formatted_price: '59.99 SAR' } } },
                    { id: 4, qty: 1, name: isAr ? 'متوسط' : 'Medium', product_id: 53, is_default: false, in_stock: true, inventory: 7, price: { regular: { price: 79.99, formatted_price: '79.99 SAR' }, final: { price: 59.99, formatted_price: '59.99 SAR' } } },
                ],
            },
            {
                id: 3, label: isAr ? 'إضافات' : 'Extras', type: 'checkbox', is_required: false, sort_order: 3,
                products: [
                    { id: 5, qty: 1, name: isAr ? 'ماسكارا' : 'Mascara', product_id: 54, is_default: false, in_stock: true, inventory: 12, price: { regular: { price: 29.99, formatted_price: '29.99 SAR' }, final: { price: 29.99, formatted_price: '29.99 SAR' } } },
                    { id: 6, qty: 1, name: isAr ? 'محدد عيون' : 'Eyeliner', product_id: 55, is_default: true, in_stock: true, inventory: 15, price: { regular: { price: 19.99, formatted_price: '19.99 SAR' }, final: { price: 19.99, formatted_price: '19.99 SAR' } } },
                ],
            },
        ],
    };
    return product;
}

// ── Grouped ───────────────────────────────────────────────────────────────────

function makeGroupedProduct(locale) {
    const isAr = locale === 'ar';
    const card = makeProductCard(120, locale);
    card.type = 'grouped';
    card.name = isAr ? 'مجموعة العناية بالبشرة' : 'Skincare Set';
    card.slug = 'skincare-set';
    card.url = '/products/skincare-set';

    const product = productDetailBase(card, locale);
    product.show_quantity_box = false;
    product.grouped_products = [
        Object.assign({}, makeProductCard(60, locale), { name: isAr ? 'غسول الوجه' : 'Face Wash', price: 35.00, formatted_price: '35.00 SAR', default_qty: 1, associated_product_id: 60 }),
        Object.assign({}, makeProductCard(61, locale), { name: isAr ? 'تونر' : 'Toner', price: 45.00, formatted_price: '45.00 SAR', default_qty: 1, associated_product_id: 61 }),
        Object.assign({}, makeProductCard(62, locale), { name: isAr ? 'مرطب' : 'Moisturizer', price: 65.00, formatted_price: '65.00 SAR', default_qty: 0, associated_product_id: 62 }),
    ];
    return product;
}

// ── Downloadable ──────────────────────────────────────────────────────────────

function makeDownloadableProduct(locale) {
    const isAr = locale === 'ar';
    const card = makeProductCard(130, locale);
    card.type = 'downloadable';
    card.name = isAr ? 'دليل المكياج الرقمي' : 'Digital Makeup Guide';
    card.slug = 'digital-makeup-guide';
    card.url = '/products/digital-makeup-guide';

    const product = productDetailBase(card, locale);
    product.show_quantity_box = false;
    product.downloadable = {
        links: [
            { id: 1, title: isAr ? 'الكتاب الكامل' : 'Full Guide (PDF)', price: 29.99, formatted_price: '29.99 SAR', has_sample: true, sample_url: '#sample-1' },
            { id: 2, title: isAr ? 'فيديو تعليمي' : 'Video Tutorial', price: 19.99, formatted_price: '19.99 SAR', has_sample: false, sample_url: null },
        ],
        samples: [
            { id: 1, title: isAr ? 'معاينة الفصل الأول' : 'Chapter 1 Preview', download_url: '#download-sample-1' },
        ],
    };
    return product;
}

// ── Booking ───────────────────────────────────────────────────────────────────

function makeBookingProduct(locale, bookingType) {
    const isAr = locale === 'ar';
    const card = makeProductCard(140, locale);
    card.type = 'booking';
    const type = bookingType || 'default';

    const typeNames = {
        default: { en: 'Beauty Consultation', ar: 'استشارة تجميل' },
        appointment: { en: 'Facial Appointment', ar: 'موعد تنظيف بشرة' },
        event: { en: 'Makeup Masterclass', ar: 'ورشة مكياج' },
        rental: { en: 'Makeup Kit Rental', ar: 'تأجير طقم مكياج' },
        table: { en: 'Beauty Lounge Table', ar: 'طاولة صالون تجميل' },
    };
    card.name = isAr ? (typeNames[type]?.ar || typeNames.default.ar) : (typeNames[type]?.en || typeNames.default.en);
    card.slug = `booking-${type}`;
    card.url = `/products/booking-${type}`;

    const product = productDetailBase(card, locale);
    const bookingConfig = {
        id: 1, type, location: isAr ? 'الرياض - حي الملقا' : 'Riyadh - Al Malqa', show_location: true,
        qty: 10, available_every_week: true,
        available_from: new Date().toISOString().slice(0, 10),
        available_to: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
        slot_api_url: `/api/booking/${card.id}/slots`,
    };

    if (type === 'default') {
        bookingConfig.today_slots_text = isAr ? '3 أوقات متاحة اليوم' : '3 slots available today';
        bookingConfig.default_slot = { booking_type: 'one', duration: 60, break_time: 15 };
    } else if (type === 'appointment') {
        bookingConfig.today_slots_text = isAr ? '5 مواعيد متاحة اليوم' : '5 appointments available today';
        bookingConfig.appointment_slot = { duration: 45, break_time: 10, same_slot_all_days: true };
    } else if (type === 'event') {
        bookingConfig.event_date = isAr ? 'السبت 15 مارس 2025 — 6:00 مساءً' : 'Saturday, March 15, 2025 — 6:00 PM';
        bookingConfig.tickets = [
            { id: 1, name: isAr ? 'تذكرة عادية' : 'General Admission', description: isAr ? 'دخول عام' : 'Standard entry', qty: 50, unit_price: 99, remaining_qty: 50, is_available: true, formatted_price_text: '99.00 SAR', formatted_price: '99.00 SAR', original_formatted_price: '149.00 SAR' },
            { id: 2, name: isAr ? 'تذكرة VIP' : 'VIP Ticket', description: isAr ? 'مع هدية' : 'Includes gift bag', qty: 20, unit_price: 249, remaining_qty: 20, is_available: true, formatted_price_text: '249.00 SAR', formatted_price: '249.00 SAR', original_formatted_price: '' },
        ];
    } else if (type === 'rental') {
        bookingConfig.rental_slot = {
            renting_type: 'daily_hourly', daily_price: 150, hourly_price: 25,
            formatted_daily_price: '150.00 SAR', formatted_hourly_price: '25.00 SAR', same_slot_all_days: true,
        };
    } else if (type === 'table') {
        bookingConfig.today_slots_text = isAr ? '2 طاولات متاحة' : '2 tables available today';
        bookingConfig.table_slot = {
            price_type: 'guest', guest_limit: 8, duration: 120, break_time: 30,
            prevent_scheduling_before: 24, same_slot_all_days: false,
        };
    }

    product.booking = bookingConfig;
    return product;
}

// ── Customizable (simple + custom options) ────────────────────────────────────

function makeCustomizableProduct(locale) {
    const isAr = locale === 'ar';
    const card = makeProductCard(150, locale);
    card.name = isAr ? 'أحمر شفاه مخصص' : 'Custom Lipstick';
    card.slug = 'custom-lipstick';
    card.url = '/products/custom-lipstick';

    const product = productDetailBase(card, locale);
    product.customizable_options = [
        {
            id: 1, label: isAr ? 'نقش مخصص' : 'Custom Engraving', type: 'text', is_required: false,
            max_characters: 20, supported_file_extensions: '', items: [],
        },
        {
            id: 2, label: isAr ? 'نوع العلبة' : 'Case Type', type: 'select', is_required: true,
            max_characters: null, supported_file_extensions: '',
            items: [
                { id: 10, label: isAr ? 'عادي' : 'Standard', price: 0, formatted_price: '' },
                { id: 11, label: isAr ? 'فاخر' : 'Luxury Box', price: 25.00, formatted_price: '25.00 SAR' },
                { id: 12, label: isAr ? 'هدية' : 'Gift Wrap', price: 15.00, formatted_price: '15.00 SAR' },
            ],
        },
        {
            id: 3, label: isAr ? 'ملحقات إضافية' : 'Add-ons', type: 'checkbox', is_required: false,
            max_characters: null, supported_file_extensions: '',
            items: [
                { id: 20, label: isAr ? 'مرآة صغيرة' : 'Mini Mirror', price: 10.00, formatted_price: '10.00 SAR' },
                { id: 21, label: isAr ? 'محدد شفاه' : 'Lip Liner', price: 20.00, formatted_price: '20.00 SAR' },
            ],
        },
    ];
    return product;
}

// ── Product type router ───────────────────────────────────────────────────────

const PRODUCT_TYPE_BUILDERS = {
    simple: (locale) => productDetailBase(makeProductCard(1, locale), locale),
    configurable: makeConfigurableProduct,
    bundle: makeBundleProduct,
    grouped: makeGroupedProduct,
    downloadable: makeDownloadableProduct,
    booking: (locale) => makeBookingProduct(locale, 'default'),
    'booking-default': (locale) => makeBookingProduct(locale, 'default'),
    'booking-appointment': (locale) => makeBookingProduct(locale, 'appointment'),
    'booking-event': (locale) => makeBookingProduct(locale, 'event'),
    'booking-rental': (locale) => makeBookingProduct(locale, 'rental'),
    'booking-table': (locale) => makeBookingProduct(locale, 'table'),
    customizable: makeCustomizableProduct,
};

function buildProductContext(locale, productType) {
    const builder = PRODUCT_TYPE_BUILDERS[productType || 'simple'] || PRODUCT_TYPE_BUILDERS.simple;
    return { product: builder(locale) };
}

function buildCategoryContext(locale) {
    const isAr = locale === 'ar';
    return {
        category: {
            id: 1,
            name: isAr ? 'أحمر الشفاه' : 'Lipsticks',
            description: isAr ? 'تشكيلة واسعة من أحمر الشفاه الفاخرة' : 'Wide selection of premium lipsticks',
            slug: 'lipsticks',
            logo: { medium_image_url: 'https://picsum.photos/seed/cat1/400/200' },
            url: '/lipsticks',
            logo_url: 'https://picsum.photos/seed/cat1/400/200',
            banner_url: 'https://picsum.photos/seed/cat1-banner/1200/300',
            meta_title: isAr ? 'أحمر الشفاه | متجري' : 'Lipsticks | My Store',
            meta_description: isAr ? 'تشكيلة واسعة من أحمر الشفاه الفاخرة' : 'Wide selection of premium lipsticks',
            meta_keywords: isAr ? 'أحمر شفاه, مكياج, جمال' : 'lipstick, makeup, beauty',
            subcategories: [
                {
                    id: 10,
                    name: isAr ? 'أحمر شفاه مطفي' : 'Matte Lipsticks',
                    slug: 'matte-lipsticks',
                    url: '/matte-lipsticks',
                    image: 'https://picsum.photos/seed/subcat-matte/200/200',
                    banner: 'https://picsum.photos/seed/subcat-matte-banner/800/200',
                    description: isAr ? 'أحمر شفاه مطفي يدوم طويلاً' : 'Long-lasting matte lipsticks',
                    meta_title: isAr ? 'أحمر شفاه مطفي' : 'Matte Lipsticks',
                    meta_description: isAr ? 'أحمر شفاه مطفي يدوم طويلاً' : 'Long-lasting matte lipsticks',
                    meta_keywords: isAr ? 'مطفي, أحمر شفاه' : 'matte, lipstick',
                    products_count: 24,
                    subcategories: [
                        {
                            id: 100,
                            name: isAr ? 'أحمر شفاه سائل' : 'Liquid Matte',
                            slug: 'liquid-matte',
                            url: '/liquid-matte',
                            image: 'https://picsum.photos/seed/subcat-liquid/200/200',
                            banner: '',
                            description: isAr ? 'أحمر شفاه سائل مطفي' : 'Liquid matte lipsticks',
                            meta_title: '',
                            meta_description: '',
                            meta_keywords: '',
                            products_count: 12,
                            subcategories: [],
                        },
                    ],
                },
                {
                    id: 11,
                    name: isAr ? 'أحمر شفاه لامع' : 'Glossy Lipsticks',
                    slug: 'glossy-lipsticks',
                    url: '/glossy-lipsticks',
                    image: 'https://picsum.photos/seed/subcat-glossy/200/200',
                    banner: 'https://picsum.photos/seed/subcat-glossy-banner/800/200',
                    description: isAr ? 'أحمر شفاه لامع بلمسة رطبة' : 'Glossy lipsticks with a hydrating feel',
                    meta_title: isAr ? 'أحمر شفاه لامع' : 'Glossy Lipsticks',
                    meta_description: isAr ? 'أحمر شفاه لامع بلمسة رطبة' : 'Glossy lipsticks with a hydrating feel',
                    meta_keywords: isAr ? 'لامع, أحمر شفاه' : 'glossy, lipstick',
                    products_count: 18,
                    subcategories: [],
                },
                {
                    id: 12,
                    name: isAr ? 'أقلام الشفاه' : 'Lip Liners',
                    slug: 'lip-liners',
                    url: '/lip-liners',
                    image: 'https://picsum.photos/seed/subcat-liner/200/200',
                    banner: '',
                    description: isAr ? 'أقلام تحديد الشفاه للون يدوم' : 'Lip liners for long-lasting color',
                    meta_title: isAr ? 'أقلام الشفاه' : 'Lip Liners',
                    meta_description: isAr ? 'أقلام تحديد الشفاه للون يدوم' : 'Lip liners for long-lasting color',
                    meta_keywords: isAr ? 'قلم, تحديد, شفاه' : 'liner, lip, pencil',
                    products_count: 9,
                    subcategories: [],
                },
            ],
        },
    };
}

function buildSearchContext(locale) {
    const isAr = locale === 'ar';
    return {
        search: {
            query: isAr ? 'أحمر شفاه' : 'lipstick',
            results: Array.from({ length: 8 }, (_, i) => makeProductCard(i + 1, locale)),
            results_count: 8,
        },
    };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Build the full Liquid rendering context.
 *
 * @param {string} pageType  home|product|category|cart|search|cms|custom|404
 * @param {string} locale    en|ar
 * @param {string|null} slug  for cms/custom pages
 * @param {string} themeRoot  absolute path to the theme directory
 */
// Default page sections per type — matches what the platform renders for a fresh install.
// Add new section slugs here (in render order) when creating a new section for a page.
// Exported so preview/server.js can import this as its single source of truth.
const DEFAULT_PAGE_SECTIONS = {
    home: ['sp-product-special', 'sp-interactive-gallery', 'G-Categories', 'G-FAQ', 'G-Interactive-banner', 'G-category-cards', 'image-gallery',
        'featured-categories', 'sub-banner', 'promotions-banner', 'video-banner', 'G-Value_Propositions', 'testimonials', 'brands-carousel', 'featured-products', 'newsletter'],

    product: ['product-detail'],
    category: ['G-index-banner', 'product-grid', 'category-carousel'],
    search: ['search-results'],
    cart: ['cart-page'],
    cms: ['cms-page'],
    custom: ['custom-page'],
    '404': ['page-not-found'],
};

function buildContext(pageType, locale, slug, themeRoot) {
    const isRtl = locale === 'ar';
    const themeJson = readJson(path.join(themeRoot, 'theme.json')) || {};

    const state = readJson(path.join(themeRoot, 'preview', 'state.json')) || {};
    const stateSections = state.surfaces?.[pageType]?.sections || [];
    const pageSections = stateSections.length
        ? stateSections.filter(section => section.enabled !== false).map(section => ({ slug: section.slug, uuid: section.uuid }))
        : (DEFAULT_PAGE_SECTIONS[pageType] || []);

    const sectionSettingsMap = buildSectionSettingsMap(themeJson);
    const translations = loadTranslations(themeRoot, locale);
    const menus = buildMenus(locale);

    // Theme-level settings: theme.json setting defaults only
    // (mirrors ThemeConfigReader::getDefaults() — no DB overrides in preview by design)
    const themeSettings = {};
    for (const group of (themeJson.settings || [])) {
        for (const field of (group.settings || [])) {
            const key = field.key || field.id;
            if (key && field.default !== undefined) {
                themeSettings[key] = field.default;
            }
        }
    }

    const BASE_URL = '';
    const context = {
        _company_id: 1,
        slug: themeJson.slug,
        csrf_token: 'preview-csrf-token',

        shop: {
            company_id: 1,
            name: themeSettings.store_name || (locale === 'ar' ? 'متجري' : 'My Store'),
            domain: `localhost:${process.env.PREVIEW_PORT || 3060}`,
            locale,
            currency: 'SAR',
            rtl: isRtl,
        },

        theme: themeSettings,
        translations,

        collections: {
            featured: { products: Array.from({ length: 8 }, (_, i) => makeProductCard(i + 1, locale)) },
            trending: { products: Array.from({ length: 8 }, (_, i) => makeProductCard(i + 5, locale)) },
        },

        api_routes: {
            products_index: `${BASE_URL}/api/products`,
            categories_index: `${BASE_URL}/api/categories`,
            categories_attributes: `${BASE_URL}/api/categories/attributes`,
            categories_max_price: `${BASE_URL}/api/categories/max-price`,
            product_card_html: `/__preview/api/product-card-html`,
            cart_store: `${BASE_URL}/api/checkout/cart`,
            cart_index: `${BASE_URL}/api/checkout/cart`,
            cart_update: `${BASE_URL}/api/checkout/cart`,
            cart_destroy: `${BASE_URL}/api/checkout/cart`,
            cart_destroy_selected: `${BASE_URL}/api/checkout/cart/destroy-selected`,
            cart_move_to_wishlist: `${BASE_URL}/api/checkout/cart/move-to-wishlist`,
            coupon_apply: `${BASE_URL}/api/checkout/cart/coupon`,
            coupon_remove: `${BASE_URL}/api/checkout/cart/coupon`,
            cart_cross_sell: `${BASE_URL}/api/checkout/cart/cross-sell`,
            wishlist_store: `${BASE_URL}/api/customers/account/wishlist`,
            wishlist_index: `${BASE_URL}/api/customers/account/wishlist`,
            compare_store: `${BASE_URL}/api/compare`,
            compare_index: `${BASE_URL}/api/compare`,
            compare_destroy: `${BASE_URL}/api/compare`,
        },

        page: {
            type: pageType,
            title: pageType,
            slug: slug || null,
        },

        menus,

        request: {
            path: '/',
            locale,
            is_rtl: isRtl,
            is_customer: false,
        },

        payment_methods: [
            {
                code: 'cashondelivery',
                title: isRtl ? 'الدفع عند الاستلام' : 'Cash On Delivery',
                description: isRtl ? 'ادفع نقداً عند استلام طلبك' : 'Pay with cash upon delivery',
                image: 'https://static.vecteezy.com/system/resources/previews/033/046/946/non_2x/solid-icon-for-cod-vector.jpg',
                sort: 1,
            },
            {
                code: 'streampay',
                title: isRtl ? 'ستريم باي' : 'StreamPay',
                description: isRtl ? 'ادفع بأمان عبر بطاقة الائتمان' : 'Secure credit card payment',
                image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS2SdrQgAw2x10zYLqj361d61IRV6O7eOC4BTARq4p-HiGEAkq6_ll2_UPL&s=10',
                sort: 2,
            },
            {
                code: 'moyasar',
                title: isRtl ? 'مويسر' : 'Moyasar',
                description: isRtl ? 'بوابة دفع سعودية' : 'Saudi payment gateway',
                image: 'https://cms-cdn.moyasar.com/48771c2f-3521-4b13-9789-a1c3297b6d9f.png',
                sort: 3,
            },
            {
                code: 'tabby',
                title: isRtl ? 'تابي' : 'Tabby',
                description: isRtl ? 'اشترِ الآن وادفع لاحقاً' : 'Buy now, pay later',
                image: 'https://images.squarespace-cdn.com/content/v1/5abdf4e6c3c16a2a7cfb472b/d7edb476-a13f-4770-a3c6-c8a204953306/tabby-logo-charcoal.png',
                sort: 4,
            },
        ],

        // Internal props — used by server.js, stripped before Liquid render
        _section_settings_map: sectionSettingsMap,
        _page_sections: pageSections,
        _layout_slots: { header: true, footer: true },
        _css_tokens: themeJson.css_tokens || {},
    };

    // Surface-specific additions
    if (pageType === 'product') Object.assign(context, buildProductContext(locale, slug || 'simple'));
    if (pageType === 'category') Object.assign(context, buildCategoryContext(locale));
    if (pageType === 'search') Object.assign(context, buildSearchContext(locale));

    return context;
}

module.exports = { buildContext, makeProductCard, makeCategoryCard, resolveCategoryCards, MOCK_BLOGS, makeBlogCard, mockResolveBlogCards, MOCK_CATEGORIES, PRODUCT_TYPE_BUILDERS, DEFAULT_PAGE_SECTIONS };