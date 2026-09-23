'use strict';

/**
 * sdk.js — host-side wrapper for embedding PaperStamp in an iframe.
 * UMD: works as <script>, CommonJS, or AMD. Zero dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define([], factory);
  else root.PaperStamp = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Resolve the directory this SDK was loaded from, so hosts don't need src. */
  const SELF_DIR = (() => {
    const cs = document.currentScript;
    if (!cs || !cs.src) return null;
    try {
      return new URL('.', cs.src).href;
    } catch (e) {
      return null;
    }
  })();
  const defaultSrc = () => (SELF_DIR ? SELF_DIR + 'sdk.html' : null);

  function createInstance(iframe, opts) {
    const inst = {
      ready: false,
      origin: '*',
      queue: [],
      layouts: [],
      layoutDefs: {},
      pending: null,
      pendingExport: null,
      pendingListLayoutDefs: null,
      autoShow: opts.autoShow !== false,
      defaultLayout: opts.defaultLayout || null,
      layoutId: opts.layoutId || null,
      listeners: {
        ready: typeof opts.onReady === 'function' ? [opts.onReady] : [],
        done: typeof opts.onDone === 'function' ? [opts.onDone] : [],
        error: typeof opts.onError === 'function' ? [opts.onError] : [],
        exportResult: [],
        layoutDefs: []
      }
    };

    function emit(name, payload) {
      (inst.listeners[name] || []).forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error('[paperstamp-sdk] listener error:', e);
        }
      });
    }
    function post(msg) {
      if (iframe.contentWindow)
        iframe.contentWindow.postMessage(msg, inst.origin);
    }
    function flushQueue() {
      if (!inst.ready) return;
      inst.queue.splice(0).forEach(post);
    }
    function enqueue(msg) {
      if (inst.ready) post(msg);
      else inst.queue.push(msg);
    }
    function onMessage(e) {
      if (e.source !== iframe.contentWindow) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string')
        return;
      if (msg.type === 'paperstamp:ready') {
        inst.ready = true;
        inst.layouts = msg.layouts || [];
        inst.layoutDefs = msg.layoutDefs || {};
        emit('ready', {
          version: msg.version,
          layouts: inst.layouts,
          layoutDefs: inst.layoutDefs
        });
        flushQueue();
        if (inst.autoShow) {
          if (inst.defaultLayout) {
            api.preview({ layoutDef: inst.defaultLayout });
          } else if (inst.layoutId) {
            api.printById(inst.layoutId);
          }
        }
      } else if (msg.type === 'paperstamp:exportResult') {
        const cb = inst.pendingExport;
        inst.pendingExport = null;
        emit('exportResult', { layoutDef: msg.layoutDef });
        if (typeof cb === 'function') cb(msg.layoutDef);
      } else if (msg.type === 'paperstamp:layoutDefs') {
        inst.layoutDefs = msg.layouts || {};
        const cb = inst.pendingListLayoutDefs;
        inst.pendingListLayoutDefs = null;
        emit('layoutDefs', { layouts: inst.layoutDefs });
        if (typeof cb === 'function') cb(inst.layoutDefs);
      } else if (msg.type === 'paperstamp:done') {
        const info = inst.pending || {};
        inst.pending = null;
        emit('done', info);
      } else if (msg.type === 'paperstamp:error') {
        const err = {
          code: msg.code,
          message: msg.message,
          job: inst.pending || null
        };
        inst.pending = null;
        emit('error', err);
      } else {
        emit('error', {
          code: 'E_UNKNOWN_MESSAGE',
          message: 'Unknown message type: ' + msg.type,
          job: null
        });
      }
    }
    window.addEventListener('message', onMessage);

    const api = {
      iframe,
      isReady: () => inst.ready,
      layouts: () => inst.layouts.slice(),
      layoutDefs: () => Object.assign({}, inst.layoutDefs),
      listLayoutDefs(cb) {
        inst.pendingListLayoutDefs = typeof cb === 'function' ? cb : null;
        enqueue({ type: 'paperstamp:listLayoutDefs' });
        return api;
      },
      previewById(layoutId, fieldValues, options) {
        if (!layoutId) {
          emit('error', {
            code: 'E_BAD_CALL',
            message: 'previewById() requires layoutId.'
          });
          return api;
        }
        enqueue({
          type: 'paperstamp:previewById',
          layoutId,
          fieldValues: fieldValues || null,
          keepZoom: !!(options && options.keepZoom)
        });
        return api;
      },
      print(job) {
        if (!job || !job.layoutDef) {
          emit('error', {
            code: 'E_BAD_CALL',
            message: 'print() requires layoutDef.'
          });
          return api;
        }
        inst.pending = {
          kind: 'print',
          layoutName: job.layoutDef.name || null
        };
        enqueue({
          type: 'paperstamp:print',
          layoutDef: job.layoutDef,
          fieldValues: job.fieldValues || null,
          options: job.options || {}
        });
        return api;
      },
      printById(layoutId, fieldValues, options) {
        if (!layoutId) {
          emit('error', {
            code: 'E_BAD_CALL',
            message: 'printById() requires layoutId.'
          });
          return api;
        }
        inst.pending = { kind: 'printById', layoutId };
        enqueue({
          type: 'paperstamp:printById',
          layoutId,
          fieldValues: fieldValues || null,
          options: options || {}
        });
        return api;
      },
      preview(job) {
        if (!job || !job.layoutDef) {
          emit('error', {
            code: 'E_BAD_CALL',
            message: 'preview() requires layoutDef.'
          });
          return api;
        }
        enqueue({
          type: 'paperstamp:preview',
          layoutDef: job.layoutDef,
          fieldValues: job.fieldValues || null,
          keepZoom: !!job.keepZoom
        });
        return api;
      },
      register(layoutDef) {
        if (!layoutDef || !layoutDef.name) {
          emit('error', {
            code: 'E_BAD_CALL',
            message: 'register() requires layoutDef.name.'
          });
          return api;
        }
        enqueue({ type: 'paperstamp:register', layoutDef });
        return api;
      },
      ping() {
        enqueue({ type: 'paperstamp:ping' });
        return api;
      },
      /**
       * Lazy-load the designer UI into the embedded plugin.
       * After load, all editing chrome becomes visible inside the iframe.
       * Idempotent — repeated calls are ignored after the first.
       * Pass {layoutId} to open the designer with that saved layout
       * selected (select + name + canvas), not just previewed.
       */
      openDesigner(opts) {
        const layoutId = opts && opts.layoutId;
        if (layoutId)
          enqueue({ type: 'paperstamp:setDesignerLayout', layoutId });
        else enqueue({ type: 'paperstamp:openDesigner' });
        return api;
      },
      /**
       * Load the designer (if needed) and select a saved layout in it.
       * Unlike previewById(), this sets the designer's layout name/select
       * so Save/Delete operate on that layout, not an anonymous sheet.
       */
      setDesignerLayout(layoutId) {
        if (!layoutId) {
          emit('error', {
            code: 'E_BAD_CALL',
            message: 'setDesignerLayout() requires layoutId.'
          });
          return api;
        }
        enqueue({ type: 'paperstamp:setDesignerLayout', layoutId });
        return api;
      },
      /**
       * Request the current in-plugin layout as JSON.
       * cb(layoutDef) fires when the plugin responds; also emits 'exportResult'.
       */
      export(cb) {
        inst.pendingExport = typeof cb === 'function' ? cb : null;
        enqueue({ type: 'paperstamp:export' });
        return api;
      },
      /** Push a layoutDef into the plugin, replacing its current state. */
      import(layoutDef, options) {
        if (!layoutDef || !Array.isArray(layoutDef.items)) {
          emit('error', {
            code: 'E_BAD_CALL',
            message: 'import() requires layoutDef.items array.'
          });
          return api;
        }
        enqueue({
          type: 'paperstamp:import',
          layoutDef,
          options: options || {}
        });
        return api;
      },
      closeDesigner() {
        enqueue({ type: 'paperstamp:closeDesigner' });
        return api;
      },
      on(name, fn) {
        if (!inst.listeners[name]) inst.listeners[name] = [];
        inst.listeners[name].push(fn);
        return api;
      },
      destroy() {
        window.removeEventListener('message', onMessage);
        inst.listeners = {
          ready: [],
          done: [],
          error: [],
          exportResult: [],
          layoutDefs: []
        };
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
    };
    return api;
  }

  /**
   * Create a hidden iframe pointed at PaperStamp.
   * opts:
   *   src           - plugin URL (auto-derived from sdk.js location)
   *   origin        - ignored (origin not enforced; postMessage always uses '*')
   *   width/height  - iframe size (default 0x0, hidden)
   *   container     - parent element (default document.body)
   *   autoShow      - if true (default), SDK auto-sends a layout after ready
   *   defaultLayout - layoutDef to preview() on ready (highest precedence)
   *   layoutId      - plugin-side saved layout name to printById() on ready
   *   onReady/onDone/onError - listener shortcuts
   */
  function embed(opts) {
    opts = opts || {};
    const src = opts.src || defaultSrc();
    if (!src)
      throw new Error(
        'PaperStamp.embed: could not resolve plugin URL. Pass opts.src explicitly.'
      );

    const origin = '*'; // origin not enforced — any host allowed

    const iframe = document.createElement('iframe');
    iframe.setAttribute('role', 'application');
    iframe.setAttribute('aria-label', 'PaperStamp print surface');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'PaperStamp');
    if (opts.hidden !== false && opts.width == null && opts.height == null)
      iframe.setAttribute('hidden', '');
    const w = opts.width != null ? String(opts.width) : '0';
    const h = opts.height != null ? String(opts.height) : '0';
    const pos = opts.position != null ? String(opts.position) : 'absolute';
    iframe.style.cssText =
      'border:0;pointer-events:auto;width:' +
      w +
      ';height:' +
      h +
      ';position:' +
      pos;
    iframe.src = src;
    (opts.container || document.body).appendChild(iframe);

    return createInstance(iframe, Object.assign({}, opts, { origin, src }));
  }

  return { embed, version: '1' };
});
