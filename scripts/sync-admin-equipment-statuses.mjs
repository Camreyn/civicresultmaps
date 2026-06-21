import { readFile, stat, writeFile } from "node:fs/promises";

const registryPath = "data/admin-source-packages.json";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function rowCount(path) {
  if (!(await exists(path))) {
    return null;
  }

  const text = await readFile(path, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return Math.max(0, lines.length - 1);
}

async function main() {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  let loaded = 0;
  let blocked = 0;
  let candidate = 0;

  for (const entry of registry.stateYearStatuses ?? []) {
    const equipment = entry.equipment;
    if (!equipment?.normalizedArtifact) {
      continue;
    }

    const rows = await rowCount(equipment.normalizedArtifact);
    if (rows === null) {
      entry.status = "candidate";
      equipment.status = "candidate";
      candidate += 1;
      continue;
    }

    equipment.expectedJurisdictions = rows;
    if (rows > 0) {
      entry.status = "loaded";
      equipment.status = "loaded";
      loaded += 1;
    } else {
      entry.status = "blocked";
      equipment.status = "blocked";
      equipment.why = "The registered Verified Voting Verifier source downloaded, but the current normalizer produced zero equipment rows.";
      blocked += 1;
    }
  }

  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Equipment status sync complete: ${loaded} loaded, ${candidate} candidate, ${blocked} blocked.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
