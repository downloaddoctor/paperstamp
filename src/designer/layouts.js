/* Layout storage UI */
import {
  applyPageSize,
  core,
  el,
  getAllLayouts,
  listLayouts,
  on,
  render,
  setAllLayouts,
  state
} from './ctx.js';
import { setMode } from './modes.js';
import { hideItemToolbar } from './selection.js';
import { syncGuideDom, syncPageSetupInputs } from './sync.js';
import { confirmAction, notify } from './ui.js';

export function populateLayoutSelect(selectId) {
  if (!el.layoutSelect) return;
  const ids = listLayouts();
  el.layoutSelect.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '-- none --';
  el.layoutSelect.appendChild(empty);
  ids.forEach((id) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    el.layoutSelect.appendChild(o);
  });
  if (selectId && ids.includes(selectId)) el.layoutSelect.value = selectId;
  if (!el.layoutComboList) return;
  el.layoutComboList.innerHTML = '';
  if (!ids.length) {
    const e = document.createElement('div');
    e.className = 'layout-combo-empty';
    e.textContent = 'No saved layouts';
    el.layoutComboList.appendChild(e);
    return;
  }
  ids.forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = id;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      el.layoutName.value = id;
      el.layoutSelect.value = id;
      el.layoutComboList.classList.remove('open');
      loadLayout();
    });
    el.layoutComboList.appendChild(b);
  });
}
export function saveLayout() {
  const id = (el.layoutName.value || '').trim();
  if (!id) {
    notify('Enter a layout name first.');
    return;
  }
  const l = getAllLayouts();
  l[id] = {
    pageWmm: state.pageWmm,
    pageHmm: state.pageHmm,
    orientation: state.orientation,
    items: state.items,
    guideSrc: state.guideSrc,
    guideOpacity: state.guideOpacity
  };
  if (!setAllLayouts(l)) {
    notify('Could not save: storage is full or unavailable.');
    return;
  }
  populateLayoutSelect(id);
  notify('Layout "' + id + '" saved.');
}
export function getSelectedLayoutId() {
  const id = el.layoutSelect.value;
  if (!id) {
    notify('Select a saved layout first.');
    return null;
  }
  return id;
}
export function loadLayout() {
  const id = getSelectedLayoutId();
  if (!id) return;
  const data = getAllLayouts()[id];
  if (!data) {
    notify('Layout not found.');
    return;
  }
  core.applyLayoutToState(data, null, id);
  syncGuideDom();
  syncPageSetupInputs();
  setMode('design');
}
export function clearLayout() {
  state.pageWmm = 210;
  state.pageHmm = 297;
  state.orientation = 'portrait';
  state.items = [];
  state.nextId = 1;
  state.selectedId = null;
  state.guideSrc = '';
  state.guideOpacity = 60;
  if (el.layoutName) el.layoutName.value = '';
  if (el.guideUpload) el.guideUpload.value = '';
  if (el.fileDropText) el.fileDropText.textContent = 'Click to upload image';
  hideItemToolbar();
  applyPageSize();
  syncPageSetupInputs();
  syncGuideDom();
  render();
  setMode('design');
}
export function deleteLayout() {
  const id = getSelectedLayoutId();
  if (!id) return;
  confirmAction('Delete layout "' + id + '"?', () => {
    const l = getAllLayouts();
    delete l[id];
    if (!setAllLayouts(l)) {
      notify('Could not delete: storage unavailable.');
      return;
    }
    // If the deleted layout is the one on the page, reset to a blank
    // sheet; otherwise leave the currently-displayed layout untouched.
    const displayedName = (el.layoutName.value || '').trim();
    populateLayoutSelect();
    if (displayedName === id) clearLayout();
    notify('Layout "' + id + '" deleted.');
  });
}
