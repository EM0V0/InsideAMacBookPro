// Bundles src/ into one HTML page.  node tools/build-page.mjs [prod|dev]
//   prod -> index.html (three.js from jsDelivr, model inlined)   dev -> dev/index.html (local three, fetches the model)
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'prod';
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.170.0';
const MODEL = fs.existsSync(path.join(ROOT, 'model/mbp.glb')) ? path.join(ROOT, 'model/mbp.glb') : path.join(ROOT, 'dev/mbp.glb');
const importmap = (base) => `<script type="importmap">{"imports":{"three":"${base}/build/three.module.js","three/addons/":"${base}/examples/jsm/"}}</script>`;
const glbPlugin = { name: 'glb', setup(b) {
  b.onResolve({ filter: /\/glb\.js$/ }, () => ({ path: 'glb', namespace: 'glb' }));
  b.onLoad({ filter: /.*/, namespace: 'glb' }, () => ({ contents: mode === 'prod' ? `export const GLB_B64 = ${JSON.stringify(fs.readFileSync(MODEL).toString('base64'))};` : 'export const GLB_B64 = null;', loader: 'js' }));
} };
const out = await esbuild.build({ entryPoints: [path.join(ROOT, 'src/main.js')], bundle: true, format: 'esm', write: false, minify: mode === 'prod', external: ['three', 'three/addons/*'], target: 'es2020', plugins: [glbPlugin], legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const body = fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8').replace('<!--IMPORTMAP-->', importmap(mode === 'prod' ? cdn : './three')).replace('<!--APP-->', `<script type="module">\n${js}\n</script>`);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
if (mode === 'prod') { fs.writeFileSync(path.join(ROOT, 'index.html'), full); console.log('prod bytes', full.length); }
else { fs.mkdirSync(path.join(ROOT, 'dev'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'dev/index.html'), full); console.log('dev bytes', full.length); }
