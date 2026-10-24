/* Shared mutable state, DOM refs and tiny helpers. */

export const params = new URLSearchParams(location.search);

export const state = {
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
/* Stage nodes, base CSS and designer markup all come from the SDK's iframe HTML. */

export const el = {};
['page', 'pageViewport', 'stage', 'guideImg', 'pageSizeStyle'].forEach((id) => {
  el[id] = document.getElementById(id);
});

export const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
export const round1 = (n) => Math.round(n * 10) / 10;
export const on = (n, ev, fn) => {
  if (n) n.addEventListener(ev, fn);
};
export const findItem = (id) => state.items.find((it) => it.id === id);
export const getItemNode = (id) =>
  el.page.querySelector('.item[data-id="' + id + '"]');
export const computeNextId = (items) =>
  items.length ? Math.max(...items.map((it) => it.id + 1)) : 1;

export const itemHooks = {
  interactive: false,
  onPointerDown: null,
  onResizePointerDown: null,
  onDblClick: null
};

export const flags = {
  fitRafPending: false,
  autoPrintTriggered: false,
  printInFlight: false,
  designerLoaded: false,
  designer: null,

  pendingDesignerLayoutId: null,
  pendingMinimal: false
};
