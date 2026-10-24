/* Geometry inputs, drag/resize and item hooks */
import {
  positionItemBadge,
  positionItemToolbar,
  selectItem
} from './selection.js';
import {
  GEO_CLAMP,
  GEO_STYLE,
  el,
  findItem,
  getItemNode,
  itemHooks,
  on,
  round1,
  state
} from './ctx.js';

export function syncGeoInputs(item) {
  el.itemX.value = round1(item.x);
  el.itemY.value = round1(item.y);
  el.itemW.value = round1(item.w);
  el.itemH.value = round1(item.h);
}
export function wireGeometryInput(input, key) {
  input.addEventListener('input', () => {
    const item = findItem(state.selectedId);
    if (!item) return;
    const v = Number(input.value);
    if (Number.isNaN(v)) return;
    item[key] = GEO_CLAMP[key](v, item);
    const node = getItemNode(item.id);
    if (node) {
      node.style[GEO_STYLE[key]] = item[key] + '%';
      positionItemToolbar(node);
      positionItemBadge(item, node);
    }
  });
}

export function beginGeometryDrag(e, item, node, applyDelta) {
  e.preventDefault();
  e.stopPropagation();
  selectItem(item.id);
  const sx = e.clientX;
  const sy = e.clientY;
  function onMove(ev) {
    // Recompute rect each move: a mid-drag zoom changes page dims.
    const rect = el.page.getBoundingClientRect();
    const dx = ((ev.clientX - sx) / rect.width) * 100;
    const dy = ((ev.clientY - sy) / rect.height) * 100;
    applyDelta(dx, dy);
    positionItemToolbar(node);
    if (state.selectedId === item.id) {
      syncGeoInputs(item);
      positionItemBadge(item, node);
    }
  }
  function onUp() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}
export function onItemPointerDown(e, item, node) {
  if (state.mode === 'fill') return;
  if (node.getAttribute('contenteditable') === 'true') return;
  if (e.target.classList.contains('resize-handle')) return;
  const sx = item.x;
  const sy = item.y;
  beginGeometryDrag(e, item, node, (dx, dy) => {
    let nx = GEO_CLAMP.x(sx + dx, item);
    let ny = GEO_CLAMP.y(sy + dy, item);
    const cx = (100 - item.w) / 2;
    const cy = (100 - item.h) / 2;
    if (Math.abs(nx - cx) < 1) nx = cx;
    if (Math.abs(ny - cy) < 1) ny = cy;
    item.x = nx;
    item.y = ny;
    node.style.left = nx + '%';
    node.style.top = ny + '%';
  });
}
export function onResizePointerDown(e, item, node) {
  if (state.mode === 'fill') return;
  const sw = item.w;
  const sh = item.h;
  beginGeometryDrag(e, item, node, (dw, dh) => {
    item.w = GEO_CLAMP.w(sw + dw, item);
    item.h = GEO_CLAMP.h(sh + dh, item);
    node.style.width = item.w + '%';
    node.style.height = item.h + '%';
  });
}
export function startEdit(node, item) {
  node.setAttribute('contenteditable', 'true');
  node.focus();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const onBlur = () => {
    node.removeAttribute('contenteditable');
    item.text = node.textContent;
    node.removeEventListener('blur', onBlur);
  };
  node.addEventListener('blur', onBlur);
}

export function installItemHooks() {
  itemHooks.interactive = true;
  itemHooks.onPointerDown = onItemPointerDown;
  itemHooks.onResizePointerDown = onResizePointerDown;
  itemHooks.onDblClick = (e, item, node) => {
    if (state.mode !== 'fill') startEdit(node, item);
  };
  /* Chrome repositioning on pan/zoom is handled by the module-scope
     core.onEvent('fit', ...) listener above — nothing to install here. */
}
