/* Dev-only UI self-test (lazy, ?dev=1). Drives the real controls like a user:
   moves a visible cursor, hit-tests each target, dispatches the pointer/mouse
   sequence on the element under the cursor, then asserts state and DOM.
   Only native pickers (file dialog, download, print) are stubbed. */
import { core, state, el, findItem, getAllLayouts } from './ctx.js';

const D = () => core.getDesigner();
const STORE_KEY = 'paperstampLayouts';
const TEST_NAME = '__selftest__';
const MOVE = 180;
const PAUSE = 140;
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const last = () => state.items[state.items.length - 1];
const nodeOf = (it) => document.querySelector('.item[data-id="' + it.id + '"]');
const desc = (n) =>
  n.tagName.toLowerCase() +
  (n.id ? '#' + n.id : '') +
  (typeof n.className === 'string' && n.className.trim()
    ? '.' + n.className.trim().split(/\s+/).join('.')
    : '');

/* ---------- visible pointer ---------- */

function ensureCursor() {
  let c = document.getElementById('psTestCursor');
  if (!c) {
    c = document.createElement('div');
    c.id = 'psTestCursor';
    c.setAttribute('data-paperstamp-designer', '1');
    c.style.cssText =
      'position:fixed;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(229,57,53,.85);border:2px solid #fff;box-shadow:0 0 0 2px rgba(229,57,53,.5);z-index:10001;pointer-events:none;transition:transform .16s ease';
    document.body.appendChild(c);
  }
  return c;
}
async function moveTo(p, ms) {
  ensureCursor().style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
  await wait(ms == null ? MOVE : ms);
}
function flash(n) {
  const old = n.style.outline;
  n.style.outline = '2px solid #e53935';
  setTimeout(() => {
    n.style.outline = old;
  }, PAUSE * 2);
}

/* ---------- real-user primitives ---------- */

function center(n) {
  const r = n.getBoundingClientRect();
  if (!r.width && !r.height) throw new Error('not visible: ' + desc(n));
  const p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight)
    throw new Error('off-screen: ' + desc(n));
  return p;
}
function hit(n, p) {
  const t = document.elementFromPoint(p.x, p.y);
  if (!t || !(t === n || n.contains(t)))
    throw new Error(
      'not clickable: ' +
      desc(n) +
      ' is covered by ' +
      (t ? desc(t) : 'nothing') +
      ' at ' +
      Math.round(p.x) +
      ',' +
      Math.round(p.y) +
      ' rect=' +
      JSON.stringify(n.getBoundingClientRect()) +
      ' display=' +
      getComputedStyle(n).display +
      ' parent=' +
      (n.parentElement ? desc(n.parentElement) : '') +
      ' parentRect=' +
      JSON.stringify(
        n.parentElement && n.parentElement.getBoundingClientRect()
      )
    );
  return t;
}
const mouse = (t, type, p, extra) =>
  t.dispatchEvent(
    new MouseEvent(
      type,
      Object.assign(
        {
          bubbles: true,
          cancelable: true,
          clientX: p.x,
          clientY: p.y,
          button: 0,
          view: window
        },
        extra
      )
    )
  );
const pointer = (t, type, p) =>
  t.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: p.x,
      clientY: p.y,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      view: window
    })
  );

