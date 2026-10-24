# paperstamp

A dependency-free layout designer and print runtime for the browser. Design a page, save it as a layout, and print it at exact positions, or embed the runtime in a host app and drive it via `postMessage`.

Ships as **one script**: `paperstamp.min.js` contains the host SDK plus the runtime, designer UI and all CSS. `PaperStamp.embed()` creates an isolated iframe from it (`srcdoc`), so one request is enough. No service worker.

## Live demo

| Try it                       | URL                                                      |
| ---------------------------- | -------------------------------------------------------- |
| **Designer** (standalone)    | https://downloaddoctor.github.io/paperstamp/             |
| **SDK demo** (embed example) | https://downloaddoctor.github.io/paperstamp/example.html |

## Use it

```html
<script src="https://downloaddoctor.github.io/paperstamp/paperstamp.min.js"></script>
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

Layouts live in the host page's own `localStorage`, since the iframe is `srcdoc`.

## Develop

```
pnpm install
pnpm dev     # watch + rebuild + serve dist/ at http://localhost:3000
pnpm build   # -> dist/ (paperstamp(.min).js, site pages)
pnpm test
```

| Path       | Purpose                                         |
| ---------- | ----------------------------------------------- |
| `src/`     | runtime, designer and SDK sources               |
| `site/`    | demo pages copied into `dist/`                  |
| `build.js` | esbuild bundler producing the single-file build |
| `test/`    | `node:test` suite                               |

See [PLUGIN.md](PLUGIN.md) for the protocol, [INTEGRATION.md](INTEGRATION.md) for hosting options, and [site/llms.txt](site/llms.txt) for an LLM summary.

## Notes

- **Browser support:** Chrome, Edge, Firefox. Safari `@page` mm positioning is approximate.
- **Silent printing:** `window.print()` always shows the dialog; use Chrome `--kiosk-printing` or an Electron host.
- **Storage:** layouts live in `localStorage` (`paperstampLayouts`, capped at 100, LRU evicted).

## License

MIT © downloaddoctor
