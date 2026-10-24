import {
  LAYOUTS_KEY,
  LAYOUTS_META_KEY,
  LAYOUTS_LRU_KEY,
  SCHEMA_VERSION,
  MAX_LAYOUTS
} from './constants.js';

export function getAllLayouts() {
  try {
    return JSON.parse(localStorage.getItem(LAYOUTS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function setAllLayouts(l) {
  try {
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(l));
    localStorage.setItem(LAYOUTS_META_KEY, String(SCHEMA_VERSION));
    return true;
  } catch (e) {
    return false;
  }
}

export function listLayouts() {
  return Object.keys(getAllLayouts()).sort();
}

function getAllLayoutsMeta() {
  try {
    return JSON.parse(localStorage.getItem(LAYOUTS_LRU_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function setAllLayoutsMeta(meta) {
  try {
    localStorage.setItem(LAYOUTS_LRU_KEY, JSON.stringify(meta));
    return true;
  } catch (e) {
    return false;
  }
}

export function registerLayoutDef(def, opts) {
  const l = getAllLayouts();
  l[def.name] = {
    pageWmm: def.pageWmm,
    pageHmm: def.pageHmm,
    orientation: def.orientation || 'portrait',
    items: def.items
  };
  const meta = getAllLayoutsMeta();
  meta[def.name] = Date.now();
  if (Object.keys(l).length > MAX_LAYOUTS && !(opts && opts.force)) {
    /* LRU: evict least-recently-registered keys until within cap. */
    const byAge = Object.keys(l)
      .filter((k) => k !== def.name)
      .sort((a, b) => (meta[a] || 0) - (meta[b] || 0));
    while (Object.keys(l).length > MAX_LAYOUTS && byAge.length) {
      const k = byAge.shift();
      delete l[k];
      delete meta[k];
    }
  }
  setAllLayoutsMeta(meta);
  return setAllLayouts(l);
}
