const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const output = path.resolve(__dirname, '../.runtime/ocr-regression/long-list.png');
const rows = Array.from({ length: 26 }, (_, index) => {
  const marker = index === 0 ? 'START' : index === 25 ? 'FINAL' : 'LINE';
  return `<text x="28" y="${42 + index * 34}" fill="#e8edf2">${marker} ${index + 1} Screenshot recognition: local processing, editable text, and complete long URLs https://example.com/documentation/section/${index + 1}</text>`;
}).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="940"><rect width="100%" height="100%" fill="#16191d"/><g font-family="Arial" font-size="18">${rows}</g></svg>`;
fs.mkdirSync(path.dirname(output), { recursive: true });
sharp(Buffer.from(svg)).png().toFile(output).then(() => {
  console.log(`Generated 26-line dark small-text fixture: ${output}`);
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
