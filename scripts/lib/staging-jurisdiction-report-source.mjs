import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const STAGING_FILE_PATTERN = /^([a-z]{2})-2024-staging\.json$/i;
const ARRAY_FIELDS = ["resultRows", "historicalRows"];

function validateArtifact(artifact, fileName, fileState) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error(`${fileName} must contain a JSON object`);
  }

  const state = String(artifact.state?.code ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error(`${fileName} is missing a valid state.code`);
  }
  if (state !== fileState) {
    throw new Error(`${fileName} state.code ${state} does not match filename state ${fileState}`);
  }

  if (!Number.isInteger(artifact.election?.year) || artifact.election.year !== 2024) {
    throw new Error(`${fileName} must declare election.year 2024`);
  }
  if (!artifact.native || typeof artifact.native !== "object" || Array.isArray(artifact.native)) {
    throw new Error(`${fileName} is missing its native staging payload`);
  }

  for (const field of ARRAY_FIELDS) {
    if (artifact.native[field] != null && !Array.isArray(artifact.native[field])) {
      throw new Error(`${fileName} native.${field} must be an array when present`);
    }
  }

  return state;
}

export async function loadStagingJurisdictionReportSource(inputDir) {
  const stagingDir = resolve(inputDir);
  let directoryStats;
  try {
    directoryStats = await stat(stagingDir);
  } catch (error) {
    throw new Error(`Staging directory does not exist: ${stagingDir}`, { cause: error });
  }
  if (!directoryStats.isDirectory()) {
    throw new Error(`Staging path is not a directory: ${stagingDir}`);
  }

  const files = (await readdir(stagingDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && STAGING_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!files.length) {
    throw new Error(`No *-2024-staging.json artifacts found in ${stagingDir}`);
  }

  const artifacts = new Map();
  for (const fileName of files) {
    const fileState = fileName.match(STAGING_FILE_PATTERN)[1].toUpperCase();
    let artifact;
    try {
      artifact = JSON.parse(await readFile(resolve(stagingDir, fileName), "utf8"));
    } catch (error) {
      throw new Error(`Could not parse staging artifact ${fileName}`, { cause: error });
    }

    const state = validateArtifact(artifact, fileName, fileState);
    if (artifacts.has(state)) {
      throw new Error(`Duplicate staging artifact for ${state}`);
    }
    artifacts.set(state, artifact);
  }

  return {
    base: inputDir,
    states: Array.from(artifacts.keys()).sort(),
    rowsForState(state, family, year) {
      const artifact = artifacts.get(state);
      if (!artifact) return [];

      if (family === "results") {
        if (artifact.election.year !== year) return [];
        return (artifact.native.resultRows ?? []).filter((row) => row.level === "county");
      }
      if (family === "historical") {
        return (artifact.native.historicalRows ?? []).filter((row) => Number(row.electionYear) === year);
      }
      throw new Error(`Unsupported staging row family: ${family}`);
    },
  };
}
