import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => path.join(root, 'src', f);
const dist = path.join(root, 'dist');
const read = (f) => readFile(src(f), 'utf8');

const minCss = async (css) =>
  (await transform(css, { loader: 'css', minify: true })).code;

/* designer.html has no <pre>, <textarea>, <script> or <style>, so stripping
   comments and inter-tag whitespace is safe. */
const minHtml = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();

/* core is ES modules (src/core/*); bundle them into one IIFE string. */
async function bundleIife(entry, dev) {
  const out = await build({
    define: { __PS_DEV__: String(!!dev) },
    entryPoints: [src(entry)],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2019'
  });
  return out.outputFiles[0].text;
}

/* One self-contained script: base CSS and designer CSS/markup are inlined as
   strings; core and designer share one bundle (src/entry.js). The designer
   only builds its DOM when loadDesigner()/openDesigner() is called. dev=true
   keeps the self-test (__PS_DEV__), otherwise it is dead-code eliminated. */
async function bundleRuntime(dev) {
  const [baseCss, designerCss, designerHtml, shell, app] = await Promise.all([
    read('style.css'),
    read('designer.css'),
    read('designer.html'),
    read('shell.js'),
    bundleIife('entry.js', dev)
  ]);
  return [
    '(function () {',
    '  window.__PS_BUNDLE = {',
    '    baseCss: ' + JSON.stringify(await minCss(baseCss)) + ',',
    '    designerCss: ' + JSON.stringify(await minCss(designerCss)) + ',',
    '    designerHtml: ' + JSON.stringify(minHtml(designerHtml)),
    '  };',
    '})();',
    shell,
    app,
    ''
  ].join('\n');
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

/* paperstamp(.min|.dev).js = SDK + runtime-in-a-string: one request for
   hosts. The first line carries the runtime so tests can extract it.
   paperstamp.dev.js additionally ships the ?dev=1 self-test. */
for (const [out, dev, minify] of [
  ['paperstamp.js', false, false],
  ['paperstamp.min.js', false, true],
  ['paperstamp.dev.js', true, false]
]) {
  let runtime = await bundleRuntime(dev);
  if (minify)
    runtime = (await transform(runtime, { minify: true, target: 'es2019' }))
      .code;
  const sdk = await build({
    entryPoints: [src('sdk.js')],
    write: false,
    minify,
    target: 'es2019'
  });
  await writeFile(
    path.join(dist, out),
    'window.__PS_RUNTIME_SRC=' +
      JSON.stringify(runtime) +
      ';\n' +
      sdk.outputFiles[0].text
  );
}
await cp(path.join(root, 'site'), dist, { recursive: true });

console.log('built dist/ (deployable site root)');
