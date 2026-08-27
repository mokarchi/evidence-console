import test from "node:test";
import assert from "node:assert/strict";
import { analyzeExperiment } from "../src/lib/experiment.js";
import { demoExperiment } from "../src/data/demoExperiment.js";
import { buildExperimentReport, renderMarkdownReport } from "../src/lib/report.js";

test("creates a deterministic report envelope", () => {
  const report = buildExperimentReport({
    experiment: demoExperiment,
    analysis: { ready: true, ingestion: { assignments: 3, exposures: 3, outcomes: 3, variants: { control: 2, treatment: 1 }, outcomeMetrics: ["purchase_conversion"] }, result: analyzeExperiment(demoExperiment) },
    generatedAt: "2026-08-27T00:00:00.000Z",
  });
  assert.equal(report.schemaVersion, "evidence-console.report/v1");
  assert.equal(report.generatedAt, "2026-08-27T00:00:00.000Z");
  assert.equal(report.reproducibility.bayesianSeed, demoExperiment.conversion.seed);
});

test("renders a report with auditable metric and analysis sections", () => {
  const report = buildExperimentReport({
    experiment: demoExperiment,
    analysis: { ready: true, ingestion: { assignments: 0, exposures: 0, outcomes: 0, variants: { control: 0, treatment: 0 }, outcomeMetrics: [] }, result: analyzeExperiment(demoExperiment) },
    generatedAt: "2026-08-27T00:00:00.000Z",
  });
  const markdown = renderMarkdownReport(report);
  assert.match(markdown, /# Experiment report: Checkout Redesign v1/);
  assert.match(markdown, /AOV/);
  assert.match(markdown, /Bayesian P\(Treatment > Control\)/);
  assert.match(markdown, /Raw event data: not included/);
});
