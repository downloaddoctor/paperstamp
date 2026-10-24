/* PaperStamp core — preview + print runtime. The designer is in the same
   bundle; its UI is only shown when openDesigner() runs (SDK: showDesigner). */
import {
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  MAX_LAYOUTS,
  ALIGN_TO_FLEX,
  VERT_TO_FLEX,
  GEO_CLAMP,
  GEO_STYLE,
  clampZoom
} from './constants.js';
import {
  parseDataParam,
  isValidLayoutDef,
  sanitizeItem,
  sanitizeLayoutDef
} from './validate.js';
import {
  getAllLayouts,
  setAllLayouts,
  listLayouts,
  registerLayoutDef
} from './storage.js';
import {
  params,
  state,
  el,
  deepClone,
  round1,
  on,
  findItem,
  getItemNode,
  computeNextId,
  itemHooks,
  flags
} from './state.js';
import { onEvent, emit } from './events.js';
import {
  post,
  emitReady,
  emitDone,
  emitError,
  revealPage
} from './protocol.js';
import {
  applyPageSize,
  fitPageToStage,
  computeFitScale,
  centerPage,
  setInfiniteCanvas,
  setPan,
  panBy,
  zoomAt,
  clientToPage,
  applyPageGeometry,
  applyItemFontPx,
  pagePxSize
} from './view.js';
import {
  render,
  applyLayoutToState,
  applyValidatedLayoutToState,
  applyGuideToDom,
  exportLayoutDef,
  importLayoutDef,
  applyFieldValuesToItems
} from './render.js';
import { printLayout, printStateless, triggerPrint } from './print.js';
import {
  loadDesigner,
  openDesigner,
  setDesignerLayout
} from './designer-loader.js';
import './messages.js';

export const api = {
  /** Protocol version string. @returns {string} */
  get version() {
    return PROTOCOL_VERSION;
  },
  state,
  el,
  /** @returns {Array<Object>} current items array (live reference) */
  items: () => state.items,
  findItem,
  getItemNode,
  render,
  applyPageSize,
  fitPageToStage,
  computeFitScale,
  /** @param {'fit'|'manual'} mode */
  setZoomMode(mode) {
    state.zoomMode = mode;
    if (state.infiniteCanvas && mode === 'fit') {
      fitPageToStage();
      return;
    }
    if (state.infiniteCanvas) centerPage();
    fitPageToStage();
  },
  /** @param {number} s zoom scale (clamped ZOOM_MIN-ZOOM_MAX) */
  setZoomScale(s) {
    state.zoomMode = 'manual';
    state.zoomScale = clampZoom(s);
    if (state.infiniteCanvas) centerPage();
    fitPageToStage();
  },
  /** @param {number} d delta to add to current zoom */
  zoomBy(d) {
    const base = state.zoomMode === 'fit' ? computeFitScale() : state.zoomScale;
    api.setZoomScale(base + d);
  },
  setInfiniteCanvas,
  setPan,
  panBy,
  zoomAt,
  clientToPage,
  centerPage,
  applyPageGeometry,
  applyItemFontPx,
  pagePxSize,
  applyLayoutToState,
  applyValidatedLayoutToState,
  applyGuideToDom,
  exportLayoutDef,
  importLayoutDef,
  applyFieldValuesToItems,
  sanitizeLayoutDef,
  sanitizeItem,
  isValidLayoutDef,
  printLayout,
  printStateless,
  listLayouts,
  getAllLayouts,
  setAllLayouts,
  registerLayoutDef,
  post,
  /** @returns {string} postMessage target origin (always '*' — not enforced) */
  trustedOrigin: () => '*',
  emitReady,
  emitDone,
  emitError,
  onEvent,
  on: on,
  emit,
  itemHooks,
  loadDesigner,
  openDesigner,
  setDesignerLayout,
  registerDesigner: (d) => {
    flags.designer = d;
  },
  getDesigner: () => flags.designer,
  getPendingDesignerLayoutId: () => flags.pendingDesignerLayoutId,
  getPendingMinimal: () => flags.pendingMinimal,
  consumePendingMinimal: () => {
    const v = flags.pendingMinimal;
    flags.pendingMinimal = false;
    return v;
  },
  consumePendingDesignerLayoutId: () => {
    const v = flags.pendingDesignerLayoutId;
    flags.pendingDesignerLayoutId = null;
    return v;
  },
  /** @returns {boolean} true once designer.js has finished loading */
  isDesignerLoaded: () => flags.designerLoaded,
  isPrintInFlight: () => flags.printInFlight,
  triggerPrint,
  GEO_CLAMP,
  GEO_STYLE,
  VERT_TO_FLEX,
  ALIGN_TO_FLEX,
  deepClone,
  round1,
  computeNextId,
  MAX_LAYOUTS,
  SCHEMA_VERSION
};
