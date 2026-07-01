import electronicIntegrityArtifacts from "../../data/electronic-integrity-artifacts.json";

export type ElectronicIntegrityPackage = typeof electronicIntegrityArtifacts;
export type ElectronicIntegrityState = ElectronicIntegrityPackage["states"][number];
export type ElectronicIntegrityArtifact = ElectronicIntegrityState["artifacts"][number];
export type ElectronicIntegrityArtifactStatus = ElectronicIntegrityArtifact["status"];
export type ElectronicIntegrityArtifactType = ElectronicIntegrityArtifact["type"];
type ElectronicIntegrityArtifactRecord = ElectronicIntegrityArtifact & {
  requestRequired?: boolean;
};
type ElectronicIntegrityStateRecord = Omit<ElectronicIntegrityState, "artifacts"> & {
  artifacts: ElectronicIntegrityArtifactRecord[];
};

export function listElectronicIntegrityArtifacts(input: {
  state?: string;
  status?: ElectronicIntegrityArtifactStatus;
  type?: ElectronicIntegrityArtifactType;
  year?: number;
} = {}) {
  const requestedState = input.state?.toUpperCase();
  const year = input.year ?? electronicIntegrityArtifacts.electionYear;
  const sourceStates = electronicIntegrityArtifacts.states as unknown as ElectronicIntegrityStateRecord[];
  const states = sourceStates
    .filter((entry) => !requestedState || entry.state === requestedState)
    .map((entry) => ({
      ...entry,
      electionYear: year,
      artifacts: entry.artifacts
        .filter((artifact) => !input.status || artifact.status === input.status)
        .filter((artifact) => !input.type || artifact.type === input.type),
    }))
    .filter((entry) => entry.artifacts.length > 0)
    .sort((a, b) => a.state.localeCompare(b.state));

  const artifacts = states.flatMap((state) => state.artifacts.map((artifact) => ({ ...artifact, state: state.state })));
  const countBy = (field: "status" | "type") =>
    artifacts.reduce<Record<string, number>>((summary, artifact) => {
      const value = String(artifact[field]);
      summary[value] = (summary[value] ?? 0) + 1;
      return summary;
    }, {});

  return {
    artifactTypes: electronicIntegrityArtifacts.artifactTypes,
    checkedAt: electronicIntegrityArtifacts.checkedAt,
    description: electronicIntegrityArtifacts.description,
    electionYear: year,
    states,
    summary: {
      artifactRows: artifacts.length,
      byStatus: countBy("status"),
      byType: countBy("type"),
      requestRequiredRows: artifacts.filter((artifact) => artifact.requestRequired).length,
      states: states.length,
      statesWithLoadedCvr: states.filter((state) => state.artifacts.some((artifact) => artifact.type === "cast_vote_records" && artifact.status === "loaded")).length,
      statesWithPartialCvr: states.filter((state) => state.artifacts.some((artifact) => artifact.type === "cast_vote_records" && artifact.status === "partial")).length,
      statesWithLoadedAudit: states.filter((state) => state.artifacts.some((artifact) => artifact.type === "audit_results" && artifact.status === "loaded")).length,
      statesWithPartialAudit: states.filter((state) => state.artifacts.some((artifact) => artifact.type === "audit_results" && artifact.status === "partial")).length,
    },
  };
}
