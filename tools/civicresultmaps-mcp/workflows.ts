import type { ValidatorName, WorkflowMode } from "./contracts.ts";

export type WorkflowKind = "import" | "validate";
export type RuntimeName = "node" | "python";

export type WorkflowStep = {
  args: string[];
  label: string;
  runtime: RuntimeName;
};

export type WorkflowDrift = {
  actual: string | null;
  expected: string;
  script: string;
  severity: "blocking";
};

export type ResolvedWorkflow = {
  drift: WorkflowDrift[];
  kind: WorkflowKind | "validator";
  mode: WorkflowMode | "registered";
  packageScripts: string[];
  state?: string;
  steps: WorkflowStep[];
  validator?: ValidatorName;
};

type StatePreparation = {
  expectedScripts: Record<string, string>;
  steps: WorkflowStep[];
};

type ValidatorDefinition = {
  expectedScripts: Record<string, string>;
  steps: WorkflowStep[];
};

const nodeStep = (label: string, ...args: string[]): WorkflowStep => ({ args, label, runtime: "node" });
const pythonStep = (label: string, ...args: string[]): WorkflowStep => ({ args, label, runtime: "python" });

const STATE_PREPARATIONS: Record<string, StatePreparation> = {
  AL: {
    expectedScripts: { "etl:prepare:al": "node scripts/normalize-al-sos-results.mjs" },
    steps: [nodeStep("Normalize Alabama SOS results", "scripts/normalize-al-sos-results.mjs")],
  },
  CA: {
    expectedScripts: {
      "etl:prepare:ca": "node scripts/normalize-ca-sov-workbooks.mjs && node scripts/normalize-ca-turnout.mjs",
    },
    steps: [
      nodeStep("Normalize California SOV workbooks", "scripts/normalize-ca-sov-workbooks.mjs"),
      nodeStep("Normalize California turnout", "scripts/normalize-ca-turnout.mjs"),
    ],
  },
  DC: {
    expectedScripts: { "etl:prepare:dc": "node scripts/normalize-dc-certified-results.mjs" },
    steps: [nodeStep("Normalize District of Columbia certified results", "scripts/normalize-dc-certified-results.mjs")],
  },
  IA: {
    expectedScripts: { "etl:prepare:ia": "node scripts/collect-ia-clarity-county-reports.mjs" },
    steps: [nodeStep("Collect Iowa Clarity county reports", "scripts/collect-ia-clarity-county-reports.mjs")],
  },
  KY: {
    expectedScripts: {
      "etl:prepare:ky": "node scripts/extract-ky-recap-pdf-text.mjs",
      "etl:reconcile:ky:turnout": "node scripts/reconcile-ky-turnout-registration.mjs",
    },
    steps: [
      nodeStep("Extract Kentucky recap PDF text", "scripts/extract-ky-recap-pdf-text.mjs"),
      nodeStep("Reconcile Kentucky turnout and registration", "scripts/reconcile-ky-turnout-registration.mjs"),
    ],
  },
  MO: {
    expectedScripts: { "etl:prepare:mo": "node scripts/normalize-mo-sos-pdfs.mjs" },
    steps: [nodeStep("Normalize Missouri SOS PDFs", "scripts/normalize-mo-sos-pdfs.mjs")],
  },
  ND: {
    expectedScripts: { "etl:collect:nd": "node scripts/collect-nd-sos-results.mjs" },
    steps: [nodeStep("Collect North Dakota SOS results", "scripts/collect-nd-sos-results.mjs")],
  },
  NH: {
    expectedScripts: { "etl:prepare:nh": "node scripts/normalize-nh-general-workbooks.mjs" },
    steps: [nodeStep("Normalize New Hampshire general workbooks", "scripts/normalize-nh-general-workbooks.mjs")],
  },
  NJ: {
    expectedScripts: {
      "etl:prepare:nj": "node scripts/normalize-nj-doe-pdfs.mjs && node scripts/normalize-nj-historical-presidential-baseline.mjs",
    },
    steps: [
      nodeStep("Normalize New Jersey DOE PDFs", "scripts/normalize-nj-doe-pdfs.mjs"),
      nodeStep("Normalize New Jersey historical baseline", "scripts/normalize-nj-historical-presidential-baseline.mjs"),
    ],
  },
  NY: {
    expectedScripts: {
      "etl:prepare:ny": "node scripts/reconcile-ny-monroe-sources.mjs && node scripts/normalize-ny-local-review.mjs",
    },
    steps: [
      nodeStep("Reconcile New York Monroe sources", "scripts/reconcile-ny-monroe-sources.mjs"),
      nodeStep("Normalize New York local review rows", "scripts/normalize-ny-local-review.mjs"),
    ],
  },
  RI: {
    expectedScripts: { "etl:prepare:ri": "node scripts/normalize-ri-boe-results.mjs" },
    steps: [nodeStep("Normalize Rhode Island BOE results", "scripts/normalize-ri-boe-results.mjs")],
  },
  TN: {
    expectedScripts: {
      "etl:prepare:tn": "node scripts/normalize-tn-sos-results.mjs && node scripts/normalize-tn-historical-presidential-baseline.mjs",
    },
    steps: [
      nodeStep("Normalize Tennessee SOS results", "scripts/normalize-tn-sos-results.mjs"),
      nodeStep("Normalize Tennessee historical baseline", "scripts/normalize-tn-historical-presidential-baseline.mjs"),
    ],
  },
  WV: {
    expectedScripts: { "etl:prepare:wv": "node scripts/collect-wv-clarity-county-reports.mjs" },
    steps: [nodeStep("Collect West Virginia Clarity county reports", "scripts/collect-wv-clarity-county-reports.mjs")],
  },
};

