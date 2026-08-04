'use strict';

/**
 * api.js — Mock API routes
 *
 * Registers Express routes that mirror real Bagisto shop API endpoints.
 * In-memory state resets on server restart — sufficient for layout/styling preview.
 *
 * Response shapes match real Bagisto exactly (verified from source).
 * Key quirk: GET /api/checkout/cart is double-wrapped: { data: { data: cart } }
 */

const { makeProductCard, resolveCategoryCards } = require('./context');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount) {
    return `${parseFloat(amount).toFixed(2)} SAR`;
}

function makeCartItem(productId, qty, locale) {
    const card = makeProductCard(productId, locale || 'en');
    return {
        id: productId,
        quantity: qty,
        type: 'simple',
        name: card.name,
        sku: card.sku,
        price: card.price,
        formatted_price: card.formatted_price,
        price_incl_tax: card.price,
        formatted_price_incl_tax: card.formatted_price,
        total: parseFloat((card.price * qty).toFixed(2)),
        formatted_total: fmt(card.price * qty),
        total_incl_tax: parseFloat((card.price * qty).toFixed(2)),
        formatted_total_incl_tax: fmt(card.price * qty),
        discount_amount: 0,
        formatted_discount_amount: fmt(0),
        base_image: card.base_image,
        product_url_key: card.slug,
        options: [],
        can_change_qty: true,
    };
}

function recalcCart(cart) {
    const subTotal = cart.items.reduce((sum, item) => sum + item.total, 0);
    const discount = cart.coupon_code ? parseFloat((subTotal * 0.10).toFixed(2)) : 0;
    const grand = parseFloat((subTotal - discount).toFixed(2));

    cart.items_count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.items_qty = cart.items_count;
    cart.sub_total = subTotal;
    cart.formatted_sub_total = fmt(subTotal);
    cart.sub_total_incl_tax = subTotal;
    cart.formatted_sub_total_incl_tax = fmt(subTotal);
    cart.discount_amount = discount;
    cart.formatted_discount_amount = fmt(discount);
    cart.grand_total = grand;
    cart.formatted_grand_total = fmt(grand);
}

function freshCart() {
    return {
        id: 1,
        is_guest: true,
        customer_id: null,
        items_count: 0,
        items_qty: 0,
        applied_taxes: [],
        tax_total: 0,
        formatted_tax_total: fmt(0),
        sub_total: 0,
        formatted_sub_total: fmt(0),
        sub_total_incl_tax: 0,
        formatted_sub_total_incl_tax: fmt(0),
        coupon_code: null,
        discount_amount: 0,
        formatted_discount_amount: fmt(0),
        shipping_method: null,
        shipping_amount: 0,
        formatted_shipping_amount: fmt(0),
        shipping_amount_incl_tax: 0,
        formatted_shipping_amount_incl_tax: fmt(0),
        grand_total: 0,
        formatted_grand_total: fmt(0),
        items: [],
        billing_address: null,
        shipping_address: null,
        have_stockable_items: true,
        payment_method: null,
        payment_method_title: null,
    };
}

const VALID_COUPONS = {
    DEMO10: { discount: 0.10, label: '10% off (demo)' },
    SUMMER20: { discount: 0.20, label: '20% off (summer)' },
    BEAUTY15: { discount: 0.15, label: '15% off (beauty)' },
};

function makeCategory(i, locale) {
    const isAr = locale === 'ar';
    const names = [
        ['Lipsticks', 'أحمر الشفاه'],
        ['Foundation', 'أساس الوجه'],
        ['Skincare', 'العناية بالبشرة'],
        ['Eyeshadow', 'ظلال العيون'],
        ['Mascara', 'ماسكارا'],
        ['Perfumes', 'العطور'],
    ];
    const [en, ar] = names[(i - 1) % names.length];
    return {
        id: i,
        parent_id: 1,
        name: isAr ? ar : en,
        slug: en.toLowerCase().replace(/\s+/g, '-'),
        status: 1,
        position: i,
        display_mode: 'products',
        description: '',
        logo: { medium_image_url: `https://picsum.photos/seed/cat${i}/400/300` },
        banner: null,
        meta: { title: '', keywords: '', description: '' },
        translations: [],
        additional: {},
    };
}

