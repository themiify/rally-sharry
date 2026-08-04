'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const ejs = require('ejs');
const { Liquid } = require('liquidjs');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');

const { buildContext, resolveCategoryCards, mockResolveBlogCards, MOCK_CATEGORIES, makeBlogCard, makeProductCard, DEFAULT_PAGE_SECTIONS } = require('./mock/context');
const { registerMockApis } = require('./mock/api');

// ─── Paths ────────────────────────────────────────────────────────────────────

const THEME_ROOT = path.resolve(__dirname, '..');
const SECTIONS = path.join(THEME_ROOT, 'sections');
const ASSETS = path.join(THEME_ROOT, 'assets');
const LOCALES = path.join(THEME_ROOT, 'locales');
const THEME_JSON = path.join(THEME_ROOT, 'theme.json');
const STATE_JSON  = path.join(__dirname, 'state.json');
const PREVIEW_ENV = path.join(__dirname, '.env');

function loadPreviewEnv() {
    if (!fs.existsSync(PREVIEW_ENV)) return {};
    const values = {};
    const lines = fs.readFileSync(PREVIEW_ENV, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && process.env[key] === undefined) process.env[key] = value;
        values[key] = value;
    }
    return values;
}

const previewEnv = loadPreviewEnv();
const PREVIEW_DATA_MODE = process.env.PREVIEW_DATA_MODE || previewEnv.PREVIEW_DATA_MODE || 'mock';
const PREVIEW_API_BASE = (process.env.PREVIEW_API_BASE || previewEnv.PREVIEW_API_BASE || '').replace(/\/+$/, '');
const PREVIEW_API_TOKEN = process.env.PREVIEW_API_TOKEN || previewEnv.PREVIEW_API_TOKEN || '';
const IS_API_MODE = PREVIEW_DATA_MODE === 'api';

// ─── LiquidJS engine ─────────────────────────────────────────────────────────

const engine = new Liquid({
    root: SECTIONS,
    extname: '.liquid',
    strictFilters: false,
    strictVariables: false,
    cache: false,
});

engine.registerTag('schema', {
    parse(tagToken, remainTokens) {
        let closed = false;
        while (remainTokens.length) {
            const token = remainTokens.shift();
            if (token.name === 'endschema') { closed = true; break; }
        }
        if (!closed) throw new Error('tag schema not closed');
    },
    render() { return ''; },
});

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(ASSETS));
app.use('/__preview_assets', express.static(path.join(__dirname, 'public')));
app.use('/theme-source/sections', express.static(SECTIONS));

async function proxyApiRequest(req, res) {
    if (!PREVIEW_API_BASE) {
        res.status(400).json({ error: 'PREVIEW_API_BASE is required when PREVIEW_DATA_MODE=api.' });
        return;
    }
    const upstream = `${PREVIEW_API_BASE}${req.originalUrl}`;
    const headers = {
        'Accept': req.get('Accept') || 'application/json',
        'X-Requested-With': req.get('X-Requested-With') || 'XMLHttpRequest',
    };
    if (req.get('Content-Type')) headers['Content-Type'] = req.get('Content-Type');
    try {
        const response = await fetch(upstream, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
        });
        const text = await response.text();
        res.status(response.status);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        res.send(text);
    } catch (err) {
        res.status(502).json({ error: err.message, upstream });
    }
}

if (IS_API_MODE) {
    app.use('/api', proxyApiRequest);
} else {
    registerMockApis(app);
}

// ─── WebSocket hot-reload ─────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });

// ─── Suppress chokidar broadcast ─────────────────────────────────────────────
// لما الكاستومايزر يكتب على ملف (writeSectionDefaults/writeThemeJson)
// chokidar بيلاقي التغيير ويبعت reload — ده بيمسح الـ state
// الحل: suppress الـ broadcast لمدة ثانية بعد أي API write

let _suppressUntil = 0;

function suppressBroadcastFor(ms) {
    _suppressUntil = Date.now() + ms;
}

function broadcast(msg) {
    if (Date.now() < _suppressUntil) {
        console.log('[reload] suppressed (customizer write)');
        return;
    }
    for (const ws of wss.clients) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
    }
}

// ─── File watcher ─────────────────────────────────────────────────────────────

chokidar.watch([SECTIONS, ASSETS, LOCALES, THEME_JSON], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100 },
}).on('all', (event, filePath) => {
    const rel = path.relative(THEME_ROOT, filePath);
    console.log(`[reload] ${event}: ${rel}`);
    broadcast('reload');
});

// ─── Rendering helpers ────────────────────────────────────────────────────────

async function renderSection(sectionFile, context) {
    const tplPath = path.join(SECTIONS, sectionFile);
    if (!fs.existsSync(tplPath)) {
        return `<div style="border:2px dashed #f59e0b;padding:1rem;color:#92400e;font-family:monospace">
            Section not found: <strong>${sectionFile}</strong></div>`;
    }
    try {
        return await engine.renderFile(sectionFile, context);
    } catch (err) {
        console.error(`[section error] ${sectionFile}:`, err.message);
        return `<div style="border:2px solid #ef4444;padding:1rem;color:#991b1b;font-family:monospace">
            <strong>Liquid error in ${sectionFile}</strong><br><pre>${err.message}</pre></div>`;
    }
}