const SPECIAL_VALIDATE_STATES = new Set(["AL", "CA", "DC", "IA", "KY", "MO", "ND", "NJ", "RI", "TN", "WV"]);
const SPECIAL_IMPORT_STATES = new Set(["AL", "CA", "DC", "IA", "KY", "MO", "ND", "NH", "NJ", "NY", "RI", "TN", "WV"]);

const SPECIAL_TOP_LEVEL_SCRIPTS: Record<WorkflowKind, Record<string, string>> = {
  validate: {
    AL: "npm run etl:prepare:al && python -m civic_etl.cli validate --config etl/state-configs/al.json",
    CA: "npm run etl:prepare:ca && python -m civic_etl.cli validate --config etl/state-configs/ca.json",
    DC: "npm run etl:prepare:dc && python -m civic_etl.cli validate --config etl/state-configs/dc.json",
    IA: "npm run etl:prepare:ia && python -m civic_etl.cli validate --config etl/state-configs/ia.json",
    KY: "npm run etl:prepare:ky && npm run etl:reconcile:ky:turnout && python -m civic_etl.cli validate --config etl/state-configs/ky.json",
    MO: "npm run etl:prepare:mo && python -m civic_etl.cli validate --config etl/state-configs/mo.json",
    ND: "npm run etl:collect:nd && python -m civic_etl.cli validate --config etl/state-configs/nd.json",
    NJ: "npm run etl:prepare:nj && python -m civic_etl.cli validate --config etl/state-configs/nj.json",
    RI: "npm run etl:prepare:ri && python -m civic_etl.cli validate --config etl/state-configs/ri.json",
    TN: "npm run etl:prepare:tn && python -m civic_etl.cli validate --config etl/state-configs/tn.json",
    WV: "npm run etl:prepare:wv && python -m civic_etl.cli validate --config etl/state-configs/wv.json",
  },
  import: {
    AL: "npm run etl:prepare:al && python -m civic_etl.cli import --config etl/state-configs/al.json --out .etl/staging",
    CA: "npm run etl:prepare:ca && python -m civic_etl.cli import --config etl/state-configs/ca.json --out .etl/staging",
    DC: "npm run etl:prepare:dc && python -m civic_etl.cli import --config etl/state-configs/dc.json --out .etl/staging",
    IA: "npm run etl:prepare:ia && python -m civic_etl.cli import --config etl/state-configs/ia.json --out .etl/staging",
    KY: "npm run etl:prepare:ky && npm run etl:reconcile:ky:turnout && python -m civic_etl.cli import --config etl/state-configs/ky.json --out .etl/staging",
    MO: "npm run etl:prepare:mo && python -m civic_etl.cli import --config etl/state-configs/mo.json --out .etl/staging",
    ND: "npm run etl:collect:nd && python -m civic_etl.cli import --config etl/state-configs/nd.json --out .etl/staging",
    NH: "npm run etl:prepare:nh && python -m civic_etl.cli import --config etl/state-configs/nh.json --out .etl/staging",
    NJ: "npm run etl:prepare:nj && python -m civic_etl.cli import --config etl/state-configs/nj.json --out .etl/staging",
    NY: "npm run etl:prepare:ny && python -m civic_etl.cli import --config etl/state-configs/ny.json --out .etl/staging",
    RI: "npm run etl:prepare:ri && python -m civic_etl.cli import --config etl/state-configs/ri.json --out .etl/staging",
    TN: "npm run etl:prepare:tn && python -m civic_etl.cli import --config etl/state-configs/tn.json --out .etl/staging",
    WV: "npm run etl:prepare:wv && python -m civic_etl.cli import --config etl/state-configs/wv.json --out .etl/staging",
  },
};

