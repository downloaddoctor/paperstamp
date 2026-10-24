/* PaperStamp designer — lazy-loaded editing UI on top of core. */
import { installCanvasInput } from './canvas.js';
import { core, el, fitPageToStage, on, render } from './ctx.js';
import { buildDom } from './dom.js';
import { installItemHooks } from './drag.js';
import { wireEvents } from './events.js';
import { populateLayoutSelect } from './layouts.js';
import { setMinimalMode, setMode } from './modes.js';
import { syncGuideDom, syncPageSetupInputs } from './sync.js';

import './selection.js';
import { runSelfTest } from './selftest.js';

// Select + name + canvas sync to a saved layout id, without re-fetching
// the layout (core has already applied state when called from core).
function applyDesignerLayout(id) {
  if (!id) return;
  const data = core.getAllLayouts()[id];
  if (!data) return;
  core.applyValidatedLayoutToState(data, null, id);
  populateLayoutSelect(id);
  if (el.layoutSelect) el.layoutSelect.value = id;
  if (el.layoutName) el.layoutName.value = id;
  syncGuideDom();
  syncPageSetupInputs();
  setMode('design');
}

/* Dev tools (self-test) are opt-in via ?dev=1 on this page or on the host page that embeds the srcdoc iframe. */
function flag(name) {
  const q = (s) => new URLSearchParams(s).get(name) === '1';
  try {
    if (q(location.search)) return true;
  } catch (e) {}
  try {
    return q(window.parent.location.search);
  } catch (e) {
    return false;
  }
}
function mountDevTools() {
  const run = () => runSelfTest();
  core.selfTest = run;
  const rail = document.getElementById('toolRail');
  if (rail && !document.getElementById('railSelfTest')) {
    const b = document.createElement('button');
    b.className = 'rail-btn';
    b.id = 'railSelfTest';
    b.title = 'Run self-test';
    b.textContent = '✓';
    b.addEventListener('click', run);
    rail.insertBefore(b, document.getElementById('railClearAll'));
  }
  if (flag('selftest')) setTimeout(run, 300);
}

async function init() {
  if (document.querySelector('#psDesignerChrome')) return;
  await buildDom();
  document.body.classList.add('designer-mode');
  installCanvasInput();
  installItemHooks();
  wireEvents();
  populateLayoutSelect();
  syncPageSetupInputs();
  render();
  fitPageToStage();
  // Pick up a layout requested before the designer chrome existed.
  const pid =
    core.getPendingDesignerLayoutId && core.getPendingDesignerLayoutId();
  if (pid) {
    core.consumePendingDesignerLayoutId &&
      core.consumePendingDesignerLayoutId();
    applyDesignerLayout(pid);
  }
  // Pick up a minimal-mode request made before the chrome existed.
  const wantMinimal = core.getPendingMinimal && core.getPendingMinimal();
  core.consumePendingMinimal && core.consumePendingMinimal();
  if (wantMinimal) setMinimalMode(true);
  core.emit('designer:ready', {});
  core.emit('designer:mounted', {});
  if (__PS_DEV__ && flag('dev')) mountDevTools();
}

core.onEvent('designer:setLayout', (p) => {
  if (!p || !p.layoutId) return;
  // Chrome not built yet -> init() will consume the pending id itself.
  if (!document.querySelector('#psDesignerChrome')) return;
  core.consumePendingDesignerLayoutId && core.consumePendingDesignerLayoutId();
  applyDesignerLayout(p.layoutId);
  if (p.minimal) setMinimalMode(true);
});

core.onEvent('designer:close', () => {
  if (el._canvasInput) {
    el._canvasInput.teardown();
    el._canvasInput = null;
  }
  /* Drop minimal mode so the next open starts in full editing mode. */
  document.body.classList.remove('designer-minimal');
  core.setInfiniteCanvas(false);
  document
    .querySelectorAll('[data-paperstamp-designer]')
    .forEach((n) => n.remove());
  document.body.classList.remove('designer-mode');
  core.emit('designer:closed', {});
});

window.PaperStampDesigner = {
  init,
  setMode,
  populateLayoutSelect,
  syncGuideDom,
  syncPageSetupInputs
};
