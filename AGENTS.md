# PROJECT
paperstamp: static browser layout designer. src/core/ renders a layoutDef onto a page-sized canvas and prints at exact positions onto pre-printed forms; designer is inlined in the single-file build and mounted on demand.

# DIRECTORY
src/ -> runtime sources (bundled by build.js)
site/ -> static pages copied into dist/ (index.html, example.html, favicon.svg, llms.txt)
test/ -> node:test suite, extracts the runtime string from dist/paperstamp.js and runs it in a stubbed vm
dist/ -> build output, committed; opens directly via dist/index.html (file://), and the Pages workflow uploads it as-is (no CI build, so run pnpm build before every commit)
.github/workflows/ -> ci.yml, pages.yml, release.yml (GITHUB_TOKEN only)

# ENTRY-POINTS
dist/paperstamp.js, dist/paperstamp.min.js -> single file for hosts: window.__PS_RUNTIME_SRC (runtime string) + SDK; embed() builds a srcdoc iframe running the runtime
dist/paperstamp.dev.js -> same as paperstamp.js plus the ?dev=1 self-test (__PS_DEV__=true); prod builds dead-code-eliminate it; site/index.html and site/example.html load it instead of paperstamp.min.js when the page URL has ?dev=1
# the runtime (shell + one bundle of core and designer + inlined css/html strings) is embedded as a string and runs inside the srcdoc iframe; exposes window.PaperStampCore + window.PaperStamp there
dist/index.html -> host page: full-bleed iframe, openDesigner() on ready
dist/example.html -> SDK demo (controls left, live preview right)
iframe URL params ?design=1 and ?layoutId=&data=<json> are only honoured when the runtime is served as a page
no auto-close: plugin never calls window.close() (host owns iframe lifecycle)

# MODULES
src/shell.js -> runs first; injects base CSS from window.__PS_BUNDLE and creates #stage/#pageViewport/#page/#guideImg if absent
src/entry.js -> single esbuild entry: imports core/index.js then designer/index.js
src/core/ -> runtime core; shared mutable state lives in state.js (state, el, itemHooks, flags)
 index.js -> public API object → window.PaperStampCore + window.PaperStamp, init, URL autotrigger
 constants.js -> PROTOCOL_VERSION, SCHEMA_VERSION, MAX_LAYOUTS, geometry/zoom constants, px ratios
 validate.js -> parseDataParam, isValidLayoutDef, sanitizeItem, sanitizeLayoutDef
 storage.js -> getAllLayouts, setAllLayouts, listLayouts, registerLayoutDef (LRU)
 state.js -> state, el, helpers, itemHooks, flags (fitRafPending, printInFlight, autoPrintTriggered, designerLoaded, pendingDesignerLayoutId, pendingMinimal)
 events.js -> onEvent/emit event bus
 protocol.js -> post, emitReady/emitDone/emitError, revealPage
 view.js -> page size, zoom, pan, infinite-canvas geometry
 render.js -> render, applyLayoutToState, export/import
 print.js -> triggerPrint, printLayout, printStateless
 designer-loader.js -> loadDesigner (injects designer CSS, calls PaperStampDesigner.init), openDesigner, setDesignerLayout
 messages.js -> MESSAGE_HANDLERS, message/print listeners
src/designer/ -> editing UI in the same bundle; reads core via window.PaperStampCore (ctx.js); exposes window.PaperStampDesigner {init,setMode,...}; DOM is built only when init() runs
 index.js -> init (mount on demand), designer:setLayout/designer:close handlers, PaperStampDesigner export
 ctx.js -> core handle + destructured core helpers, ZOOM_* constants
 dom.js -> buildDom (markup from __PS_BUNDLE.designerHtml, fetch fallback), cacheEls, badges
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
 selftest.js -> dev-only (guarded by __PS_DEV__); exports runSelfTest; drives real controls via hit-tested pointer/mouse events with a visible cursor; asserts state, restores layout + storage; panel has Copy report (also window.__PS_SELFTEST_REPORT); emits designer:selftest, posts paperstamp:selftest
 index.js dev gate: ?dev=1 (page or embedding host) → injects #railSelfTest + PaperStamp.selfTest(); ?selftest=1 (with dev=1) auto-runs
src/designer.html -> `<template id="ps-designer-root">` markup, inlined at build
src/designer.css, src/style.css -> designer chrome / base+print CSS, inlined at build
src/sdk.js -> host wrapper source
dev.js -> `pnpm dev`: watches src/ + site/ + build.js, rebuilds dist/, serves it on http://localhost:3000 (PORT env overrides), no-store caching
build.js -> esbuild: bundleIife(entry, dev) bundles src/entry.js with define __PS_DEV__; assembles window.__PS_BUNDLE {baseCss,designerCss,designerHtml} + shell + bundle into a runtime string, prepends it to the SDK as dist/paperstamp(.min|.dev).js, copies site/ to dist/

# ARCHITECTURE
no service worker, no PWA, no runtime fetches in the bundled build
PaperStamp `on` = DOM addEventListener helper; `onEvent` = event bus subscription used by designer
designer:close -> teardown removes [data-paperstamp-designer] nodes, drops body.designer-mode; reopen re-runs PaperStampDesigner.init (via loadDesigner)

# SCHEMA
layoutDef = {name?, pageWmm, pageHmm (1-5000 mm), orientation, items[]}
item = {id, type:text|line, x, y, w, h (% 0-100), text, name, fontSize (pt), align, valign, fixed?, bg?}
line item adds line (dotted|dashed|solid), thickness (pt), color
localStorage 'paperstampLayouts' -> {[name]: layout}; capped at MAX_LAYOUTS=100, LRU evicted

# ENV
Node >=22, pnpm 12.14.0 (packageManager pinned), esbuild + prettier dev deps
pnpm build -> dist/ (commit it); pnpm test -> node --test test/core.test.js (requires built dist/)

# TESTING
test/core.test.js -> vm with stubbed DOM; covers public API surface, sanitize range/clamp/dedupe, LRU cap

# API
full contract: PLUGIN.md; live URLs: INTEGRATION.md
