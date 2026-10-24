/* Page size, zoom, pan and the infinite-canvas geometry. */
import { MM_TO_PX, PT_TO_PX, ZOOM_MIN, clampZoom } from './constants.js';
import { state, el, flags, getItemNode } from './state.js';
import { emit } from './events.js';

/* Physical page size in mm after orientation swap. */
export function physicalMm() {
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
export function pagePxSize() {
  const { w, h } = physicalMm();
  return { w: w * MM_TO_PX, h: h * MM_TO_PX };
}

export function applyPageSize(opts) {
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
  /* keepZoom: page size updated in place, but skip the deferred refit so
       the view doesn't re-center under the user. */
  if (opts && opts.keepZoom) return;
  if (flags.fitRafPending) return;
  flags.fitRafPending = true;
  requestAnimationFrame(() => {
    flags.fitRafPending = false;
    fitPageToStage();
  });
}

/* Re-apply the on-screen px size + position of #page for the current
     zoom/pan, and re-apply item font sizes so text renders at target px. */
export function applyPageGeometry() {
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
export function applyItemFontPx(item, node) {
  const z = state.infiniteCanvas ? state.zoomScale : 1;
  node.style.fontSize = item.fontSize * PT_TO_PX * z + 'px';
  node.style.setProperty('--ps-fs', item.fontSize * PT_TO_PX + 'px');
  if (item.type === 'line') {
    const base = (item.thickness || 1) * PT_TO_PX;
    node.style.setProperty('--lt-px', Math.max(1, Math.round(base * z)) + 'px');
    node.style.setProperty('--ps-lt', base + 'px');
  }
}

export function computeFitScale() {
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
export function centerPage() {
  if (!state.infiniteCanvas) return;
  const { w, h } = pagePxSize();
  const sw = el.stage.clientWidth,
    sh = el.stage.clientHeight;
  const s = state.zoomScale;
  state.panX = Math.round((sw - w * s) / 2);
  state.panY = Math.round((sh - h * s) / 2);
}

/* Re-center horizontally only, leaving vertical pan untouched. Used by
     the keepZoom preview path so the page stays x-centered without yanking
     the user's vertical scroll position. */
export function centerPageX() {
  if (!state.infiniteCanvas) return;
  const { w } = pagePxSize();
  const s = state.zoomScale;
  state.panX = Math.round((el.stage.clientWidth - w * s) / 2);
  applyPageGeometry();
}

export function fitPageToStage() {
  const scale = state.zoomMode === 'fit' ? computeFitScale() : state.zoomScale;
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

export function setInfiniteCanvas(on) {
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

export function setPan(x, y) {
  state.panX = x;
  state.panY = y;
  applyPageGeometry();
}

export function panBy(dx, dy) {
  setPan(state.panX + dx, state.panY + dy);
}

/* Zoom around a viewport-space anchor (client coords relative to #stage).
     Keeps the page point under the cursor fixed. */
export function zoomAt(clientX, clientY, newScale) {
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
export function clientToPage(clientX, clientY) {
  const r = el.stage.getBoundingClientRect();
  return {
    x: (clientX - r.left - state.panX) / state.zoomScale,
    y: (clientY - r.top - state.panY) / state.zoomScale
  };
}
