// Turns the single-file Vite build into a page fragment for publishing as a test link:
// the publisher supplies its own <!doctype>/<html>/<head>/<body> skeleton.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? '';
const headKeep = head.replace(/<meta charset[^>]*>/i, '').replace(/<meta name="viewport"[^>]*>/i, '');
writeFileSync('dist/preview.html', `${headKeep.trim()}\n${body.trim()}\n`);
console.log('wrote dist/preview.html');
