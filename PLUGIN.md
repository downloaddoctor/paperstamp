# paperstamp — Plugin / Embedding Contract

`paperstamp` is a static client-side page. Embed it as an `<iframe>` in any host that needs to render a layout with data and trigger printing. No build step, no server — point an iframe at `sdk.html` and talk via `postMessage` (or the optional `sdk.js` wrapper). `sdk.html` is the embed/print runtime and ships chrome-free; call `openDesigner()` to mount the editing UI on demand. `index.html` is itself a host page — it embeds `sdk.html` full-bleed via `sdk.js` and calls `lp.openDesigner()` on ready, so opening it gives you the designer in one step.

---

## 1. Concepts

- **layoutDef** — self-contained layout object: page size, orientation, items. What a host sends.
- **layoutId** — name of a layout saved in the plugin's `localStorage` (`paperstampLayouts`). Usable only when host and iframe share an origin, or after the host pre-registers it.
- **fieldValues** — `{ [item.name]: value }`. Applied to items whose `name` matches; `item.text` becomes `String(value)`. Unmatched items keep their design-time text.

---

## 2. Schemas

```ts
type Item = {
  id: number; // unique within layout
  type: 'text'; // only 'text' supported today
  x: number; // 0-100, % of page width, from left
  y: number; // 0-100, % of page height, from top
  w: number; // 0-100, % of page width
  h: number; // 0-100, % of page height
  text: string; // initial / default text
  name: string; // field key used to bind fieldValues
  fontSize: number; // pt
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
};

type LayoutDef = {
  name?: string; // if present, upserted into plugin localStorage
  pageWmm: number; // e.g. 210 (A4 width)
  pageHmm: number; // e.g. 297 (A4 height)
  orientation: 'portrait' | 'landscape';
  items: Item[];
};
```

- `pageWmm`/`pageHmm` describe the **portrait** physical size; `orientation` swaps them at render via `applyPageSize()`.
- Item positions are stored as percentages — resolution- and unit-independent.

---

## 2.1 Security

The plugin does **not** enforce origin. Any host may embed and drive it: inbound messages are accepted when `e.source` is `window.parent` (or `window`); `e.origin` is not checked. Outbound `postMessage` uses `'*'`.

Do not pass `origin:` to `PaperStamp.embed()` — it is ignored. No `?hostOrigin=` query param is used.

Anyone who can frame the plugin can drive it. Load it only on pages you control, or sandbox the iframe if that matters.

**Storage cap:** `paperstampLayouts` is capped at 100 entries; older keys are evicted on overflow. `print`/`printStateless` only persist a layout when called with `options.persist === true` (or when `layoutDef.name` is set and the caller opts in). Explicit `register` always persists.

## 3. Embedding the iframe

```html
<iframe
  id="pf"
  src="https://your-host/paperstamp/sdk.html"
  style="width:0;height:0;border:0;position:absolute"
  aria-hidden="true"
></iframe>
```