async function click(n) {
  const p = center(n);
  const t = hit(n, p);
  await moveTo(p);
  flash(n);
  pointer(t, 'pointerdown', p);
  mouse(t, 'mousedown', p);
  pointer(t, 'pointerup', p);
  mouse(t, 'mouseup', p);
  mouse(t, 'click', p);
  await wait(PAUSE);
}
async function dblclick(n) {
  await click(n);
  const p = center(n);
  mouse(hit(n, p), 'dblclick', p, { detail: 2 });
  await wait(PAUSE);
}
async function dragFrom(t, p, dx, dy) {
  await moveTo(p);
  pointer(t, 'pointerdown', p);
  mouse(t, 'mousedown', p);
  let q = p;
  for (let i = 1; i <= 5; i++) {
    q = { x: p.x + (dx * i) / 5, y: p.y + (dy * i) / 5 };
    await moveTo(q, 50);
    pointer(document, 'pointermove', q);
  }
  pointer(document, 'pointerup', q);
  mouse(document, 'mouseup', q);
  await wait(PAUSE);
}
async function drag(n, dx, dy) {
  const p = center(n);
  await dragFrom(hit(n, p), p, dx, dy);
}
async function type(n, v, ev) {
  const p = center(n);
  hit(n, p);
  await moveTo(p);
  flash(n);
  n.focus();
  n.value = v;
  n.dispatchEvent(new Event(ev || 'input', { bubbles: true }));
  await wait(PAUSE);
}
async function press(k, extra) {
  const a = document.activeElement;
  if (a && a.blur) a.blur();
  document.dispatchEvent(
    new KeyboardEvent(
      'keydown',
      Object.assign({ key: k, bubbles: true, cancelable: true }, extra)
    )
  );
  await wait(PAUSE);
}
async function openPanel(btn, id) {
  const pn = document.getElementById(id);
  if (!pn || !pn.classList.contains('open')) await click(btn);
  assert(
    document.getElementById(id).classList.contains('open'),
    'panel #' + id + ' did not open'
  );
}
function findBackground() {
  const r = el.stage.getBoundingClientRect();
  for (let y = r.top + 60; y < r.bottom - 60; y += 40)
    for (let x = r.left + 60; x < r.right - 60; x += 40) {
      const t = document.elementFromPoint(x, y);
      if (
        t === el.stage ||
        t === el.pageViewport ||
        t === el.page ||
        t === el.guideImg
      )
        return { x, y, t };
    }
  throw new Error('no empty canvas area found');
}
const confirmOk = () =>
  click(document.querySelector('#psConfirm .ps-confirm-ok'));
const fileOf = (name, type, parts) => {
  const dt = new DataTransfer();
  dt.items.add(new File(parts, name, { type }));
  return dt.files;
};
const stub = async (proto, name, fn) => {
  const orig = proto[name];
  let hits = 0;
  proto[name] = function () {
    hits++;
  };
  try {
    await fn();
  } finally {
    proto[name] = orig;
  }
  return hits;
};

/* ---------- steps ---------- */

