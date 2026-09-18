# PROJECT
paperstamp: static browser layout designer. core.js renders a layoutDef onto a page-sized canvas and prints at exact positions onto pre-printed forms; designer.* adds editing chrome and is lazy-loaded on demand.

# DIRECTORY
index.html -> host page: full-bleed iframe on sdk.html; embed({autoShow:false}).openDesigner() on ready
sdk.html -> embed/print runtime entry: app shell + core.js only, no auto-designer; designer mounts on request
style.css -> base, item, print, designer-mode infinite-canvas rules (no designer chrome)
core.js -> preview + print runtime, host protocol, designer lazy-loader; exposes window.PaperStampCore + window.PaperStamp
designer.html -> designer markup as `<template id="ps-designer-root">`; fetched + injected on demand
designer.css -> designer chrome styles, loaded alongside designer.js
designer.js -> fetches designer.html, imports template into body, caches els, wires events; IIFE
sdk.js -> UMD host wrapper; PaperStamp.embed() auto-derives sdk.html, hidden iframe + postMessage bridge; autoShow on ready via defaultLayout|layoutId; openDesigner() lazy-loads designer into iframe
sw.js -> service worker: precaches app shell, cache-first local + cache-first navigation (instant load, background revalidate), best-effort opaque font cache; AGENTS.md sentinel HEAD-checked in background via event.waitUntil (never blocks nav response), skipped if last check was under CHECK_GUARD_MS=30s ago (paperstamp-meta __lastcheck__); when changed, HEAD-diff each shell asset, refetch only the changed ones (per-file ETag/Last-Modified in paperstamp-meta), then postMessage('paperstamp-update-ready') to the requesting client
manifest.webmanifest -> PWA manifest: start_url ./index.html, scope ./, standalone, favicon.svg any+maskable
pw.js -> PWA bootstrap loaded by every page; registers ./sw.js on load, no-op if unsupported; on SW message {type:'paperstamp-update-ready'} does window.location.reload()
# PWA-RULE: AGENTS.md is the sw.js cache sentinel. Touch AGENTS.md on EVERY commit that changes a cached asset, or the shell will not refresh.
example.html -> SDK demo (50/50 split: controls left, live preview iframe right via preview()); embed({autoShow:false})
PLUGIN.md -> authoritative embedding contract
.prettierrc -> prettier config (singleQuote, lf, no trailing comma)
.prettierignore -> prettier exclusions (AGENTS.md)

# ENTRY-POINTS
index.html -> host page; embeds sdk.html full-bleed, calls openDesigner() on ready
sdk.html -> embed/print runtime, no build step; chrome-free until loadDesigner() called
sdk.html?design=1 -> loads designer on boot
sdk.html?layoutId=&data=<json> -> auto printLayout on boot
SDK embed() -> autoShow (default true): on ready sends preview(defaultLayout) else printById(layoutId); openDesigner({layoutId}?) lazy-loads designer into iframe (with layoutId -> setDesignerLayout)
no auto-close: plugin never calls window.close() (host owns iframe lifecycle)