| Attribute | Value                       | Why                                                                                                         |
| --------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src`     | `.../sdk.html`              | Embed/print runtime entry point.                                                                            |
| `style`   | `width:0;height:0;border:0` | Keep it invisible.                                                                                          |
| `allow`   | `clipboard-write` (opt.)    | Only if future features need it.                                                                            |
| `sandbox` | _(omit)_                    | Plugin needs `window.print()`. If you must sandbox, include `allow-modals allow-same-origin allow-scripts`. |

Do **not** add `?layoutId=...` to `src` unless you want auto-print on load.

---

## 4. Message protocol

Plain objects via `postMessage`. Host -> iframe uses `contentWindow`; iframe -> host replies go to `window.parent`.

### 4.1 Host -> plugin

| `type`                      | Payload                                                        | Behaviour                                                                                                                      |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `paperstamp:ping`           | `{}`                                                           | Ask plugin to (re)emit `paperstamp:ready`.                                                                                     |
| `paperstamp:preview`        | `{ layoutDef, fieldValues? }`                                  | Render a layoutDef into the plugin without printing. Live preview.                                                             |
| `paperstamp:previewById`    | `{ layoutId, fieldValues? }`                                   | Same as `preview` but resolves `layoutId` from plugin storage. Replies with nothing on success, `paperstamp:error` on failure. |
| `paperstamp:print`          | `{ layoutDef, fieldValues?, options?: { persist?: boolean } }` | Stateless print. Preferred for cross-origin hosts.                                                                             |
| `paperstamp:printById`      | `{ layoutId, fieldValues? }`                                   | Print a previously-registered layout from plugin storage.                                                                      |
| `paperstamp:register`       | `{ layoutDef }`                                                | Upsert a named layout without printing. Requires `layoutDef.name`. Emits `paperstamp:ready` on success.                        |
| `paperstamp:import`         | `{ layoutDef }`                                                | Replace the plugin's current state with `layoutDef`. Does not persist to storage.                                              |
| `paperstamp:export`         | `{}`                                                           | Request the plugin's current in-memory layout as JSON. Replies with `paperstamp:exportResult`.                                 |
| `paperstamp:listLayoutDefs` | `{}`                                                           | Request every saved layoutDef. Replies with `paperstamp:layoutDefs`.                                                           |
| `paperstamp:openDesigner`   | `{}`                                                           | Lazy-load `designer.html` + `designer.js` + `designer.css` into the embedded plugin. Idempotent.                               |
| `paperstamp:closeDesigner`  | `{}`                                                           | Tear down designer chrome, return to preview-only mode.                                                                        |

### 4.2 Plugin -> host

| `type`                    | Payload                                                                 | When                                                                             |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `paperstamp:ready`        | `{ version, layouts: string[], layoutDefs: Record<string, LayoutDef> }` | On load, after `register`, and in reply to `ping` — hosts must tolerate repeats. |
| `paperstamp:done`         | `{ layoutId?, layoutName? }`                                            | After `afterprint` following a plugin-initiated print.                           |
| `paperstamp:exportResult` | `{ layoutDef }`                                                         | Reply to `paperstamp:export`.                                                    |
| `paperstamp:layoutDefs`   | `{ layouts: Record<string, LayoutDef> }`                                | Reply to `paperstamp:listLayoutDefs`.                                            |
| `paperstamp:error`        | `{ code, message }`                                                     | Bad payload / missing layout / invalid layoutDef.                                |

Error codes

- `E_BAD_MESSAGE` — not an object, or `type` missing/unknown, or a message missing required fields.
- `E_NO_LAYOUT` — `printById` for a `layoutId` not present in plugin storage.
- `E_BAD_LAYOUT_DEF` — a `layoutDef` whose `items` is not an array, or which fails sanitization.
- `E_PRINT_BLOCKED` — `window.print()` threw (e.g. iframe sandbox without `allow-modals`).
- `E_UNKNOWN_MESSAGE` — (SDK-side) plugin sent a `type` the SDK does not recognize.

### 4.3 Origin / security

- Origin is **not** enforced. The plugin accepts messages when `e.source` is `window.parent` (or `window`), regardless of `e.origin`. Plugin replies go to `window.parent` with `'*'`.
- Only frame the plugin on pages you control. Any framer can drive it.
- `item.text` is rendered via `textContent` — HTML in field values is not interpreted. Do not change this without sanitising.

---

## 4.4 Designer (lazy-loaded)

The plugin ships in two layers:

- **`core.js` + `style.css`** — always loaded. Renders a `layoutDef`, applies `fieldValues`, prints, and speaks the host protocol. No editing chrome; chrome lives only in `designer.css`/`designer.html`.
- **`designer.html` + `designer.js` + `designer.css`** — loaded on demand. `designer.html` holds the markup as a `<template id="ps-designer-root">`; `designer.js` fetches it, imports the template content into the page, then wires events. Adds the full editing UI (page setup, guide image, item toolbar, zoom, fill mode, layout save/load, keyboard shortcuts).

The designer can be pulled in three ways:

1. URL param: `sdk.html?design=1`. Opening `index.html` is equivalent — it embeds `sdk.html` and calls `openDesigner()` on ready.
2. Host message: `postMessage({ type: 'paperstamp:openDesigner' })`.
3. SDK method: `lp.openDesigner()`.

There is no `?embed=1` and no `body.embed-mode` — `sdk.html` is always the embed runtime, and it ships chrome-free until the designer is loaded. Loading the designer adds `body.designer-mode`; chrome comes from `designer.html` + `designer.css` (which are only fetched at that point). Closing via `paperstamp:closeDesigner` / `lp.closeDesigner()` removes the injected DOM and drops `designer-mode`.

`lp.isDesignerLoaded()` returns a boolean (also exposed as `PaperStampCore.isDesignerLoaded()` inside the plugin).

## 5. Host SDK

`sdk.js` creates the hidden iframe, waits for `paperstamp:ready`, and exposes an imperative API. Load before your own script:

```html
<script src="sdk.js"></script>
```

No `src` needed: the SDK derives `sdk.html` from its own `<script src>`.

### 5.1 `PaperStamp.embed(opts) -> instance`

| Option             | Type           | Notes                                                                    |
| ------------------ | -------------- | ------------------------------------------------------------------------ |
| `src`              | string         | Plugin URL. Optional — derived from SDK's own script URL when omitted.   |
| `container`        | HTMLElement    | Where to append the hidden iframe. Default `document.body`.              |
| `origin`           | string         | Ignored — origin is not enforced; outbound postMessage always uses `'*'`. |
| `width` / `height` | number\|string | Iframe size. Default `0`.                                                |
| `onReady(info)`    | fn             | `info = { version, layouts }`. Fires once per load (and after `ping`).   |
| `onDone(job)`      | fn             | Fires when the plugin's print dialog closes.                             |
| `onError(err)`     | fn             | `err = { code, message, job }`.                                          |

The plugin ships chrome-free; the designer is only loaded on explicit request via `lp.openDesigner()`. No URL param needed.

### 5.2 Instance methods

| Method                                                              | Purpose                                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `lp.isReady()`                                                      | `true` once the plugin has emitted `paperstamp:ready`.                                              |
| `lp.layouts()`                                                      | Latest saved layout ids from the plugin (`string[]`).                                               |
| `lp.layoutDefs()`                                                   | Latest map of `{ name: layoutDef }` captured from the last `ready` or `listLayoutDefs`.             |
| `lp.listLayoutDefs(cb?)`                                            | Request every saved layoutDef. `cb(layouts)` on reply; also emits `'layoutDefs'`.                   |
| `lp.preview({ layoutDef, fieldValues? })`                           | Render a layoutDef into the plugin without printing (live preview).                                 |
| `lp.previewById(layoutId, fieldValues?)`                            | Render a saved layout into the plugin without printing. Missing ids emit `E_NO_LAYOUT`.             |
| `lp.print({ layoutDef, fieldValues?, options? })`                   | Stateless print. Preferred for cross-origin hosts.                                                  |
| `lp.printById(layoutId, fieldValues?, options?)`                    | Print a previously-saved/registered layout.                                                         |
| `lp.register(layoutDef)`                                            | Upsert a named layout without printing (`layoutDef.name` required).                                 |
| `lp.import(layoutDef, options?)`                                    | Replace the plugin's current in-memory state with `layoutDef`. Does not persist to storage.         |
| `lp.export(cb?)`                                                    | Request the plugin's current layout as JSON. `cb(layoutDef)` on reply; also emits `'exportResult'`. |
| `lp.ping()`                                                         | Ask plugin to re-emit `paperstamp:ready`.                                                           |
| `lp.openDesigner()`                                                 | Lazy-load the designer into the embedded plugin (idempotent).                                       |
| `lp.closeDesigner()`                                                | Remove designer chrome and revert to preview-only.                                                  |
| `lp.on('ready'\|'done'\|'error'\|'exportResult'\|'layoutDefs', fn)` | Add a listener.                                                                                     |
| `lp.destroy()`                                                      | Detach listeners, remove the iframe.                                                                |

Calls before `ready` are queued and flushed automatically.

### 5.3 Example

```html
<script src="sdk.js"></script>
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
          align: 'left'
        }
      ]
    },
    fieldValues: { name: 'Jane Doe' }
  });
