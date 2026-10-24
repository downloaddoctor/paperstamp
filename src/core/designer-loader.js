/* Designer show and designer-layout entry points. The designer code is in
   the same bundle; nothing is downloaded, init() only builds the UI DOM. */
import { flags } from './state.js';
import { getAllLayouts } from './storage.js';
import { emitError, revealPage } from './protocol.js';
import { emit } from './events.js';
import { applyValidatedLayoutToState } from './render.js';

function ensureDesignerCss() {
  const style = document.getElementById('psDesignerStyle');
  if (style) style.media = 'all';
}

export function loadDesigner() {
  const d = flags.designer;
  if (!d || typeof d.init !== 'function') {
    const err = new Error('designer unavailable');
    emit('designer:error', err);
    return Promise.reject(err);
  }
  ensureDesignerCss();
  flags.designerLoaded = true;
  return Promise.resolve(d.init());
}

/* Set which saved layout the designer shows (select + name + canvas).
   Mounts the designer on demand; idempotent when it is already open. This is
   the 'open designer on THIS layout' entry point, unlike previewById() which
   only paints the canvas without touching designer UI. */
export function setDesignerLayout(layoutId, opts) {
  if (!layoutId) {
    emitError('E_BAD_MESSAGE', 'setDesignerLayout requires layoutId.');
    return Promise.resolve(false);
  }
  const data = getAllLayouts()[layoutId];
  if (!data) {
    emitError('E_NO_LAYOUT', 'Layout "' + layoutId + '" not found.');
    return Promise.resolve(false);
  }
  const designerAlreadyMounted = !!document.querySelector('#psDesignerChrome');
  flags.pendingDesignerLayoutId = layoutId;
  const minimal = !!(opts && opts.minimal);
  flags.pendingMinimal = minimal;
  const result = applyValidatedLayoutToState(data, null, layoutId);
  if (!result.ok) {
    emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
    return Promise.resolve(false);
  }
  revealPage();
  return loadDesigner().then(() => {
    // A fresh mount consumed the pending id/minimal flag in init(); only nudge
    // an already-mounted designer to avoid double-applying.
    if (designerAlreadyMounted)
      emit('designer:setLayout', { layoutId, minimal });
    return true;
  });
}

export function openDesigner(opts) {
  const layoutId = opts && opts.layoutId;
  if (layoutId) return setDesignerLayout(layoutId, opts);
  flags.pendingMinimal = !!(opts && opts.minimal);
  return loadDesigner();
}