# MODULES
core.js
-> state{items[], nextId, pageWmm, pageHmm, orientation, guideSrc, guideOpacity, selectedId, mode, zoomMode, zoomScale, panX, panY, infiniteCanvas}
-> zoom clamp ZOOM_MIN=0.1 .. ZOOM_MAX=5 (clampZoom); infinite canvas widens range vs legacy 0.25–3
-> deepClone(obj) -> JSON round-trip; exposed on public API for shared snapshot/clone use
-> render() rebuilds #page items from state.items, keeps #guideImg first; adds interactive hooks when itemHooks.interactive
-> applyGuideToDom() paints state.guideSrc/guideOpacity onto #guideImg; used by applyLayoutToState + designer's syncGuideDom
-> applyPageSize() sets #page mm size + injects @page rule; orientation swaps w/h
-> MM_TO_PX=96/25.4 + PT_TO_PX=96/72 constants; pagePxSize() -> natural (zoom=1) page size in CSS px
-> applyPageSize() sets @page mm rule, --ps-page-w/h custom props (print reset), and routes #page sizing (mm in embed, px in infinite)
-> applyPageGeometry() (infinite mode) sets #page width/height/left/top in px from pagePxSize * zoomScale + panX/panY; re-applies item font px; emits 'fit'
-> applyItemFontPx(item, node) sets node font-size in px = item.fontSize * PT_TO_PX * zoomScale(infinite only); also sets --ps-fs = unzoomed px (print uses it)
-> render() calls applyItemFontPx per item
-> fitPageToStage() infinite: centerPage + applyPageGeometry; embed: #page transform scale + #pageViewport px size (unchanged from before)
-> centerPage() centers the scaled page inside #stage (infinite mode only)
-> setInfiniteCanvas(on) toggles infinite canvas; on=false clears #pageViewport transform + #page left/top + zeroes pan + resets zoom (zoomMode='fit', zoomScale=1) + re-applies item fonts at z=1 (undo designer zoom-baked font-size); then applyPageSize + fitPageToStage
-> setPan(x,y) / panBy(dx,dy) mutate panX/panY + applyPageGeometry
-> zoomAt(clientX, clientY, scale) pointer-anchored zoom; keeps page point under cursor fixed; sets zoomMode='manual'
-> clientToPage(clientX, clientY) -> {x,y} in unscaled page-local px (inverse of the canvas transform)
-> sanitizeLayoutDef()/sanitizeItem() validate+coerce host layoutDef; {ok:false, errors[]} on fail
-> applyLayoutToState() applies def + fieldValues; also applies+paints guideSrc/guideOpacity if def carries them (host preview, previewById)
-> applyValidatedLayoutToState() = sanitize + re-attach guide fields (sanitizeLayoutDef strips them) + apply
-> printLayout(layoutId) / printStateless(def) -> validate + triggerPrint (2x rAF -> window.print); emitError on fail
-> registerLayoutDef() upserts into paperstampLayouts
-> listLayouts/getAllLayouts/setAllLayouts -> localStorage
-> loadDesigner() fetches designer.css + designer.js on first call only; adds body.designer-mode; isDesignerLoaded() reflects completion
-> reopen after designer:close: loadDesigner() re-runs window.PaperStampDesigner.init() (rebuilds DOM via buildDom) instead of re-fetching script
-> designer.js init() no-ops if #psDesignerChrome already mounted (idempotent vs double loadDesigner / duplicate host openDesigner)
-> on/emit -> internal event bus (designer subscribes via core.on)
-> MESSAGE_HANDLERS map -> paperstamp:ping|preview|previewById|print|printById|register|openDesigner|closeDesigner|listLayoutDefs

-> itemHooks{interactive, onPointerDown, onResizePointerDown, onDblClick} installed by designer

designer.js
-> async buildDom() fetches designer.html, DOMParser -> #ps-designer-root template -> importNode -> wrap in #psDesignerChrome -> el.stage.appendChild
-> cacheEls() collects all chrome nodes into el.*
-> buildBadges() creates #wBadge/#hBadge inside #pageViewport
-> installItemHooks() flips core.itemHooks.interactive and wires drag/resize/dblclick
-> setActiveAlign()/setActiveVAlign() sync active state of #textAlignGroup/#vertAlignGroup
-> wireEvents() binds zoom, page setup, guide, geometry inputs, layout save/load, fill mode, keyboard shortcuts, both align groups

-> setMode('design'|'fill') -> Design = geometry edit; Fill = #fillFormList
-> notify()/#psToast, confirmAction()/#psConfirm
-> clearLayout() resets state to a blank A4 portrait sheet (items, guide, name field); deleteLayout() calls it when the deleted layout is the one displayed
-> on designer:close -> removes [data-paperstamp-designer] nodes, drops body.designer-mode

# RUNTIME-GRAPH
page size/orientation -> applyPageSize() -> #page size + @page CSS
guide upload -> FileReader -> dataURL -> #guideImg (screen-only)
add item -> state.items -> render()
drag/resize -> item x/y/w/h % -> live DOM update + geometry input sync
Print -> window.print() -> print CSS hides chrome + guide
host embed -> SDK hidden iframe -> sdk.html -> emitReady() -> onReady({version, layouts})
host print/register -> postMessage -> core.js MESSAGE_HANDLERS -> print/registerLayoutDef -> afterprint -> emitDone()
designer open -> loadDesigner() -> fetch designer.html + designer.css + designer.js -> buildDom() injects template -> designer-mode
setDesignerLayout(id) -> applyValidatedLayoutToState -> loadDesigner -> emit designer:setLayout -> applyDesignerLayout(id) selects+names canvas layout
openDesigner({layoutId}) -> setDesignerLayout(layoutId) else loadDesigner()