const steps = [
  [
    'add text item (rail button)',
    async () => {
      const n = state.items.length;
      await click(el.railAddText);
      assert(state.items.length === n + 1, 'item not added');
      assert(last().type === 'text', 'wrong type');
      assert(state.selectedId === last().id, 'not selected');
      assert(nodeOf(last()), 'no DOM node');
      assert(el.itemToolbar.classList.contains('open'), 'toolbar closed');
    }
  ],
  [
    'geometry input moves item',
    async () => {
      await type(el.itemX, '25');
      assert(last().x === 25, 'x=' + last().x);
    }
  ],
  [
    'drag moves item',
    async () => {
      const it = last();
      const x0 = it.x;
      await drag(nodeOf(it), 40, 0);
      assert(it.x !== x0, 'x unchanged after drag');
    }
  ],
  [
    'resize handle changes size',
    async () => {
      const it = last();
      const h = nodeOf(it).querySelector('.resize-handle');
      assert(h, 'no resize handle');
      const w0 = it.w;
      await drag(h, -25, 0);
      assert(it.w !== w0, 'w unchanged after resize');
    }
  ],
  [
    'font size, alignment, name, fixed',
    async () => {
      const it = last();
      await type(el.fontSize, '20');
      assert(findItem(it.id).fontSize === 20, 'fontSize');
      await click(el.textAlignGroup.querySelector('[data-align="center"]'));
      assert(findItem(it.id).align === 'center', 'align');
      await click(el.vertAlignGroup.querySelector('[data-valign="middle"]'));
      assert(findItem(it.id).valign === 'middle', 'valign');
      await type(el.itemName, 'st_field');
      assert(findItem(it.id).name === 'st_field', 'name');
      await click(el.fixedToggle);
      assert(findItem(it.id).fixed === true, 'fixed on');
      await click(el.fixedToggle);
      assert(findItem(it.id).fixed === false, 'fixed off');
    }
  ],
  [
    'inline text edit (double-click)',
    async () => {
      const it = last();
      const node = nodeOf(it);
      await dblclick(node);
      assert(node.getAttribute('contenteditable') === 'true', 'not editable');
      node.textContent = 'Hello';
      node.dispatchEvent(new FocusEvent('blur'));
      assert(findItem(it.id).text === 'Hello', 'text not committed');
    }
  ],
  [
    'duplicate (Ctrl+D)',
    async () => {
      const n = state.items.length;
      await press('d', { ctrlKey: true });
      assert(state.items.length === n + 1, 'not duplicated');
    }
  ],
  [
    'arrow-key nudge',
    async () => {
      const it = last();
      const x0 = it.x;
      await press('ArrowRight');
      assert(findItem(it.id).x > x0, 'no nudge');
    }
  ],
  [
    'add line + style, thickness, color',
    async () => {
      await click(el.railAddLine);
      const it = last();
      assert(it.type === 'line', 'not a line');
      await type(el.lineStyle, 'solid', 'change');
      assert(findItem(it.id).line === 'solid', 'line style');
      await type(el.lineThickness, '3');
      assert(findItem(it.id).thickness === 3, 'thickness');
      await type(el.lineColor, '#ff0000');
      assert(findItem(it.id).color === '#ff0000', 'color');
    }
  ],
  [
    'background color set and clear',
    async () => {
      await click(el.railAddText);
      const it = last();
      await type(el.itemBg, '#ccddee');
      assert(findItem(it.id).bg === '#ccddee', 'bg set');
      await click(el.itemBgClear);
      assert(!findItem(it.id).bg, 'bg clear');
    }
  ],
  [
    'delete selected item',
    async () => {
      const n = state.items.length;
      await click(el.deleteItem);
      assert(state.items.length === n - 1, 'not deleted');
    }
  ],
  [
    'page panel: size and orientation',
    async () => {
      await openPanel(el.railPage, 'pagePanel');
      await type(el.pageSize, 'custom', 'change');
      await type(el.customWidth, '100');
      await type(el.customHeight, '150');
      assert(state.pageWmm === 100 && state.pageHmm === 150, 'custom size');
      await type(el.orientation, 'landscape', 'change');
      assert(state.orientation === 'landscape', 'orientation');
      const css = el.pageSizeStyle.textContent;
      assert(css.indexOf('150mm 100mm') >= 0, 'page css: ' + css);
    }
  ],
  [
    'guide panel: upload (picker stubbed), opacity, clear',
    async () => {
      await openPanel(el.railGuide, 'guidePanel');
      const bin = atob(PNG);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      el.guideUpload.files = fileOf('g.png', 'image/png', [bytes]);
      el.guideUpload.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(250);
      assert(state.guideSrc.indexOf('data:') === 0, 'guide not loaded');
      await type(el.guideOpacity, '30');
      assert(state.guideOpacity === 30, 'opacity');
      await click(el.clearGuide);
      assert(state.guideSrc === '', 'guide not cleared');
    }
  ],
  [
    'zoom buttons',
    async () => {
      await click(el.zoomInBtn);
      assert(state.zoomMode === 'manual', 'zoom in mode');
      await click(el.zoom100Btn);
      assert(state.zoomScale === 1, 'zoom 100%');
      await click(el.zoomFitBtn);
      assert(state.zoomMode === 'fit', 'zoom fit');
    }
  ],
  [
    'pan by dragging empty canvas',
    async () => {
      const b = findBackground();
      const x0 = state.panX;
      await dragFrom(b.t, { x: b.x, y: b.y }, 40, 0);
      assert(state.panX !== x0, 'panX unchanged');
      await click(el.zoomFitBtn);
    }
  ],
  [
    'wheel: Ctrl zoom and plain pan',
    async () => {
      const b = findBackground();
      await moveTo(b);
      const s0 = state.zoomScale;
      b.t.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -100,
          clientX: b.x,
          clientY: b.y
        })
      );
      assert(state.zoomScale !== s0, 'wheel zoom');
      const py = state.panY;
      b.t.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: 50,
          clientX: b.x,
          clientY: b.y
        })
      );
      assert(state.panY !== py, 'wheel pan');
      await wait(PAUSE);
      await click(el.zoomFitBtn);
    }
  ],
  [
    'fill mode edits text',
    async () => {
      await click(el.railAddText);
      const it = last();
      await click(el.fillToggleBtn);
      assert(state.mode === 'fill', 'not in fill mode');
      const inputs = el.fillFormList.querySelectorAll('input');
      assert(inputs.length > 0, 'no fill inputs');
      await type(inputs[inputs.length - 1], 'FILLED');
      assert(findItem(it.id).text === 'FILLED', 'fill text');
      await click(el.fillToggleBtn);
      assert(state.mode === 'design', 'not back in design mode');
    }
  ],
  [
    'minimal mode (M key)',
    async () => {
      await press('m');
      assert(
        document.body.classList.contains('designer-minimal'),
        'minimal on'
      );
      await press('m');
      assert(
        !document.body.classList.contains('designer-minimal'),
        'minimal off'
      );
    }
  ],
  [
    'save layout',
    async () => {
      await type(el.layoutName, TEST_NAME);
      await click(el.saveLayout);
      assert(getAllLayouts()[TEST_NAME], 'not saved');
    }
  ],
  [
    'load layout from combo list',
    async () => {
      const saved = state.items.length;
      state.items = [];
      core.render();
      await click(el.layoutComboBtn);
      const btn = Array.from(
        el.layoutComboList.querySelectorAll('button')
      ).find((b) => b.textContent === TEST_NAME);
      assert(btn, 'layout not in combo list');
      await click(btn);
      assert(state.items.length === saved, 'items not restored');
    }
  ],
  [
    'export layout (download stubbed)',
    async () => {
      const hits = await stub(HTMLAnchorElement.prototype, 'click', () =>
        click(el.exportLayout)
      );
      assert(hits === 1, 'download not triggered (' + hits + ')');
    }
  ],
  [
    'import layout: button, valid file, invalid file',
    async () => {
      const hits = await stub(HTMLInputElement.prototype, 'click', () =>
        click(el.importLayoutBtn)
      );
      assert(hits === 1, 'import button did not open the file picker');
      const good = JSON.stringify({
        pageWmm: 120,
        pageHmm: 80,
        orientation: 'landscape',
        items: []
      });
      el.importLayoutFile.files = fileOf('g.json', 'application/json', [good]);
      el.importLayoutFile.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(250);
      assert(state.pageWmm === 120, 'valid import not applied');
      el.importLayoutFile.files = fileOf('b.json', 'application/json', [
        '{nope'
      ]);
      el.importLayoutFile.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(250);
      const toast = document.getElementById('psToast');
      assert(
        toast && /Invalid JSON/.test(toast.textContent),
        'no error toast for invalid JSON'
      );
      const bad = core.importLayoutDef({
        items: [],
        pageWmm: 99999,
        pageHmm: 10
      });
      assert(!bad.ok, 'out-of-range import accepted');
    }
  ],
  [
    'delete layout (confirm dialog)',
    async () => {
      /* #layoutSelect is a hidden model behind the combo; set it directly. */
      el.layoutSelect.value = TEST_NAME;
      el.layoutSelect.dispatchEvent(new Event('change', { bubbles: true }));
      await click(el.deleteLayout);
      await confirmOk();
      assert(!getAllLayouts()[TEST_NAME], 'layout still stored');
    }
  ],
  [
    'clear all items (confirm dialog)',
    async () => {
      await click(el.railAddText);
      assert(state.items.length > 0, 'nothing to clear');
      await click(el.railClearAll);
      await confirmOk();
      assert(state.items.length === 0, 'items remain');
    }
  ],
  [
    'print button (window.print stubbed)',
    async () => {
      const hits = await stub(window, 'print', () => click(el.printBtn));
      assert(hits === 1, 'print called ' + hits + ' times');
    }
  ]
];

