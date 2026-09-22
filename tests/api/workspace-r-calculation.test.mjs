import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildWorkspaceRCalculationInputs,
  normalizeWorkspaceRResult,
  WORKSPACE_R_MAX_INPUT_BYTES,
  WORKSPACE_R_MAX_INPUT_STRING_LENGTH,
  WORKSPACE_R_MAX_OUTPUT_LABEL_LENGTH,
  WORKSPACE_R_RUNTIME_PUBLIC_PATH,
  WORKSPACE_R_RUNTIME_R_VERSION,
  WORKSPACE_R_RUNTIME_VERSION,
} from "../../src/lib/workspace-r-calculation.ts";
import { workspaceRRuntimeDocument } from "../../src/lib/workspace-r-runtime-document.ts";

const results = [
  {
    jurisdictionCode: "53033",
    jurisdictionName: "King County",
    jurisdictionTag: "county:53033",
    level: "county",
    marginPct: 20,
    marginVotes: 20,
    office: "US President",
    sourceId: "wa-certified",
    state: "WA",
    totalVotes: 100,
    votes: { "Candidate A": 60, "Candidate B": 40 },
    winner: "Candidate A",
    year: 2024,
  },
  {
    jurisdictionCode: "53061",
    jurisdictionName: "Snohomish County",
    jurisdictionTag: "county:53061",
    level: "county",
    marginPct: 10,
    marginVotes: 5,
    office: "US President",
    sourceId: "wa-certified",
    state: "WA",
    totalVotes: 50,
    votes: { "Candidate A": 25, "Candidate B": 25 },
    winner: "Tie",
    year: 2024,
  },
];

test("R inputs expose dedicated full-state and current-view variables", () => {
  const inputs = buildWorkspaceRCalculationInputs(results, {
    fips: "53033",
    mode: "margin",
    state: "WA",
    tab: "map",
    year: 2024,
  });

  assert.deepEqual(inputs.context, {
    fips: "53033",
    inputByteLimit: WORKSPACE_R_MAX_INPUT_BYTES,
    inputBytes: inputs.context.inputBytes,
    inputTruncated: false,
    mode: "margin",
    resultRowCount: 2,
    state: "WA",
    tab: "map",
    truncatedStringCount: 0,
    viewResultRowCount: 1,
    viewVoteRowCount: 2,
    voteRowCount: 4,
    year: 2024,
  });
  assert.deepEqual(inputs.results.jurisdictionName, ["King County", "Snohomish County"]);
  assert.deepEqual(inputs.viewResults.jurisdictionName, ["King County"]);
  assert.deepEqual(inputs.viewVotes.candidate, ["Candidate A", "Candidate B"]);
  assert.deepEqual(inputs.viewVotes.votes, [60, 40]);
  assert.equal(inputs.context.inputBytes, new TextEncoder().encode(JSON.stringify(inputs)).byteLength);
});

test("R inputs use all loaded rows when no geography is selected", () => {
  const inputs = buildWorkspaceRCalculationInputs(results, {
    state: "WA",
    tab: "data",
    year: 2024,
  });
  assert.equal(inputs.context.fips, null);
  assert.equal(inputs.context.viewResultRowCount, inputs.context.resultRowCount);
  assert.equal(inputs.context.viewVoteRowCount, inputs.context.voteRowCount);
});

test("R result normalization supports proof-friendly metric, vector, and table outputs", () => {
  assert.deepEqual(normalizeWorkspaceRResult({
    format: "r-object",
    value: {
      names: ["label", "value", "detail"],
      type: "list",
      values: [
        { type: "character", values: ["Current votes"] },
        { type: "double", values: [100] },
        { type: "character", values: ["Certified result rows"] },
      ],
    },
  }), {
    detail: "Certified result rows",
    kind: "metric",
    label: "Current votes",
    value: 100,
  });

  assert.deepEqual(normalizeWorkspaceRResult({
    format: "r-object",
    value: { names: ["first", "second"], type: "double", values: [1, 2] },
  }), {
    kind: "vector",
    names: ["first", "second"],
    truncated: false,
    values: [1, 2],
  });

  assert.deepEqual(normalizeWorkspaceRResult({
    format: "data-frame",
    rows: [{ county: "King", votes: 100 }, { county: "Snohomish", votes: 50 }],
  }), {
    columns: ["county", "votes"],
    kind: "table",
    rows: [["King", 100], ["Snohomish", 50]],
    truncated: false,
  });
});