function adjustHex(hex, delta) {
    hex = hex.replace('#', '');
    if (hex.length !== 6) return '#' + hex;
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp(parseInt(hex.slice(0, 2), 16) + delta);
    const g = clamp(parseInt(hex.slice(2, 4), 16) + delta);
    const b = clamp(parseInt(hex.slice(4, 6), 16) + delta);
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function buildCssVariablesBlock(theme, cssTokens = {}) {
    const t = theme || {};
    const vars = [];
    if (t.primary_color)   vars.push(`    --gl-primary: ${t.primary_color};`);
    if (t.secondary_color) vars.push(`    --gl-secondary: ${t.secondary_color};`);
    if (t.accent_color)    vars.push(`    --gl-accent: ${t.accent_color};`);
    if (t.background_color)vars.push(`    --gl-bg: ${t.background_color};`);
    if (t.text_color)      vars.push(`    --gl-text: ${t.text_color};`);
    if (t.heading_color)   vars.push(`    --gl-heading: ${t.heading_color};`);
    if (t.header_bg)       vars.push(`    --gl-header-bg: ${t.header_bg};`);
    if (t.heading_font)    vars.push(`    --gl-font-heading: '${t.heading_font}', serif;`);
    if (t.body_font)       vars.push(`    --gl-font-body: '${t.body_font}', sans-serif;`);
    if (t.arabic_font)     vars.push(`    --gl-font-arabic: '${t.arabic_font}', sans-serif;`);
    if (t.base_font_size)  vars.push(`    --gl-font-size: ${t.base_font_size}px;`);
    if (t.border_radius)   vars.push(`    --gl-radius: ${t.border_radius}px;`);
    if (t.container_width) vars.push(`    --gl-container: ${t.container_width}px;`);
    if (t.primary_color) {
        const pct = (p) => Math.trunc(255 * p / 100);
        vars.push(`    --gl-primary-light: ${adjustHex(t.primary_color, +pct(20))};`);
        vars.push(`    --gl-primary-dark: ${adjustHex(t.primary_color, -pct(15))};`);
        vars.push(`    --gl-box-shadow: ${adjustHex(t.primary_color, -pct(5))};`);
        vars.push(`    --gl-box-shadow-light: ${adjustHex(t.primary_color, +pct(10))};`);
    }
    for (const [cssVar, value] of Object.entries(cssTokens)) {
        vars.push(`    ${cssVar}: ${value};`);
    }
    const rootBlock = `:root {\n${vars.join('\n')}\n}`;
    const rtlBlock = t.arabic_font
        ? `\n[dir="rtl"] {\n    --gl-font-body: '${t.arabic_font}', sans-serif;\n    --gl-font-heading: '${t.arabic_font}', sans-serif;\n}`
        : '';
    return `<style>${rootBlock}${rtlBlock}\n</style>`;
}

function buildGoogleFontsLinks(theme) {
    const t = theme || {};
    const systemFonts = new Set(['arial','helvetica','times','courier','georgia','verdana','system-ui','sans-serif','serif','monospace','poppins']);
    const candidates = [t.heading_font, t.body_font, t.arabic_font];
    const uniqueFonts = [...new Set(candidates.filter((f) => f && !systemFonts.has(f.toLowerCase().trim())))];
    if (uniqueFonts.length === 0) return '';
    const familyParam = uniqueFonts.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`).join('&');
    return [
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        `<link href="https://fonts.googleapis.com/css2?${familyParam}&display=swap" rel="stylesheet">`,
    ].join('\n');
}

function collectCssFiles(rootDir, baseDir = rootDir) {
    if (!fs.existsSync(rootDir)) return [];
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        const fullPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) { files = files.concat(collectCssFiles(fullPath, baseDir)); continue; }
        if (entry.isFile() && entry.name.endsWith('.css')) files.push(path.relative(baseDir, fullPath));
    }
    return files;
}

function loadOrderedCss(themeSlug) {
    const cssRoot = path.join(ASSETS, 'css');
    const files = collectCssFiles(cssRoot);
    const sharry = [], main = [], others = [];
    for (const rel of files) {
        const base = path.basename(rel);
        if (base === 'sharry.css') sharry.push(rel);
        else if (base === `${themeSlug}.css`) main.push(rel);
        else others.push(rel);
    }
    const ordered = [...sharry, ...main, ...others.sort((a, b) => a.localeCompare(b))];
    return ordered.map((rel) => path.join(cssRoot, rel)).filter((p) => fs.existsSync(p)).map((p) => fs.readFileSync(p, 'utf8')).join('\n\n');
}

function injectBeforeHeadEnd(html, content) {
    if (!content) return html;
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${content}\n</head>`);
    return `${content}\n${html}`;
}