</script>
```

See `example.html` for a runnable demo. Hosts may talk raw `postMessage` per §4 instead.

---

## 6. URL-param convenience

For one-shot integrations (email links, server pages):

```
sdk.html?layoutId=<id>&data=<urlencoded JSON>
```

`layoutId` must already exist in plugin storage (same origin). `printStateless` is **not** reachable via URL params.

---

## 7. Print behaviour & caveats

- The plugin calls `window.print()` — modern browsers open the native print dialog; there is **no client-side way to skip it**.
- True silent printing needs one of: Chrome/Edge with `--kiosk-printing`, or an Electron/CEF/WebView host exposing a native print API.
- The plugin injects a dynamic `@page { size: <W>mm <H>mm; margin: 0 }` rule so paper size matches the layout.
- `@media print` in `style.css` hides designer chrome and the guide image; only `#page` prints.
- The plugin never calls `window.close()`. The host owns the iframe lifecycle: recreate or remove the iframe on `paperstamp:done`. If you need a persistent embed, simply leave it in place.

---

## 8. Storage & isolation

- Saved layouts live in `localStorage['paperstampLayouts']` scoped to the **plugin's origin**.
- Cross-origin hosts cannot read or write plugin storage — use `layoutDef` in messages for all data.
- `printStateless` with `layoutDef.name` upserts into plugin storage as a side effect — pass `name` only if you want caching.

---

## 9. Versioning

- `paperstamp:ready` includes `version` (currently `'1'`). Pin against a major version; ignore unknown message `type`s.
- The `Item` and `LayoutDef` schemas above are the compatibility surface. Additive fields are safe; renames are breaking.
