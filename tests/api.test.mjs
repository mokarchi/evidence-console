import test from "node:test";
import assert from "node:assert/strict";
import { ExperimentStore, handleApiRequest } from "../src/lib/api.js";
import { demoExperiment } from "../src/data/demoExperiment.js";

const contract = demoExperiment.metricContract;

function request(path, options = {}) {
  return new Request(`https://example.test${path}`, { headers: { "content-type": "application/json" }, ...options });
}

test("creates an experiment and persists deterministic assignment", async () => {
  const store = new ExperimentStore();
  const createdResponse = await handleApiRequest(request("/api/experiments", { method: "POST", body: JSON.stringify({ name: "Checkout", metricContract: contract }) }), store);
  assert.equal(createdResponse.status, 201);
  const { experiment } = await createdResponse.json();
  assert.equal(experiment.metricContract.schemaVersion, "evidence-console.metric-contract/v1");

  const first = await handleApiRequest(request(`/api/experiments/${experiment.id}/assign`, { method: "POST", body: JSON.stringify({ subjectId: "user_1" }) }), store);
  const second = await handleApiRequest(request(`/api/experiments/${experiment.id}/assign`, { method: "POST", body: JSON.stringify({ subjectId: "user_1" }) }), store);
  const firstAssignment = await first.json();
  const secondAssignment = await second.json();
  assert.equal(firstAssignment.assignment.variant, secondAssignment.assignment.variant);
  assert.equal(firstAssignment.assignment.id, secondAssignment.assignment.id);
});

test("serves the machine-readable metric contract schema", async () => {
  const response = await handleApiRequest(request("/api/metric-contract/schema"));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.schema.$id, "https://raw.githubusercontent.com/mokarchi/evidence-console/main/schemas/metric-contract.v1.json");
  assert.equal(payload.schema.properties.schemaVersion.const, "evidence-console.metric-contract/v1");
  assert.ok(payload.schema.required.includes("guardrails"));
});

test("serves the stopping rule schema and evaluates experiment monitoring", async () => {
  const schemaResponse = await handleApiRequest(request("/api/stopping-rule/schema"));
  const schemaPayload = await schemaResponse.json();
  assert.equal(schemaResponse.status, 200);
  assert.equal(schemaPayload.schema.properties.schemaVersion.const, "evidence-console.stopping-rule/v1");

  const store = new ExperimentStore([{ ...demoExperiment, id: "exp_monitor_api", createdAt: "2026-08-25T00:00:00.000Z" }]);
  const response = await handleApiRequest(request("/api/experiments/exp_monitor_api/monitor?now=2026-08-27T00:00:00.000Z"), store);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.monitor.schemaVersion, "evidence-console.monitoring/v1");
  assert.equal(payload.monitor.evaluation.status, "stopped");
  assert.equal(payload.monitor.evaluation.decision, "ship_treatment");
  assert.equal(payload.monitor.alerts[0].type, "stopping_rule");
});

test("records idempotent exposure and outcome events", async () => {
  const store = new ExperimentStore([{ id: "exp_api", name: "API test", metricContract: contract }]);
  const exposurePayload = JSON.stringify({ subjectId: "user_2", eventName: "checkout_view" });
  const firstExposure = await handleApiRequest(request("/api/experiments/exp_api/exposure", { method: "POST", body: exposurePayload }), store);
  const secondExposure = await handleApiRequest(request("/api/experiments/exp_api/exposure", { method: "POST", body: exposurePayload }), store);
  const first = await firstExposure.json();
  const second = await secondExposure.json();
  assert.equal(first.exposure.id, second.exposure.id);

  const outcome = await handleApiRequest(request("/api/experiments/exp_api/outcome", { method: "POST", body: JSON.stringify({ subjectId: "user_2", metric: "purchase_conversion", value: 1 }) }), store);
  assert.equal(outcome.status, 201);
  assert.equal((await outcome.json()).outcome.variant, first.exposure.variant);
});