function injectBeforeBodyEnd(html, content) {
    if (!content) return html;
    if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${content}\n</body>`);
    return `${html}\n${content}`;
}

async function renderPage(ctx, sectionSettingsMap, pageSections, layoutSlots, cssTokens = {}, sectionSchemaMap = {}) {
    const locale = ctx.request.locale;
    const isAr = locale === 'ar';
    const themeSlug = ctx.slug;
    const cssContent = loadOrderedCss(themeSlug);
    const jsPaths = [
        path.join(ASSETS, 'js', 'sharry.js'),
        path.join(ASSETS, 'js', `${themeSlug}.js`),
    ];
    const jsContent = jsPaths.filter((p) => fs.existsSync(p)).map((p) => fs.readFileSync(p, 'utf8')).join('\n\n');

    function normalizeIds(rawVal, multiple) {
        let ids = [];
        if (rawVal === null || rawVal === undefined || rawVal === '') return [];
        if (Array.isArray(rawVal)) ids = rawVal.map(Number).filter(Boolean);
        else if (typeof rawVal === 'number') ids = [rawVal];
        else if (typeof rawVal === 'string') {
            try { const p = JSON.parse(rawVal); ids = Array.isArray(p) ? p.map(Number).filter(Boolean) : [Number(p)]; }
            catch (_) { const n = Number(rawVal); if (n) ids = [n]; }
        }
        if (multiple === false) ids = ids.slice(0, 1);
        return ids;
    }

    async function resolveLinkField(rawVal) {
        if (!rawVal) return '';
        let val = rawVal;
        if (typeof val === 'string') { try { val = JSON.parse(val); } catch (_) { return val; } }
        if (!val || typeof val !== 'object') return '';
        const type = val.type || '';
        if (type === 'custom') return val.url || '';
        const id = parseInt(val.id || 0, 10);
        if (!id) return '';
        if (IS_API_MODE) {
            try { const data = await fetchDeveloperPreviewData('picker/link/resolve', { type, id }); return typeof data === 'string' ? data : (data?.url || ''); }
            catch (_) { return ''; }
        }
        const mockUrls = { category: `/categories/${id}`, product: `/products/beauty-product-${id}`, blog: `/blogs/article-${id}` };
        return mockUrls[type] || '';
    }

    const renderWithSettings = async (sectionItem, sectionSchemaMap = {}) => {
        // sectionItem can be: string slug, {slug}, or {slug, uuid}
        const sectionKey = typeof sectionItem === 'string' ? sectionItem : sectionItem.slug;
        const sectionUuid = (typeof sectionItem === 'object' && sectionItem.uuid) ? sectionItem.uuid : null;

        // Try uuid-based lookup first (more specific), then slug-based
        const settingsBase = (sectionUuid && sectionSettingsMap[sectionUuid])
            ? sectionSettingsMap[sectionUuid]
            : (sectionSettingsMap[sectionKey] || {});

        const settings = Object.assign({}, settingsBase);
        const schema = sectionSchemaMap[sectionKey] || [];
        const resolved = {};
        const enrichTasks = [];
        for (const field of schema) {
            if (!field.id) continue;
            if (field.type === 'category_picker') {
                const ids = normalizeIds(settings[field.id], field.multiple);
                enrichTasks.push((IS_API_MODE && ids.length ? fetchStorefrontApiData('categories/resolve', { ids }) : Promise.resolve(resolveCategoryCards(ids, locale))).then(cards => { resolved[field.id] = cards; }));
            } else if (field.type === 'blog_picker') {
                const ids = normalizeIds(settings[field.id], field.multiple);
                enrichTasks.push((IS_API_MODE && ids.length ? resolvePickerData('blogs/resolve', { ids }) : Promise.resolve(mockResolveBlogCards(ids, locale))).then(cards => { resolved[field.id] = cards; }));
            } else if (field.type === 'product' && field.resolved === true) {
                const ids = normalizeIds(settings[field.id], field.multiple);
                enrichTasks.push((IS_API_MODE && ids.length ? fetchStorefrontApiData('products/resolve', { ids }) : Promise.resolve(ids.map(id => makeProductCard(id, locale)))).then(cards => { resolved[field.id] = cards; }));
            } else if (field.type === 'category' && field.resolved === true) {
                const ids = normalizeIds(settings[field.id], field.multiple);
                enrichTasks.push((IS_API_MODE && ids.length ? fetchStorefrontApiData('categories/resolve', { ids }) : Promise.resolve(resolveCategoryCards(ids, locale))).then(cards => { resolved[field.id] = cards; }));
            } else if (field.type === 'link') {
                enrichTasks.push(resolveLinkField(settings[field.id]).then(url => { settings[field.id] = url; }));
            } else if (field.type === 'repeater') {
                const subFields = Array.isArray(field.fields) ? field.fields : [];
                const items = settings[field.id] || [];
                if (!Array.isArray(items) || items.length === 0) continue;
                const resolverSubFields = subFields.filter(f =>
                    f.type === 'category_picker' || f.type === 'blog_picker' ||
                    (f.type === 'product' && f.resolved === true) ||
                    (f.type === 'category' && f.resolved === true)
                );
                if (resolverSubFields.length === 0) continue;
                const repeaterId = field.id;
                enrichTasks.push((async () => {
                    const repeaterResolved = [];
                    for (const item of items) {
                        const itemResolved = {};
                        for (const subField of resolverSubFields) {
                            const subIds = normalizeIds(item[subField.id], subField.multiple);
                            if (subField.type === 'category_picker' || (subField.type === 'category' && subField.resolved === true)) {
                                itemResolved[subField.id] = IS_API_MODE && subIds.length
                                    ? await fetchStorefrontApiData('categories/resolve', { ids: subIds })
                                    : resolveCategoryCards(subIds, locale);
                            } else if (subField.type === 'blog_picker') {
                                itemResolved[subField.id] = IS_API_MODE && subIds.length
                                    ? await resolvePickerData('blogs/resolve', { ids: subIds })
                                    : mockResolveBlogCards(subIds, locale);
                            } else if (subField.type === 'product' && subField.resolved === true) {
                                itemResolved[subField.id] = IS_API_MODE && subIds.length
                                    ? await fetchStorefrontApiData('products/resolve', { ids: subIds })
                                    : subIds.map(id => makeProductCard(id, locale));
                            }
                        }
                        repeaterResolved.push(itemResolved);
                    }
                    resolved[repeaterId] = repeaterResolved;
                })());
            }
        }
        await Promise.all(enrichTasks);
        const sectionCtx = Object.assign({}, ctx, { section: { settings, resolved, id: sectionKey, slug: sectionKey, uuid: sectionUuid } });
        const file = sectionKey.endsWith('.liquid') ? sectionKey : `${sectionKey}.liquid`;
        return renderSection(file, sectionCtx);
    };

    const headerHtml  = layoutSlots.header ? await renderWithSettings('header', sectionSchemaMap) : '';
    const footerHtml  = layoutSlots.footer ? await renderWithSettings('footer', sectionSchemaMap) : '';
    const contentHtml = (await Promise.all(pageSections.map(s => renderWithSettings(s, sectionSchemaMap)))).join('\n');

    const wsScript = `
<script>
(function(){
    var ws = new WebSocket('ws://' + location.host);
    ws.onmessage = function(e){
        if(e.data === 'reload'){
            // لو في iframe داخل الكاستومايزر، بلّغ الـ parent بدل ما نعمل full reload
            if(window.parent && window.parent !== window){
                window.parent.postMessage({ type: 'PREVIEW_RELOAD' }, '*');
            } else {
                location.reload();
            }
        }
    };
    ws.onerror = function(){};
})();
</script>`;

    const cssVarsBlock = buildCssVariablesBlock(ctx.theme, cssTokens);
    const fontLinks = buildGoogleFontsLinks(ctx.theme);
    const layoutPath = path.join(THEME_ROOT, 'layout.liquid');
    let renderedHtml = '';

    if (fs.existsSync(layoutPath)) {
        try {
            const layoutTemplate = fs.readFileSync(layoutPath, 'utf8');
            renderedHtml = await engine.parseAndRender(layoutTemplate, Object.assign({}, ctx, {
                content_for_header: headerHtml,
                content_for_layout: contentHtml,
                content_for_footer: footerHtml,
                custom_css: '',
            }));
        } catch (err) {
            console.error('[layout error]', err.message);
            renderedHtml = '';
        }
    }

    if (!renderedHtml || !/<html|<body/i.test(renderedHtml)) {
        renderedHtml = `<!DOCTYPE html>\n<html lang="${locale}" dir="${isAr ? 'rtl' : 'ltr'}">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<meta name="csrf-token" content="preview-csrf-token">\n<title>Theme Preview — ${ctx.page.type}</title>\n</head>\n<body>\n${headerHtml}\n<main id="main-content">\n${contentHtml}\n</main>\n${footerHtml}\n</body>\n</html>`;
    }

    renderedHtml = injectBeforeHeadEnd(renderedHtml, `${fontLinks}\n${cssVarsBlock}\n<style>${cssContent}</style>\n${wsScript}`);
    renderedHtml = injectBeforeBodyEnd(renderedHtml, `<script>${jsContent}</script>\n<script>\ndocument.dispatchEvent(new CustomEvent('theme-marketplace:dynamic', {\n    detail: {\n        auth:   { is_logged_in: false, name: null },\n        cart:   { items_count: 0, has_items: false },\n        flash:  null,\n        locale: '${locale}',\n    }\n}));\n</script>`);
    return renderedHtml;
}

// ─── Schema helpers ───────────────────────────────────────────────────────────

function extractLiquidSchema(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const src = fs.readFileSync(filePath, 'utf8');
        const match = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i);
        if (!match) return null;
        const parsed = JSON.parse(match[1].trim());
        return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.settings) ? parsed.settings : null);
    } catch { return null; }
}

function readThemeJson()       { return JSON.parse(fs.readFileSync(THEME_JSON, 'utf8')); }
function writeThemeJson(tj)    { fs.writeFileSync(THEME_JSON, JSON.stringify(tj, null, 4) + '\n'); }

function readSectionSchemaDocument(slug) {
    const filePath = path.join(SECTIONS, `${slug}.liquid`);
    if (!/^[A-Za-z0-9_-]+$/.test(slug) || !fs.existsSync(filePath)) return null;
    const src = fs.readFileSync(filePath, 'utf8');
    const match = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i);
    if (!match) return null;
    try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function writeSectionSchemaDocument(slug, schemaDocument) {
    const filePath = path.join(SECTIONS, `${slug}.liquid`);
    if (!/^[A-Za-z0-9_-]+$/.test(slug) || !fs.existsSync(filePath)) throw new Error('Section file not found');
    JSON.stringify(schemaDocument);
    const src = fs.readFileSync(filePath, 'utf8');
    const blockPattern = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i;
    const nextBlock = `{% schema %}\n${JSON.stringify(schemaDocument, null, 4)}\n{% endschema %}`;
    if (!blockPattern.test(src)) { fs.writeFileSync(filePath, `${src.trimEnd()}\n\n${nextBlock}\n`); return; }
    fs.writeFileSync(filePath, src.replace(blockPattern, nextBlock));
}

function getThemeSection(slug, themeJson = readThemeJson()) {
    return (themeJson.sections || []).find(sec => sec.slug === slug) || null;
}

function getSectionSchemaDocument(slug, themeJson = readThemeJson()) {
    const liquidDocument = readSectionSchemaDocument(slug);
    if (liquidDocument) {
        const settings = Array.isArray(liquidDocument) ? liquidDocument : (Array.isArray(liquidDocument.settings) ? liquidDocument.settings : []);
        return { source: 'section_schema', document: Array.isArray(liquidDocument) ? { settings } : liquidDocument, settings };
    }
    const themeSection = getThemeSection(slug, themeJson);
    if (!themeSection) return null;
    return {
        source: 'theme_json',
        document: {
            slug: themeSection.slug, name: themeSection.name || slug,
            category: themeSection.category || 'custom',
            template: themeSection.template || `sections/${slug}.liquid`,
            sort_order: themeSection.sort_order || 0,
            reusable: themeSection.reusable ?? true,
            page_types: themeSection.page_types || [],
            settings: Array.isArray(themeSection.settings) ? themeSection.settings : [],
            defaults: themeSection.defaults || {},
        },
        settings: Array.isArray(themeSection.settings) ? themeSection.settings : [],
    };
}

function writeSectionDefaults(slug, values) {
    try {
        const schemaDoc = getSectionSchemaDocument(slug);
        if (!schemaDoc) return;
        if (schemaDoc.source === 'section_schema') writeSectionSchemaDocument(slug, Object.assign({}, schemaDoc.document, { defaults: values }));
        else if (schemaDoc.source === 'theme_json') writeThemeJsonSectionDocument(slug, Object.assign({}, schemaDoc.document, { defaults: values }));
    } catch { }
}

function writeThemeJsonSectionDocument(slug, schemaDocument) {
    const themeJson = readThemeJson();
    const index = (themeJson.sections || []).findIndex(sec => sec.slug === slug);
    if (index === -1) throw new Error('Section not found in theme.json');
    themeJson.sections[index] = Object.assign({}, themeJson.sections[index], {
        name: schemaDocument.name ?? themeJson.sections[index].name,
        category: schemaDocument.category ?? themeJson.sections[index].category,
        template: schemaDocument.template ?? themeJson.sections[index].template,
        sort_order: schemaDocument.sort_order ?? themeJson.sections[index].sort_order,
        reusable: schemaDocument.reusable ?? themeJson.sections[index].reusable,
        page_types: schemaDocument.page_types ?? themeJson.sections[index].page_types,
        settings: Array.isArray(schemaDocument.settings) ? schemaDocument.settings : [],
        defaults: schemaDocument.defaults ?? themeJson.sections[index].defaults,
    });
    writeThemeJson(themeJson);
}

function getFieldDefault(field) {
    if (Object.prototype.hasOwnProperty.call(field, 'default')) return field.default;
    if (field.type === 'checkbox') return false;
    if (field.type === 'repeater') return [];
    if (['product', 'category', 'category_picker', 'blog_picker'].includes(field.type)) return field.multiple === true ? [] : null;
    if (field.type === 'spacing') return { top: 0, right: 0, bottom: 0, left: 0 };
    return '';
}

function normalizeTextValue(field, value) {
    let normalized = value === null || value === undefined ? '' : String(value);
    const max = field.max_length ?? field.max;
    if (Number.isFinite(Number(max)) && Number(max) > 0) normalized = normalized.slice(0, Number(max));
    return normalized;
}

function normalizeFieldValue(field, value) {
    if (!field || !field.type) return value;
    if (field.type === 'text' || field.type === 'textarea') return normalizeTextValue(field, value);
    if (field.type === 'repeater') {
        const rows = Array.isArray(value) ? value : [];
        const nestedFields = Array.isArray(field.fields) ? field.fields : [];
        const maxItems = Math.max(1, Number(field.max_items || 20));
        return rows.slice(0, maxItems).map(row => {
            const normalizedRow = {};
            for (const nestedField of nestedFields) {
                if (!nestedField.id) continue;
                normalizedRow[nestedField.id] = normalizeFieldValue(nestedField, Object.prototype.hasOwnProperty.call(row || {}, nestedField.id) ? row[nestedField.id] : getFieldDefault(nestedField));
            }
            return normalizedRow;
        });
    }
    return value;
}

function normalizeSettingsValues(settings = {}, schema = []) {
    const normalized = Object.assign({}, settings || {});
    for (const field of schema || []) {
        if (!field.id || !Object.prototype.hasOwnProperty.call(normalized, field.id)) continue;
        normalized[field.id] = normalizeFieldValue(field, normalized[field.id]);
    }
    return normalized;
}

function buildSchemaDefaults(settings = [], explicitDefaults = {}) {
    const defaults = {};
    for (const field of settings) {
        if (!field.id) continue;
        defaults[field.id] = getFieldDefault(field);
    }
    return Object.assign(defaults, explicitDefaults || {});
}

function seedState(themeJson = readThemeJson()) {
    const surfaces = {};
    for (const [surface, slugs] of Object.entries(DEFAULT_PAGE_SECTIONS)) {
        surfaces[surface] = {
            sections: slugs.map(slug => ({ uuid: `${surface}-${slug}`, slug, enabled: true })),
            section_settings: {},
        };
        for (const slug of slugs) {
            const schema = getSectionSchemaDocument(slug, themeJson);
            surfaces[surface].section_settings[`${surface}-${slug}`] = schema ? buildSchemaDefaults(schema.settings, schema.document.defaults) : {};
        }
    }
    return {
        version: 1, active_surface: 'home',
        active_locale: process.env.PREVIEW_API_LOCALE || 'ar',
        theme_settings: {}, surfaces,
        layout_slots: { header: { section: 'header', settings: {} }, footer: { section: 'footer', settings: {} } },
        custom_css: '',
    };
}

let _liveState = null;
function readState() {
    if (_liveState) return _liveState;
    if (fs.existsSync(STATE_JSON)) {
        try { _liveState = JSON.parse(fs.readFileSync(STATE_JSON, 'utf8')); return _liveState; } catch (e) {}
    }
    _liveState = seedState();
    return _liveState;
}
function writeState(state) {
    _liveState = Object.assign({ version: 1 }, state || {});
    try { fs.writeFileSync(STATE_JSON, JSON.stringify(_liveState, null, 2), 'utf8'); } catch (e) { console.error('[state] write failed:', e.message); }
}

function buildSectionRegistry(surface = null) {
    const themeJson = readThemeJson();
    const bySlug = new Map((themeJson.sections || []).map(sec => [sec.slug, sec]));
    let slugs = [], stateSections = [];

    if (surface) {
        const state = readState();
        stateSections = state.surfaces?.[surface]?.sections || [];

        if (stateSections.length) {
            slugs = stateSections.filter(item => item.enabled !== false).map(item => item.slug);
        } else {
            slugs = DEFAULT_PAGE_SECTIONS[surface] || [];
            stateSections = slugs.map(slug => ({ uuid: `${surface}-${slug}`, slug, enabled: true }));
        }
    } else {
        const slugSet = new Set([...bySlug.keys()]);
        if (fs.existsSync(SECTIONS)) {
            for (const file of fs.readdirSync(SECTIONS)) {
                if (file.endsWith('.liquid')) slugSet.add(file.replace(/\.liquid$/, ''));
            }
        }
        slugs = [...slugSet].sort();
    }

    if (!surface && fs.existsSync(SECTIONS)) {
        for (const file of fs.readdirSync(SECTIONS)) {
            if (file.endsWith('.liquid') && !slugs.includes(file.replace(/\.liquid$/, ''))) {
                slugs.push(file.replace(/\.liquid$/, ''));
            }
        }
    }

    return slugs.map(slug => {
        const stateSection = stateSections.find(item => item.slug === slug) || {};
        const themeSection = bySlug.get(slug) || {};
        const schema = getSectionSchemaDocument(slug, themeJson);
        const settings = schema?.settings || [];
        return {
            uuid: stateSection.uuid || `${surface || 'global'}-${slug}`,
            slug, enabled: stateSection.enabled ?? true,
            name: schema?.document?.name || themeSection.name || slug,
            category: schema?.document?.category || themeSection.category || 'custom',
            page_types: schema?.document?.page_types || themeSection.page_types || [],
            reusable: schema?.document?.reusable ?? themeSection.reusable ?? true,
            template: themeSection.template || `sections/${slug}.liquid`,
            settings, defaults: schema?.document?.defaults || themeSection.defaults || {},
            source: schema?.source || 'missing',
        };
    });
}

function applyStateToContext(context, pageType, state) {
    const surface = state.surfaces?.[pageType] || {};
    const enabledSections = (surface.sections || [])
        .filter(item => item.enabled !== false)
        .map(item => ({ slug: item.slug, uuid: item.uuid }));

    const sectionSettingsMap = Object.assign({}, context._section_settings_map || {});

    for (const sectionItem of (surface.sections || [])) {
        const slug = sectionItem.slug;
        const uuid = sectionItem.uuid || `${pageType}-${slug}`;
        const schema   = getSectionSchemaDocument(slug);
        const defaults = schema ? buildSchemaDefaults(schema.settings, schema.document?.defaults || {}) : {};
        const saved    = surface.section_settings?.[uuid] || {};

        // Merge: schema defaults → context defaults → saved values
        sectionSettingsMap[slug] = Object.assign(
            {},
            sectionSettingsMap[slug] || {},
            defaults,
            saved
        );

        // Also store under uuid key for sections with duplicate slugs
        sectionSettingsMap[uuid] = sectionSettingsMap[slug];
    }

    context.theme = Object.assign({}, context.theme || {}, state.theme_settings || {});
    context._section_settings_map = sectionSettingsMap;

    // Pass full section objects (with uuid) so renderWithSettings can resolve correctly
    context._page_sections = enabledSections.length
        ? enabledSections
        : (context._page_sections || []);

    context._layout_slots = {
        header: state.layout_slots?.header !== false,
        footer: state.layout_slots?.footer !== false,
    };

    return context;
}

async function proxyDeveloperPreview(req, res) {
    if (!PREVIEW_API_BASE) { res.status(400).json({ error: 'PREVIEW_API_BASE is not configured.' }); return; }
    const upstream = `${PREVIEW_API_BASE}/api/theme/local-preview/${req.params[0] || ''}`;
    const query = new URLSearchParams(req.query).toString();
    const url = query ? `${upstream}?${query}` : upstream;
    try {
        const response = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(PREVIEW_API_TOKEN ? { 'Authorization': `Bearer ${PREVIEW_API_TOKEN}` } : {}) } });
        const text = await response.text();
        res.status(response.status);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        res.send(text);
    } catch (err) { res.status(502).json({ error: err.message }); }
}

function buildQueryString(query) {
    const parts = [];
    for (const [key, val] of Object.entries(query || {})) {
        if (Array.isArray(val)) val.forEach(v => parts.push(`${encodeURIComponent(key + '[]')}=${encodeURIComponent(v)}`));
        else if (val !== undefined && val !== null) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
    return parts.join('&');
}

async function fetchDeveloperPreviewData(pathname, query = {}) {
    if (!PREVIEW_API_BASE) throw new Error('PREVIEW_API_BASE is not configured.');
    const search = buildQueryString(query);
    const url = `${PREVIEW_API_BASE}/api/theme/local-preview/${pathname.replace(/^\/+/, '')}${search ? `?${search}` : ''}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(PREVIEW_API_TOKEN ? { 'Authorization': `Bearer ${PREVIEW_API_TOKEN}` } : {}) } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || json.message || `Developer preview API failed with HTTP ${response.status}`);
    return json.data !== undefined ? json.data : json;
}

