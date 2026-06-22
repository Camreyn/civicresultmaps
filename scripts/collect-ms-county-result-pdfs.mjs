import fs from "node:fs";
import path from "node:path";

const sourcePage = "https://sos.ms.gov/elections/electionresults_aspx/elections_results_2024_county.aspx";
const outputDir = process.argv[2] ?? "data/ms-2024-county-results-pdfs";

function safeName(value) {
  return decodeURIComponent(value).replace(/[\\/:*?"<>|]/g, "_");
}

async function fetchBuffer(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      accept: "application/pdf,text/html,*/*;q=0.8",
      referer: sourcePage,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(url + " returned " + response.status);
  }
  return Buffer.from(await response.arrayBuffer());
}

fs.mkdirSync(outputDir, { recursive: true });
const page = (await fetchBuffer(sourcePage, { headers: { accept: "text/html,*/*;q=0.8" } })).toString("utf8");
const hrefs = [...page.matchAll(/href=["\']([^"\']+\.pdf)["\']/gi)].map((match) => match[1]);
const files = [];
for (const href of hrefs) {
  const url = new URL(href, "https://sos.ms.gov").toString();
  const file = safeName(url.split("/").pop() ?? "county.pdf");
  const buffer = await fetchBuffer(url);
  fs.writeFileSync(path.join(outputDir, file), buffer);
  files.push({ url, file, bytes: buffer.length });
  console.log(file + " " + buffer.length);
}
fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({ sourcePage, count: files.length, files }, null, 2) + "\n");
console.log("Downloaded " + files.length + " Mississippi county result PDFs to " + outputDir);
