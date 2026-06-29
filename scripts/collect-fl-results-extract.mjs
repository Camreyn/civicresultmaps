import { writeFile } from "node:fs/promises";

const url = "https://results.elections.myflorida.com/ResultsExtract.Asp";
const outPath = process.argv[2] ?? "data/fl-2024-general-results-extract.tsv";
const body = new URLSearchParams({
  DataMode: "",
  ElectionDate: "11/5/2024",
  FormsButton2: "Download",
  OfficialResults: "Y",
  PartyRaces: "N",
});

const response = await fetch(url, {
  body,
  headers: { "content-type": "application/x-www-form-urlencoded" },
  method: "POST",
});

if (!response.ok) {
  throw new Error(`Florida results extract download failed with HTTP ${response.status}`);
}

const text = await response.text();
if (!text.startsWith("ElectionDate\tPartyCode")) {
  throw new Error("Florida results extract response did not look like the expected tab-delimited file.");
}

await writeFile(outPath, text, "latin1");
console.log(JSON.stringify({ outPath, bytes: Buffer.byteLength(text, "latin1"), sourceUrl: url }, null, 2));