/* ---------- report + panel ---------- */

function buildReport(results, logs) {
  const fails = results.filter((r) => !r.ok);
  const L = [
    'PaperStamp self-test report',
    'time: ' + new Date().toISOString(),
    'url: ' + location.href,
    'ua: ' + navigator.userAgent,
    'result: ' +
    (results.length - fails.length) +
    '/' +
    results.length +
    ' passed'
  ];
  if (fails.length) {
    L.push('', 'FAILED STEPS:');
    for (const f of fails) {
      L.push('- ' + f.name + ': ' + f.error);
      L.push('  state: ' + f.snap);
    }
  }
  if (logs.length) {
    L.push('', 'LOG:');
    for (const l of logs) L.push('- ' + l);
  }
  L.push('', 'ALL STEPS:');
  for (const r of results) L.push((r.ok ? 'PASS ' : 'FAIL ') + r.name);
  return L.join('\n');
}
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch (e) {
    /* clipboard blocked in sandboxed iframe: fall back */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}
const snapState = () =>
  'items=' +
  state.items.length +
  ' sel=' +
  state.selectedId +
  ' mode=' +
  state.mode +
  ' zoom=' +
  state.zoomMode +
  '/' +
  state.zoomScale +
  ' page=' +
  state.pageWmm +
  'x' +
  state.pageHmm;