async function fetchStorefrontApiData(pathname, query = {}) {
    if (!PREVIEW_API_BASE) throw new Error('PREVIEW_API_BASE is not configured.');
    const search = buildQueryString(query);
    const url = `${PREVIEW_API_BASE}/api/theme/storefront/${pathname.replace(/^\/+/, '')}${search ? `?${search}` : ''}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(PREVIEW_API_TOKEN ? { 'Authorization': `Bearer ${PREVIEW_API_TOKEN}` } : {}) } });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || json.message || `Storefront API failed with HTTP ${response.status}`);
    return json.data !== undefined ? json.data : json;
}

async function buildPreviewContext(pageType, locale, slug) {
    const localContext = buildContext(pageType, locale, slug, THEME_ROOT);
    if (!IS_API_MODE) return applyStateToContext(localContext, pageType, readState());
    const [tenantContext, tenantThemeSettings, tenantSurface] = await Promise.all([
        fetchDeveloperPreviewData('context', { page: pageType, locale, slug }),
        fetchDeveloperPreviewData('theme-settings'),
        fetchDeveloperPreviewData('surface', { page: pageType, locale, slug }),
    ]);
    const surfaceSections = (tenantSurface?.sections || []).filter(section => section.is_visible !== false);
    const sectionSettingsMap = {}, sectionSchemaMap = {};
    for (const section of surfaceSections) {
        if (section.slug) { sectionSettingsMap[section.slug] = section.settings || {}; sectionSchemaMap[section.slug] = section.settings_schema || []; }
    }
    const localState = readState();
    const localSurface = localState.surfaces?.[pageType] || {};
    const localPageSections = (localSurface.sections || []).length
        ? (localSurface.sections || []).filter(section => section.enabled !== false).map(section => ({ slug: section.slug, uuid: section.uuid }))
        : (localContext._page_sections || DEFAULT_PAGE_SECTIONS[pageType] || []);
    const localSectionSettings = localSurface.section_settings || {};
    const fullSectionSettingsMap = {};
    for (const sectionItem of localPageSections) {
        const sectionSlug = typeof sectionItem === 'string' ? sectionItem : sectionItem.slug;
        const sectionUuid = typeof sectionItem === 'object' ? sectionItem.uuid : `${pageType}-${sectionSlug}`;
        const schemaDoc = getSectionSchemaDocument(sectionSlug);
        const defaults = schemaDoc ? buildSchemaDefaults(schemaDoc.settings, schemaDoc.document?.defaults) : {};
        const mergedSettings = Object.assign({}, defaults, sectionSettingsMap[sectionSlug] || {}, localSectionSettings[sectionUuid] || {}, localSectionSettings[sectionSlug] || {});
        fullSectionSettingsMap[sectionSlug] = mergedSettings;
        if (sectionUuid) fullSectionSettingsMap[sectionUuid] = mergedSettings;
    }
    return Object.assign(localContext, tenantContext || {}, {
        theme: Object.assign({}, localContext.theme || {}, tenantContext?.theme || {}, tenantThemeSettings?.merged || {}),
        _section_settings_map: fullSectionSettingsMap,
        _section_schema_map: sectionSchemaMap,
        _page_sections: localPageSections,
        _layout_slots: { header: true, footer: true },
        _css_tokens: tenantThemeSettings?.css_tokens || localContext._css_tokens || {},
    });
}

// ─── Customizer route ─────────────────────────────────────────────────────────

app.get('/customizer', (req, res) => {
    const page = req.query.page || 'home';
    const locale = req.query.locale || process.env.PREVIEW_API_LOCALE || 'en';
    const slug = req.query.slug || '';
    const previewUrl = `/?page=${encodeURIComponent(page)}&locale=${encodeURIComponent(locale)}${slug ? '&slug=' + encodeURIComponent(slug) : ''}`;
    ejs.renderFile(
        path.join(__dirname, 'views', 'customizer.ejs'),
        { page, locale, slug, previewUrl, dataMode: PREVIEW_DATA_MODE, apiBase: PREVIEW_API_BASE || 'mock/local only', surfaces: ['home', 'product', 'category', 'search', 'cart', 'cms', 'custom', '404'] },
        (err, html) => {
            if (err) { res.status(500).send('<pre>' + err.message + '</pre>'); return; }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        }
    );
});

app.get('/__preview/api/demo/*', proxyDeveloperPreview);

// ─── Picker APIs ──────────────────────────────────────────────────────────────

const PICKER_TYPES = ['products', 'categories', 'blogs'];

function mockPickerProducts(query, excludeIds) {
    const results = [];
    for (let i = 1; i <= 20; i++) {
        if (excludeIds.includes(i)) continue;
        const name = `Beauty Product ${i}`;
        if (query && !name.toLowerCase().includes(query.toLowerCase()) && !`SKU-${String(i).padStart(4,'0')}`.toLowerCase().includes(query.toLowerCase())) continue;
        results.push({ id: i, name, sku: `SKU-${String(i).padStart(4,'0')}`, image: `https://picsum.photos/seed/prod${i}/120/120` });
    }
    return results.slice(0, 20);
}

