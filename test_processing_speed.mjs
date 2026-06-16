import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const app = read('./extension/app.js');
const background = read('./extension/background.js');
const content = read('./extension/content.js');

assert.match(app, /wbPageSize:\s*100/);
assert.match(app, /ozonPdfConcurrency:\s*Math\.min\(12/);
assert.match(app, /wbReceiptConcurrency:\s*Math\.min\(24/);
assert.match(background, /Promise\.all\(jobs\.map/);
assert.match(content, /Promise\.all\(\[\.\.\.new Set/);
assert.match(content, /mapWithConcurrency\(pageNumbers,\s*2/);
assert.match(content, /function wbPageSizeCandidates/);
assert.match(content, /пустая первая страница, пробую размер/);
assert.doesNotMatch(content, /sleep\(250\)/);
