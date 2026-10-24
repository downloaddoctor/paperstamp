/* Fill and minimal modes */
import { installItemHooks } from './drag.js';
import { closeAllPopovers, positionFillPanel } from './popovers.js';
import { hideItemToolbar, renderSelection } from './selection.js';
import { el, getItemNode, itemHooks, on, render, state } from './ctx.js';

export function renderFillForm() {
  el.fillFormList.innerHTML = '';
  const textItems = state.items.filter((it) => it.type === 'text' && !it.fixed);
  if (!textItems.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'No text fields yet. Switch to Design mode to add some.';
    el.fillFormList.appendChild(p);
    return;
  }
  for (const item of textItems) {
    const wrap = document.createElement('div');
    wrap.className = 'fill-field';
    const label = document.createElement('label');
    label.textContent = item.name || 'Field ' + item.id;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.text;
    input.addEventListener('input', () => {
      item.text = input.value;
      const node = getItemNode(item.id);
      if (node) node.textContent = item.text;
      else render();
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    el.fillFormList.appendChild(wrap);
  }
}
export function setMode(mode) {
  const isFill = mode === 'fill';
  /* closeAllPopovers() resets pencil + state.mode='design'; assert the
     requested mode after it runs so its reset doesn't stomp us. */
  closeAllPopovers();
  state.mode = mode;
  if (el.fillToggleBtn) {
    el.fillToggleBtn.classList.toggle('active', isFill);
    el.fillToggleBtn.setAttribute('aria-pressed', String(isFill));
  }
  if (isFill) {
    state.selectedId = null;
    hideItemToolbar();
    const fp = document.getElementById('fillPanel');
    if (fp) fp.classList.add('open');
  }
  render();
  // Bind fill inputs to live item objects *after* render() so the
  // freshly-built nodes are the ones the inputs write into.
  if (isFill) {
    renderFillForm();
    /* Position after the form is populated so getBoundingClientRect()
       measures the final panel height — otherwise the panel is placed
       against a zero/old height and overlaps surrounding chrome. */
    const fp = document.getElementById('fillPanel');
    if (fp) positionFillPanel(fp);
  }
}

/* In minimal mode every editing affordance is hidden; only the zoom bar
   and the layout-name field remain. Item interaction is disabled so the
   canvas is view-only + pannable. */
export function setMinimalMode(on) {
  const minimal = !!on;
  document.body.classList.toggle('designer-minimal', minimal);
  if (el.minimalToggleBtn) {
    el.minimalToggleBtn.classList.toggle('active', minimal);
    el.minimalToggleBtn.setAttribute('aria-pressed', String(minimal));
  }
  /* Layout name stays visible but non-editable in minimal mode. */
  if (el.layoutName) {
    el.layoutName.readOnly = minimal;
    el.layoutName.classList.toggle('readonly', minimal);
  }
  if (minimal) {
    // Drop any open editing UI + selection so nothing floats over the page.
    closeAllPopovers();
    state.selectedId = null;
    hideItemToolbar();
    renderSelection();
    itemHooks.interactive = false;
    itemHooks.onPointerDown = null;
    itemHooks.onResizePointerDown = null;
    itemHooks.onDblClick = null;
    render();
  } else {
    installItemHooks();
    render();
  }
}