test("returns analysis from configured aggregates and ingestion counts", async () => {
  const store = new ExperimentStore([{ ...demoExperiment, id: "exp_analysis", name: "Analysis API" }]);
  await handleApiRequest(request("/api/experiments/exp_analysis/exposure", { method: "POST", body: JSON.stringify({ subjectId: "user_3" }) }), store);
  const response = await handleApiRequest(request("/api/experiments/exp_analysis/analysis"), store);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.analysis.ready, true);
  assert.equal(payload.analysis.ingestion.exposures, 1);
  assert.equal(Number(payload.analysis.result.ltv.contribution.control.toFixed(2)), 72.17);
});

test("returns useful validation errors", async () => {
  const store = new ExperimentStore();
  const response = await handleApiRequest(request("/api/experiments", { method: "POST", body: JSON.stringify({ name: "Missing contract" }) }), store);
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.match(payload.error, /metricContract is incomplete/);
});

test("imports CSV assignment, exposure, and outcome events", async () => {
  const store = new ExperimentStore([{ id: "exp_import", name: "Import test", metricContract: contract }]);
  const csv = [
    "type,subject_id,event_name,metric,value,period,censored,occurred_at",
    "assignment,user_csv_1,,,,,,2026-08-25T09:00:00.000Z",
    "exposure,user_csv_1,checkout_view,,,,,2026-08-25T09:01:00.000Z",
    "outcome,user_csv_1,,purchase_conversion,1,1,false,2026-08-25T09:10:00.000Z",
  ].join("\n");
  const response = await handleApiRequest(request("/api/experiments/exp_import/import", { method: "POST", body: JSON.stringify({ format: "csv", data: csv }) }), store);
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.deepEqual(payload.result, { received: 3, accepted: 3, skipped: 0, errors: [] });
  const summary = await handleApiRequest(request("/api/experiments/exp_import"), store);
  assert.equal((await summary.json()).experiment.ingestion.outcomes, 1);
  assert.equal(store.getOutcomeRecords("exp_import")[0].period, 1);
  assert.equal(store.getOutcomeRecords("exp_import")[0].censored, false);
});

