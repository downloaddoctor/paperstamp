/* Item rendering, layout application, export/import. */
import { ALIGN_TO_FLEX, VERT_TO_FLEX } from './constants.js';
import { state, el, itemHooks, deepClone, computeNextId } from './state.js';
import { emit } from './events.js';
import {
  applyItemFontPx,
  applyPageSize,
  fitPageToStage,
  centerPageX
} from './view.js';
import { isValidLayoutDef, sanitizeLayoutDef } from './validate.js';

export function render() {
  const frag = document.createDocumentFragment();
  for (const item of state.items) {
    const node = document.createElement('div');
    node.className =
      item.type === 'line'
        ? 'item line-item line-' + item.line
        : 'item text-item' + (item.fixed ? ' fixed' : '');
    node.dataset.id = item.id;
    node.style.background = item.bg || '';
    if (item.bg) node.classList.add('has-bg');
    if (item.type === 'line')
      node.style.setProperty('--lc', item.color || '#111111');
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

export function applyFieldValuesToItems(items, fv) {
  if (!fv) return items;
  return items.map((it) => {
    if (
      it.type === 'text' &&
      it.name &&
      !it.fixed &&
      fv[it.name] !== undefined
    ) {
      return Object.assign(deepClone(it), { text: String(fv[it.name]) });
    }
    return deepClone(it);
  });
}

export function applyGuideToDom() {
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

export function applyLayoutToState(def, fv, labelName, opts) {
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
  applyPageSize(opts);
  render();
  /* keepZoom preserves zoom scale + vertical pan, but re-centers the page
       horizontally so it never drifts off the x-axis. */
  if (opts && opts.keepZoom) centerPageX();
  else fitPageToStage();
  emit('layout', { def, fv, labelName });
}

export function applyValidatedLayoutToState(def, fv, labelName, opts) {
  const result = sanitizeLayoutDef(def);
  if (!result.ok) return result;
  if (Object.prototype.hasOwnProperty.call(def, 'guideSrc')) {
    result.def.guideSrc = def.guideSrc;
    result.def.guideOpacity = def.guideOpacity;
  }
  applyLayoutToState(result.def, fv, labelName, opts);
  return result;
}

export function exportLayoutDef(name) {
  return {
    name: name != null ? String(name) : null,
    pageWmm: state.pageWmm,
    pageHmm: state.pageHmm,
    orientation: state.orientation,
    items: deepClone(state.items)
  };
}

export function importLayoutDef(def) {
  if (!isValidLayoutDef(def))
    return { ok: false, errors: ['layoutDef.items must be an array'] };
  const result = sanitizeLayoutDef(def);
  if (!result.ok) return result;
  applyLayoutToState(result.def, null, result.def.name);
  return result;
}
