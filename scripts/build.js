import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

/* core + designer are ES modules; bundle src/core/index.js (single entry, imports the designer) into one IIFE string.
   dev=true keeps the self-test (__PS_DEV__); otherwise it is dead-code eliminated. */
async function bundleIife(dev) {
  const out = await build({
    define: { __PS_DEV__: String(!!dev) },
    entryPoints: [src('core/index.js')],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2019'
  });
  return out.outputFiles[0].text;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

/* Two SDK files, same API, both include the designer:
   sdk.js = production, sdk.dev.js = plus self-test (testing only).
   The runtime and the css/html assets are inlined into the SDK as constants. */
const [baseCss, designerCss, designerHtml] = await Promise.all([
  read('style.css'),
  read('designer.css'),
  read('designer.html')
]);
for (const [out, dev] of [
  ['sdk.js', false],
  ['sdk.dev.js', true]
]) {
  const raw = await bundleIife(dev);
  const runtime = dev
    ? raw
    : (await transform(raw, { minify: true, target: 'es2019' })).code;
  const sdk = await build({
    entryPoints: [src('sdk.js')],
    write: false,
    minify: true,
    target: 'es2019',
    define: {
      __PS_RUNTIME__: JSON.stringify(runtime),
      __PS_BASE_CSS__: JSON.stringify(await minCss(baseCss)),
      __PS_DESIGNER_CSS__: JSON.stringify(await minCss(designerCss)),
      __PS_DESIGNER_HTML__: JSON.stringify(minHtml(designerHtml))
    }
  });
  await writeFile(path.join(dist, out), sdk.outputFiles[0].text);
}

/* Designer page: same index.html as dev, only the SDK script changes from src/sdk.js to the built sdk.js. */
{
  const page = await readFile(path.join(root, 'index.html'), 'utf8');
  const tag = "<script src='src/sdk.js'></script>";
  if (!page.includes(tag)) throw new Error('sdk.js script tag not found in index.html');
  await writeFile(
    path.join(dist, 'index.html'),
    page.replace(tag, "<script src='sdk.js'></script>").replaceAll('assets/', '')
  );
}

const example = await readFile(path.join(root, 'example.html'), 'utf8');
await writeFile(
  path.join(dist, 'example.html'),
  example.replace("<script src='src/sdk.js'></script>", "<script src='sdk.js'></script>").replaceAll('assets/', '')
);
await cp(path.join(root, 'assets', 'favicon.svg'), path.join(dist, 'favicon.svg'));
await cp(path.join(root, 'llms.txt'), path.join(dist, 'llms.txt'));

console.log('built dist/ (sdk.js, sdk.dev.js)');
