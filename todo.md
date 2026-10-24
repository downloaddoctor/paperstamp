# TODO - single html, js, css (no dev server, open index.html directly)

## Goal
- Open dist/index.html in a browser (file://) with no dev server and no install.
- Output is one html, one js, one css. Only CDN files stay external.
- GitHub Pages serves the same files with no CI build.

## Current state
- dist/ is committed (c7dd534). sw.js removed. pages.yml uploads dist as-is.
- dist/index.html loads paperstamp.min.js. The CSS is inlined inside JS strings, so there is no standalone css file.
- The runtime runs in a srcdoc iframe, so it is not yet a plain single page.
- Unstaged: deleted assets/logo-candidates.svg (decide: commit the deletion or restore).

## Steps
- [x] 1. Decide the output layout: dist/index.html + dist/app.js + dist/style.css (example.html, favicon.svg and llms.txt stay as extras).
- [x] 2. build.js: emit dist/style.css (base + designer css, minified) and link it from index.html.
- [x] 3. build.js: emit one dist/app.js (SDK + runtime) and reference it from index.html.
- [x] 4. Check that file:// works: no fetch, no module scripts, no absolute paths.
- [x] 5. Keep the dev self-test out of the prod files (paperstamp.dev.js stays optional).
- [x] 6. Update test/core.test.js to the new output names and run pnpm test.
- [ ] 7. Update the docs: AGENTS.md, README.md, INTEGRATION.md, PLUGIN.md (file names, how to open, no build needed to view).
- [ ] 8. pnpm build, then commit dist together with the sources (Pages has no build step).
- [ ] 9. Push, set Pages source to GitHub Actions, check the live URL.

## Open questions
- Keep embed() and the iframe model for hosts, or make index.html a direct page?
- Keep paperstamp.min.js as the public SDK filename for existing integrations?
