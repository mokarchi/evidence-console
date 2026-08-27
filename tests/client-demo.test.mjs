import test from "node:test";
import assert from "node:assert/strict";
import { buildClientDemo } from "../src/lib/clientDemo.js";

test("builds the complete frontend-only demo without an API", async () => {
  const demo = await buildClientDemo();
  assert.equal(demo.experiment.id, "exp_20260811_01");
  assert.equal(demo.ingestion.assignments, 8);
  assert.equal(demo.ingestion.exposures, 8);
  assert.equal(demo.ingestion.outcomes, 40);
  assert.equal(demo.analysis.result.survivalLtv.uncertainty.draws, 1000);
  assert.equal(demo.segmentAnalysis.testedSegments, 2);
  assert.equal(demo.monitor.evaluation.status, "running");
  assert.equal(demo.monitor.evaluation.decision, "continue");
});
