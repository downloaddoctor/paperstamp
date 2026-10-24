/* Selection, alignment and zoom UI sync */
import {
  core,
  el,
  findItem,
  getItemNode,
  on,
  render,
  round1,
  state
} from './ctx.js';
import { syncGeoInputs } from './drag.js';

export function renderSelection() {
  document.querySelectorAll('.item').forEach((n) => {
    n.classList.toggle('selected', Number(n.dataset.id) === state.selectedId);
  });
}
export const hideItemToolbar = () => {
  if (el.itemToolbar) el.itemToolbar.classList.remove('open');
  if (el.geomBar) el.geomBar.classList.remove('open');
  hideItemBadge();
};
export function positionItemToolbar(node) {
  if (!el.itemToolbar.classList.contains('open'))
    el.itemToolbar.classList.add('open');
  const r = node.getBoundingClientRect();
  const t = el.itemToolbar.getBoundingClientRect();
  let top = r.top - t.height - 10;
  if (top < 8) top = r.bottom + 10;
  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - t.width - 8,
      r.left + r.width / 2 - t.width / 2
    )
  );
  el.itemToolbar.style.top = top + 'px';
  el.itemToolbar.style.left = left + 'px';
}
export function positionGeomBar(node) {
  if (!el.geomBar) return;
  const r = node.getBoundingClientRect();
  const t = el.geomBar.getBoundingClientRect();
  let top = r.top - t.height - 10;
  if (top < 8) top = r.bottom + 10;
  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - t.width - 8,
      r.left + r.width / 2 - t.width / 2
    )
  );
  el.geomBar.style.top = top + 'px';
  el.geomBar.style.left = left + 'px';
}
export function showItemToolbar(id) {
  const node = getItemNode(id);
  if (!node) {
    hideItemToolbar();
    return;
  }
  positionItemToolbar(node);
  el.itemToolbar.classList.add('open');
}
export function hideItemBadge() {
  if (el.wBadge) el.wBadge.hidden = true;
  if (el.hBadge) el.hBadge.hidden = true;
}
export function positionItemBadge(item, node) {
  if (!node) {
    hideItemBadge();
    return;
  }
  /* Badges are position:fixed — position in viewport space from the
     item's real on-screen rect. The -50% transforms in .item-badge
     handle centering, so we only supply viewport coordinates. */
  const r = node.getBoundingClientRect();
  el.wBadge.hidden = false;
  el.wBadge.textContent = round1(item.w);
  el.wBadge.style.top = r.bottom + 6 + 'px';
  el.wBadge.style.left = r.left + r.width / 2 + 'px';
  el.hBadge.hidden = false;
  el.hBadge.textContent = round1(item.h);
  el.hBadge.style.top = r.top + r.height / 2 + 'px';
  el.hBadge.style.left = r.right + 6 + 'px';
}
export function selectItem(id) {
  state.selectedId = id;
  renderSelection();
  const item = findItem(id);
  if (!item) {
    hideItemToolbar();
    hideItemBadge();
    return;
  }
  el.itemName.value = item.name || '';
  el.fontSize.value = item.fontSize;
  syncGeoInputs(item);
  setActiveAlign(item.align);
  setActiveVAlign(item.valign || 'top');
  const isLine = item.type === 'line';
  el.itemToolbar
    .querySelectorAll(
      '#itemName,#fontSize,#textAlignGroup,#vertAlignGroup,#fixedToggle,.toolbar-sep'
    )
    .forEach((n) => {
      n.style.display = isLine ? 'none' : '';
    });
  el.itemToolbar.querySelectorAll('.line-only').forEach((n) => {
    n.style.display = isLine ? '' : 'none';
  });
  if (isLine) {
    el.lineStyle.value = item.line || 'dotted';
    el.lineThickness.value = item.thickness || 1;
    el.lineColor.value = item.color || '#111111';
  }
  if (el.fixedToggle) el.fixedToggle.classList.toggle('active', !!item.fixed);
  el.itemBg.value = item.bg || '#ffff99';
  el.geomBar.classList.add('open');
  positionGeomBar(getItemNode(id));
  showItemToolbar(id);
  positionItemBadge(item, getItemNode(id));
}

export function setActiveAlign(a) {
  el.textAlignGroup.querySelectorAll('.align-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.align === a);
  });
}
export function setActiveVAlign(v) {
  if (!el.vertAlignGroup) return;
  el.vertAlignGroup.querySelectorAll('.align-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.valign === v);
  });
}

core.onEvent('fit', ({ mode, scale }) => {
  if (!el.zoomPctLabel) return;
  el.zoomPctLabel.textContent =
    mode === 'fit' ? 'Fit' : Math.round(scale * 100) + '%';
  if (state.selectedId == null) return;
  const item = findItem(state.selectedId);
  const node = getItemNode(state.selectedId);
  if (!item || !node) return;
  if (el.itemToolbar && el.itemToolbar.classList.contains('open'))
    positionItemToolbar(node);
  if (el.geomBar && el.geomBar.classList.contains('open'))
    positionGeomBar(node);
  positionItemBadge(item, node);
});