test("R inputs enforce per-field and aggregate browser memory bounds", () => {
  const longValue = "x".repeat(WORKSPACE_R_MAX_INPUT_STRING_LENGTH + 200);
  const largeResults = Array.from({ length: 600 }, (_, index) => ({
    ...results[0],
    jurisdictionCode: String(index).padStart(5, "0"),
    jurisdictionName: `${index}-${longValue}`,
    jurisdictionTag: `county:${String(index).padStart(5, "0")}-${longValue}`,
    office: longValue,
    sourceId: longValue,
    winner: longValue,
    votes: Object.fromEntries(Array.from({ length: 20 }, (__, candidateIndex) => [
      `${candidateIndex}-${longValue}`,
      candidateIndex,
    ])),
  }));

  const inputs = buildWorkspaceRCalculationInputs(largeResults, {
    state: longValue,
    tab: longValue,
    year: 2024,
  });

  assert.equal(inputs.context.inputTruncated, true);
  assert.ok(inputs.context.inputBytes <= WORKSPACE_R_MAX_INPUT_BYTES);
  assert.equal(inputs.context.inputBytes, new TextEncoder().encode(JSON.stringify(inputs)).byteLength);
  assert.ok(inputs.context.truncatedStringCount > 0);
  for (const columns of [inputs.results, inputs.viewResults, inputs.votes, inputs.viewVotes]) {
    for (const values of Object.values(columns)) {
      for (const value of values) {
        if (typeof value === "string") assert.ok(value.length <= WORKSPACE_R_MAX_INPUT_STRING_LENGTH);
      }
    }
  }
});

test("R output labels are bounded before rendering", () => {
  const longLabel = "label".repeat(100);
  const normalized = normalizeWorkspaceRResult({
    format: "data-frame",
    rows: [{ [longLabel]: 1 }],
  });
  assert.equal(normalized.kind, "table");
  assert.equal(normalized.columns[0].length, WORKSPACE_R_MAX_OUTPUT_LABEL_LENGTH);
});

test("the browser runtime is pinned, isolated, and syntactically valid", () => {
  assert.equal(WORKSPACE_R_RUNTIME_VERSION, "0.6.0");
  assert.equal(WORKSPACE_R_RUNTIME_R_VERSION, "4.6.0");
  assert.equal(WORKSPACE_R_RUNTIME_PUBLIC_PATH, "/vendor/webr/v0.6.0/");
  const document = workspaceRRuntimeDocument("http://localhost:3000");
  assert.match(document, /http:\/\/localhost:3000\/vendor\/webr\/v0\.6\.0\/webr\.js/);
  assert.match(document, /default-src 'none'; base-uri 'none';/);
  assert.match(document, /connect-src http:\/\/localhost:3000\/vendor\/webr\/v0\.6\.0\//);
  assert.match(document, /script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: http:\/\/localhost:3000\/vendor\/webr\/v0\.6\.0\//);
  assert.match(document, /worker-src blob:/);
  assert.doesNotMatch(document, /webr\.r-wasm\.org/);
  assert.doesNotMatch(document, /loader-fetching|patchedSource|originCheck/);
  assert.match(document, /channelType: ChannelType\.PostMessage/);
  assert.match(document, /new shelter\.REnvironment/);
  assert.match(document, /event\.source !== parent/);
  assert.match(document, /byteLength\(message\.payload\.inputs\) <= MAX_INPUT_BYTES/);
  assert.match(document, /byteLength\(output\) > MAX_OUTPUT_BYTES/);
  assert.throws(() => workspaceRRuntimeDocument("javascript:alert(1)"), /exact HTTP\(S\) parent origin/);

  const script = document.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "the isolated runtime module script should exist");
  assert.doesNotThrow(() => new Function(script));
});

test("the build prepares only the exact lockfile-pinned self-hosted runtime", () => {
  const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  const script = readFileSync("scripts/prepare-browser-r-runtime.mjs", "utf8");
  const locked = packageLock.packages["node_modules/webr"];
  assert.equal(locked.version, WORKSPACE_R_RUNTIME_VERSION);
  assert.equal(locked.integrity, "sha512-M2b8m3/ZBk7XMIR7LD97s5k/9jUla83Z0Hl4b+WnrK7XmSMpZdajCiP3XkSzHKHDUgscHKe+lVUvk3aym8q0bw==");
  assert.match(script, /occurrenceCount !== 1/);
  assert.match(script, /copyFile\(path\.join\(packageRoot, "LICENSE\.md"\), path\.join\(stagingRoot, "LICENSE\.md"\)\)/);
  assert.match(script, /copiedFiles\.push\("LICENSE\.md"\)/);
  assert.match(script, /runtime-manifest\.json/);
  assert.match(script, /createHash\("sha256"\)/);
});
