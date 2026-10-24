/* Print triggering. */
import { flags } from './state.js';
import { getAllLayouts, registerLayoutDef } from './storage.js';
import { emitError } from './protocol.js';
import { isValidLayoutDef } from './validate.js';
import { applyValidatedLayoutToState } from './render.js';

export function triggerPrint() {
  if (flags.printInFlight) return false;
  flags.autoPrintTriggered = true;
  flags.printInFlight = true;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      try {
        window.print();
      } catch (err) {
        flags.printInFlight = false;
        emitError('E_PRINT_BLOCKED', String((err && err.message) || err));
      }
    })
  );
  return true;
}
export function printLayout(layoutId, fv, opts) {
  const data = getAllLayouts()[layoutId];
  if (!data) {
    emitError('E_NO_LAYOUT', 'Layout "' + layoutId + '" not found.');
    return false;
  }
  const result = applyValidatedLayoutToState(data, fv, layoutId, opts);
  if (!result.ok) {
    emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
    return false;
  }
  triggerPrint();
  return true;
}
export function printStateless(def, fv, opts) {
  if (!isValidLayoutDef(def)) {
    emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
    return false;
  }
  const result = applyValidatedLayoutToState(def, fv, def.name || null, {
    keepZoom: !!(opts && opts.keepZoom)
  });
  if (!result.ok) {
    emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
    return false;
  }
  if (def.name && opts && opts.persist) registerLayoutDef(result.def);
  triggerPrint();
  return true;
}
