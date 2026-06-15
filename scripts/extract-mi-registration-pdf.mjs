import { readFile, writeFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";

const input = process.argv[2] ?? "data/mi-2024-registered-voter-count.pdf";
const output = process.argv[3] ?? "data/mi-2024-registered-voter-count.json";

const countyPattern = /^([A-Z][A-Z ]+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/;

function toInt(value) {
  return Number.parseInt(value.replaceAll(",", ""), 10);
}

const parser = new PDFParse({ data: await readFile(input) });
const result = await parser.getText();
await parser.destroy();

const counties = {};
for (const rawLine of result.text.split(/\r?\n/)) {
  const line = rawLine.trim().replace(/\s+/g, " ");
  const match = countyPattern.exec(line);
  if (!match) {
    continue;
  }

  const [, county, mayActive, mayAll, augustActive, augustAll, novemberActive, novemberAll] = match;
  counties[county] = {
    augustActiveRegisteredVoters: toInt(augustActive),
    augustAllRegisteredVoters: toInt(augustAll),
    mayActiveRegisteredVoters: toInt(mayActive),
    mayAllRegisteredVoters: toInt(mayAll),
    novemberActiveRegisteredVoters: toInt(novemberActive),
    novemberAllRegisteredVoters: toInt(novemberAll),
  };
}

const payload = {
  sourcePdf: input,
  parser: "pdf-parse",
  extractedCountyRows: Object.keys(counties).length,
  counties,
};

await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ output, extractedCountyRows: payload.extractedCountyRows }));