function mockPickerCategories(query, excludeIds) {
    return MOCK_CATEGORIES
        .map((cat, i) => ({ id: i + 1, name: cat.en.name, slug: cat.slug, image: `https://picsum.photos/seed/cat${i + 1}/120/120` }))
        .filter(c => !excludeIds.includes(c.id))
        .filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.slug.includes(query.toLowerCase()))
        .slice(0, 20);
}

function mockPickerBlogs(query, excludeIds) {
    return Array.from({ length: 5 }, (_, i) => makeBlogCard(i + 1, 'en'))
        .map(b => ({ id: b.id, name: b.title, slug: b.slug, image: b.image }))
        .filter(b => !excludeIds.includes(b.id))
        .filter(b => !query || b.name.toLowerCase().includes(query.toLowerCase()) || b.slug.includes(query.toLowerCase()))
        .slice(0, 20);
}

async function resolvePickerData(endpoint, query) {
    if (IS_API_MODE) return fetchDeveloperPreviewData(`picker/${endpoint}`, query);
    const q = (query.query || '').trim();
    const excludeIds = [].concat(query.exclude_ids || []).map(Number).filter(Boolean);
    const ids = [].concat(query.ids || []).map(Number).filter(Boolean);
    if (endpoint === 'products') return mockPickerProducts(q, excludeIds);
    if (endpoint === 'products/resolve') return ids.map(id => ({ id, name: `Beauty Product ${id}`, sku: `SKU-${String(id).padStart(4,'0')}`, image: `https://picsum.photos/seed/prod${id}/120/120` }));
    if (endpoint === 'categories') return mockPickerCategories(q, excludeIds);
    if (endpoint === 'categories/resolve') return resolveCategoryCards(ids, 'en');
    if (endpoint === 'blogs') return mockPickerBlogs(q, excludeIds);
    if (endpoint === 'blogs/resolve') return mockResolveBlogCards(ids, 'en').map(b => ({ id: b.id, name: b.title, slug: b.slug, image: b.image }));
    return [];
}

