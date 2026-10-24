# PROJECT
paperstamp: static browser layout designer. src/core/ renders a layoutDef onto a page-sized canvas and prints at exact positions onto pre-printed forms; designer is inlined in the single-file build and mounted on demand.

# DIRECTORY
src/ -> runtime sources (bundled by build.js)
index.html -> loads src/sdk.js directly and calls PaperStamp.embed({showDesigner:true}); no build, needs a static server; with no built runtime the SDK makes the same blob iframe, whose bootstrap fetches style.css, designer.css, designer.html into __PS_BUNDLE and imports src/core/index.js (single entry, pulls in the designer) by absolute URL
dist/index.html -> build.js copies index.html and only swaps src/sdk.js for sdk.js (same embed call as dev)
example.html, llms.txt -> root; example.html needs dist/sdk.js; build.js copies them into dist/ with dist/ and assets/ prefixes stripped
assets/ -> favicon.svg
test/ -> node:test suite, runs dist/sdk.js with a stub Blob, takes the runtime from blobs[0] (the runtime script blob, created before the frame HTML blob) and runs it in a stubbed vm
dist/ -> build output, gitignored; pages.yml runs npm ci + npm run build in CI and deploys dist/
.github/workflows/ -> ci.yml, pages.yml, release.yml (GITHUB_TOKEN only)

# ENTRY-POINTS
dist/sdk.js -> production: SDK + full runtime (core + designer, no lazy loading) inlined as constants; embed() builds a blob-URL iframe running it (same path in dev and prod); the designer UI only appears on openDesigner()
dist/sdk.dev.js -> same SDK + runtime plus the ?dev=1 self-test (__PS_DEV__=true); testing only, the prod file dead-code-eliminates it
SDK embed() has a single path: no variants, no conditional loading, no downloads
# the runtime (one bundle of core and designer + inlined css/html strings) is embedded as a string and runs inside the blob iframe; exposes only window.PaperStamp there; the SDK iframe HTML writes the stage DOM (#stage > #pageViewport > #page > img#guideImg + style#pageSizeStyle)
build output: sdk.js, sdk.dev.js + index.html, example.html, favicon.svg, llms.txt; no style.css
dist/example.html -> SDK demo (controls left, live preview right)
iframe URL params ?design=1 and ?layoutId=&data=<json> are only honoured when the runtime is served as a page
no auto-close: plugin never calls window.close() (host owns iframe lifecycle)

