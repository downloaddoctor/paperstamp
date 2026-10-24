# paperstamp

A dependency-free layout designer and print runtime for the browser. Design a page, save it as a layout, and print it at exact positions, or embed the runtime in a host app and drive it via `postMessage`.

Ships as **one script**: `sdk.js` contains the host SDK plus the runtime, designer UI and all CSS. `PaperStamp.embed()` creates an isolated iframe from it (blob URL), so one request is enough. No service worker.

## Live demo

| Try it                       | URL                                                      |
| ---------------------------- | -------------------------------------------------------- |
| **Designer** (standalone)    | https://downloaddoctor.github.io/paperstamp/             |
| **SDK demo** (embed example) | https://downloaddoctor.github.io/paperstamp/example.html |

## Use it

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

Layouts live in the host page's own `localStorage`, since the blob iframe inherits the host origin.

## Develop

```
pnpm install
pnpm build   # -> dist/ (sdk.js, sdk.dev.js)
# dev needs no build: serve the repo root statically (e.g. npx serve) and open index.html, it loads src/ directly
# example.html needs pnpm build (loads dist/sdk.js)
pnpm test
```

| Path                         | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `src/`                       | runtime, designer and SDK sources                  |
| `index.html`, `example.html` | designer page and SDK demo (root, outside `dist/`) |
| `scripts/build.js`           | esbuild bundler producing `dist/`                  |
| `test/`                      | `node:test` suite                                  |

See [PLUGIN.md](PLUGIN.md) for the protocol, [INTEGRATION.md](INTEGRATION.md) for hosting options, and [llms.txt](llms.txt) for an LLM summary.

## Notes

- **Browser support:** Chrome, Edge, Firefox. Safari `@page` mm positioning is approximate.
- **Silent printing:** `window.print()` always shows the dialog; use Chrome `--kiosk-printing` or an Electron host.
- **Strict CSP:** hosts must allow `blob:` in `frame-src` and `script-src`, and `'unsafe-inline'` in `style-src`.
- **Storage:** layouts live in `localStorage` (`paperstampLayouts`, capped at 100, LRU evicted).

## License

MIT © downloaddoctor
