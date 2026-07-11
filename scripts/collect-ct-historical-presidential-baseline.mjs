import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const HOST = "ctemspublic.tgstg.net";
const FILES = [
  "Lookupdata.json",
  "townVotes_Electiondata.json",
  "stateVotes_Electiondata.json",
  "election_Electiondata.json",
];

const ELECTIONS = [
  {
    year: 2016,
    electionId: "1",
    expectedVersion: 5603,
    outputDirectory: "data/ct-2016-ems-election-1-version-5603",
  },
  {
    year: 2020,
    electionId: "54",
    expectedVersion: 64824,
    outputDirectory: "data/ct-2020-ems-election-54-version-64824",
  },
];

async function fetchOfficialJson(pathname) {
  const attempts = [`https://${HOST}${pathname}`, `http://${HOST}${pathname}`];
  let lastError;
  for (const url of attempts) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      JSON.parse(text);
      return { text, canonicalUrl: attempts[0], transportUrl: url };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Connecticut EMS download failed for ${pathname}: ${lastError?.message ?? lastError}`);
}

for (const election of ELECTIONS) {
  const outputDirectory = path.join(repoRoot, election.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });

  const versionPath = `/ng-app/data/election/${election.electionId}/Version.json`;
  const versionDownload = await fetchOfficialJson(versionPath);
  const version = Number(JSON.parse(versionDownload.text).Version);
  if (version !== election.expectedVersion) {
    throw new Error(
      `Connecticut EMS ${election.year} version changed: expected ${election.expectedVersion}, got ${version}`,
    );
  }
  await writeFile(path.join(outputDirectory, "Version.json"), versionDownload.text, "utf8");

  for (const fileName of FILES) {
    const pathname = `/ng-app/data/election/${election.electionId}/${version}/${fileName}`;
    const download = await fetchOfficialJson(pathname);
    await writeFile(path.join(outputDirectory, fileName), download.text, "utf8");
  }

  console.log(
    `Collected CT ${election.year} election ${election.electionId}/version ${version} into ${election.outputDirectory}`,
  );
}

