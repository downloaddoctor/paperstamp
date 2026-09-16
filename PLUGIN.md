# paperstamp — Plugin / Embedding Contract

`paperstamp` is a static client-side page. Embed it as an `<iframe>` in any host that needs to render a layout with data and trigger printing. No build step, no server — point an iframe at `sdk.html` and talk via `postMessage` (or the optional `sdk.js` wrapper). `index.html` is the standalone designer entry; `sdk.html` is the embed/print runtime.

---

## 1. Concepts

- **layoutDef** — self-contained layout object: page size, orientation, items. What a host sends.
- **layoutId** — name of a layout saved in the plugin's `localStorage` (`paperstampLayouts`). Usable only when host and iframe share an origin, or after the host pre-registers it.
- **fieldValues** — `{ [item.name]: value }`. Applied to items whose `name` matches; `item.text` becomes `String(value)`. Unmatched items keep their design-time text.
- **silent** — default `true`; hides all designer chrome (`body.silent-mode`) before printing. Does **not** bypass the browser print dialog.

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

The plugin validates incoming messages: `e.source` must be `window.parent` (or `window`), and `e.origin` must match the trusted origin. Trusted origin is resolved, in order:

1. `?hostOrigin=<origin>` query param on the plugin URL.
2. `document.referrer` origin (when the iframe is loaded from a host page).
3. `'*'` fallback — **do not rely on this in production.**

Recommended host setup:

```js
PaperStamp.embed({ origin: 'https://host.example.com', ... });
```

The SDK appends `?hostOrigin=<origin>` to the plugin URL automatically and validates `e.origin` against the same value in the reverse direction. Outbound `postMessage` uses the resolved trusted origin, never `'*'`, once an origin is known.

**Storage cap:** `paperstampLayouts` is capped at 100 entries; older keys are evicted on overflow. `print`/`printStateless` only persist a layout when called with `options.persist === true` (or when `layoutDef.name` is set and the caller opts in). Explicit `register` always persists.

## 3. Embedding the iframe

