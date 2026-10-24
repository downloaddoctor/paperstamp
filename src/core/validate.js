import { MAX_PAGE_MM } from './constants.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

/* URLSearchParams.get() already percent-decodes, so try plain JSON first;
   only fall back to decodeURIComponent for hosts that double-encoded. */
export function parseDataParam(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return JSON.parse(decodeURIComponent(raw));
  }
}

export function isValidLayoutDef(d) {
  return !!d && Array.isArray(d.items);
}

export function sanitizeItem(raw, i, errors) {
  if (!raw || typeof raw !== 'object') {
    errors.push('item[' + i + '] must be an object');
    return null;
  }
  const num = (key, fallback, min, max) => {
    const v = Number(raw[key]);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  };
  const x = num('x', 0, 0, 100);
  const y = num('y', 0, 0, 100);
  const w = num('w', 10, 2, 100);
  const h = num('h', 6, 2, 100);
  const align = ['left', 'center', 'right'].includes(raw.align)
    ? raw.align
    : 'left';
  const valign = ['top', 'middle', 'bottom'].includes(raw.valign)
    ? raw.valign
    : 'top';
  const fontSize = num('fontSize', 12, 4, 400);
  const id = Number.isFinite(Number(raw.id)) ? Number(raw.id) : i + 1;
  if (raw.type === 'line') {
    return {
      id,
      type: 'line',
      x: Math.min(x, 100 - w),
      y: Math.min(y, 100 - h),
      w,
      h,
      text: '',
      name: raw.name != null ? String(raw.name) : 'Line ' + id,
      line: ['dotted', 'dashed', 'solid'].includes(raw.line)
        ? raw.line
        : 'dotted',
      thickness: num('thickness', 1, 0.25, 20),
      color: HEX.test(raw.color) ? raw.color : '#111111',
      bg: HEX.test(raw.bg) ? raw.bg : '',
      fontSize: 12,
      align: 'left',
      valign: 'top'
    };
  }
  return {
    id,
    type: 'text',
    x: Math.min(x, 100 - w),
    y: Math.min(y, 100 - h),
    w,
    h,
    text: raw.text != null ? String(raw.text) : '',
    name: raw.name != null ? String(raw.name) : 'Field ' + id,
    fixed: raw.fixed === true,
    bg: HEX.test(raw.bg) ? raw.bg : '',
    fontSize,
    align,
    valign
  };
}

export function sanitizeLayoutDef(d) {
  const errors = [];
  const w = Number(d.pageWmm);
  const h = Number(d.pageHmm);
  if (!(w >= 1 && w <= MAX_PAGE_MM))
    errors.push('pageWmm must be a number between 1 and ' + MAX_PAGE_MM);
  if (!(h >= 1 && h <= MAX_PAGE_MM))
    errors.push('pageHmm must be a number between 1 and ' + MAX_PAGE_MM);
  const orientation = d.orientation === 'landscape' ? 'landscape' : 'portrait';
  const items = [];
  (d.items || []).forEach((raw, i) => {
    const it = sanitizeItem(raw, i, errors);
    if (it) items.push(it);
  });
  if (errors.length) return { ok: false, errors };
  /* Deduplicate ids: sanitizeItem may fall back to i+1, colliding with an
     explicit numeric id from the host. Renumber on any duplicate. */
  const seen = new Set();
  let bumped = false;
  for (const it of items) {
    if (seen.has(it.id)) {
      bumped = true;
      break;
    }
    seen.add(it.id);
  }
  if (bumped) {
    const used = new Set();
    let next = 1;
    for (const it of items) {
      while (used.has(next)) next++;
      it.id = next;
      used.add(next);
    }
  }
  return {
    ok: true,
    def: { name: d.name || null, pageWmm: w, pageHmm: h, orientation, items }
  };
}