PICKER_TYPES.forEach(type => {
    app.get(`/__preview/api/picker/${type}`, async (req, res) => {
        try { res.json({ data: await resolvePickerData(type, req.query) }); } catch (err) { res.status(502).json({ error: err.message }); }
    });
    app.get(`/__preview/api/picker/${type}/resolve`, async (req, res) => {
        try { res.json({ data: await resolvePickerData(`${type}/resolve`, req.query) }); } catch (err) { res.status(502).json({ error: err.message }); }
    });
});

app.get('/__preview/api/picker/link/resolve', async (req, res) => {
    try {
        if (IS_API_MODE) { const data = await fetchDeveloperPreviewData('picker/link/resolve', req.query); res.json({ url: typeof data === 'string' ? data : (data?.url || '') }); return; }
        const type = req.query.type || 'custom', id = parseInt(req.query.id || 0, 10), url = req.query.url || '';
        if (type === 'custom') { res.json({ url }); return; }
        if (!id) { res.json({ url: '' }); return; }
        const mockUrls = { category: `/categories/${id}`, product: `/products/beauty-product-${id}`, blog: `/blogs/article-${id}` };
        res.json({ url: mockUrls[type] || '' });
    } catch (err) { res.status(502).json({ error: err.message }); }
});

app.get('/__preview/api/config', (req, res) => {
    res.json({ data: { data_mode: PREVIEW_DATA_MODE, api_base: PREVIEW_API_BASE, theme_root: THEME_ROOT } });
});

