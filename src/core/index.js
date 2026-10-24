/* Single entry: core api, init, then the designer (same bundle, UI shown on openDesigner()). */
import { api } from './api.js';
import { params, state } from './state.js';
import { parseDataParam } from './validate.js';
import { emitReady, revealPage } from './protocol.js';
import { applyPageSize, fitPageToStage, centerPage } from './view.js';
import { render } from './render.js';
import { printLayout } from './print.js';
import '../designer/index.js';

window.PaperStamp = api;

applyPageSize();
render();
fitPageToStage();
window.addEventListener('resize', () => {
  if (state.infiniteCanvas) centerPage();
  fitPageToStage();
});

(function autoTriggerFromUrl() {
  const layoutId = params.get('layoutId');
  if (!layoutId) return;
  let fv = null;
  const raw = params.get('data');
  if (raw) {
    try {
      fv = parseDataParam(raw);
    } catch (e) {
      /* malformed data param: proceed with null fieldValues */
    }
  }
  printLayout(layoutId, fv);
  revealPage();
})();

requestAnimationFrame(() => requestAnimationFrame(emitReady));