// ─── Register ─────────────────────────────────────────────────────────────────

function registerMockApis(app) {
    // multer.none() parses multipart/form-data fields (used by the theme's FormData sends)
    // without it, req.body.product_id is always undefined → cart mock defaults to product 1.
    let multerNone = null;
    try {
        const multer = require('multer');
        multerNone = multer({ storage: multer.memoryStorage() }).none();
    } catch (e) { /* multer not installed — FormData fields won't parse */ }
    const formParser = multerNone || ((req, res, next) => next());

    // In-memory state
    let cart = freshCart();
    let wishlist = [];
    let compare = [];
    let nextItemId = 100;

    // ── Cart ──────────────────────────────────────────────────────────────────

    // GET — double-wrapped to match real Bagisto: { data: { data: cart } }
    app.get('/api/checkout/cart', (req, res) => {
        res.json({ data: { data: cart } });
    });

    // POST — Add to cart
    app.post('/api/checkout/cart', formParser, (req, res) => {
        const productId = parseInt(req.body.product_id || req.query.product_id || 1);
        const qty = parseInt(req.body.quantity || req.query.quantity || 1);
        const existing = cart.items.find(i => i.id === productId);
        if (existing) {
            existing.quantity += qty;
            existing.total = parseFloat((existing.price * existing.quantity).toFixed(2));
            existing.formatted_total = fmt(existing.total);
            existing.total_incl_tax = existing.total;
            existing.formatted_total_incl_tax = fmt(existing.total);
        } else {
            cart.items.push(makeCartItem(productId, qty, 'en'));
        }
        recalcCart(cart);
        res.json({ data: cart, message: 'Item added to cart.' });
    });

    // DELETE /:id — Remove item
    app.delete('/api/checkout/cart/:id', (req, res) => {
        const id = parseInt(req.params.id);
        cart.items = cart.items.filter(i => i.id !== id);
        recalcCart(cart);
        res.json({ data: cart, message: 'Item removed from cart.' });
    });

    // PUT — Update quantities  { qty: { "1": 3, "2": 1 } }
    app.put('/api/checkout/cart', (req, res) => {
        const quantities = req.body.qty || {};
        for (const item of cart.items) {
            const newQty = parseInt(quantities[item.id]);
            if (newQty > 0) {
                item.quantity = newQty;
                item.total = parseFloat((item.price * newQty).toFixed(2));
                item.formatted_total = fmt(item.total);
                item.total_incl_tax = item.total;
                item.formatted_total_incl_tax = fmt(item.total);
            } else if (newQty === 0) {
                cart.items = cart.items.filter(i => i.id !== item.id);
            }
        }
        recalcCart(cart);
        res.json({ data: cart, message: 'Cart updated.' });
    });

    // POST — Destroy selected  { ids: [1, 2] }
    app.post('/api/checkout/cart/destroy-selected', (req, res) => {
        const ids = (req.body.ids || []).map(Number);
        cart.items = cart.items.filter(i => !ids.includes(i.id));
        recalcCart(cart);
        res.json({ data: cart, message: 'Selected items removed.' });
    });

    // POST — Move to wishlist
    app.post('/api/checkout/cart/move-to-wishlist/:id', (req, res) => {
        const id = parseInt(req.params.id);
        const item = cart.items.find(i => i.id === id);
        if (item) {
            cart.items = cart.items.filter(i => i.id !== id);
            recalcCart(cart);
            if (!wishlist.find(w => w.id === id)) {
                wishlist.push({ id: nextItemId++, product: makeProductCard(id, 'en'), options: {} });
            }
        }
        res.json({ message: 'Item moved to wishlist.' });
    });

    // POST — Apply coupon
    app.post('/api/checkout/cart/coupon', (req, res) => {
        const code = (req.body.code || '').toUpperCase();
        if (!VALID_COUPONS[code]) {
            return res.status(422).json({ data: cart, message: 'Invalid coupon code. Try: DEMO10, SUMMER20, or BEAUTY15' });
        }
        if (cart.coupon_code === code) {
            return res.status(422).json({ data: cart, message: 'Coupon code already applied.' });
        }
        cart.coupon_code = code;
        recalcCart(cart);
        res.json({ data: cart, message: 'Coupon applied successfully.' });
    });

    // DELETE — Remove coupon
    app.delete('/api/checkout/cart/coupon', (req, res) => {
        cart.coupon_code = null;
        recalcCart(cart);
        res.json({ data: cart, message: 'Coupon removed successfully.' });
    });

    // GET — Cross-sell (6 products, NOT paginated)
    app.get('/api/checkout/cart/cross-sell', (req, res) => {
        const products = Array.from({ length: 6 }, (_, i) => makeProductCard(i + 30, 'en'));
        res.json({ data: products });
    });

    // ── Products ──────────────────────────────────────────────────────────────

    app.get('/api/products', (req, res) => {
        // Support id[] filter (used by product-spotlight)
        const idFilter = [].concat(req.query['id[]'] || req.query.id || []).map(Number).filter(Boolean);
        const locale = req.query.locale || 'en';

        if (idFilter.length > 0) {
            const products = idFilter.map(id => makeProductCard(id, locale));
            return res.json({ data: products });
        }

        // Support category_id filter (used by category-carousel)
        const categoryId = parseInt(req.query.category_id || 0);
        if (categoryId > 0) {
            const seed = (categoryId - 1) * 8;
            const products = Array.from({ length: 8 }, (_, i) => makeProductCard(seed + i + 1, locale));
            return res.json({ data: products });
        }
        const BASE_URL = '';
        const page = parseInt(req.query.page || 1);
        const perPage = parseInt(req.query.limit || req.query.per_page || 12);
        const total = 48;
        const lastPage = Math.ceil(total / perPage);
        const from = (page - 1) * perPage + 1;
        const to = Math.min(page * perPage, total);
        const products = Array.from({ length: perPage }, (_, i) =>
            makeProductCard((page - 1) * perPage + i + 1, locale)
        );
        res.json({
            data: products,
            links: {
                first: `${BASE_URL}/api/products?page=1`,
                last: `${BASE_URL}/api/products?page=${lastPage}`,
                prev: page > 1 ? `${BASE_URL}/api/products?page=${page - 1}` : null,
                next: page < lastPage ? `${BASE_URL}/api/products?page=${page + 1}` : null,
            },
            meta: {
                current_page: page, from, last_page: lastPage, per_page: perPage, to, total,
                path: `${BASE_URL}/api/products`
            },
        });
    });

    // GET — Related (4 items, NOT paginated)
    app.get('/api/products/:id/related', (req, res) => {
        const products = Array.from({ length: 4 }, (_, i) => makeProductCard(i + 40, 'en'));
        res.json({ data: products });
    });

    // GET — Up-sell (4 items, NOT paginated)
    app.get('/api/products/:id/up-sell', (req, res) => {
        const products = Array.from({ length: 4 }, (_, i) => makeProductCard(i + 50, 'en'));
        res.json({ data: products });
    });

    // ── Reviews ───────────────────────────────────────────────────────────────

    app.get('/api/product/:id/reviews', (req, res) => {
        res.json({
            data: [
                {
                    id: 1, title: 'Amazing product!', comment: 'Really love this, will buy again.',
                    rating: 5, name: 'Sarah M.', created_at: '2026-01-15'
                },
                {
                    id: 2, title: 'Great quality', comment: 'High quality and fast shipping.',
                    rating: 4, name: 'Nour A.', created_at: '2026-02-20'
                },
            ]
        });
    });

    app.post('/api/product/:id/review', formParser, (req, res) => {
        res.json({
            data: {
                id: 3, title: req.body.title, comment: req.body.comment,
                rating: req.body.rating, name: 'Preview User', created_at: new Date().toISOString().slice(0, 10)
            },
            message: 'Review submitted successfully.'
        });
    });

    // ── Categories ────────────────────────────────────────────────────────────

    app.get('/api/categories', (req, res) => {
        const cats = Array.from({ length: 6 }, (_, i) => makeCategory(i + 1, 'en'));
        res.json({
            data: cats, links: {}, meta: {
                total: 6, per_page: 15, current_page: 1,
                last_page: 1, from: 1, to: 6
            }
        });
    });

    app.get('/api/categories/tree', (req, res) => {
        const cats = Array.from({ length: 6 }, (_, i) => {
            const c = makeCategory(i + 1, 'en');
            const BASE_URL = '';
            return {
                id: c.id, parent_id: null, name: c.name, slug: c.slug,
                url: `${BASE_URL}/${c.slug}`, status: 1, children: []
            };
        });
        res.json({ data: cats });
    });

    // ── Category picker resolve (mirrors /api/theme/storefront/categories/resolve) ─

    app.get('/api/theme/storefront/categories/resolve', (req, res) => {
        const locale = req.query.locale || 'en';
        const rawIds = [].concat(req.query['ids[]'] || req.query.ids || []);
        const ids = rawIds.map(id => parseInt(id, 10)).filter(Boolean);
        if (ids.length === 0) {
            return res.json({ data: [] });
        }
        const cards = resolveCategoryCards(ids, locale);
        res.json({ data: cards });
    });

    // ── Wishlist ──────────────────────────────────────────────────────────────

    app.get('/api/customers/account/wishlist', (req, res) => {
        res.json({ data: wishlist });
    });

    app.post('/api/customers/account/wishlist', formParser, (req, res) => {
        const productId = parseInt(req.body.product_id || 1);
        const existing = wishlist.findIndex(w => w.product.id === productId);
        if (existing >= 0) {
            wishlist.splice(existing, 1);
            return res.json({ message: 'Item removed from wishlist successfully.' });
        }
        wishlist.push({ id: nextItemId++, product: makeProductCard(productId, 'en'), options: {} });
        res.json({ message: 'Item added to wishlist successfully.' });
    });

    // ── Compare ───────────────────────────────────────────────────────────────

    app.get('/api/compare', (req, res) => {
        res.json({ data: compare });
    });

    app.post('/api/compare', formParser, (req, res) => {
        const productId = parseInt(req.body.product_id || 1);
        if (compare.find(p => p.id === productId)) {
            return res.status(422).json({ message: 'Product already exists in compare.' });
        }
        if (compare.length >= 4) {
            return res.status(422).json({ message: 'You can only compare up to 4 products.' });
        }
        compare.push(makeProductCard(productId, 'en'));
        res.json({ message: 'Product added to compare successfully.' });
    });

    app.delete('/api/compare/:id', (req, res) => {
        compare = compare.filter(p => p.id !== parseInt(req.params.id));
        res.json({ message: 'Product removed from compare.' });
    });

    // ── Theme dynamic (mirrors /api/theme/storefront/dynamic) ─────────────────

    app.get('/api/theme/storefront/dynamic', (req, res) => {
        res.json({
            has_theme: true,
            data: {
                auth: { is_logged_in: false, name: null },
                cart: { items_count: cart.items_count, has_items: cart.items_count > 0 },
                flash: null,
                locale: req.query.locale || 'en',
            },
        });
    });

    // ── Core ──────────────────────────────────────────────────────────────────

    app.get('/api/core/countries', (req, res) => {
        res.json({
            data: [
                { id: 1, code: 'SA', name: 'Saudi Arabia' },
                { id: 2, code: 'AE', name: 'United Arab Emirates' },
                { id: 3, code: 'KW', name: 'Kuwait' },
            ]
        });
    });

    app.get('/api/core/states', (req, res) => {
        res.json({
            data: [
                { id: 1, country_code: 'SA', code: 'SA-01', name: 'Riyadh' },
                { id: 2, country_code: 'SA', code: 'SA-02', name: 'Jeddah' },
            ]
        });
    });

    // ── Category Attributes & Filters ────────────────────────────────────────

    // product-grid.js reads attr.name and opt.name (not label)
    const MOCK_ATTRIBUTES = [
        {
            id: 23, code: 'color', name: 'Color', type: 'select', swatch_type: 'color',
            options: [
                { id: 1,  name: 'Red',    swatch_value: '#dc2626', count: 12 },
                { id: 2,  name: 'Pink',   swatch_value: '#ec4899', count: 8  },
                { id: 3,  name: 'Nude',   swatch_value: '#d4a574', count: 15 },
                { id: 4,  name: 'Brown',  swatch_value: '#92400e', count: 7  },
                { id: 5,  name: 'Berry',  swatch_value: '#7c3aed', count: 6  },
            ],
        },
        {
            id: 24, code: 'size', name: 'Size', type: 'select', swatch_type: 'text',
            options: [
                { id: 10, name: 'Travel',  swatch_value: null, count: 18 },
                { id: 11, name: 'Regular', swatch_value: null, count: 30 },
                { id: 12, name: 'Jumbo',   swatch_value: null, count: 10 },
            ],
        },
        {
            id: 25, code: 'brand', name: 'Brand', type: 'select', swatch_type: null,
            options: [
                { id: 20, name: 'Glamour',  swatch_value: null, count: 22 },
                { id: 21, name: 'Luxe',     swatch_value: null, count: 14 },
                { id: 22, name: 'Naturelle',swatch_value: null, count: 9  },
            ],
        },
        { id: 26, code: 'price', name: 'Price Range', type: 'price', swatch_type: null, options: [] },
    ];

    // GET /api/categories/attributes — filterable attributes for current category
    app.get('/api/categories/attributes', (req, res) => {
        // Return attributes without options (options fetched separately per attribute)
        const attrs = MOCK_ATTRIBUTES.map(a => ({
            id: a.id, code: a.code, name: a.name, type: a.type, swatch_type: a.swatch_type,
        }));
        res.json({ data: attrs });
    });

    // GET /api/categories/attributes/:id/options — paginated options for an attribute
    app.get('/api/categories/attributes/:id/options', (req, res) => {
        const attrId = parseInt(req.params.id, 10);
        const attr = MOCK_ATTRIBUTES.find(a => a.id === attrId);
        if (!attr) return res.status(404).json({ data: [] });
        const page = parseInt(req.query.page || 1);
        const perPage = parseInt(req.query.per_page || 10);
        const total = attr.options.length;
        const from = (page - 1) * perPage;
        const items = attr.options.slice(from, from + perPage);
        res.json({
            data: items,
            meta: { current_page: page, per_page: perPage, total, last_page: Math.ceil(total / perPage) },
        });
    });

    // GET /api/categories/max-price/:categoryId — maximum price for price-range filter
    app.get('/api/categories/max-price/:categoryId', (req, res) => {
        res.json({ data: { max_price: 500 } });
    });

    // Also handle no-category variant
    app.get('/api/categories/max-price', (req, res) => {
        res.json({ data: { max_price: 500 } });
    });

    // ── Booking slots (mirrors shop.booking-product.slots.index) ──────────

    app.get('/api/booking/:productId/slots', (req, res) => {
        const date = req.query.date || new Date().toISOString().slice(0, 10);

        // Generate mock time slots
        const slots = [];
        const startHour = 9;
        const endHour = 18;
        const duration = 60; // minutes

        for (let h = startHour; h < endHour; h++) {
            const from = `${String(h).padStart(2, '0')}:00`;
            const to = `${String(h + 1).padStart(2, '0')}:00`;
            slots.push({
                id: h - startHour + 1,
                from,
                to,
                timestamp: `${date} ${from}`,
            });
        }

        res.json({ data: slots });
    });
}

module.exports = { registerMockApis };