```html
<iframe
  id="pf"
  src="https://your-host/paperstamp/sdk.html?hostOrigin=https%3A%2F%2Fhost.example.com"
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

Do **not** add `?silent=1` or `?layoutId=...` to `src` unless you want auto-print on load.

---

## 4. Message protocol

Plain objects via `postMessage`. Host -> iframe uses `contentWindow`; iframe -> host replies go to `window.parent`.

### 4.1 Host -> plugin

| `type`                     | Payload                                                       | Behaviour                                                                                      |
| -------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --- | ------------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| `paperstamp:preview`       | `{ layoutDef, fieldValues? }`                                 | Render a layoutDef into the plugin without printing. Live preview.                             |
| `paperstamp:print`         | `{ layoutDef, fieldValues?, options?: { silent?: boolean } }` | Stateless print. Preferred.                                                                    |
| `paperstamp:printById`     | `{ layoutId, fieldValues?, options?: { silent?: boolean } }`  | Print a previously-registered layout from plugin storage.                                      |
| `paperstamp:register`      | `{ layoutDef }`                                               | Upsert a layout without printing. Requires `layoutDef.name`.                                   |
| `paperstamp:ping`          | `{}`                                                          | Ask plugin to (re)emit `paperstamp:ready`.                                                     |     | `paperstamp:openDesigner` | `{}` | Lazy-load `designer.html` + `designer.js` + `designer.css` into the embedded plugin. Idempotent. |
| `paperstamp:closeDesigner` | `{}`                                                          | Tear down designer chrome, return to preview-only mode.                                        |
| `paperstamp:export`        | `{}`                                                          | Request the plugin's current in-memory layout as JSON. Replies with `paperstamp:exportResult`. |
| `paperstamp:import`        | `{ layoutDef, options?: { silent?: boolean } }`               | Replace the plugin's current state with `layoutDef`. Does not persist to storage.              |

### 4.2 Plugin -> host

| `type`             | Payload                          | When                                                                             |
| ------------------ | -------------------------------- | -------------------------------------------------------------------------------- |
| `paperstamp:ready` | `{ version, layouts: string[] }` | On load, after `register`, and in reply to `ping` — hosts must tolerate repeats. |
| `paperstamp:done`  | `{ layoutId?, layoutName? }`     | After `afterprint` following a plugin-initiated print.                           |
| `paperstamp:error` | `{ code, message }`              | Bad payload / missing layout / invalid layoutDef.                                |

Error codes

- `E_BAD_MESSAGE` — not an object, or `type` missing/unknown, or a message missing required fields.
- `E_NO_LAYOUT` — `printById` for a `layoutId` not present in plugin storage.
- `E_BAD_LAYOUT_DEF` — a `layoutDef` whose `items` is not an array, or which fails sanitization.
- `E_BAD_ORIGIN` — message rejected because `e.origin` did not match the trusted host origin.
- `E_PRINT_BLOCKED` — `window.print()` threw (e.g. iframe sandbox without `allow-modals`).
- `E_UNKNOWN_MESSAGE` — (SDK-side) plugin sent a `type` the SDK does not recognize.

### 4.3 Origin / security

- The plugin validates inbound messages: `e.source` must be `window.parent` (or `window`), and `e.origin` must match the trusted origin (`?hostOrigin=` > `document.referrer` origin > `'*'`). Mismatches are rejected with `E_BAD_ORIGIN`.
- Plugin replies go to `window.parent` using the resolved trusted origin, never `'*'` once an origin is known.
- `item.text` is rendered via `textContent` — HTML in field values is not interpreted. Do not change this without sanitising.

---

## 4.4 Designer (lazy-loaded)

The plugin ships in two layers:

- **`core.js` + `style.css`** — always loaded. Renders a `layoutDef`, applies `fieldValues`, prints, and speaks the host protocol. No editing chrome.
- **`designer.html` + `designer.js` + `designer.css`** — loaded on demand. `designer.html` holds the markup as a `<template id="ps-designer-root">`; `designer.js` fetches it, imports the template content into the page, then wires events. Adds the full editing UI (page setup, guide image, item toolbar, zoom, fill mode, layout save/load, keyboard shortcuts).

The designer can be pulled in three ways:

1. URL param: `sdk.html?design=1` (works alongside `?embed=1`; embed hiding is overridden once the designer mounts). The standalone designer at `index.html` loads the designer unconditionally.
2. Host message: `postMessage({ type: 'paperstamp:openDesigner' })`.
3. SDK method: `lp.openDesigner()`.

When the designer is active on an embedded iframe, `body.embed-mode` stays set but is overridden by `body.designer-mode` — designer chrome becomes visible again. Closing via `paperstamp:closeDesigner` / `lp.closeDesigner()` removes the injected DOM and re-applies the embed hiding.

`lp.isDesignerLoaded()` returns a boolean (also exposed as `PaperStampCore.isDesignerLoaded()` inside the plugin).

## 5. Host SDK

`sdk.js` creates the hidden iframe, waits for `paperstamp:ready`, and exposes an imperative API. Load before your own script:

```html
<script src="sdk.js"></script>
```

No `src` needed: the SDK derives `sdk.html?embed=1` from its own `<script src>`.

### 5.1 `PaperStamp.embed(opts) -> instance`

| Option             | Type           | Notes                                                                    |
| ------------------ | -------------- | ------------------------------------------------------------------------ |
| `src`              | string         | Plugin URL. Optional — derived from SDK's own script URL when omitted.   |
| `container`        | HTMLElement    | Where to append the hidden iframe. Default `document.body`.              |
| `origin`           | string         | Target origin for outbound postMessage. Derived from `src` when omitted. |
| `width` / `height` | number\|string | Iframe size. Default `0`.                                                |
| `onReady(info)`    | fn             | `info = { version, layouts }`. Fires once per load (and after `ping`).   |
| `onDone(job)`      | fn             | Fires when the plugin's print dialog closes.                             |
| `onError(err)`     | fn             | `err = { code, message, job }`.                                          |

Appending `?embed=1` is recommended: hides all designer chrome.

### 5.2 Instance methods

| Method                                            | Purpose                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --- | ------------------- | ------------------------------------------------------------- |
| `lp.preview({ layoutDef, fieldValues? })`         | Render a layout into the plugin without printing (live preview).                                    |
| `lp.print({ layoutDef, fieldValues?, options? })` | Stateless print. Preferred for cross-origin hosts.                                                  |
| `lp.printById(layoutId, fieldValues?, options?)`  | Print a previously-saved/registered layout.                                                         |
| `lp.register(layoutDef)`                          | Upsert a named layout without printing (`layoutDef.name` required).                                 |
| `lp.ping()`                                       | Ask plugin to re-emit `paperstamp:ready`.                                                           |
| `lp.isReady()`                                    | Boolean.                                                                                            |
| `lp.layouts()`                                    | Latest saved layout ids from the plugin.                                                            |
| `lp.on('ready'\|'done'\|'error', fn)`             | Add a listener after `embed()`.                                                                     |     | `lp.openDesigner()` | Lazy-load the designer into the embedded plugin (idempotent). |
| `lp.closeDesigner()`                              | Remove designer chrome and revert to preview-only.                                                  |     | `lp.destroy()`      | Detach listener, remove the iframe.                           |
| `lp.export(cb?)`                                  | Request the plugin's current layout as JSON. `cb(layoutDef)` on reply; also emits `'exportResult'`. |
| `lp.import(layoutDef, options?)`                  | Replace the plugin's current in-memory state with `layoutDef`. Does not persist to storage.         |

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
sdk.html?layoutId=<id>&data=<urlencoded JSON>&silent=0|1
```

`layoutId` must already exist in plugin storage (same origin). `silent` defaults to `1`. `printStateless` is **not** reachable via URL params.

---

## 7. Print behaviour & caveats

- The plugin calls `window.print()` — modern browsers open the native print dialog; there is **no client-side way to skip it**.
- True silent printing needs one of: Chrome/Edge with `--kiosk-printing`, or an Electron/CEF/WebView host exposing a native print API.
- The plugin injects a dynamic `@page { size: <W>mm <H>mm; margin: 0 }` rule so paper size matches the layout.
- `@media print` in `style.css` hides designer chrome and the guide image; only `#page` prints.
- When print is programmatic (message or URL param), the plugin sets an internal flag and calls `window.close()` on `afterprint`. When embedded, either host the plugin in a dedicated iframe you recreate on `paperstamp:done`, or pass `options.silent === false` to keep it open.

---

## 8. Storage & isolation

- Saved layouts live in `localStorage['paperstampLayouts']` scoped to the **plugin's origin**.
- Cross-origin hosts cannot read or write plugin storage — use `layoutDef` in messages for all data.
- `printStateless` with `layoutDef.name` upserts into plugin storage as a side effect — pass `name` only if you want caching.

---

## 9. Versioning

- `paperstamp:ready` includes `version` (currently `'1'`). Pin against a major version; ignore unknown message `type`s.
- The `Item` and `LayoutDef` schemas above are the compatibility surface. Additive fields are safe; renames are breaking.
