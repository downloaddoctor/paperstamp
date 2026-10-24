/* Host message handlers and print lifecycle listeners. */
import { isValidLayoutDef } from './validate.js';
import { getAllLayouts, registerLayoutDef } from './storage.js';
import {
  post,
  emitReady,
  emitDone,
  emitError,
  revealPage
} from './protocol.js';
import { emit } from './events.js';
import {
  applyValidatedLayoutToState,
  importLayoutDef,
  exportLayoutDef
} from './render.js';
import { printLayout, printStateless } from './print.js';
import { openDesigner, setDesignerLayout } from './designer-loader.js';
import { flags } from './state.js';

export const MESSAGE_HANDLERS = Object.freeze({
  'paperstamp:ping'() {
    emitReady();
  },
  'paperstamp:preview'(m) {
    if (!isValidLayoutDef(m.layoutDef)) {
      emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
      return;
    }
    const r = applyValidatedLayoutToState(
      m.layoutDef,
      m.fieldValues || null,
      m.layoutDef.name || null,
      { keepZoom: !!m.keepZoom }
    );
    if (!r.ok) {
      emitError('E_BAD_LAYOUT_DEF', r.errors.join('; '));
      return;
    }
    revealPage();
  },
  'paperstamp:print'(m) {
    if (!isValidLayoutDef(m.layoutDef)) {
      emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
      return;
    }
    if (
      !printStateless(m.layoutDef, m.fieldValues || null, {
        ...(m.options || {}),
        keepZoom: !!m.keepZoom || !!(m.options && m.options.keepZoom)
      })
    ) {
      emitError('E_BAD_LAYOUT_DEF', 'printStateless rejected the layoutDef.');
      return;
    }
    revealPage();
  },
  'paperstamp:printById'(m) {
    if (!m.layoutId) {
      emitError('E_BAD_MESSAGE', 'printById requires layoutId.');
      return;
    }
    if (!getAllLayouts()[m.layoutId]) {
      emitError('E_NO_LAYOUT', 'Layout "' + m.layoutId + '" not found.');
      return;
    }
    printLayout(m.layoutId, m.fieldValues || null, {
      keepZoom: !!m.keepZoom
    });
    revealPage();
  },
  'paperstamp:register'(m) {
    if (!isValidLayoutDef(m.layoutDef)) {
      emitError('E_BAD_LAYOUT_DEF', 'layoutDef.items must be an array.');
      return;
    }
    if (!m.layoutDef.name) {
      emitError('E_BAD_MESSAGE', 'register requires layoutDef.name.');
      return;
    }
    registerLayoutDef(m.layoutDef);
    emitReady();
  },
  'paperstamp:openDesigner'(m) {
    openDesigner(m || null);
  },
  'paperstamp:setDesignerLayout'(m) {
    if (!m.layoutId) {
      emitError('E_BAD_MESSAGE', 'setDesignerLayout requires layoutId.');
      return;
    }
    setDesignerLayout(m.layoutId, { minimal: !!m.minimal });
  },
  'paperstamp:closeDesigner'() {
    emit('designer:close', {});
  },
  'paperstamp:export'() {
    post('paperstamp:exportResult', { layoutDef: exportLayoutDef() });
  },
  'paperstamp:listLayoutDefs'() {
    post('paperstamp:layoutDefs', { layouts: getAllLayouts() });
  },
  'paperstamp:previewById'(m) {
    if (!m.layoutId) {
      emitError('E_BAD_MESSAGE', 'previewById requires layoutId.');
      return;
    }
    const data = getAllLayouts()[m.layoutId];
    if (!data) {
      emitError('E_NO_LAYOUT', 'Layout "' + m.layoutId + '" not found.');
      return;
    }
    const result = applyValidatedLayoutToState(
      data,
      m.fieldValues || null,
      m.layoutId,
      { keepZoom: !!m.keepZoom }
    );
    if (!result.ok) {
      emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
      return;
    }
    revealPage();
  },
  'paperstamp:import'(m) {
    // importLayoutDef() sanitizes; skip the redundant pre-check.
    const result = importLayoutDef(m.layoutDef);
    if (!result.ok) {
      emitError('E_BAD_LAYOUT_DEF', result.errors.join('; '));
      return;
    }
    revealPage();
  }
});

window.addEventListener('message', (e) => {
  if (e.source !== window.parent && e.source !== window) return;
  const m = e.data;
  if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
  const h = MESSAGE_HANDLERS[m.type];
  if (h) h(m);
  else emitError('E_BAD_MESSAGE', 'Unknown message type: ' + m.type);
});

window.addEventListener('beforeprint', () => {
  flags.printInFlight = true;
});
window.addEventListener('afterprint', () => {
  if (!flags.autoPrintTriggered) return;
  flags.autoPrintTriggered = false;
  flags.printInFlight = false;
  emitDone({});
});
