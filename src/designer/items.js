/* Item operations */
import { hideItemToolbar, selectItem } from './selection.js';
import { confirmAction } from './ui.js';
import { deepClone, el, findItem, on, render, state } from './ctx.js';

export function addTextItem() {
  const id = state.nextId++;
  state.items.push({
    id,
    type: 'text',
    x: 10,
    y: 10,
    name: 'Field ' + id,
    w: 30,
    h: 6,
    text: 'Text',
    fixed: false,
    fontSize: 12,
    align: 'left',
    valign: 'top'
  });
  render();
  selectItem(id);
}
export function addLineItem() {
  const id = state.nextId++;
  state.items.push({
    id,
    type: 'line',
    x: 10,
    y: 20,
    w: 40,
    h: 2,
    name: 'Line ' + id,
    text: '',
    line: 'dotted',
    thickness: 1,
    color: '#111111',
    fontSize: 12,
    align: 'left',
    valign: 'top'
  });
  render();
  selectItem(id);
}
export function deleteSelected() {
  if (state.selectedId == null) return;
  state.items = state.items.filter((it) => it.id !== state.selectedId);
  state.selectedId = null;
  hideItemToolbar();
  render();
}
export function duplicateSelected() {
  const item = findItem(state.selectedId);
  if (!item) return;
  const clone = Object.assign(deepClone(item), { id: state.nextId++ });
  clone.x = Math.min(100 - clone.w, clone.x + 2);
  clone.y = Math.min(100 - clone.h, clone.y + 2);
  if (clone.type === 'text') clone.name = (clone.name || 'Field') + ' copy';
  state.items.push(clone);
  render();
  selectItem(clone.id);
}
export function handleClearAll() {
  confirmAction('Remove all items?', () => {
    state.items = [];
    state.selectedId = null;
    hideItemToolbar();
    render();
  });
}
