# PROJECT
paperstamp: static browser layout designer. core.js renders a layoutDef onto a page-sized canvas and prints at exact positions onto pre-printed forms; designer.* adds editing chrome and is lazy-loaded on demand.

# DIRECTORY
index.html -> designer-first entry: app shell + #page canvas; auto loadDesigner() on boot
sdk.html -> embed/print runtime entry: app shell + core.js only (former index.html)
style.css -> base, item, print, silent-mode, embed-mode chrome hiding (no designer chrome)
core.js -> preview + print runtime, host protocol, designer lazy-loader; exposes window.PaperStampCore + window.PaperStamp
designer.html -> designer markup as `<template id="ps-designer-root">`; fetched + injected on demand
designer.css -> designer chrome styles, loaded alongside designer.js
designer.js -> fetches designer.html, imports template into body, caches els, wires events; IIFE
sdk.js -> UMD host wrapper; PaperStamp.embed() auto-derives sdk.html?embed=1, hidden iframe + postMessage bridge; autoShow on ready via defaultLayout|layoutId
example.html -> SDK demo (50/50 split: controls left, live preview iframe right via preview()); embed({autoShow:false})
PLUGIN.md -> authoritative embedding contract
.prettierrc -> prettier config (singleQuote, lf, no trailing comma)
.prettierignore -> prettier exclusions (AGENTS.md)
app.js -> legacy monolith, unreferenced by any entry

# ENTRY-POINTS
index.html -> designer-first; auto-loads designer on boot
sdk.html -> embed/print runtime, no build step
sdk.html?embed=1 -> silent + embed chrome hiding, suppresses window.close(); page stays blank until first layout (preview/print/printById)
sdk.html?design=1 -> loads designer on boot
sdk.html?layoutId=&data=<json>&silent=0|1 -> auto printLayout on boot
revealPage() -> adds body.paperstamp-ready on first layout in EMBED; CSS hides #pageViewport until then
SDK embed() -> autoShow (default true): on ready sends preview(defaultLayout) else printById(layoutId)

# MODULES
core.js
-> state{items[], nextId, pageWmm, pageHmm, orientation, guideSrc, guideOpacity, selectedId, mode, zoomMode, zoomScale}
-> deepClone(obj) -> JSON round-trip; exposed on public API for shared snapshot/clone use
-> render() rebuilds #page items from state.items, keeps #guideImg first; adds interactive hooks when itemHooks.interactive
-> applyPageSize() sets #page mm size + injects @page rule; orientation swaps w/h
-> fitPageToStage() scales #page; emit('fit', {scale, mode})
-> sanitizeLayoutDef()/sanitizeItem() validate+coerce host layoutDef; {ok:false, errors[]} on fail
-> applyLayoutToState() applies def + fieldValues; applyValidatedLayoutToState() = sanitize + apply
-> printLayout(layoutId) / printStateless(def) -> validate + triggerPrint (2x rAF -> window.print); emitError on fail
-> registerLayoutDef() upserts into paperstampLayouts
-> listLayouts/getAllLayouts/setAllLayouts -> localStorage
-> loadDesigner() fetches designer.css + designer.js, adds body.designer-mode; idempotent; isDesignerLoaded() reflects completion
-> on/emit -> internal event bus (designer subscribes via core.on)
-> MESSAGE_HANDLERS map -> paperstamp:ping|preview|print|printById|register|openDesigner|closeDesigner
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
host embed -> SDK hidden iframe -> index.html -> emitReady() -> onReady({version, layouts})
host print/register -> postMessage -> core.js MESSAGE_HANDLERS -> print/registerLayoutDef -> afterprint -> emitDone()
designer open -> loadDesigner() -> fetch designer.html + designer.css + designer.js -> buildDom() injects template -> designer-mode

