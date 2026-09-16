# paperstamp

A tiny, dependency-free, build-free layout designer and print runtime for the browser. Design a page in the designer, save it as a layout, and print it — or embed the runtime in a host app and drive it via `postMessage`.

Pure static HTML/CSS/JS. No server, no build step, no npm.

## Live demo

| Try it                       | URL                                                      |
| ---------------------------- | -------------------------------------------------------- |
| **Designer** (standalone)    | https://downloaddoctor.github.io/paperstamp/             |
| **SDK demo** (embed example) | https://downloaddoctor.github.io/paperstamp/example.html |
| **Embed runtime** (sdk.html) | https://downloaddoctor.github.io/paperstamp/sdk.html     |

## What it does

- **Design mode** — drag, resize, align, and style text items on a page-sized canvas (A4, Letter, Legal, or custom mm).
- **Guide image** — upload a scanned form as a background guide; your items print onto the real pre-printed form at exact positions.
- **Fill mode** — bind values to named fields and print.
- **Print** — injects a dynamic `@page { size: ... }` rule so paper size matches the layout.
- **Embed** — `sdk.js` wraps everything in a hidden iframe with a `postMessage` bridge; hosts can `preview`, `print`, `register`, `import`/`export`, and open/close the designer.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Designer-first entry (loads the designer on boot) |
| `sdk.html` | Embed/print runtime (no designer chrome) |
| `core.js` | Preview + print runtime, host protocol |
| `designer.html` / `designer.css` / `designer.js` | Lazy-loaded designer UI |
| `sdk.js` | Host-side UMD wrapper (`PaperStamp.embed()`) |
| `example.html` | Runnable SDK demo |
| `PLUGIN.md` | Authoritative embedding contract |
| `AGENTS.md` | Architecture notes |

## Quick start (designer)

Open `index.html` in a browser. Add text, drag it onto the page, print.

## Quick start (embed)

```html
<script src="sdk.js"></script>
<script>
  const lp = PaperStamp.embed({
    onReady: ({ layouts }) => console.log('ready', layouts),
    onDone:  (job)       => console.log('printed', job),
    onError: (err)       => console.error(err.code, err.message)
  });

  lp.print({
    layoutDef: {
      pageWmm: 210, pageHmm: 297, orientation: 'portrait',
      items: [{
        id: 1, type: 'text', x: 10, y: 10, w: 60, h: 8,
        text: 'Name', name: 'name', fontSize: 14,
        align: 'left', valign: 'top'
      }]
    },
    fieldValues: { name: 'Jane Doe' }
  });
</script>
```

See [PLUGIN.md](https://github.com/downloaddoctor/paperstamp/blob/main/PLUGIN.md) for the full protocol and the [live SDK demo](https://downloaddoctor.github.io/paperstamp/example.html).

## Notes

- **Browser support:** Chrome, Edge, Firefox. Safari `@page` mm positioning is approximate.
- **Silent printing:** `window.print()` always shows the dialog. Use Chrome `--kiosk-printing` or an Electron host for true silent output.
- **Storage:** Layouts are saved in `localStorage` under `paperstampLayouts` (capped at 100, LRU evicted). Export any layout you care about.

## License

MIT © downloaddoctor
