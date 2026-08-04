/**
 * Generic JS build script for GoSharry themes.
 *
 * Run from the theme version root (same directory as package.json).
 *
 * Usage:
 *   node build.mjs            → production build  (minified, no sourcemap)
 *   node build.mjs --dev      → development build (not minified, inline sourcemap)
 *   node build.mjs --watch    → watch mode        (not minified, inline sourcemap)
 *   node build.mjs --pack     → production build + create upload zip
 *   node build.mjs --slug=foo → override theme slug
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';


const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// ── Resolve slug ──────────────────────────────────────────────────────────────

const slugArg = process.argv.find((a) => a.startsWith('--slug='));
let slug;

if (slugArg) {
    slug = slugArg.split('=')[1];
} else {
    const themeJsonPath = [
        resolve(__dirname, 'theme.json'),
        resolve(process.cwd(), 'theme.json'),
    ].find(existsSync);

    if (!themeJsonPath) {
        console.error('[build] Could not find theme.json. Pass --slug=<slug> to set the output filename, or run from the theme version directory.');
        process.exit(1);
    }

    slug = JSON.parse(readFileSync(themeJsonPath, 'utf8')).slug;
}

if (!slug) {
    console.error('[build] Could not determine theme slug.');
    process.exit(1);
}

// ── Options ───────────────────────────────────────────────────────────────────

const isPack  = process.argv.includes('--pack');
const isWatch = process.argv.includes('--watch');
const isDev   = isWatch || process.argv.includes('--dev');

// ── Paths ─────────────────────────────────────────────────────────────────────

const THEME_ROOT = __dirname;
const JS_SRC     = resolve(THEME_ROOT, 'assets', 'js', 'index.js');
const JS_OUT     = resolve(THEME_ROOT, 'assets', 'js', `${slug}.js`);
const CSS_OUT    = resolve(THEME_ROOT, 'assets', 'css', `${slug}.css`);

// ── esbuild ───────────────────────────────────────────────────────────────────

function loadEsbuild() {
    const bases = [__dirname, process.cwd()];
    for (const base of bases) {
        try {
            return require(require.resolve('esbuild', { paths: [base] }));
        } catch { /* try next */ }
    }
    throw new Error('[build] Could not resolve "esbuild". Run npm install.');
}

const esbuild = loadEsbuild();

const buildOptions = {
    entryPoints: [JS_SRC],
    bundle:      true,
    format:      'iife',
    outfile:     JS_OUT,
    minify:      !isDev,
    sourcemap:   isDev ? 'inline' : false,
    logLevel:    'info',
};

// ── State → Schema sync ───────────────────────────────────────────────────────
// Reads preview/state.json and merges local customizer values into schema
// defaults so they survive packaging into the theme ZIP.

const SECTIONS_DIR = resolve(THEME_ROOT, 'sections');
const STATE_JSON   = resolve(THEME_ROOT, 'preview', 'state.json');
const THEME_JSON_PATH = resolve(THEME_ROOT, 'theme.json');

function readThemeJsonSync() {
    return JSON.parse(readFileSync(THEME_JSON_PATH, 'utf8'));
}

function writeThemeJsonSync(tj) {
    writeFileSync(THEME_JSON_PATH, JSON.stringify(tj, null, 4) + '\n', 'utf8');
}

function readLiquidSchema(filePath) {
    if (!existsSync(filePath)) return null;
    const src = readFileSync(filePath, 'utf8');
    const match = src.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i);
    if (!match) return null;
    try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function writeLiquidSchema(filePath, schemaDoc) {
    const src = readFileSync(filePath, 'utf8');
    const blockPattern = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i;
    const nextBlock = `{% schema %}\n${JSON.stringify(schemaDoc, null, 4)}\n{% endschema %}`;
    if (!blockPattern.test(src)) {
        writeFileSync(filePath, `${src.trimEnd()}\n\n${nextBlock}\n`, 'utf8');
        return;
    }
    writeFileSync(filePath, src.replace(blockPattern, nextBlock), 'utf8');
}

function getSectionSchemaSource(slug, themeJson) {
    const liquidPath = join(SECTIONS_DIR, `${slug}.liquid`);
    const liquidDoc = readLiquidSchema(liquidPath);
    if (liquidDoc) {
        const settings = Array.isArray(liquidDoc) ? liquidDoc : (Array.isArray(liquidDoc.settings) ? liquidDoc.settings : []);
        const doc = Array.isArray(liquidDoc) ? { settings } : liquidDoc;
        return { source: 'section_liquid', document: doc, settings, filePath: liquidPath };
    }
    const themeSection = (themeJson.sections || []).find(sec => sec.slug === slug);
    if (themeSection) {
        return {
            source: 'theme_json',
            document: {
                slug: themeSection.slug,
                name: themeSection.name || slug,
                category: themeSection.category || 'custom',
                template: themeSection.template || `sections/${slug}.liquid`,
                sort_order: themeSection.sort_order || 0,
                reusable: themeSection.reusable ?? true,
                page_types: themeSection.page_types || [],
                settings: Array.isArray(themeSection.settings) ? themeSection.settings : [],
                defaults: themeSection.defaults || {},
            },
            settings: Array.isArray(themeSection.settings) ? themeSection.settings : [],
            filePath: null,
        };
    }
    return null;
}

