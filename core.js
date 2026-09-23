'use strict';

/* PaperStamp core — preview + print runtime. Always loaded.
   Designer UI is optional and lazy-loaded via loadDesigner(). */

(function () {
  const PROTOCOL_VERSION = '1';
  const SCHEMA_VERSION = 1;
  const LAYOUTS_KEY = 'paperstampLayouts';
  const LAYOUTS_META_KEY = 'paperstampLayoutsMeta';
  const LAYOUTS_LRU_KEY = 'paperstampLayoutsLru';
  const params = new URLSearchParams(location.search);
  const ALIGN_TO_FLEX = Object.freeze({
    center: 'center',
    right: 'flex-end',
    left: 'flex-start'
  });
  const VERT_TO_FLEX = Object.freeze({
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end'
  });
  const GEO_CLAMP = Object.freeze({
    x: (v, it) => Math.max(0, Math.min(100 - it.w, v)),
    y: (v, it) => Math.max(0, Math.min(100 - it.h, v)),
    w: (v, it) => Math.max(2, Math.min(100 - it.x, v)),
    h: (v, it) => Math.max(2, Math.min(100 - it.y, v))
  });
  const GEO_STYLE = Object.freeze({
    x: 'left',
    y: 'top',
    w: 'width',
    h: 'height'
  });

  const state = {
    items: [],
    nextId: 1,
    pageWmm: 210,
    pageHmm: 297,
    orientation: 'portrait',
    guideSrc: '',
    guideOpacity: 60,
    selectedId: null,
    mode: 'design',
    zoomMode: 'fit',
    zoomScale: 1,
    /* Infinite-canvas pan (designer mode only), in CSS px of #stage space. */
    panX: 0,
    panY: 0,
    infiniteCanvas: false
  };
  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 5;
  const clampZoom = (s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s));
  const MM_TO_PX = 96 / 25.4;
  const PT_TO_PX = 96 / 72;

  const el = {};
  ['page', 'pageViewport', 'stage', 'guideImg', 'pageSizeStyle'].forEach(
    (id) => {
      el[id] = document.getElementById(id);
    }
  );

  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
  const round1 = (n) => Math.round(n * 10) / 10;
  const on = (n, ev, fn) => {
    if (n) n.addEventListener(ev, fn);
  };
  const findItem = (id) => state.items.find((it) => it.id === id);
  const getItemNode = (id) =>
    el.page.querySelector('.item[data-id="' + id + '"]');
  const computeNextId = (items) =>
    items.length ? Math.max(...items.map((it) => it.id + 1)) : 1;

  /* ---------- Validation ---------- */

  function isValidLayoutDef(d) {
    return !!d && Array.isArray(d.items);
  }

  function sanitizeItem(raw, i, errors) {
    if (!raw || typeof raw !== 'object') {
      errors.push('item[' + i + '] must be an object');
      return null;
    }
    const num = (key, fallback, min, max) => {
      const v = Number(raw[key]);
      if (!Number.isFinite(v)) return fallback;
      return Math.max(min, Math.min(max, v));
    };
    const x = num('x', 0, 0, 100);
    const y = num('y', 0, 0, 100);
    const w = num('w', 10, 2, 100);
    const h = num('h', 6, 2, 100);
    const align = ['left', 'center', 'right'].includes(raw.align)
      ? raw.align
      : 'left';
    const valign = ['top', 'middle', 'bottom'].includes(raw.valign)
      ? raw.valign
      : 'top';
    const fontSize = num('fontSize', 12, 4, 400);
    const id = Number.isFinite(Number(raw.id)) ? Number(raw.id) : i + 1;
    return {
      id,
      type: 'text',
      x: Math.min(x, 100 - w),
      y: Math.min(y, 100 - h),
      w,
      h,
      text: raw.text != null ? String(raw.text) : '',
      name: raw.name != null ? String(raw.name) : 'Field ' + id,
      fontSize,
      align,
      valign
    };
  }

  function sanitizeLayoutDef(d) {
    const errors = [];
    const w = Number(d.pageWmm);
    const h = Number(d.pageHmm);
    if (!Number.isFinite(w) || w <= 0)
      errors.push('pageWmm must be a positive number');
    if (!Number.isFinite(h) || h <= 0)
      errors.push('pageHmm must be a positive number');
    const orientation =
      d.orientation === 'landscape' ? 'landscape' : 'portrait';
    const items = [];
    (d.items || []).forEach((raw, i) => {
      const it = sanitizeItem(raw, i, errors);
      if (it) items.push(it);
    });
    if (errors.length) return { ok: false, errors };
    // Deduplicate ids: sanitizeItem may fall back to i+1, colliding with
    // an explicit numeric id from the host. Renumber on any duplicate.
    const seen = new Set();
    let bumped = false;
    for (const it of items) {
      if (seen.has(it.id)) {
        bumped = true;
        break;
      }
      seen.add(it.id);
    }
    if (bumped) {
      const used = new Set();
      let next = 1;
      for (const it of items) {
        while (used.has(next)) next++;
        it.id = next;
        used.add(next);
      }
    }
    return {
      ok: true,
      def: { name: d.name || null, pageWmm: w, pageHmm: h, orientation, items }
    };
  }

  /* ---------- Host protocol ---------- */

  /* Origin is not enforced — any host may embed and drive this plugin. */
  function post(type, payload) {
    if (window.parent === window) return;
    try {
      window.parent.postMessage({ type, ...(payload || {}) }, '*');
    } catch (e) {
      /* postMessage can throw in sandboxed/cross-origin iframes — non-fatal */
    }
  }
  const revealPage = () => {
    if (document.body) document.body.classList.add('paperstamp-ready');
  };
  const emitReady = () => {
    post('paperstamp:ready', {
      version: PROTOCOL_VERSION,
      layouts: listLayouts(),
      layoutDefs: getAllLayouts()
    });
  };
  const emitDone = (info) => post('paperstamp:done', info || {});
  const emitError = (code, message) =>
    post('paperstamp:error', { code, message });

  /* ---------- Storage ---------- */

  function getAllLayouts() {
    try {
      const raw = JSON.parse(localStorage.getItem(LAYOUTS_KEY)) || {};
      const meta = Number(localStorage.getItem(LAYOUTS_META_KEY) || 0);
      if (meta && meta !== SCHEMA_VERSION) {
        // future migrations go here; unknown schema -> return as-is
      }
      return raw;
    } catch (e) {
      return {};
    }
  }
  function setAllLayouts(l) {
    try {
      localStorage.setItem(LAYOUTS_KEY, JSON.stringify(l));
      localStorage.setItem(LAYOUTS_META_KEY, String(SCHEMA_VERSION));
      return true;
    } catch (e) {
      return false;
    }
  }
  function listLayouts() {
    return Object.keys(getAllLayouts()).sort();
  }
  const MAX_LAYOUTS = 100;
  function getAllLayoutsMeta() {
    try {
      return JSON.parse(localStorage.getItem(LAYOUTS_LRU_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function setAllLayoutsMeta(meta) {
    try {
      localStorage.setItem(LAYOUTS_LRU_KEY, JSON.stringify(meta));
      return true;
    } catch (e) {
      return false;
    }
  }
  function registerLayoutDef(def, opts) {
    const l = getAllLayouts();
    l[def.name] = {
      pageWmm: def.pageWmm,
      pageHmm: def.pageHmm,
      orientation: def.orientation || 'portrait',
      items: def.items
    };
    const meta = getAllLayoutsMeta();
    meta[def.name] = Date.now();
    if (Object.keys(l).length > MAX_LAYOUTS && !(opts && opts.force)) {
      // LRU: evict least-recently-registered keys until within cap.
      const keys = Object.keys(l);
      const byAge = keys
        .filter((k) => k !== def.name)
        .sort((a, b) => (meta[a] || 0) - (meta[b] || 0));
      while (Object.keys(l).length > MAX_LAYOUTS && byAge.length) {
        const k = byAge.shift();
        delete l[k];
        delete meta[k];
      }
    }
    setAllLayoutsMeta(meta);
    return setAllLayouts(l);
  }

  /* ---------- Page size ---------- */

  /* Physical page size in mm after orientation swap. */
  function physicalMm() {
    let w = state.pageWmm,
      h = state.pageHmm;
    const swap =
      (state.orientation === 'landscape' && w < h) ||
      (state.orientation === 'portrait' && w > h);
    if (swap) {
      const t = w;
      w = h;
      h = t;
    }
    return { w, h };
  }

  /* Natural (zoom=1) page size in CSS px. */
  function pagePxSize() {
    const { w, h } = physicalMm();
    return { w: w * MM_TO_PX, h: h * MM_TO_PX };
  }

  function applyPageSize() {
    const { w, h } = physicalMm();
    /* Custom props for the print reset in style.css. */
    document.documentElement.style.setProperty('--ps-page-w', w + 'mm');
    document.documentElement.style.setProperty('--ps-page-h', h + 'mm');
    el.pageSizeStyle.textContent =
      '@page { size: ' + w + 'mm ' + h + 'mm; margin: 0; }';
    if (state.infiniteCanvas) {
      /* Designer mode: #page is sized in px via applyPageGeometry. */
      applyPageGeometry();
    } else {
      el.page.style.width = w + 'mm';
      el.page.style.height = h + 'mm';
      el.page.style.transform = 'none';
    }
    if (fitRafPending) return;
    fitRafPending = true;
    requestAnimationFrame(() => {
      fitRafPending = false;
      fitPageToStage();
    });
  }

  /* Re-apply the on-screen px size + position of #page for the current
     zoom/pan, and re-apply item font sizes so text renders at target px. */
  function applyPageGeometry() {
    if (!state.infiniteCanvas) return;
    const { w, h } = pagePxSize();
    const z = state.zoomScale;
    el.page.style.width = w * z + 'px';
    el.page.style.height = h * z + 'px';
    el.page.style.left = state.panX + 'px';
    el.page.style.top = state.panY + 'px';
    el.page.style.transform = 'none';
    for (const item of state.items) {
      const node = getItemNode(item.id);
      if (node) applyItemFontPx(item, node);
    }
    emit('fit', { scale: z, mode: state.zoomMode });
  }

  /* Font size in px at the current zoom, so text renders crisp.
     Also store the unzoomed physical size in --ps-fs; @media print uses it
     to override the zoomed inline size without any JS write at print time
     (writing inline styles under beforeprint repaints the live screen). */
  function applyItemFontPx(item, node) {
    const z = state.infiniteCanvas ? state.zoomScale : 1;
    node.style.fontSize = item.fontSize * PT_TO_PX * z + 'px';
    node.style.setProperty('--ps-fs', item.fontSize * PT_TO_PX + 'px');
  }

  /* ---------- Zoom ---------- */

  let fitRafPending = false;

  function computeFitScale() {
    const { w, h } = pagePxSize();
    if (!w || !h) return 1;
    const designer = document.body.classList.contains('designer-mode');
    /* Insets keep the page clear of floating chrome in designer mode. */
    const padX = designer ? 120 : 80;
    const padTop = designer ? 48 : 48;
    const padBottom = designer ? 132 : 48;
    const availW = Math.max(1, el.stage.clientWidth - padX);
    const availH = Math.max(1, el.stage.clientHeight - padTop - padBottom);
    return Math.max(ZOOM_MIN, Math.min(1, availW / w, availH / h));
  }

  /* Center the (scaled) page inside #stage in designer mode. */
  function centerPage() {
    if (!state.infiniteCanvas) return;
    const { w, h } = pagePxSize();
    const sw = el.stage.clientWidth,
      sh = el.stage.clientHeight;
    const s = state.zoomScale;
    state.panX = Math.round((sw - w * s) / 2);
    state.panY = Math.round((sh - h * s) / 2);
  }

  function fitPageToStage() {
    const scale =
      state.zoomMode === 'fit' ? computeFitScale() : state.zoomScale;
    if (state.zoomMode === 'fit') state.zoomScale = scale;
    state.zoomScale = clampZoom(state.zoomScale);
    if (state.infiniteCanvas) {
      centerPage();
      applyPageGeometry();
      return;
    }
    /* Embed/print: bounded scroll behavior — page own transform only. */
    const w = el.page.offsetWidth,
      h = el.page.offsetHeight;
    if (!w || !h) return;
    el.page.style.transform = 'scale(' + state.zoomScale + ')';
    el.pageViewport.style.width = w * state.zoomScale + 'px';
    el.pageViewport.style.height = h * state.zoomScale + 'px';
    emit('fit', { scale: state.zoomScale, mode: state.zoomMode });
  }

  /* ---------- Infinite-canvas API (designer-only) ---------- */

  function setInfiniteCanvas(on) {
    state.infiniteCanvas = !!on;
    if (!on) {
      el.pageViewport.style.transform = '';
      el.page.style.left = '';
      el.page.style.top = '';
      state.panX = 0;
      state.panY = 0;
      /* Reset zoom so the embed/preview view refits at 100%, not the last
         designer zoom level. */
      state.zoomMode = 'fit';
      state.zoomScale = 1;
      /* Re-apply item fonts at z=1 — designer mode baked the on-screen zoom
         into inline font-size px, so leaving it would keep zoomed sizes. */
      for (const item of state.items) {
        const node = getItemNode(item.id);
        if (node) applyItemFontPx(item, node);
      }
    }
    applyPageSize();
    fitPageToStage();
  }

  function setPan(x, y) {
    state.panX = x;
    state.panY = y;
    applyPageGeometry();
  }

  function panBy(dx, dy) {
    setPan(state.panX + dx, state.panY + dy);
  }

  /* Zoom around a viewport-space anchor (client coords relative to #stage).
     Keeps the page point under the cursor fixed. */
  function zoomAt(clientX, clientY, newScale) {
    const s0 = state.zoomScale;
    const s1 = clampZoom(newScale);
    if (s1 === s0) return;
    const rx = clientX - state.panX;
    const ry = clientY - state.panY;
    const k = s1 / s0;
    state.zoomScale = s1;
    state.zoomMode = 'manual';
    state.panX = clientX - rx * k;
    state.panY = clientY - ry * k;
    applyPageGeometry();
  }

  /* Convert a client point to page-local coordinates (unscaled px). */
  function clientToPage(clientX, clientY) {
    const r = el.stage.getBoundingClientRect();
    return {
      x: (clientX - r.left - state.panX) / state.zoomScale,
      y: (clientY - r.top - state.panY) / state.zoomScale
    };
  }

  /* ---------- Render ---------- */

  const itemHooks = {
    interactive: false,
    onPointerDown: null,
    onResizePointerDown: null,
    onDblClick: null
  };

  function render() {
    const frag = document.createDocumentFragment();
    for (const item of state.items) {
      const node = document.createElement('div');
      node.className = 'item text-item';
      node.dataset.id = item.id;
      node.style.left = item.x + '%';
      node.style.top = item.y + '%';
      node.style.width = item.w + '%';
      node.style.height = item.h + '%';
      applyItemFontPx(item, node);
      node.style.alignItems = ALIGN_TO_FLEX[item.align] || 'flex-start';
      node.style.justifyContent = VERT_TO_FLEX[item.valign] || 'flex-start';
      node.style.textAlign = item.align;
      node.textContent = item.text;
      if (itemHooks.interactive) {
        if (itemHooks.onDblClick) {
          node.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            itemHooks.onDblClick(e, item, node);
          });
        }
        if (itemHooks.onPointerDown) {
          node.addEventListener('pointerdown', (e) =>
            itemHooks.onPointerDown(e, item, node)
          );
        }
        const h = document.createElement('div');
        h.className = 'resize-handle';
        if (itemHooks.onResizePointerDown) {
          h.addEventListener('pointerdown', (e) =>
            itemHooks.onResizePointerDown(e, item, node)
          );
        }
        node.appendChild(h);
      }
      frag.appendChild(node);
    }
    el.page.replaceChildren(el.guideImg, frag);
    emit('render', { items: state.items });
  }

  /* ---------- Apply layout ---------- */

  function applyFieldValuesToItems(items, fv) {
    if (!fv) return items;
    return items.map((it) => {
      if (it.type === 'text' && it.name && fv[it.name] !== undefined) {
        return Object.assign(deepClone(it), { text: String(fv[it.name]) });
      }
      return deepClone(it);
    });
  }

  function applyGuideToDom() {
    if (!el.guideImg) return;
    if (state.guideSrc) {
      el.guideImg.src = state.guideSrc;
      el.guideImg.style.display = 'block';
    } else {
      el.guideImg.removeAttribute('src');
      el.guideImg.style.display = 'none';
    }
    el.guideImg.style.opacity = state.guideOpacity / 100;
  }

  function applyLayoutToState(def, fv, labelName, opts) {
    state.pageWmm = def.pageWmm;
    state.pageHmm = def.pageHmm;
    state.orientation = def.orientation || 'portrait';
    state.items = applyFieldValuesToItems(
      def.items.map((it) => Object.assign({}, it)),
      fv
    );
    state.nextId = Math.max(1, computeNextId(state.items));
    state.selectedId = null;
    /* Live preview (designer embed) can opt out of resetting zoom/pan so
       re-previewing a layout doesn't yank the user's current view. */
    if (!opts || !opts.keepZoom) {
      state.zoomMode = 'fit';
      state.zoomScale = 1;
    }
    /* Always reset the guide from the incoming def — a layout without a
       guide must clear any previously-uploaded image, not inherit it. */
    state.guideSrc = def.guideSrc || '';
    state.guideOpacity =
      typeof def.guideOpacity === 'number' ? def.guideOpacity : 60;
    applyGuideToDom();
    applyPageSize();
    render();
    /* keepZoom preserves both zoom scale AND pan; skip the refit/center
       pass entirely so the designer view doesn't snap back to center. */
    if (!opts || !opts.keepZoom) fitPageToStage();
    emit('layout', { def, fv, labelName });
  }

  function applyValidatedLayoutToState(def, fv, labelName, opts) {
    const result = sanitizeLayoutDef(def);
    if (!result.ok) return result;
    if (Object.prototype.hasOwnProperty.call(def, 'guideSrc')) {
      result.def.guideSrc = def.guideSrc;
      result.def.guideOpacity = def.guideOpacity;
    }
    applyLayoutToState(result.def, fv, labelName, opts);
    return result;
  }

  /* ---------- Export / Import (current layout only) ---------- */

  function exportLayoutDef(name) {
    return {
      name: name != null ? String(name) : null,
      pageWmm: state.pageWmm,
      pageHmm: state.pageHmm,
      orientation: state.orientation,
      items: deepClone(state.items)
    };
  }

  function importLayoutDef(def) {
    if (!isValidLayoutDef(def))
      return { ok: false, errors: ['layoutDef.items must be an array'] };
    const result = sanitizeLayoutDef(def);
    if (!result.ok) return result;
    applyLayoutToState(result.def, null, result.def.name);
    return result;
  }

  /* ---------- Print ---------- */

  let autoPrintTriggered = false;
  let printInFlight = false;
  function triggerPrint() {
    if (printInFlight) return false;
    autoPrintTriggered = true;
    printInFlight = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          window.print();
        } catch (err) {
          printInFlight = false;
          emitError('E_PRINT_BLOCKED', String((err && err.message) || err));
        }
      })
    );
    return true;
  }
  function printLayout(layoutId, fv) {
    const data = getAllLayouts()[layoutId];
    if (!data) {
      emitError('E_NO_LAYOUT', 'Layout "' + layoutId + '" not found.');
      return false;
    }
    const result = applyValidatedLayoutToState(data, fv, layoutId);
    if (!result.ok) {
      emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
      return false;
    }
    triggerPrint();
    return true;
  }
  function printStateless(def, fv, opts) {
    if (!isValidLayoutDef(def)) {
      emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
      return false;
    }
    const result = applyValidatedLayoutToState(def, fv, def.name || null);
    if (!result.ok) {
      emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
      return false;
    }
    if (def.name && opts && opts.persist) registerLayoutDef(result.def);
    triggerPrint();
    return true;
  }

  /* ---------- Event bus ---------- */

  const listeners = {};
  function onEvent(name, fn) {
    (listeners[name] = listeners[name] || []).push(fn);
    return function off() {
      const a = listeners[name];
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    };
  }
  function emit(name, payload) {
    (listeners[name] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error('[paperstamp] listener error', e);
      }
    });
  }

  /* ---------- Designer lazy loader ---------- */

  let designerLoaded = false;
  let designerLoading = null;

  function loadDesigner() {
    if (designerLoaded) {
      // designer.js is already loaded, but a prior designer:close teardown
      // removed its DOM. Re-run its init() to rebuild the chrome instead of
      // re-fetching/re-executing the script.
      const d = window.PaperStampDesigner;
      if (d && typeof d.init === 'function') return Promise.resolve(d.init());
      return Promise.resolve();
    }
    if (designerLoading) return designerLoading;
    designerLoading = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'designer.css';
      // Distinct attribute from chrome-content nodes: designer:close teardown
      // only removes [data-paperstamp-designer], never these <head> assets,
      // so the stylesheet survives a close/reopen cycle.
      link.dataset.paperstampDesignerAsset = '1';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'designer.js';
      script.dataset.paperstampDesignerAsset = '1';
      script.onload = () => {
        designerLoaded = true;
        resolve();
      };
      script.onerror = (e) => {
        designerLoading = null;
        emit('designer:error', e);
        reject(e);
      };
      document.head.appendChild(script);
    });
    return designerLoading;
  }

  /* Set which saved layout the designer shows (select + name + canvas).
     Loads the designer on demand; idempotent when the designer is already
     open. This is the "open designer on THIS layout" entry point, unlike
     previewById() which only paints the canvas without touching designer UI. */
  let pendingDesignerLayoutId = null;

  function setDesignerLayout(layoutId) {
    if (!layoutId) {
      emitError('E_BAD_MESSAGE', 'setDesignerLayout requires layoutId.');
      return Promise.resolve(false);
    }
    const data = getAllLayouts()[layoutId];
    if (!data) {
      emitError('E_NO_LAYOUT', 'Layout "' + layoutId + '" not found.');
      return Promise.resolve(false);
    }
    const designerAlreadyMounted =
      !!document.querySelector('#psDesignerChrome');
    pendingDesignerLayoutId = layoutId;
    const result = applyValidatedLayoutToState(data, null, layoutId);
    if (!result.ok) {
      emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
      return Promise.resolve(false);
    }
    revealPage();
    return loadDesigner().then(() => {
      // If the designer chrome was already up, nudge it to sync select/name
      // to the new layout. A fresh load already consumed pendingLayoutId in
      // its init(), so emitting here would double-apply.
      if (designerAlreadyMounted) emit('designer:setLayout', { layoutId });
      return true;
    });
  }

  function openDesigner(opts) {
    const layoutId = opts && opts.layoutId;
    if (layoutId) return setDesignerLayout(layoutId);
    return loadDesigner();
  }

  /* ---------- Message handling ---------- */

  const MESSAGE_HANDLERS = Object.freeze({
    'paperstamp:ping'() {
      emitReady();
    },
    'paperstamp:preview'(m) {
      if (!isValidLayoutDef(m.layoutDef)) {
        emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
        return;
      }
      const r = applyValidatedLayoutToState(
        m.layoutDef,
        m.fieldValues || null,
        m.layoutDef.name || null,
        { keepZoom: !!m.keepZoom }
      );
      if (!r.ok) {
        emitError('E_BAD_LAYOUT_DEF', r.errors.join('; '));
        return;
      }
      revealPage();
    },
    'paperstamp:print'(m) {
      if (!isValidLayoutDef(m.layoutDef)) {
        emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
        return;
      }
      if (
        !printStateless(m.layoutDef, m.fieldValues || null, m.options || {})
      ) {
        emitError('E_BAD_LAYOUT_DEF', 'printStateless rejected the layoutDef.');
        return;
      }
      revealPage();
    },
    'paperstamp:printById'(m) {
      if (!m.layoutId) {
        emitError('E_BAD_MESSAGE', 'printById requires layoutId.');
        return;
      }
      if (!getAllLayouts()[m.layoutId]) {
        emitError('E_NO_LAYOUT', 'Layout "' + m.layoutId + '" not found.');
        return;
      }
      printLayout(m.layoutId, m.fieldValues || null);
      revealPage();
    },
    'paperstamp:register'(m) {
      if (!isValidLayoutDef(m.layoutDef)) {
        emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
        return;
      }
      if (!m.layoutDef.name) {
        emitError('E_BAD_MESSAGE', 'register requires layoutDef.name.');
        return;
      }
      registerLayoutDef(m.layoutDef);
      emitReady();
    },
    'paperstamp:openDesigner'(m) {
      openDesigner(m || null);
    },
    'paperstamp:setDesignerLayout'(m) {
      if (!m.layoutId) {
        emitError('E_BAD_MESSAGE', 'setDesignerLayout requires layoutId.');
        return;
      }
      setDesignerLayout(m.layoutId);
    },
    'paperstamp:closeDesigner'() {
      emit('designer:close', {});
    },
    'paperstamp:export'() {
      post('paperstamp:exportResult', { layoutDef: exportLayoutDef() });
    },
    'paperstamp:listLayoutDefs'() {
      post('paperstamp:layoutDefs', { layouts: getAllLayouts() });
    },
    'paperstamp:previewById'(m) {
      if (!m.layoutId) {
        emitError('E_BAD_MESSAGE', 'previewById requires layoutId.');
        return;
      }
      const data = getAllLayouts()[m.layoutId];
      if (!data) {
        emitError('E_NO_LAYOUT', 'Layout "' + m.layoutId + '" not found.');
        return;
      }
      const result = applyValidatedLayoutToState(
        data,
        m.fieldValues || null,
        m.layoutId,
        { keepZoom: !!m.keepZoom }
      );
      if (!result.ok) {
        emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
        return;
      }
      revealPage();
    },
    'paperstamp:import'(m) {
      // importLayoutDef() sanitizes; skip the redundant pre-check.
      const result = importLayoutDef(m.layoutDef);
      if (!result.ok) {
        emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
        return;
      }
      revealPage();
    }
  });

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent && e.source !== window) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
    const h = MESSAGE_HANDLERS[m.type];
    if (h) h(m);
    else emitError('E_BAD_MESSAGE', 'Unknown message type: ' + m.type);
  });

  window.addEventListener('beforeprint', () => {
    printInFlight = true;
  });
  window.addEventListener('afterprint', () => {
    if (!autoPrintTriggered) return;
    autoPrintTriggered = false;
    printInFlight = false;
    emitDone({});
  });
  /* ---------- Public API ---------- */

  const api = {
    /** Protocol version string. @returns {string} */
    get version() {
      return PROTOCOL_VERSION;
    },
    state,
    el,
    /** @returns {Array<Object>} current items array (live reference) */
    items: () => state.items,
    findItem,
    getItemNode,
    render,
    applyPageSize,
    fitPageToStage,
    computeFitScale,
    /** @param {'fit'|'manual'} mode */
    setZoomMode(mode) {
      state.zoomMode = mode;
      if (state.infiniteCanvas && mode === 'fit') {
        fitPageToStage();
        return;
      }
      if (state.infiniteCanvas) centerPage();
      fitPageToStage();
    },
    /** @param {number} s zoom scale (clamped ZOOM_MIN-ZOOM_MAX) */
    setZoomScale(s) {
      state.zoomMode = 'manual';
      state.zoomScale = clampZoom(s);
      if (state.infiniteCanvas) centerPage();
      fitPageToStage();
    },
    /** @param {number} d delta to add to current zoom */
    zoomBy(d) {
      const base =
        state.zoomMode === 'fit' ? computeFitScale() : state.zoomScale;
      api.setZoomScale(base + d);
    },
    setInfiniteCanvas,
    setPan,
    panBy,
    zoomAt,
    clientToPage,
    centerPage,
    applyPageGeometry,
    applyItemFontPx,
    pagePxSize,
    applyLayoutToState,
    applyValidatedLayoutToState,
    applyGuideToDom,
    exportLayoutDef,
    importLayoutDef,
    applyFieldValuesToItems,
    sanitizeLayoutDef,
    sanitizeItem,
    isValidLayoutDef,
    printLayout,
    printStateless,
    listLayouts,
    getAllLayouts,
    setAllLayouts,
    registerLayoutDef,
    post,
    /** @returns {string} postMessage target origin (always '*' — not enforced) */
    trustedOrigin: () => '*',
    emitReady,
    emitDone,
    emitError,
    onEvent,
    on: on,
    emit,
    itemHooks,
    loadDesigner,
    openDesigner,
    setDesignerLayout,
    getPendingDesignerLayoutId: () => pendingDesignerLayoutId,
    consumePendingDesignerLayoutId: () => {
      const v = pendingDesignerLayoutId;
      pendingDesignerLayoutId = null;
      return v;
    },
    /** @returns {boolean} true once designer.js has finished loading */
    isDesignerLoaded: () => designerLoaded,
    isPrintInFlight: () => printInFlight,
    triggerPrint,
    GEO_CLAMP,
    GEO_STYLE,
    VERT_TO_FLEX,
    ALIGN_TO_FLEX,
    deepClone,
    round1,
    computeNextId,
    MAX_LAYOUTS,
    SCHEMA_VERSION
  };

  window.PaperStampCore = api;
  window.PaperStamp = api;

  /* ---------- Init ---------- */

  applyPageSize();
  render();
  fitPageToStage();
  window.addEventListener('resize', () => {
    if (state.infiniteCanvas) centerPage();
    fitPageToStage();
  });

  if (params.get('design') === '1') loadDesigner();

  (function autoTriggerFromUrl() {
    const layoutId = params.get('layoutId');
    if (!layoutId) return;
    let fv = null;
    const raw = params.get('data');
    if (raw) {
      try {
        /* malformed data param — proceed with null fieldValues */

        fv = JSON.parse(decodeURIComponent(raw));
      } catch (e) {}
    }
    printLayout(layoutId, fv);
    revealPage();
  })();

  requestAnimationFrame(() => requestAnimationFrame(emitReady));
})();
