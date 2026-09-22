import assert from "node:assert/strict";
import test from "node:test";
import { buildModelValidation, MODEL_VALIDATION_CONFIRMATION, experimentalModelWarning, modelValidationStep, validateModelValidationInput } from "../../tools/civicresultmaps-mcp/model-validation.ts";
import { createRuntimeContext } from "../../tools/civicresultmaps-mcp/runtime.ts";

test("synthetic model-validation contract is narrow and cannot select a model or outcome target", () => {
  const input = validateModelValidationInput({ states: ["wi", "MN"], confirmation: MODEL_VALIDATION_CONFIRMATION });
  assert.deepEqual(input, { states: ["WI", "MN"], seed: 20260908, confirmation: MODEL_VALIDATION_CONFIRMATION });
  assert.deepEqual(modelValidationStep(input).args, ["-m", "civic_etl.model_validation", "--states", "WI,MN", "--seed", "20260908"]);
  assert.match(experimentalModelWarning(), /no actual election results are fitted/i);
  for (const invalid of [
    { states: [], confirmation: MODEL_VALIDATION_CONFIRMATION }, { states: ["WI", "WI"], confirmation: MODEL_VALIDATION_CONFIRMATION },
    { states: ["../"], confirmation: MODEL_VALIDATION_CONFIRMATION }, { states: ["WI"], seed: -1, confirmation: MODEL_VALIDATION_CONFIRMATION },
    { states: ["WI"], confirmation: "wrong" }, { states: ["WI"], confirmation: MODEL_VALIDATION_CONFIRMATION, model: "arbitrary" },
  ]) assert.throws(() => validateModelValidationInput(invalid));
});

test("fixed runner produces an audited synthetic-QA/readiness report in the real repository", async () => {
  const { report, run } = await buildModelValidation(createRuntimeContext(), { states: ["WI"], seed: 7, confirmation: MODEL_VALIDATION_CONFIRMATION });
  assert.equal(run.reference.status, "passed");
  assert.equal(report.experimental, true);
  assert.equal(report.publicationEligible, false);
  assert.equal(report.electionForecastingSupported, false);
  assert.ok("syntheticQa" in report);
  assert.ok("dataReadiness" in report);
  assert.doesNotMatch(JSON.stringify(report), /demVotes|repVotes|candidate|party/i);
});
