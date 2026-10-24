/* Shared handles to the core runtime. */
import { api } from '../core/api.js';
export const core = api;

export const {
  state,
  el,
  on,
  round1,
  findItem,
  getItemNode,
  computeNextId,
  render,
  applyPageSize,
  fitPageToStage,
  computeFitScale,
  getAllLayouts,
  setAllLayouts,
  listLayouts,
  registerLayoutDef,
  GEO_CLAMP,
  GEO_STYLE,
  itemHooks,
  deepClone
} = core;

export const ZOOM_STEP = 0.1;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