# SCHEMA
item = {id, type:'text', x, y, w, h (% 0-100), text, name, fontSize (pt), align, valign}
align -> #textAlignGroup (left|center|right) -> node.style.alignItems (cross axis of column flex)
valign -> #vertAlignGroup (top|middle|bottom) -> node.style.justifyContent (main axis of column flex)
both -> node.style.textAlign via item.align (text justification for wrapped lines)
layoutDef = {name?, pageWmm, pageHmm, orientation, items[]}
localStorage 'paperstampLayouts' -> {[layoutId]: {pageWmm, pageHmm, orientation, items}}, keyed by layout name
designer:close removes [data-paperstamp-designer] nodes + #psToast/#psConfirm, detaches el._scrollHandler, drops body.designer-mode
syncPageSetupInputs() reconciles pageSize/customW/customH/orientation inputs with state (called from init, loadLayout)
syncGuideDom() reconciles guideImg/src/opacity + guideOpacity slider with state (called after guide mutations)
wireEvents scopes rail-btn/tool-popover queries to el.chrome (#psDesignerChrome) to avoid host-page collisions
designer markup -> designer.html `<template id="ps-designer-root">`; injected nodes tagged [data-paperstamp-designer]

# PRODUCTION
see PRODUCTION.md for audit + browser matrix + operator checklist

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
PaperStamp.on/emit -> event bus
PaperStamp.itemHooks -> designer attaches handlers here
PaperStamp.deepClone(obj) -> JSON round-trip clone
PaperStamp.version -> '1'
URL ?layoutId=&data=<json>&silent=0|1 -> auto printLayout (silent default true)
URL ?design=1 -> loadDesigner() on boot
URL ?embed=1 -> silent+embed chrome hiding, suppresses window.close()
caveat: window.print() always opens native dialog; bypass needs Chrome --kiosk-printing or Electron host
notify/confirm UI -> #psToast + #psConfirm, defined in designer.js, hidden in print
full contract: see PLUGIN.md

# FILL-MODE
Fill & Print -> setMode('fill'): clears selection, hides item chrome, renders fillFormList into #fillPanel
#fillPanel docked in #rightStack (data-dock=stack); opened via classList directly (not openPopover)
mode buttons stopPropagation so document click-close doesn't shut the panel

# DESIGNER-CHROME-FLOAT
item toolbar + geomBar + W/H badges are position:fixed, repositioned on select/drag/resize/scroll/fit(zoom)
core 'fit' event -> designer repositions toolbar+geomBar+badges for selectedId (else chrome drifts on zoom)
#geomBar inherits position:fixed; #rightStack #geomBar overrides to static (docked in right stack)
mode pill (#modePill) styled like #zoomBar: radius/padding/border match; .mode-btn.active = accent-soft bg + accent ink

# EXTENSION-POINTS
mode design|fill -> guards in onItemPointerDown/onResizePointerDown/dblclick
geometry inputs -> clamp to page bounds, sync with drag/resize
snap-to-center: within 1% of page center
keys: Esc deselect/close, Ctrl+D dup, arrows nudge (0.2%), Del removes
Ctrl/Cmd + wheel over #stage -> api.setZoomScale(base ± 0.05); disabled in embed mode
#stage scroll -> repositions #itemToolbar + #wBadge/#hBadge for selected item
body.silent-mode -> hides modePill/zoomBar/toolRail/popovers
body.embed-mode -> hides all chrome (?embed=1)
body.designer-mode -> reverts embed hiding for designer chrome
afterprint -> emitDone(); window.close() only if autoPrintTriggered && !embed && window.parent !== window (never closes a standalone tab)
designer:close event -> teardown removes injected nodes

# HOST-INTEGRATION
host -> plugin: paperstamp:print | paperstamp:printById | paperstamp:preview | paperstamp:register | paperstamp:ping | paperstamp:openDesigner | paperstamp:closeDesigner | paperstamp:export | paperstamp:import
paperstamp:preview -> applyValidatedLayoutToState(silent) without triggerPrint (live preview)
paperstamp:openDesigner -> loadDesigner(); paperstamp:closeDesigner -> emit('designer:close')
plugin -> host: paperstamp:ready {version, layouts[]} | paperstamp:done | paperstamp:error {code, message}
error codes: E_BAD_MESSAGE, E_NO_LAYOUT, E_BAD_LAYOUT_DEF
ready emitted on load (2x rAF), after register, on ping
item.text set via textContent -> no HTML injection

# ENV
none — pure static client-side (no build, no server, no deps)
runtime config via URL params on sdk.html:
  ?embed=1 silent chrome hiding + blank-until-first-layout
  ?design=1 load designer on boot
  ?hostOrigin=<origin> trusted postMessage origin (overrides document.referrer)
  ?layoutId=&data=<json>&silent=0|1 auto printLayout on boot

# SECURITY
post() sends to TRUSTED_ORIGIN (hostOrigin > referrer origin > '*')
inbound message listener gates on e.source === window.parent && e.origin === TRUSTED_ORIGIN (when not '*')
unknown message type -> emitError('E_BAD_MESSAGE')
SDK validates e.origin on incoming messages; appends ?hostOrigin= to plugin URL
error codes: E_BAD_ORIGIN E_BAD_MESSAGE E_BAD_LAYOUT_DEF E_NO_LAYOUT E_PRINT_BLOCKED

# STORAGE
paperstampLayouts capped at MAX_LAYOUTS=100 (LRU evict on overflow, timestamps in paperstampLayoutsLru)
paperstampLayoutsMeta -> SCHEMA_VERSION for future migration
sanitizeLayoutDef renumbers duplicate item ids before returning ok=true
afterprint window.close() only when EMBED or running inside an iframe (never closes a standalone tab)
printStateless/print only persist layoutDef when opts.persist === true; register always persists
setAllLayouts returns bool; failures surface via notify in designer

# PRINT-LIFECYCLE
triggerPrint: printInFlight guard (blocks reentry), autoPrintTriggered set, rAF x2 -> window.print() in try/catch
beforeprint -> printInFlight = true; afterprint -> clear both flags, emitDone, window.close() only if !EMBED
