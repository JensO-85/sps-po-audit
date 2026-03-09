import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfModule = require('pdf-parse');
const pdf = pdfModule.default || pdfModule.pdf || pdfModule;

const buf = fs.readFileSync('/Users/jamesy/Downloads/Order- 16043880 12.2.25 (1).pdf');

const run = async () => {
  const d = await pdf(buf);
  fs.writeFileSync('/tmp/po-raw.txt', d.text || String(d));
  console.log('Written to /tmp/po-raw.txt');
};

run().catch(err => {
  console.error('ERR:', err);
  process.exit(1);
});