const VALIDATORS: Record<ValidatorName, ValidatorDefinition> = {
  "admin-packages": singleValidator("validate:admin-packages", "node scripts/validate-admin-source-packages.mjs", nodeStep("Validate admin source packages", "scripts/validate-admin-source-packages.mjs")),
  "electronic-integrity": singleValidator("validate:electronic-integrity", "node scripts/validate-electronic-integrity-artifacts.mjs", nodeStep("Validate electronic-integrity artifacts", "scripts/validate-electronic-integrity-artifacts.mjs")),
  "electronic-integrity-requests": singleValidator("validate:electronic-integrity-requests", "node scripts/sync-electronic-integrity-request-operations.mjs --dry-run", nodeStep("Dry-run electronic-integrity request sync", "scripts/sync-electronic-integrity-request-operations.mjs", "--dry-run")),
  "equipment-catalog": singleValidator("validate:equipment-catalog", "node scripts/validate-equipment-catalog.mjs", nodeStep("Validate equipment catalog", "scripts/validate-equipment-catalog.mjs")),
  "equipment-editorial": singleValidator("validate:equipment-editorial", "node scripts/validate-equipment-editorial-workflow.mjs", nodeStep("Validate equipment editorial workflow", "scripts/validate-equipment-editorial-workflow.mjs")),
  "equipment-production": singleValidator("validate:equipment-production", "node scripts/validate-production-equipment.mjs", nodeStep("Validate production equipment", "scripts/validate-production-equipment.mjs")),
  "jurisdiction-tags": singleValidator("jurisdictions:validate", "node --experimental-strip-types scripts/validate-jurisdiction-tags.mjs", nodeStep("Validate jurisdiction tags", "--experimental-strip-types", "scripts/validate-jurisdiction-tags.mjs")),
  maps: {
    expectedScripts: {
      "validate:map-geometry": "node scripts/validate-map-geometry-coverage.mjs",
      "validate:maps": "npm run validate:map-geometry && node scripts/validate-production-map-joins.mjs",
    },
    steps: [
      nodeStep("Validate map geometry coverage", "scripts/validate-map-geometry-coverage.mjs"),
      nodeStep("Validate production map joins", "scripts/validate-production-map-joins.mjs"),
    ],
  },
  provenance: singleValidator("validate:provenance", "node scripts/validate-production-provenance.mjs", nodeStep("Validate production provenance", "scripts/validate-production-provenance.mjs")),
  "security-incidents": singleValidator("validate:security-incidents", "node scripts/validate-security-incidents.mjs", nodeStep("Validate security incident registry", "scripts/validate-security-incidents.mjs")),
  "source-acquisition-tiers": singleValidator("validate:source-acquisition-tiers", "node scripts/validate-source-acquisition-tiers.mjs", nodeStep("Validate source acquisition tiers", "scripts/validate-source-acquisition-tiers.mjs")),
  "source-packages": singleValidator("validate:source-packages", "node scripts/validate-native-source-packages.mjs", nodeStep("Validate native source packages", "scripts/validate-native-source-packages.mjs")),
  "source-records-requests": singleValidator("validate:source-records-requests", "node scripts/sync-source-records-request-operations.mjs --dry-run", nodeStep("Dry-run source-record request sync", "scripts/sync-source-records-request-operations.mjs", "--dry-run")),
  "turnout-packages": singleValidator("validate:turnout-packages", "node scripts/validate-turnout-source-packages.mjs", nodeStep("Validate turnout source packages", "scripts/validate-turnout-source-packages.mjs")),
};

function singleValidator(script: string, expected: string, step: WorkflowStep): ValidatorDefinition {
  return { expectedScripts: { [script]: expected }, steps: [step] };
}

export function directStateStep(kind: WorkflowKind, state: string): WorkflowStep {
  const lower = state.toLowerCase();
  return kind === "validate"
    ? pythonStep(`Validate ${state} ETL config`, "-m", "civic_etl.cli", "validate", "--config", `etl/state-configs/${lower}.json`)
    : pythonStep(`Import ${state} staging artifact`, "-m", "civic_etl.cli", "import", "--config", `etl/state-configs/${lower}.json`, "--out", ".etl/staging");
}

