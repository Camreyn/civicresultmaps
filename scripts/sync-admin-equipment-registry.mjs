import { readFile, writeFile } from "node:fs/promises";
import { states } from "./state-metadata.mjs";

const registryPath = "data/admin-source-packages.json";
const year = 2024;
const caveat =
  "Verified Voting Verifier data is jurisdiction-level election-administration context. Most rows are counties, but some states report state-level rows and some county rows can summarize mixed tabulation, accessible-device, absentee, poll-book, or other configurations. Treat it as source-linked context, not proof every precinct in a county used one identical setup, and not a turnout or vote-result source.";

function equipmentEntry(state) {
  const lower = state.code.toLowerCase();
  const fips = Number(state.fips);
  return {
    status: "candidate",
    reportingLevel: "county",
    parser: "verifiedVotingEquipment",
    sourceDocumentId: `verified-voting-verifier-${lower}-${year}-equipment`,
    sourceUrl: `https://verifiedvoting.org/verifier/#mode/navigate/map/voteEquip/mapType/ppEquip/year/${year}/state/${fips}`,
    apiUrl: `https://verifiedvoting.org/wp-content/themes/dt-the7-child/verifier/api/api_sandbox.php?state_fips=${fips}&db_year=${year}&map=voteEquip&map_type=ppEquip`,
    localArtifact: `data/verifiedvoting-${lower}-${year}-equipment.json`,
    normalizedArtifact: `data/${lower}-${year}-equipment-context.csv`,
    caveat,
  };
}

function placeholderStatus(label, state) {
  return {
    status: "needs_data",
    why: `${state.name} ${year} ${label} artifacts have not been inventoried or normalized into this administration context registry yet.`,
  };
}

function mergeStateEntry(existing, state) {
  const baseEquipment = equipmentEntry(state);
  const existingEquipment = existing?.equipment ?? {};
  const equipment = {
    ...baseEquipment,
    ...existingEquipment,
    sourceDocumentId: baseEquipment.sourceDocumentId,
    sourceUrl: baseEquipment.sourceUrl,
    apiUrl: baseEquipment.apiUrl,
    localArtifact: baseEquipment.localArtifact,
    normalizedArtifact: baseEquipment.normalizedArtifact,
    caveat: baseEquipment.caveat,
  };

  return {
    state: state.code,
    stateName: state.name,
    electionYear: year,
    status: existing?.status ?? (equipment.status === "loaded" ? "loaded" : "candidate"),
    priority: existing?.priority ?? state.priority ?? "standard",
    equipment,
    audit: existing?.audit ?? placeholderStatus("post-election audit", state),
    cvr: existing?.cvr ?? placeholderStatus("CVR", state),
    incidents: existing?.incidents ?? placeholderStatus("incident, correction, and litigation", state),
  };
}

async function main() {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const existingByState = new Map(
    (registry.stateYearStatuses ?? [])
      .filter((entry) => Number(entry.electionYear) === year)
      .map((entry) => [entry.state, entry]),
  );

  registry.stateYearStatuses = states.map((state) => mergeStateEntry(existingByState.get(state.code), state));
  delete registry.remainingStatesNeedingPackages;

  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Synced ${registry.stateYearStatuses.length} ${year} admin source package entries.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
