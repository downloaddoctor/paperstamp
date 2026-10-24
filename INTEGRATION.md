# Integrating paperstamp into another project

paperstamp is published on **GitHub Pages**, so you can use it from any project
**directly from the live URL** — no clone, no npm install, no bundler.

---

## TL;DR — the live links

| What                            | URL                                                             |
| ------------------------------- | --------------------------------------------------------------- |
| Single-file script (`<script>`) | `https://downloaddoctor.github.io/paperstamp/sdk.js` |
| Standalone designer             | `https://downloaddoctor.github.io/paperstamp/`                  |
| Runnable SDK demo               | `https://downloaddoctor.github.io/paperstamp/example.html`      |

Load one script and `PaperStamp.embed()` builds an isolated blob-URL iframe from it:

```html
<script src="https://downloaddoctor.github.io/paperstamp/sdk.js"></script>
```

No second request and no `src` option are needed.
Layouts are stored in the host page's own `localStorage`, since the blob iframe inherits the host origin.

---

## Option A — use the hosted copy (recommended)

Point a `<script>` at the Pages-hosted `sdk.js` and call `PaperStamp.embed()`.

```html
<script src="https://downloaddoctor.github.io/paperstamp/sdk.js"></script>
<script>
  const lp = PaperStamp.embed({
    onReady: ({ layouts }) => console.log('ready', layouts),
    onDone: (job) => console.log('printed', job),
    onError: (err) => console.error(err.code, err.message)
  });

  lp.print({
    layoutDef: {
      pageWmm: 210,
      pageHmm: 297,
      orientation: 'portrait',
      items: [
        {
          id: 1,
          type: 'text',
          x: 10,
          y: 10,
          w: 60,
          h: 8,
          text: 'Name',
          name: 'name',
          fontSize: 14,
          align: 'left',
          valign: 'top'
        }
      ]
    },
    fieldValues: { name: 'Jane Doe' }
  });
</script>
```

**Origin note:** paperstamp does **not** validate `postMessage` origins — any
host can embed and drive it. No `origin:` option and no `?hostOrigin=` handshake
are needed (passing `origin:` is ignored).

Layouts are stored in the **plugin's origin** `localStorage`. When you embed the
hosted copy that storage belongs to `downloaddoctor.github.io`, not your site —
so you **cannot** read/write it directly. Send everything in the message
(`layoutDef` / `fieldValues`), or use `listLayoutDefs()` / `previewById()` /
`printById()` to work against the plugin's own storage.

---

## Option B — self-host (vendored)

Build (`pnpm build`) and copy one file from `dist/` into your project:

```
sdk.js
```

Then:

```html
<script src="/vendor/paperstamp/sdk.js"></script>
```

The blob iframe shares your origin, so you can read/write `paperstampLayouts` directly.

The designer is already inlined; open it via
`lp.openDesigner()`, `lp.openDesigner({ layoutId })` or
`lp.setDesignerLayout(layoutId)`.

---

## Common flows

```js
// Live preview while the user types
lp.preview({ layoutDef, fieldValues: { name: 'Jane' } });

// Stateless print (preferred; nothing persisted)
lp.print({ layoutDef, fieldValues: { name: 'Jane' } });

// Save a named layout into the plugin, then print it later by id
lp.register(layoutDef); // layoutDef.name required
lp.printById('shipping-label', { name: 'Jane' });

// Open / close the editor UI inside the embedded iframe
lp.openDesigner(); // or lp.openDesigner({ minimal: true }) for pan-only view mode
lp.closeDesigner();

// Open the editor on a specific saved layout (select + name + canvas)
lp.openDesigner({ layoutId: 'shipping-label' });
lp.setDesignerLayout('shipping-label'); // same effect, explicit method
lp.setDesignerLayout('shipping-label', { minimal: true }); // opens straight into minimal (pan-only) mode

// Round-trip the current in-plugin layout
lp.export((def) => console.log(def));
lp.import(layoutDef);
```

---

## Gotchas

- **Print dialog always appears.** `window.print()` is used; true silent printing
  needs Chrome `--kiosk-printing` or an Electron/CEF host.
- **Safari** `@page` mm sizing is approximate — prefer Chrome/Edge/Firefox for
  exact positioning.
- **`sandbox` iframes** need `allow-modals allow-same-origin allow-scripts` or
  printing is blocked (`E_PRINT_BLOCKED`).
- Item text is rendered with `textContent` — HTML in field values is never
  interpreted.

Full protocol: [PLUGIN.md](PLUGIN.md).
Machine-readable summary: [llms.txt](llms.txt).
