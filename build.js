/* Inline every source into one self-contained page: terraform.html
   Run: node build.js                                                   */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const out = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\r?\n?/g, (_, src) => {
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  return `<script>\n/* ===== ${src} ===== */\n${code}\n</script>\n`;
});

if (out.includes('<script src=')) {
  console.error('A script tag was left un-inlined — check the pattern.');
  process.exit(1);
}

const dest = path.join(ROOT, 'terraform.html');
fs.writeFileSync(dest, out, 'utf8');
const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(0);
console.log(`built ${path.relative(ROOT, dest)}  (${kb} KB, single file, opens from file://)`);
