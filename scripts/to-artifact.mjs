// Turns the single-file Vite build into a page fragment for publishing as a test link:
// the publisher supplies its own <!doctype>/<html>/<head>/<body> skeleton.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
// The test link can't install the app, so drop the install bits (manifest, icons, app metas).
const headKeep = head
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '')
  .replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*/gi, '')
  .replace(/<meta name="(mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>\s*/gi, '');
writeFileSync('dist/preview.html', `${headKeep.trim()}\n${body.trim()}\n`);
console.log('wrote dist/preview.html');
