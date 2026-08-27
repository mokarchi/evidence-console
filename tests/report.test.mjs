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

test("renders a report for event-derived survival LTV", () => {
  const report = buildExperimentReport({
    experiment: { ...demoExperiment, analysisInput: null },
    analysis: {
      ready: true,
      mode: "event-derived",
      ingestion: { assignments: 4, exposures: 4, outcomes: 16, variants: { control: 2, treatment: 2 }, outcomeMetrics: ["retention", "contribution_margin"] },
      result: {
        survivalLtv: {
          control: { ltv: 13, subjectCount: 2, components: [{ period: 1 }, { period: 2 }] },
          treatment: { ltv: 18, subjectCount: 2, components: [{ period: 1 }, { period: 2 }] },
          difference: 5,
          relativeUplift: 5 / 13,
        },
      },
    },
    generatedAt: "2026-08-27T00:00:00.000Z",
  });
  const markdown = renderMarkdownReport(report);
  assert.match(markdown, /Survival-based LTV/);
  assert.match(markdown, /Survival\(t\)/);
  assert.match(markdown, /Raw event data: summarized/);
});