test("derives survival LTV from raw retention and contribution events", async () => {
  const store = new ExperimentStore([{ id: "exp_survival", name: "Survival test", metricContract: contract }]);
  const findSubject = (variant, prefix) => {
    for (let index = 1; index <= 100; index += 1) {
      const subjectId = `${prefix}_${index}`;
      if (store.assign("exp_survival", subjectId).variant === variant) return subjectId;
    }
    throw new Error(`Could not find ${variant} assignment`);
  };
  const subjects = {
    control: [findSubject("control", "control_a"), findSubject("control", "control_b")],
    treatment: [findSubject("treatment", "treatment_a"), findSubject("treatment", "treatment_b")],
  };
  const events = Object.entries(subjects).flatMap(([variant, ids]) => ids.flatMap((subjectId, index) => [
    { type: "exposure", subjectId, eventName: "checkout_view" },
    { type: "outcome", id: `${variant}_${index}_retention_1`, subjectId, metric: "retention", value: 1, period: 1, dimensions: { device: index === 0 ? "mobile" : "desktop" } },
    { type: "outcome", id: `${variant}_${index}_contribution_1`, subjectId, metric: "contribution_margin", value: 10, period: 1, dimensions: { device: index === 0 ? "mobile" : "desktop" } },
    { type: "outcome", id: `${variant}_${index}_retention_2`, subjectId, metric: "retention", value: variant === "control" && index === 0 ? 0 : 1, period: 2, censored: variant !== "control" || index === 1, dimensions: { device: index === 0 ? "mobile" : "desktop" } },
    { type: "outcome", id: `${variant}_${index}_contribution_2`, subjectId, metric: "contribution_margin", value: variant === "control" ? 6 : 8, period: 2, dimensions: { device: index === 0 ? "mobile" : "desktop" } },
  ]));
  const importResponse = await handleApiRequest(request("/api/experiments/exp_survival/import", { method: "POST", body: JSON.stringify({ events }) }), store);
  assert.equal(importResponse.status, 201);
  assert.equal((await importResponse.json()).result.accepted, events.length);

  const response = await handleApiRequest(request("/api/experiments/exp_survival/analysis"), store);
  const payload = await response.json();
  assert.equal(payload.analysis.ready, true);
  assert.equal(payload.analysis.mode, "event-derived");
  assert.equal(payload.analysis.result.survivalLtv.control.ltv, 13);
  assert.equal(payload.analysis.result.survivalLtv.treatment.ltv, 18);
  assert.equal(payload.analysis.result.survivalLtv.difference, 5);
  assert.equal(payload.analysis.result.survivalLtv.uncertainty.method, "subject-level bootstrap");
  assert.equal(payload.analysis.result.survivalLtv.uncertainty.draws, 1000);
  assert.equal(payload.analysis.result.survivalLtv.uncertainty.difference.interval.length, 2);

  const segmentResponse = await handleApiRequest(request("/api/experiments/exp_survival/segments?field=device"), store);
  const segmentPayload = await segmentResponse.json();
  assert.equal(segmentResponse.status, 200);
  assert.equal(segmentPayload.analysis.field, "device");
  assert.equal(segmentPayload.analysis.correction, "Benjamini-Hochberg");
  assert.equal(segmentPayload.analysis.testedSegments, 2);
  assert.equal(segmentPayload.analysis.segments.length, 2);
  assert.ok(segmentPayload.analysis.segments.every((segment) => Number.isFinite(segment.adjustedPValue)));

  const ambiguousSubject = findSubject("control", "ambiguous");
  const ambiguousEvents = [
    { type: "outcome", id: "ambiguous_retention_1", subjectId: ambiguousSubject, metric: "retention", value: 1, period: 1, dimensions: { device: "mobile" } },
    { type: "outcome", id: "ambiguous_contribution_1", subjectId: ambiguousSubject, metric: "contribution_margin", value: 10, period: 1, dimensions: { device: "mobile" } },
    { type: "outcome", id: "ambiguous_retention_2", subjectId: ambiguousSubject, metric: "retention", value: 1, period: 2, dimensions: { device: "desktop" } },
    { type: "outcome", id: "ambiguous_contribution_2", subjectId: ambiguousSubject, metric: "contribution_margin", value: 10, period: 2, dimensions: { device: "desktop" } },
  ];
  await handleApiRequest(request("/api/experiments/exp_survival/import", { method: "POST", body: JSON.stringify({ events: ambiguousEvents }) }), store);
  const afterAmbiguous = await handleApiRequest(request("/api/experiments/exp_survival/segments?field=device"), store);
  assert.equal((await afterAmbiguous.json()).analysis.excludedAmbiguousSubjects, 1);

  const reportResponse = await handleApiRequest(request("/api/experiments/exp_survival/report?format=md&segmentField=device"), store);
  const reportMarkdown = await reportResponse.text();
  assert.equal(reportResponse.status, 200);
  assert.match(reportMarkdown, /## Segment analysis/);
  assert.match(reportMarkdown, /Benjamini-Hochberg/);
});

test("returns JSON and Markdown reports", async () => {
  const store = new ExperimentStore([{ ...demoExperiment, id: "exp_report" }]);
  const jsonResponse = await handleApiRequest(request("/api/experiments/exp_report/report"), store);
  const jsonPayload = await jsonResponse.json();
  assert.equal(jsonResponse.status, 200);
  assert.equal(jsonPayload.report.schemaVersion, "evidence-console.report/v1");
  assert.equal(jsonPayload.report.metricContractSchemaVersion, "evidence-console.metric-contract/v1");
  assert.equal(jsonPayload.report.experiment.stoppingRule.schemaVersion, "evidence-console.stopping-rule/v1");
  assert.equal(jsonPayload.report.analysis.ltv.contribution.control.toFixed(2), "72.17");

  const markdownResponse = await handleApiRequest(request("/api/experiments/exp_report/report?format=md"), store);
  const markdown = await markdownResponse.text();
  assert.equal(markdownResponse.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.match(markdown, /## Metric contract/);
  assert.match(markdown, /evidence-console\.metric-contract\/v1/);
  assert.match(markdown, /Contribution LTV/);
});
