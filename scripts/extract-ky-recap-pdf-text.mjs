import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const inputDir = process.argv[2] ?? 'data/ky-2024-general-recap-sheets';
const outputDir = process.argv[3] ?? 'data/ky-2024-general-recap-text';

await fs.mkdir(outputDir, { recursive: true });
const files = (await fs.readdir(inputDir)).filter((name) => name.toLowerCase().endsWith('.pdf')).sort();

for (const file of files) {
  const input = path.join(inputDir, file);
  const output = path.join(outputDir, file.replace(/\.pdf$/i, '.txt'));
  const stat = await fs.stat(input);
  let parser;
  try {
    const buffer = await fs.readFile(input);
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const extracted = result.text.replace(/\r\n/g, '\n');
    const extractedLength = extracted.trim().length;
    let existing = '';
    try {
      existing = await fs.readFile(output, 'utf8');
    } catch {
      existing = '';
    }
    if (extractedLength < 1000 && existing.trim().length > extractedLength) {
      console.log(`${file}\t${result.text.length}\tmanual-preserved`);
      continue;
    }
    const text = `# Source: ${file}\n# ByteSize: ${stat.size}\n\n${extracted}`;
    await fs.writeFile(output, text, 'utf8');
    console.log(`${file}\t${result.text.length}`);
  } finally {
    await parser?.destroy();
  }
}
