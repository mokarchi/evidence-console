import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { analyzeExperiment, assignVariant, validateMetricContract } from "../src/lib/experiment.js";
import { analyzeBinary, calculateSrm, sampleBeta } from "../src/lib/statistics.js";
import { METRIC_CONTRACT_SCHEMA_VERSION, metricContractSchema, normalizeMetricContract } from "../src/lib/metricContract.js";
import { demoExperiment } from "../src/data/demoExperiment.js";

test("assigns the same subject deterministically", () => {
  const first = assignVariant({ subjectId: "user_123", experimentId: "exp_checkout" });
  const second = assignVariant({ subjectId: "user_123", experimentId: "exp_checkout" });
  assert.equal(first, second);
  assert.ok(["control", "treatment"].includes(first));
});

test("detects an invalid metric contract", () => {
  const result = validateMetricContract({ name: "Incomplete" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("unit is required"));
});

test("normalizes and validates the versioned metric contract schema", async () => {
  const legacy = { ...demoExperiment.metricContract };
  delete legacy.schemaVersion;
  delete legacy.guardrails;
  const normalized = normalizeMetricContract(legacy);
  const result = validateMetricContract(normalized);
  assert.equal(normalized.schemaVersion, METRIC_CONTRACT_SCHEMA_VERSION);
  assert.deepEqual(normalized.guardrails, { minSampleRatio: 0.8, maxSrmPValue: 0.01 });
  assert.equal(result.valid, true);
  assert.equal(metricContractSchema.properties.schemaVersion.const, METRIC_CONTRACT_SCHEMA_VERSION);
  const canonicalSchema = JSON.parse(await fs.readFile(new URL("../schemas/metric-contract.v1.json", import.meta.url), "utf8"));
  assert.deepEqual(metricContractSchema, canonicalSchema);
});

test("rejects invalid metric contract types and ranges", () => {
  const result = validateMetricContract({ ...demoExperiment.metricContract, primary: "yes", minimumDetectableEffect: -0.1, guardrails: { minSampleRatio: 1.2, maxSrmPValue: 0 } });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("primary must be a boolean"));
  assert.ok(result.errors.includes("minimumDetectableEffect must be a number greater than or equal to 0"));
  assert.ok(result.errors.includes("guardrails.minSampleRatio must be greater than 0 and less than or equal to 1"));
});

test("calculates a passing sample ratio mismatch check", () => {
  const result = calculateSrm({ controlCount: 1000, treatmentCount: 1005 });
  assert.equal(result.pass, true);
  assert.ok(result.pValue > 0.01);
});

test("calculates deterministic Bayesian probability for binary outcomes", () => {
  const result = analyzeBinary({ control: { successes: 42, total: 100 }, treatment: { successes: 58, total: 100 }, samples: 5000, seed: 7 });
  assert.ok(result.probabilityTreatmentBetter > 0.95);
  assert.ok(result.relativeUplift > 0);
  assert.ok(result.pValue < 0.05);
});

test("samples a beta distribution within its support", () => {
  const result = sampleBeta(2, 5, () => 0.4);
  assert.ok(result > 0 && result < 1);
});

test("builds the complete demo experiment analysis", () => {
  const result = analyzeExperiment(demoExperiment);
  assert.equal(result.contractStatus.valid, true);
  assert.equal(Number(result.ltv.contribution.control.toFixed(2)), 72.17);
  assert.equal(Number(result.ltv.contribution.treatment.toFixed(2)), 79.5);
  assert.ok(result.srm.pass);
});