function syncStateToSchema() {
    if (!existsSync(STATE_JSON)) {
        console.log('[sync] No preview/state.json found — skipping state-to-schema sync.');
        return;
    }

    let state;
    try { state = JSON.parse(readFileSync(STATE_JSON, 'utf8')); }
    catch (e) { console.warn('[sync] Could not parse state.json:', e.message); return; }

    const themeJson = readThemeJsonSync();
    let themeModified = false;
    const modifiedFiles = new Set();

    // ── 1. Theme-level settings → theme.json defaults ──
    const themeValues = state.theme_settings || {};
    if (Object.keys(themeValues).length > 0) {
        for (const group of (themeJson.settings || [])) {
            for (const field of (group.settings || [])) {
                if (field.id && Object.prototype.hasOwnProperty.call(themeValues, field.id)) {
                    field.default = themeValues[field.id];
                    themeModified = true;
                }
            }
        }
    }

    // ── 2. Section-level settings → schema defaults (last instance wins) ──
    const surfaces = state.surfaces || {};
    const lastValuesBySlug = {}; // slug → { values, source }

    for (const [surfaceName, surface] of Object.entries(surfaces)) {
        const sections = surface.sections || [];
        const sectionSettings = surface.section_settings || {};
        for (const sec of sections) {
            if (sec.enabled === false) continue;
            const uuid = sec.uuid;
            const slug = sec.slug;
            const values = sectionSettings[uuid] || sectionSettings[slug];
            if (slug && values && typeof values === 'object') {
                lastValuesBySlug[slug] = values;
            }
        }
    }

    // Write merged defaults back to each section's schema source
    for (const [slug, values] of Object.entries(lastValuesBySlug)) {
        const schemaSource = getSectionSchemaSource(slug, themeJson);
        if (!schemaSource) continue;

        const merged = Object.assign({}, schemaSource.document.defaults || {}, values);

        if (schemaSource.source === 'section_liquid') {
            const doc = Object.assign({}, schemaSource.document, { defaults: merged });
            writeLiquidSchema(schemaSource.filePath, doc);
            modifiedFiles.add(schemaSource.filePath);
        } else if (schemaSource.source === 'theme_json') {
            const idx = (themeJson.sections || []).findIndex(sec => sec.slug === slug);
            if (idx !== -1) {
                themeJson.sections[idx].defaults = merged;
                themeModified = true;
            }
        }
    }

    if (themeModified) {
        writeThemeJsonSync(themeJson);
        modifiedFiles.add(THEME_JSON_PATH);
    }

    if (modifiedFiles.size > 0) {
        console.log('[sync] ✓ Merged state.json values into schema defaults:');
        for (const f of modifiedFiles) console.log(`  - ${f}`);
    } else {
        console.log('[sync] No state values to merge.');
    }
}

// ── Pack helpers ──────────────────────────────────────────────────────────────

async function createZip() {
    let archiver;
    try {
        archiver = require(require.resolve('archiver', { paths: [__dirname, process.cwd()] }));
    } catch {
        console.error('[build] Could not resolve "archiver". Run npm install.');
        process.exit(1);
    }

    const { createWriteStream } = await import('fs');
    const ZIP_OUT = resolve(THEME_ROOT, `${slug}.zip`);

    console.log(`[${slug}] Creating zip: ${ZIP_OUT}`);

    await new Promise((res, rej) => {
        const output  = createWriteStream(ZIP_OUT);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`[${slug}] ✓ Zip created: ${ZIP_OUT} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
            res();
        });
        archive.on('error', rej);
        archive.pipe(output);

        // Files the platform reads — flat zip (no wrapping folder)
        archive.file(join(THEME_ROOT, 'theme.json'),   { name: 'theme.json' });
        archive.file(join(THEME_ROOT, 'layout.liquid'), { name: 'layout.liquid' });
        archive.directory(join(THEME_ROOT, 'sections'), 'sections');
        archive.directory(join(THEME_ROOT, 'locales'),  'locales');

        // Ship every compiled CSS file in assets/css (excluding dev source folder)
        archive.glob('**/*.css', {
            cwd: join(THEME_ROOT, 'assets', 'css'),
            ignore: ['src/**'],
        }, {
            prefix: 'assets/css/',
        });

        // Built JS bundle only (not source folder)
        archive.file(JS_OUT, { name: `assets/js/${slug}.js` });

        archive.finalize();
    });
}

// ── Run ───────────────────────────────────────────────────────────────────────

if (isPack) {
    console.log(`[${slug}] Building for release...`);
    syncStateToSchema();
    await esbuild.build(buildOptions);
    console.log(`[${slug}] ✓ JS bundle written to ${JS_OUT}`);
    await createZip();
} else if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log(`[${slug}] Watching for JS changes... (Ctrl+C to stop)`);
} else {
    await esbuild.build(buildOptions);
    console.log(`[${slug}] ✓ JS bundle written to ${JS_OUT}`);
}