app.get('/__preview/api/sections', (req, res) => {
    try { res.json({ data: buildSectionRegistry(req.query.surface || null) }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/__preview/api/theme-settings', (req, res) => {
    try {
        const themeJson = readThemeJson();
        const localGroups = themeJson.settings || [];
        if (IS_API_MODE) {
            fetchDeveloperPreviewData('theme-settings')
                .then(payload => res.json({ data: { groups: (payload.schema && payload.schema.length > 0) ? payload.schema : localGroups, values: payload.merged || {} } }))
                .catch(() => res.json({ data: { groups: localGroups, values: {} } }));
            return;
        }
        const state = readState();
        res.json({ data: { groups: localGroups, values: state.theme_settings || {} } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/__preview/api/theme-json', (req, res) => {
    try { res.json({ data: readThemeJson() }); } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/__preview/api/theme-json', (req, res) => {
    try {
        const nextThemeJson = req.body?.theme_json;
        if (!nextThemeJson || typeof nextThemeJson !== 'object' || Array.isArray(nextThemeJson)) { res.status(422).json({ error: 'theme_json object is required.' }); return; }
        writeThemeJson(nextThemeJson);
        res.json({ status: 'saved', data: nextThemeJson });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/__preview/api/theme-settings', (req, res) => {
    try {
        const updates = req.body?.settings || {};
        const themeJson = readThemeJson();
        const themeSchema = (themeJson.settings || []).flatMap(group => group.settings || []);
        const state = readState();
        state.theme_settings = Object.assign({}, state.theme_settings || {}, normalizeSettingsValues(updates, themeSchema));
        writeState(state);

        // ✅ حفظ في memory فقط + reload عبر WS
        // ❌ مش بنكتب على theme.json عشان chokidar ما يشغّلش reload تاني
        broadcast('reload');

        res.json({ status: 'saved', data: state.theme_settings });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/__preview/api/css-tokens', (req, res) => {
    try {
        const cssTokens = req.body?.css_tokens;
        if (!cssTokens || typeof cssTokens !== 'object' || Array.isArray(cssTokens)) { res.status(422).json({ error: 'css_tokens object is required.' }); return; }
        const themeJson = readThemeJson();
        themeJson.css_tokens = cssTokens;
        writeThemeJson(themeJson);
        res.json({ status: 'saved', data: cssTokens });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/__preview/api/state', (req, res) => {
    if (IS_API_MODE) { res.status(404).json({ error: 'Local state is disabled in PREVIEW_DATA_MODE=api.' }); return; }
    res.json({ data: readState() });
});

app.post('/__preview/api/state', (req, res) => {
    try {
        if (IS_API_MODE) { res.status(405).json({ error: 'Local state is disabled in PREVIEW_DATA_MODE=api.' }); return; }
        writeState(req.body?.state || {});
        res.json({ status: 'saved', data: readState() });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/__preview/api/section-schema/:slug', (req, res) => {
    const schema = getSectionSchemaDocument(req.params.slug);
    if (!schema) { res.status(404).json({ error: 'Schema block not found.' }); return; }
    res.json({ data: Object.assign({}, schema.document, { source: schema.source }) });
});

app.post('/__preview/api/section-schema/:slug', (req, res) => {
    try {
        const schema = req.body?.schema;
        if (!schema || typeof schema !== 'object') { res.status(422).json({ error: 'schema object is required.' }); return; }
        const current = getSectionSchemaDocument(req.params.slug);
        if (current?.source === 'theme_json') writeThemeJsonSectionDocument(req.params.slug, schema);
        else writeSectionSchemaDocument(req.params.slug, schema);
        const updated = getSectionSchemaDocument(req.params.slug);
        res.json({ status: 'saved', data: Object.assign({}, updated.document, { source: updated.source }) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/__preview/api/section-values/:surface/:uuid', (req, res) => {
    try {
        if (IS_API_MODE) {
            const prefix = req.params.surface + '-';
            const slug = req.params.uuid.startsWith(prefix) ? req.params.uuid.slice(prefix.length) : req.params.uuid;
            const localValues = readState().surfaces?.[req.params.surface]?.section_settings?.[req.params.uuid] || {};
            fetchDeveloperPreviewData('surface', { page: req.params.surface, locale: req.query.locale || process.env.PREVIEW_API_LOCALE || 'en' })
                .then(surface => {
                    const tenantSection = (surface.sections || []).find(item => item.slug === slug);
                    const schemaDoc = getSectionSchemaDocument(slug);
                    const defaults = schemaDoc ? buildSchemaDefaults(schemaDoc.settings, schemaDoc.document?.defaults) : {};
                    res.json({ data: Object.assign({}, defaults, tenantSection?.settings || {}, localValues) });
                })
                .catch(err => res.status(502).json({ error: err.message }));
            return;
        }
        const state = readState();
        const surface = state.surfaces?.[req.params.surface] || {};
        res.json({ data: surface.section_settings?.[req.params.uuid] || {} });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/__preview/api/section-values/:surface/:uuid', (req, res) => {
    try {
        const state = readState();
        const surface = req.params.surface, uuid = req.params.uuid;
        state.surfaces = state.surfaces || {};
        state.surfaces[surface] = state.surfaces[surface] || { sections: [], section_settings: {} };
        state.surfaces[surface].section_settings = state.surfaces[surface].section_settings || {};
        let section = (state.surfaces[surface].sections || []).find(item => item.uuid === uuid);
        if (!section) {
            const prefix = surface + '-';
            const slug = uuid.startsWith(prefix) ? uuid.slice(prefix.length) : uuid;
            section = { uuid, slug, enabled: true };
            state.surfaces[surface].sections = state.surfaces[surface].sections || [];
            state.surfaces[surface].sections.push(section);
        }
        const schema = section?.slug ? getSectionSchemaDocument(section.slug) : null;
        const normalized = normalizeSettingsValues(req.body?.settings || {}, schema?.settings || []);

        // حفظ في الـ memory تحت uuid والـ slug الاتنين
        state.surfaces[surface].section_settings[uuid] = normalized;
        if (section?.slug) state.surfaces[surface].section_settings[section.slug] = normalized;
        state.active_surface = surface;
        writeState(state);

        // ✅ بعت reload للـ iframe عبر WS بعد الحفظ في الـ memory
        // ❌ مش بنكتب على الملفات — عشان chokidar ما يعملش reload تاني
        broadcast('reload');

        res.json({ status: 'saved', data: normalized });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Image upload ─────────────────────────────────────────────────────────────
// POST /__preview/api/upload-image
// بيستقبل multipart/form-data فيه "image" file
// بيحفظ الصورة في assets/images/ وبيرجع الـ URL

(function setupImageUpload() {
    const multer = (() => {
        try { return require('multer'); }
        catch(e) {
            console.warn('[upload] multer not installed — image upload disabled. Run: npm install multer');
            return null;
        }
    })();

    const IMAGES_DIR = path.join(ASSETS, 'images');

    if (!fs.existsSync(IMAGES_DIR)) {
        try { fs.mkdirSync(IMAGES_DIR, { recursive: true }); } catch(e) {}
    }

    if (!multer) {
        // Fallback: endpoint exists but returns error
        app.post('/__preview/api/upload-image', (req, res) => {
            res.status(503).json({ error: 'multer not installed. Run: npm install multer inside preview/' });
        });
        return;
    }

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, IMAGES_DIR),
        filename: (req, file, cb) => {
            const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
            const name = path.basename(file.originalname, ext)
                .replace(/[^a-zA-Z0-9_-]/g, '-')
                .slice(0, 40);
            const ts   = Date.now();
            cb(null, `${name}-${ts}${ext}`);
        },
    });

    const upload = multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            const allowed = /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/i;
            cb(null, allowed.test(file.mimetype));
        },
    });

    app.post('/__preview/api/upload-image', upload.single('image'), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم رفع أي صورة أو نوع الملف غير مدعوم.' });
        }
        // الـ URL النسبي اللي بيستخدمه الثيم
        const url = `/assets/images/${req.file.filename}`;
        console.log(`[upload] image saved: ${req.file.filename}`);
        res.json({ url, filename: req.file.filename, size: req.file.size });
    });

    // ── Media upload proxy to demo store ─────────────────────────────────────
    // POST /__preview/api/media/upload
    // Proxies the uploaded file to the demo store's local-preview media upload
    // endpoint using PREVIEW_API_TOKEN as Bearer auth (no CSRF required).
    app.post('/__preview/api/media/upload', upload.single('file'), async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded or unsupported type.' });
        }
        if (!PREVIEW_API_BASE || !PREVIEW_API_TOKEN) {
            // Fallback: save locally only in mock mode (no API configured)
            const localUrl = `/assets/images/${req.file.filename}`;
            console.log(`[media-upload] no API configured, saved locally: ${req.file.filename}`);
            return res.json({ url: localUrl, filename: req.file.filename, size: req.file.size });
        }
        try {
            const fd = new FormData();
            const fileBuffer = fs.readFileSync(req.file.path);
            const blob = new Blob([fileBuffer], { type: req.file.mimetype });
            fd.append('file', blob, req.file.originalname);

            const apiRes = await fetch(`${PREVIEW_API_BASE}/api/theme/local-preview/media/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PREVIEW_API_TOKEN}`,
                    'Accept': 'application/json',
                },
                body: fd,
            });

            // Clean up temp file
            try { fs.unlinkSync(req.file.path); } catch {}

            if (!apiRes.ok) {
                const errBody = await apiRes.json().catch(() => ({}));
                return res.status(apiRes.status).json({ error: errBody.error || errBody.message || 'Upload failed' });
            }

            const data = await apiRes.json();
            // The API returns { data: [{ id, src, url, name, type, size }] }
            const item = (data.data && data.data[0]) || {};
            console.log(`[media-upload] proxied to demo store: ${item.src || item.url}`);
            res.json({ url: item.src || item.url, id: item.id, name: item.name });
        } catch (err) {
            try { fs.unlinkSync(req.file.path); } catch {}
            console.error('[media-upload] proxy error:', err.message);
            res.status(502).json({ error: err.message });
        }
    });
})();


// ⚠️ ترتيب الـ routes مهم جداً:
// reorder لازم يتسجل قبل /:surface POST عشان Express ما يعتبرش "reorder" uuid

// GET /sections/all — كل sections الثيم للـ add modal (optional ?page_type= filter)
app.get('/__preview/api/sections/all', (req, res) => {
    try {
        const pageType = req.query.page_type || null;
        const themeJson = readThemeJson();
        const fromTheme = (themeJson.sections || []).map(s => s.slug);
        const fromDisk  = fs.existsSync(SECTIONS)
            ? fs.readdirSync(SECTIONS).filter(f => f.endsWith('.liquid')).map(f => f.replace(/\.liquid$/, ''))
            : [];
        const unique = [...new Set([...fromTheme, ...fromDisk])].sort();
        const items = unique.map(slug => {
            const schema = getSectionSchemaDocument(slug, themeJson);
            return {
                slug,
                source: 'theme',
                uuid: null,
                name: schema?.document?.name || slug,
                page_types: schema?.document?.page_types || [],
            };
        });
        const filtered = pageType
            ? items.filter(s => !s.page_types.length || s.page_types.includes(pageType))
            : items;
        res.json({ data: filtered });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /page-sections/:surface/reorder — يجب أن يكون قبل POST /:surface
app.post('/__preview/api/page-sections/:surface/reorder', (req, res) => {
    try {
        const surface = req.params.surface;
        const { order } = req.body;
        if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array of uuids' });
        const state = readState();
        const surf  = state.surfaces?.[surface];
        if (!surf) return res.status(404).json({ error: 'surface not found' });
        const map = Object.fromEntries(surf.sections.map(s => [s.uuid, s]));
        surf.sections = order.map(uuid => map[uuid]).filter(Boolean);
        writeState(state);
        broadcast('reload');
        res.json({ data: { ok: true } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /page-sections/:surface — إضافة section
app.post('/__preview/api/page-sections/:surface', (req, res) => {
    try {
        const surface = req.params.surface;
        const { slug } = req.body;
        if (!slug) return res.status(400).json({ error: 'slug required' });
        const state = readState();
        state.surfaces = state.surfaces || {};
        state.surfaces[surface] = state.surfaces[surface] || { sections: [], section_settings: {} };
        state.surfaces[surface].section_settings = state.surfaces[surface].section_settings || {};
        // Use consistent UUID format matching seedState: ${surface}-${slug}
        // If collision exists, append a counter
        let uuid = `${surface}-${slug}`;
        let counter = 1;
        while (state.surfaces[surface].sections.find(s => s.uuid === uuid)) {
            uuid = `${surface}-${slug}-${counter}`;
            counter++;
        }
        const newSec = { uuid, slug, enabled: true };
        state.surfaces[surface].sections.push(newSec);
        const schema = getSectionSchemaDocument(slug);
        state.surfaces[surface].section_settings[uuid] =
            schema ? buildSchemaDefaults(schema.settings, schema.document?.defaults) : {};
        writeState(state);
        broadcast('reload');
        const schemaDoc = getSectionSchemaDocument(slug);
        res.json({ data: { uuid, slug, enabled: true, source: 'theme', name: schemaDoc?.document?.name || slug, settings: schemaDoc?.settings || [] } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /page-sections/:surface/:uuid — حذف section
app.delete('/__preview/api/page-sections/:surface/:uuid', (req, res) => {
    try {
        const { surface, uuid } = req.params;
        const state = readState();
        const surf  = state.surfaces?.[surface];
        if (!surf) return res.status(404).json({ error: 'surface not found' });
        const prefix = `${surface}-`;
        const fallbackSlug = uuid.startsWith(prefix) ? uuid.slice(prefix.length).replace(/-\d+$/, '') : uuid;
        const index = surf.sections.findIndex(s => s.uuid === uuid || (s.slug === fallbackSlug && (!s.uuid || s.uuid === `${surface}-${s.slug}`)));
        if (index < 0) return res.status(404).json({ error: 'section not found' });
        const removed = surf.sections.splice(index, 1)[0];
        delete (surf.section_settings || {})[uuid];
        if (removed?.uuid) delete (surf.section_settings || {})[removed.uuid];
        writeState(state);
        broadcast('reload');
        res.json({ data: { ok: true } });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Product card HTML endpoint ──────────────────────────────────────────────
// product-grid.js calls apiClient.get() with ids[0]=N&ids[1]=M&orientation=...&actions=...
// Express qs parses ids[0]=1&ids[1]=2 into req.query.ids = { '0': '1', '1': '2' } (nested object).
app.get('/__preview/api/product-card-html', async (req, res) => {
    try {
        const locale      = req.query.locale || 'en';
        const orientation = req.query.orientation || 'vertical';
        const actions     = req.query.actions     || 'view,addToCart,wishlist,compare';

        // Collect ids — Express parses ids[0]=1&ids[1]=2 as { ids: { '0': '1', '1': '2' } }
        const rawIdsValue = req.query.ids || req.query['ids[]'] || {};
        let rawIds;
        if (typeof rawIdsValue === 'object' && !Array.isArray(rawIdsValue)) {
            rawIds = Object.values(rawIdsValue);
        } else {
            rawIds = [].concat(rawIdsValue);
        }
        const ids = rawIds.map(id => parseInt(id, 10)).filter(Boolean);

        if (ids.length === 0) return res.json({ data: {} });

        // Build a lightweight base context (translations, api_routes, request) once
        const baseCtx = buildContext('home', locale, '', THEME_ROOT);
        ['_section_settings_map','_page_sections','_layout_slots','_css_tokens'].forEach(k => delete baseCtx[k]);

        // Render product-card.liquid for each ID, return map { "<id>": "<html>" }
        const entries = await Promise.all(ids.map(async id => {
            const productCard = makeProductCard(id, locale);
            const cardCtx = Object.assign({}, baseCtx, {
                product_card_item:        productCard,
                product_card_orientation: orientation,
                product_card_actions:     actions,
            });
            const html = await renderSection('product-card.liquid', cardCtx);
            return [String(id), html];
        }));

        const map = Object.fromEntries(entries);
        res.json({ data: map });
    } catch (err) {
        console.error('[product-card-html]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Main route ───────────────────────────────────────────────────────────────

app.get('/', async (req, res) => {
    const pageType = req.query.page || 'home';
    const locale   = req.query.locale || 'en';
    const slug     = req.query.slug || '';
    try {
        const context = await buildPreviewContext(pageType, locale, slug);
        const sectionSettingsMap = context._section_settings_map || {};
        const pageSections = context._page_sections || [];
        const layoutSlots  = context._layout_slots || {};
        delete context._section_settings_map;
        delete context._page_sections;
        delete context._layout_slots;
        const cssTokens = context._css_tokens || {};
        delete context._css_tokens;
        const contextSectionSchemaMap = context._section_schema_map || {};
        delete context._section_schema_map;
        const themeJson = JSON.parse(fs.readFileSync(THEME_JSON, 'utf8'));
        const sectionSchemaMap = Object.assign({}, contextSectionSchemaMap);
        const renderedSlugs = ['header', 'footer'].concat(pageSections.map(section => typeof section === 'string' ? section : section.slug).filter(Boolean));
        for (const s of renderedSlugs) {
            if (sectionSchemaMap[s]) continue;
            const schema = getSectionSchemaDocument(s, themeJson);
            if (schema?.settings) sectionSchemaMap[s] = schema.settings;
        }
        const html = await renderPage(context, sectionSettingsMap, pageSections, layoutSlots, cssTokens, sectionSchemaMap);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        console.error('[page error]', err);
        res.status(500).send(`<pre style="padding:2rem;color:#991b1b">${err.stack}</pre>`);
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PREVIEW_PORT || process.env.PORT || 3060;
server.listen(PORT, () => {
    console.log('');
    console.log('  ╔═════════════════════════════════════════════════════════════╗');
    console.log(`  ║      Theme Preview  →  http://localhost:${PORT}/customizer     ║`);
    console.log('  ╚═════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Locale: &locale=en|ar');
    console.log('');
});
