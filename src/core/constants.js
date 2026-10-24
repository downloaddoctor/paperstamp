'use strict';

export const PROTOCOL_VERSION = '1';
export const SCHEMA_VERSION = 1;
export const LAYOUTS_KEY = 'paperstampLayouts';
export const LAYOUTS_META_KEY = 'paperstampLayoutsMeta';
export const LAYOUTS_LRU_KEY = 'paperstampLayoutsLru';
export const MAX_LAYOUTS = 100;
export const MAX_PAGE_MM = 5000;

export const ALIGN_TO_FLEX = Object.freeze({
  center: 'center',
  right: 'flex-end',
  left: 'flex-start'
});
export const VERT_TO_FLEX = Object.freeze({
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end'
});
export const GEO_CLAMP = Object.freeze({
  x: (v, it) => Math.max(0, Math.min(100 - it.w, v)),
  y: (v, it) => Math.max(0, Math.min(100 - it.h, v)),
  w: (v, it) => Math.max(2, Math.min(100 - it.x, v)),
  h: (v, it) => Math.max(2, Math.min(100 - it.y, v))
});
export const GEO_STYLE = Object.freeze({
  x: 'left',
  y: 'top',
  w: 'width',
  h: 'height'
});

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 5;
export const clampZoom = (s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s));
export const MM_TO_PX = 96 / 25.4;
export const PT_TO_PX = 96 / 72;