function panel(results, done, report) {
  let p = document.getElementById('psSelfTest');
  if (!p) {
    p = document.createElement('div');
    p.id = 'psSelfTest';
    p.setAttribute('data-paperstamp-designer', '1');
    p.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:10000;width:340px;max-height:50vh;overflow:auto;background:#fff;color:#111;border:1px solid #ccc;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.25);font:12px/1.5 system-ui,sans-serif;padding:10px';
    document.body.appendChild(p);
  }
  p.style.pointerEvents = done ? 'auto' : 'none';
  const fails = results.filter((r) => !r.ok).length;
  p.innerHTML = '';
  const h = document.createElement('div');
  h.style.cssText =
    'font-weight:600;margin-bottom:6px;display:flex;gap:6px;align-items:center';
  const title = document.createElement('span');
  title.style.flex = '1';
  title.textContent = done
    ? 'Self-test: ' +
    (results.length - fails) +
    '/' +
    results.length +
    ' passed'
    : 'Self-test running ' + results.length + '/' + steps.length;
  h.appendChild(title);
  if (done) {
    const c = document.createElement('button');
    c.type = 'button';
    c.textContent = 'Copy report';
    c.onclick = async () => {
      const ok = await copyText(report);
      c.textContent = ok ? 'Copied' : 'Copy failed: select below';
      if (!ok && !p.querySelector('textarea')) {
        const ta = document.createElement('textarea');
        ta.value = report;
        ta.readOnly = true;
        ta.style.cssText = 'width:100%;height:120px;margin-top:6px';
        p.appendChild(ta);
        ta.select();
      }
    };
    h.appendChild(c);
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = 'x';
    x.onclick = () => p.remove();
    h.appendChild(x);
  }
  p.appendChild(h);
  for (const r of results) {
    const row = document.createElement('div');
    row.style.color = r.ok ? '#0a7d2c' : '#c62828';
    row.textContent =
      (r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ': ' + r.error);
    p.appendChild(row);
  }
}

/* ---------- runner ---------- */

let running = false;

export async function runSelfTest() {
  if (running) return null;
  running = true;
  const logs = [];
  const origErr = console.error;
  const origWarn = console.warn;
  console.error = (...a) => {
    logs.push('console.error: ' + a.map(String).join(' '));
    origErr.apply(console, a);
  };
  console.warn = (...a) => {
    logs.push('console.warn: ' + a.map(String).join(' '));
    origWarn.apply(console, a);
  };
  const onErr = (e) =>
    logs.push('uncaught: ' + e.message + ' @' + e.filename + ':' + e.lineno);
  const onRej = (e) => logs.push('unhandled rejection: ' + String(e.reason));
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onRej);

  const rawStore = localStorage.getItem(STORE_KEY);
  const snap = Object.assign(
    core.exportLayoutDef(el.layoutName.value || null),
    {
      guideSrc: state.guideSrc,
      guideOpacity: state.guideOpacity
    }
  );
  const name0 = el.layoutName.value;
  const results = [];
  try {
    assert(el.railAddText, 'designer chrome not mounted');
    document.body.classList.remove('designer-minimal');
    D().setMode('design');
    state.items = [];
    state.selectedId = null;
    core.render();
    core.setZoomMode('fit');
    ensureCursor();
    panel(results, false);
    await wait(300);
    for (const [name, fn] of steps) {
      try {
        await fn();
        results.push({ name, ok: true });
      } catch (e) {
        results.push({
          name,
          ok: false,
          error: String((e && e.message) || e),
          snap: snapState()
        });
      }
      panel(results, false);
      await wait(PAUSE);
    }
  } catch (e) {
    results.push({
      name: 'setup',
      ok: false,
      error: String((e && e.message) || e),
      snap: snapState()
    });
  } finally {
    try {
      if (rawStore == null) localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, rawStore);
    } catch (e) {
      /* storage unavailable */
    }
    document.body.classList.remove('designer-minimal');
    core.applyLayoutToState(snap, null, name0);
    el.layoutName.value = name0;
    D().populateLayoutSelect();
    D().syncGuideDom();
    D().syncPageSetupInputs();
    D().setMode('design');
    const c = document.getElementById('psTestCursor');
    if (c) c.remove();
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onRej);
    console.error = origErr;
    console.warn = origWarn;
    running = false;
  }
  const report = buildReport(results, logs);

  panel(results, true, report);
  const summary = {
    total: results.length,
    failed: results.filter((r) => !r.ok).length,
    results,
    report
  };
  if (summary.failed) origErr('[paperstamp] self-test failed\n' + report);
  core.emit('designer:selftest', summary);
  core.post('paperstamp:selftest', summary);
  return summary;
}