export function canonicalStateScript(kind: WorkflowKind, state: string): string {
  const lower = state.toLowerCase();
  return kind === "validate"
    ? `python -m civic_etl.cli validate --config etl/state-configs/${lower}.json`
    : `python -m civic_etl.cli import --config etl/state-configs/${lower}.json --out .etl/staging`;
}

export function resolveStateWorkflow(
  kind: WorkflowKind,
  state: string,
  mode: WorkflowMode,
  scripts: Record<string, string>,
): ResolvedWorkflow {
  const upper = state.toUpperCase();
  const packageScript = `etl:${kind}:${upper.toLowerCase()}`;
  if (mode === "config-only") {
    return { drift: [], kind, mode, packageScripts: [], state: upper, steps: [directStateStep(kind, upper)] };
  }

  const specialStates = kind === "validate" ? SPECIAL_VALIDATE_STATES : SPECIAL_IMPORT_STATES;
  if (!specialStates.has(upper)) {
    const actual = scripts[packageScript];
    const expected = canonicalStateScript(kind, upper);
    const drift = actual != null && actual !== expected
      ? [{ actual, expected, script: packageScript, severity: "blocking" as const }]
      : [];
    return { drift, kind, mode, packageScripts: actual == null ? [] : [packageScript], state: upper, steps: [directStateStep(kind, upper)] };
  }

  const preparation = STATE_PREPARATIONS[upper];
  const expectedScripts = {
    ...preparation.expectedScripts,
    [packageScript]: SPECIAL_TOP_LEVEL_SCRIPTS[kind][upper],
  };
  return {
    drift: compareExpectedScripts(expectedScripts, scripts),
    kind,
    mode,
    packageScripts: Object.keys(expectedScripts).sort(),
    state: upper,
    steps: [...preparation.steps, directStateStep(kind, upper)],
  };
}

export function resolveValidatorWorkflow(validator: ValidatorName, scripts: Record<string, string>): ResolvedWorkflow {
  const definition = VALIDATORS[validator];
  return {
    drift: compareExpectedScripts(definition.expectedScripts, scripts),
    kind: "validator",
    mode: "registered",
    packageScripts: Object.keys(definition.expectedScripts).sort(),
    steps: definition.steps,
    validator,
  };
}

export function collectWorkflowDrift(scripts: Record<string, string>, states: string[]): WorkflowDrift[] {
  const drift: WorkflowDrift[] = [];
  for (const state of states) {
    drift.push(...resolveStateWorkflow("validate", state, "full", scripts).drift);
    drift.push(...resolveStateWorkflow("import", state, "full", scripts).drift);
  }
  for (const validator of Object.keys(VALIDATORS) as ValidatorName[]) {
    drift.push(...resolveValidatorWorkflow(validator, scripts).drift);
  }
  return deduplicateDrift(drift);
}

export function registeredSpecialStates() {
  return {
    import: Array.from(SPECIAL_IMPORT_STATES).sort(),
    validate: Array.from(SPECIAL_VALIDATE_STATES).sort(),
  };
}

export function validatorNames(): ValidatorName[] {
  return Object.keys(VALIDATORS).sort() as ValidatorName[];
}

export function unregisteredWorkflowScripts(scripts: Record<string, string>, states: string[]): string[] {
  const registered = new Set<string>();
  for (const state of states) {
    for (const kind of ["validate", "import"] as const) {
      for (const script of resolveStateWorkflow(kind, state, "full", scripts).packageScripts) registered.add(script);
    }
  }
  for (const validator of Object.keys(VALIDATORS) as ValidatorName[]) {
    for (const script of resolveValidatorWorkflow(validator, scripts).packageScripts) registered.add(script);
  }
  return Object.keys(scripts)
    .filter((name) => /^etl:(?:validate|import):/.test(name) || /^validate:/.test(name) || name === "jurisdictions:validate")
    .filter((name) => !registered.has(name))
    .sort();
}


function compareExpectedScripts(expected: Record<string, string>, actual: Record<string, string>): WorkflowDrift[] {
  return Object.entries(expected)
    .filter(([name, value]) => actual[name] !== value)
    .map(([script, value]) => ({ actual: actual[script] ?? null, expected: value, script, severity: "blocking" }));
}

function deduplicateDrift(drift: WorkflowDrift[]): WorkflowDrift[] {
  return Array.from(new Map(drift.map((entry) => [`${entry.script}:${entry.expected}`, entry])).values())
    .sort((left, right) => left.script.localeCompare(right.script));
}
