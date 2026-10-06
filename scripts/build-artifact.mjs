// Turns dist/index.html into a single self-contained dist/artifact.html
// (inline CSS + JS, no <html>/<head>/<body> wrapper) for publishing as a claude.ai Artifact.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const read = (file) => readFileSync(join(dist, file), 'utf8');
let html = read('index.html');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g,
  (_, file) => `<style>\n${read(file)}\n</style>`);

// Module scripts move to the end of the body, after the markup they use.
const scripts = [];
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, file) => {
  scripts.push(read(file).replace(/<\/script/gi, '<\\/script'));
  return '';
});

const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1]
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/i)[1];
const out = [head.trim(), body.trim(), ...scripts.map((s) => `<script type="module">\n${s}\n</script>`)].join('\n') + '\n';
writeFileSync(join(dist, 'artifact.html'), out);
console.log(`artifact.html written (${(out.length / 1024).toFixed(0)} KB)`);
