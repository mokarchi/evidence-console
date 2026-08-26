import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExperiment, assignVariant, validateMetricContract } from "../src/lib/experiment.js";
import { analyzeBinary, calculateSrm, sampleBeta } from "../src/lib/statistics.js";
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
