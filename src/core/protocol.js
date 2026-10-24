/* Host protocol (postMessage to the embedding page). */
import { PROTOCOL_VERSION } from './constants.js';
import { listLayouts, getAllLayouts } from './storage.js';

/* Origin is not enforced — any host may embed and drive this plugin. */
export function post(type, payload) {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({ type, ...(payload || {}) }, '*');
  } catch (e) {
    /* postMessage can throw in sandboxed/cross-origin iframes — non-fatal */
  }
}
export const revealPage = () => {
  if (document.body) document.body.classList.add('paperstamp-ready');
};
export const emitReady = () => {
  post('paperstamp:ready', {
    version: PROTOCOL_VERSION,
    layouts: listLayouts(),
    layoutDefs: getAllLayouts()
  });
};
export const emitDone = (info) => post('paperstamp:done', info || {});
export const emitError = (code, message) =>
  post('paperstamp:error', { code, message });
