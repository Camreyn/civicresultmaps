import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingDir = process.argv[2] ?? ".etl/staging";
const outPath = process.argv[3] ?? "data/electronic-integrity-reconciliation-status.json";
const registryPath = "data/electronic-integrity-artifacts.json";
const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, registryPath), "utf8").replace(/^\uFEFF/, ""));

function readJsonIfExists(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, ""));
}

function artifactStatus(state, type) {
  return state.artifacts.find((artifact) => artifact.type === type)?.status ?? "missing";
}

function artifactRows(state, status) {
  return state.artifacts.filter((artifact) => artifact.status === status).length;
}

function requestArtifacts(state) {
  return state.artifacts
    .filter((artifact) => artifact.requestRequired)
    .map((artifact) => ({
      granularity: artifact.granularity,
      reconciliationStatus: artifact.reconciliationStatus,
      type: artifact.type,
      use: artifact.tamperDetectionUse,
    }));
}

function localArtifactExists(artifact) {
  if (!artifact.localArtifact) {
    return null;
  }
  return fs.existsSync(path.join(repoRoot, artifact.localArtifact));
}

function stagingSummary(stateCode) {
  const staging = readJsonIfExists(path.join(stagingDir, `${stateCode.toLowerCase()}-2024-staging.json`));
  if (!staging) {
    return {
      capabilities: {},
      historicalRows: 0,
      resultRows: 0,
      reviewRows: 0,
      sourceRows: 0,
      stagingPresent: false,
      turnoutRows: 0,
    };
  }

  return {
    capabilities: staging.capabilities ?? {},
    historicalRows: staging.native?.historicalRows?.length ?? 0,
    resultRows: staging.native?.resultRows?.length ?? 0,
    reviewRows: staging.native?.reviewRows?.length ?? 0,
    sourceRows: staging.sources?.length ?? 0,
    stagingPresent: true,
    turnoutRows: staging.native?.turnoutRows?.length ?? 0,
  };
}

function stateReport(state) {
  const staging = stagingSummary(state.state);
  const loadedArtifacts = state.artifacts.filter((artifact) => artifact.status === "loaded");
  const localArtifactChecks = loadedArtifacts.map((artifact) => ({
    exists: localArtifactExists(artifact),
    localArtifact: artifact.localArtifact,
    type: artifact.type,
  }));
  const cvrStatus = artifactStatus(state, "cast_vote_records");
  const ballotImageStatus = artifactStatus(state, "ballot_images");
  const tabulatorLogStatus = artifactStatus(state, "tabulator_logs");
  const auditStatus = artifactStatus(state, "audit_results");

  return {
    artifactRows: state.artifacts.length,
    auditStatus,
    ballotImageStatus,
    canRecomputeFromCvr: cvrStatus === "loaded",
    canTriangulateMachineRisk:
      staging.reviewRows > 0 && ["loaded", "partial"].includes(auditStatus) && ["loaded", "partial"].includes(cvrStatus),
    cvrStatus,
    loadedArtifactRows: loadedArtifacts.length,
    localArtifactChecks,
    missingOrBlockedRows: artifactRows(state, "needs_data") + artifactRows(state, "blocked"),
    nextAction: state.nextAction,
    overallStatus: state.overallStatus,
    requestArtifacts: requestArtifacts(state),
    requestRequiredRows: state.artifacts.filter((artifact) => artifact.requestRequired).length,
    riskPosture: state.riskPosture,
    staging,
    state: state.state,
    stateName: state.stateName,
    tabulatorLogStatus,
  };
}

const states = registry.states.map(stateReport).sort((a, b) => a.state.localeCompare(b.state));
const report = {
  caveat:
    "This report tracks electronic-integrity evidence availability and reconciliation readiness only. Missing, partial, or anomalous evidence is not proof of electronic tampering.",
  checkedAt: registry.checkedAt,
  electionYear: registry.electionYear,
  sourceRegistry: registryPath,
  states,
  summary: {
    canRecomputeFromCvrStates: states.filter((state) => state.canRecomputeFromCvr).map((state) => state.state),
    canTriangulateMachineRiskStates: states.filter((state) => state.canTriangulateMachineRisk).map((state) => state.state),
    loadedArtifactRows: states.reduce((sum, state) => sum + state.loadedArtifactRows, 0),
    requestRequiredRows: states.reduce((sum, state) => sum + state.requestRequiredRows, 0),
    states: states.length,
    statesWithReviewRows: states.filter((state) => state.staging.reviewRows > 0).map((state) => state.state),
  },
};

fs.mkdirSync(path.dirname(path.join(repoRoot, outPath)), { recursive: true });
fs.writeFileSync(path.join(repoRoot, outPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