# MODULES
src/core/state.js -> no asset injection; stage DOM, base CSS (style#psBaseStyle), designer CSS (style#psDesignerStyle, media=not all until openDesigner) and designer markup (template#ps-designer-root) all come from the SDK iframe HTML
single entry: core/index.js (esbuild entryPoint and dev blob import); it imports core/api.js and ../designer/index.js
src/core/ -> runtime core; shared mutable state lives in state.js (state, el, itemHooks, flags)
 api.js -> public API object (export const api); no side effects
 index.js -> entry: window.PaperStamp = api, init, URL autotrigger, emitReady, imports designer
 constants.js -> PROTOCOL_VERSION, SCHEMA_VERSION, MAX_LAYOUTS, geometry/zoom constants, px ratios
 validate.js -> parseDataParam, isValidLayoutDef, sanitizeItem, sanitizeLayoutDef
 storage.js -> getAllLayouts, setAllLayouts, listLayouts, registerLayoutDef (LRU)
 state.js -> state, el, helpers, itemHooks, flags (fitRafPending, printInFlight, autoPrintTriggered, designerLoaded, pendingDesignerLayoutId, pendingMinimal)
 events.js -> onEvent/emit event bus
 protocol.js -> post, emitReady/emitDone/emitError, revealPage
 view.js -> page size, zoom, pan, infinite-canvas geometry
 render.js -> render, applyLayoutToState, export/import
 print.js -> triggerPrint, printLayout, printStateless
 designer-loader.js -> loadDesigner (injects designer CSS, calls flags.designer.init registered via core.registerDesigner), openDesigner, setDesignerLayout
 messages.js -> MESSAGE_HANDLERS, message/print listeners
src/designer/ -> editing UI in the same bundle; reads core via import of core/api.js (ctx.js); registers itself with core.registerDesigner; DOM is built only when init() runs
 index.js -> init (mount on demand), designer:setLayout/designer:close handlers, PaperStampDesigner export
 ctx.js -> core handle + destructured core helpers, ZOOM_* constants
 dom.js -> buildDom (clones template#ps-designer-root from the iframe document), cacheEls, badges
 canvas.js -> installCanvasInput (pan/zoom input)
 ui.js -> notify toast, confirmAction dialog
 sync.js -> state to DOM sync (guide, page setup)
 popovers.js -> popover open/close, fill panel position
 selection.js -> selection, toolbar/badge positioning, align + zoom UI sync
 drag.js -> geometry inputs, drag/resize, installItemHooks
 items.js -> add/delete/duplicate/clear items
 layouts.js -> layout storage UI (save/load/delete/clear)
 modes.js -> fill mode, minimal mode
 events.js -> wireEvents (all DOM listeners)
 selftest.js -> dev-only (guarded by __PS_DEV__); exports runSelfTest; drives real controls via hit-tested pointer/mouse events with a visible cursor; asserts state, restores layout + storage; panel has Copy report; emits designer:selftest, posts paperstamp:selftest
 index.js dev gate: ?dev=1 (page or embedding host) → injects #railSelfTest + PaperStamp.selfTest(); ?selftest=1 (with dev=1) auto-runs
src/designer.html -> `<template id="ps-designer-root">` markup, inlined at build
src/designer.css, src/style.css -> designer chrome / base+print CSS, inlined at build
src/sdk.js -> host wrapper source
scripts/build.js -> `pnpm build`; no dev server; esbuild: bundleIife(dev) bundles entryPoint core/index.js with define __PS_DEV__; assembles window.__PS_BUNDLE {baseCss,designerCss,designerHtml} + bundle into a runtime string, prepends it to the SDK as dist/sdk.js and dist/sdk.dev.js; copies root index.html/example.html (prefixes stripped), favicon.svg, llms.txt into dist/

# ARCHITECTURE
no PWA, no runtime fetches in the bundled build; nothing registers a service worker
runtime script is loaded via blobScript (blob URL <script src>), not inline; host CSP needs blob: in frame-src + script-src and 'unsafe-inline' in style-src
src/sw.js -> kill switch only (copied to dist/sw.js): replaces the retired worker in old visitors' browsers, clears caches, unregisters itself; keep it deployed, never register it
PaperStamp `on` = DOM addEventListener helper; `onEvent` = event bus subscription used by designer
designer:close -> teardown removes [data-paperstamp-designer] nodes, drops body.designer-mode; reopen re-runs flags.designer.init (via loadDesigner)

# SCHEMA
layoutDef = {name?, pageWmm, pageHmm (1-5000 mm), orientation, items[]}
item = {id, type:text|line, x, y, w, h (% 0-100), text, name, fontSize (pt), align, valign, fixed?, bg?}
line item adds line (dotted|dashed|solid), thickness (pt), color
localStorage 'paperstampLayouts' -> {[name]: layout}; capped at MAX_LAYOUTS=100, LRU evicted

# ENV
Node >=22, pnpm locally, npm in CI (package-lock.json committed; pnpm-lock.yaml + pnpm-workspace.yaml gitignored), esbuild dev dep
pnpm build -> dist/; pnpm test -> node --test test/core.test.js (requires built dist/)

# TESTING
test/core.test.js -> vm with stubbed DOM; covers public API surface, sanitize range/clamp/dedupe, LRU cap

# API
full contract: PLUGIN.md; live URLs: INTEGRATION.md