# SCHEMA
item = {id, type:'text', x, y, w, h (% 0-100), text, name, fontSize (pt), align, valign}
align -> #textAlignGroup (left|center|right) -> node.style.alignItems (cross axis of column flex)
valign -> #vertAlignGroup (top|middle|bottom) -> node.style.justifyContent (main axis of column flex)
both -> node.style.textAlign via item.align (text justification for wrapped lines)
layoutDef = {name?, pageWmm, pageHmm, orientation, items[]}
localStorage 'paperstampLayouts' -> {[layoutId]: {pageWmm, pageHmm, orientation, items}}, keyed by layout name
designer:close runs el._canvasInput.teardown(), core.setInfiniteCanvas(false), removes [data-paperstamp-designer] nodes + #psToast/#psConfirm, drops body.designer-mode
syncPageSetupInputs() reconciles pageSize/customW/customH/orientation inputs with state (called from init, loadLayout)
syncGuideDom() reconciles guideImg/src/opacity + guideOpacity slider with state (called after guide mutations)
wireEvents scopes rail-btn/tool-popover queries to el.chrome (#psDesignerChrome) to avoid host-page collisions
designer markup -> designer.html `<template id="ps-designer-root">`; injected nodes tagged [data-paperstamp-designer]
designer.css link + designer.js script tags in <head> use separate [data-paperstamp-designer-asset] attr, excluded from designer:close teardown so CSS survives reopen

# INTEGRATION
see INTEGRATION.md for embedding via live GitHub Pages URLs (sdk.js, sdk.html, example.html), no clone/npm/bundler required
README.md -> project overview + live demo links (same URLs as INTEGRATION.md)
llms.txt -> LLM-oriented project summary + live URLs

# PUBLIC-API
PaperStamp = PaperStampCore (core.js)
SDK: PaperStamp.embed({src?,origin?,width?,height?,container?,autoShow?,defaultLayout?,layoutId?,onReady?,onDone?,onError?}) -> handle{print,printById,preview,register,ping,openDesigner,closeDesigner,on,destroy,isReady,layouts}
autoShow precedence: defaultLayout -> preview(); else layoutId -> printById(); else nothing (blank until host drives)
PaperStamp.printLayout(layoutId, fieldValues, options) -> loads layout, maps fieldValues by item.name, prints
PaperStamp.printStateless(layoutDef, fieldValues, options) -> self-contained {name?, pageWmm, pageHmm, orientation, items}; name upserts to cache
PaperStamp.exportLayoutDef(name?) -> current in-memory state as {name, pageWmm, pageHmm, orientation, items}; no localStorage read
PaperStamp.importLayoutDef(def, opts) -> sanitize + applyLayoutToState; does not persist unless caller separately calls registerLayoutDef
PaperStamp.listLayouts() -> string[]
PaperStamp.loadDesigner() -> Promise; fetches designer.html + designer.css + designer.js
PaperStamp.openDesigner({layoutId}?) -> Promise; delegates to setDesignerLayout(layoutId) when given
PaperStamp.setDesignerLayout(layoutId) -> Promise<bool>; loads designer, applies layout to canvas + designer select/name (designer:setLayout); no-op preview version is previewById()
PaperStamp.on/emit -> event bus
PaperStamp.triggerPrint() -> 2x rAF -> window.print() under printInFlight guard; used by designer print button
PaperStamp.itemHooks -> designer attaches handlers here
PaperStamp.deepClone(obj) -> JSON round-trip clone
PaperStamp.version -> '1'
URL ?layoutId=&data=<json> -> auto printLayout on boot
URL ?design=1 -> loadDesigner() on boot
(removed) no ?embed param; sdk.html is always the embed runtime, chrome-free until loadDesigner()
caveat: window.print() always opens native dialog; bypass needs Chrome --kiosk-printing or Electron host
notify/confirm UI -> #psToast + #psConfirm, defined in designer.js, hidden in print
full contract: see PLUGIN.md

# FILL-MODE
Fill & Print -> setMode('fill'): clears selection, hides item chrome, renders fillFormList into #fillPanel
#fillPanel docked in #rightStack (data-dock=stack); opened via classList directly (not openPopover)
mode buttons stopPropagation so document click-close doesn't shut the panel

# DESIGNER-CHROME-FLOAT
item toolbar + geomBar + W/H badges are position:fixed (viewport space, constant size regardless of zoom); badges are document.body children tagged [data-paperstamp-designer]
positionItemBadge uses node.getBoundingClientRect() in viewport space; transform: translate(-50%,0) / translate(0,-50%) on .item-badge/.item-badge-h handle centering
core 'fit' event (emitted on every pan/zoom/fit via applyPageGeometry) -> designer repositions toolbar+geomBar+badges for selectedId (else chrome drifts on pan/zoom)
#geomBar inherits position:fixed; #rightStack #geomBar overrides to static (docked in right stack)
mode pill (#modePill) styled like #zoomBar: radius/padding/border match; .mode-btn.active = accent-soft bg + accent ink

# EXTENSION-POINTS
mode design|fill -> guards in onItemPointerDown/onResizePointerDown/dblclick
geometry inputs -> clamp to page bounds, sync with drag/resize
snap-to-center: within 1% of page center
keys: Esc deselect/close, Ctrl+D dup, arrows nudge (0.2%), Del removes
infinite canvas (designer-only): #stage overflow:hidden; #pageViewport is a static anchor; #page is positioned via left/top and sized via px width/height at the current zoom (no transform-scale → text renders at true pixel size and stays crisp)
zoom semantic: 100% = page at natural CSS px size (mm * 96/25.4); font = pt * 96/72 * zoom px; zoom range 0.1–5.0
print: @media print resets #page to physical mm (--ps-page-w/h) + item font-size to --ps-fs (unzoomed) so zoom never leaks into print; hides #psDesignerChrome/#rightStack/#fillPanel + all fixed chrome
pan inputs (designer): left-drag empty bg | middle-mouse drag | Space+left-drag | wheel = vertical pan | Shift+wheel = horizontal pan
zoom inputs (designer): Ctrl/Cmd+wheel = pointer-anchored zoom via api.zoomAt; zoom buttons + Fit recenter page in infinite mode
Fit button in infinite mode: computeFitScale -> centerPage -> applyCanvasTransform (keeps page clear of floating chrome via 120px x-pad / 48px top / 132px bottom insets)
embed/sdk.html: no infinite canvas — #stage stays bounded-scroll with safe-center flex; setInfiniteCanvas(false) on designer:close restores it

body.designer-mode -> chrome visible; set by designer.js init(), removed on designer:close
afterprint -> emitDone(); no window.close() — host owns iframe lifecycle
designer:close event -> teardown removes injected nodes; window.PaperStampDesigner.init exposed so loadDesigner() can rebuild them on reopen

# HOST-INTEGRATION
host -> plugin: paperstamp:print | paperstamp:printById | paperstamp:preview | paperstamp:previewById | paperstamp:register | paperstamp:ping | paperstamp:openDesigner | paperstamp:setDesignerLayout | paperstamp:closeDesigner | paperstamp:export | paperstamp:listLayoutDefs | paperstamp:import

paperstamp:preview -> applyValidatedLayoutToState without triggerPrint (live preview)
paperstamp:openDesigner -> openDesigner(m); paperstamp:setDesignerLayout -> setDesignerLayout(m.layoutId); paperstamp:closeDesigner -> emit('designer:close')
plugin -> host: paperstamp:ready {version, layouts[], layoutDefs{}} | paperstamp:done | paperstamp:error {code, message} | paperstamp:layoutDefs {layouts{}}

error codes: E_BAD_MESSAGE, E_NO_LAYOUT, E_BAD_LAYOUT_DEF
ready emitted on load (2x rAF), after register, on ping
item.text set via textContent -> no HTML injection

# ENV
none — pure static client-side (no build, no server, no deps); PWA via sw.js + manifest.webmanifest + pw.js (install + offline shell)
runtime config via URL params on sdk.html:
  ?design=1 load designer on boot
  ?layoutId=&data=<json> auto printLayout on boot

# SECURITY
origin is not enforced — post() sends to '*' and inbound messages are accepted on e.source === window.parent || window
e.origin is not checked; ?hostOrigin= and embed({origin}) are ignored
only frame the plugin on pages you control (any framer can drive it)
unknown message type -> emitError('E_BAD_MESSAGE')
error codes: E_BAD_MESSAGE E_BAD_LAYOUT_DEF E_NO_LAYOUT E_PRINT_BLOCKED

# STORAGE
paperstampLayouts capped at MAX_LAYOUTS=100 (LRU evict on overflow, timestamps in paperstampLayoutsLru)
paperstampLayouts entries include guideSrc/guideOpacity (designer save/load only; exportLayoutDef/importLayoutDef omit guide fields)
previewById/preview render the guide too: core reads guideSrc/guideOpacity off the layoutDef if present and paints via applyGuideToDom()
paperstampLayoutsMeta -> SCHEMA_VERSION for future migration
sanitizeLayoutDef renumbers duplicate item ids before returning ok=true
(removed) plugin never calls window.close(); host owns iframe lifecycle
printStateless/print only persist layoutDef when opts.persist === true; register always persists
setAllLayouts returns bool; failures surface via notify in designer

# PRINT-LIFECYCLE
triggerPrint: printInFlight guard (blocks reentry), autoPrintTriggered set, rAF x2 -> window.print() in try/catch
beforeprint -> printInFlight = true; afterprint -> clear both flags, emitDone (no window.close)
