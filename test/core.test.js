import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

/* Run dist/sdk.js with a stub DOM, embed(), and take the runtime from the iframe srcdoc. */
const iframe = { style: {}, setAttribute() { } };
const host = {
  document: {
    createElement: () => iframe,
    body: { appendChild() { } }
  },
  addEventListener() { }
};
host.window = host;
vm.runInNewContext(
  readFileSync(new URL('../dist/sdk.js', import.meta.url), 'utf8'),
  host
);
let doc = '';
host.Blob = class {
  constructor(parts) {
    doc = parts[0];
  }
};
host.URL = { createObjectURL: () => 'blob:test' };
host.PaperStamp.embed();
await null;
const code = doc.slice(doc.indexOf('<script>') + 8, doc.lastIndexOf('</script>'));

function fakeEl() {
  return {
    style: { setProperty() { } },
    classList: { add() { }, remove() { }, contains: () => false },
    dataset: {},
    textContent: '',
    clientWidth: 800,
    clientHeight: 600,
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() { },
    replaceChildren() { },
    insertBefore() { },
    removeChild() { },
    remove() { },
    firstChild: null,
    children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener() { },
    setAttribute() { }
  };
}

function load() {
  const store = new Map();
  const sb = {
    console,
    URLSearchParams,
    JSON,
    Math,
    Date,
    location: { search: '' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    document: {
      getElementById: () => fakeEl(),
      createElement: fakeEl,
      createDocumentFragment: fakeEl,
      querySelector: () => null,
      querySelectorAll: () => [],
      body: fakeEl(),
      head: fakeEl(),
      documentElement: fakeEl()
    },
    requestAnimationFrame() { },
    addEventListener() { }
  };
  sb.window = sb;
  sb.parent = sb;
  vm.runInNewContext(code, sb);
  return sb.PaperStamp;
}

const base = { pageWmm: 210, pageHmm: 297, orientation: 'portrait' };

test('runtime exposes the public API', () => {
  const ps = load();
  assert.equal(ps.version, '1');
  for (const k of [
    'printLayout',
    'printStateless',
    'exportLayoutDef',
    'importLayoutDef',
    'loadDesigner',
    'openDesigner'
  ])
    assert.equal(typeof ps[k], 'function', k);
});

test('sanitizeLayoutDef rejects out-of-range pages', () => {
  const ps = load();
  assert.equal(
    ps.sanitizeLayoutDef({ ...base, pageWmm: 0, items: [] }).ok,
    false
  );
  assert.equal(
    ps.sanitizeLayoutDef({ ...base, pageHmm: 6000, items: [] }).ok,
    false
  );
  assert.equal(ps.sanitizeLayoutDef({ ...base, items: [] }).ok, true);
});

test('sanitizeLayoutDef clamps items and dedupes ids', () => {
  const ps = load();
  const r = ps.sanitizeLayoutDef({
    ...base,
    items: [
      { id: 1, x: 95, y: 0, w: 20, h: 5, text: 'a' },
      { id: 1, x: -5, y: 0, w: 10, h: 5, align: 'bogus' }
    ]
  });
  assert.equal(r.ok, true);
  const [a, b] = r.def.items;
  assert.ok(a.x + a.w <= 100);
  assert.equal(b.x, 0);
  assert.equal(b.align, 'left');
  assert.notEqual(a.id, b.id);
});

test('registerLayoutDef caps storage at MAX_LAYOUTS (LRU)', () => {
  const ps = load();
  for (let i = 0; i < ps.MAX_LAYOUTS + 5; i++)
    ps.registerLayoutDef({ ...base, name: 'l' + i, items: [] });
  assert.equal(ps.listLayouts().length, ps.MAX_LAYOUTS);
  assert.ok(ps.listLayouts().includes('l' + (ps.MAX_LAYOUTS + 4)));
});
