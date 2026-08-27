import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DEFAULT_STOPPING_RULE, evaluateStoppingRule, runExperimentMonitoring, stoppingRuleSchema, STOPPING_RULE_SCHEMA_VERSION, validateStoppingRule, WebhookNotifier } from "../src/lib/monitoring.js";

const baseExperiment = {
  id: "exp_monitoring",
  createdAt: "2026-08-25T00:00:00.000Z",
  metricContract: { practicalSignificanceThreshold: 0.03, guardrails: { maxSrmPValue: 0.01 } },
  stoppingRule: { ...DEFAULT_STOPPING_RULE },
};

function analysis({ exposures = 2000, probability = 0.98, relativeUplift = 0.1, srmPValue = 0.2 } = {}) {
  return {
    ready: true,
    ingestion: { exposures, variants: { control: exposures / 2, treatment: exposures / 2 } },
    result: { conversion: { probabilityTreatmentBetter: probability, relativeUplift }, srm: { pValue: srmPValue } },
  };
}

test("stops for treatment only after all configured gates pass", () => {
  const evaluation = evaluateStoppingRule({ experiment: baseExperiment, analysis: analysis(), now: "2026-08-27T00:00:00.000Z" });
  assert.equal(evaluation.schemaVersion, "evidence-console.monitoring/v1");
  assert.equal(evaluation.status, "stopped");
  assert.equal(evaluation.decision, "ship_treatment");
  assert.equal(evaluation.sample.sampleSizeSource, "persisted exposures");
  assert.equal(evaluation.checks.treatmentBenefit.pass, true);
  assert.equal(evaluation.blockingReasons.length, 0);
});

test("continues when sample or minimum runtime is not ready", () => {
  const evaluation = evaluateStoppingRule({ experiment: baseExperiment, analysis: analysis({ exposures: 200 }), now: "2026-08-25T01:00:00.000Z" });
  assert.equal(evaluation.status, "running");
  assert.equal(evaluation.decision, "continue");
  assert.ok(evaluation.blockingReasons.includes("minimum_sample_not_reached"));
  assert.ok(evaluation.blockingReasons.includes("minimum_runtime_not_reached"));
});

test("blocks when SRM fails and can stop for control on credible harm", () => {
  const blocked = evaluateStoppingRule({ experiment: baseExperiment, analysis: analysis({ srmPValue: 0.001 }), now: "2026-08-27T00:00:00.000Z" });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.decision, "hold");
  assert.ok(blocked.blockingReasons.includes("srm_failed"));

  const controlWins = evaluateStoppingRule({ experiment: baseExperiment, analysis: analysis({ probability: 0.02, relativeUplift: -0.1 }), now: "2026-08-27T00:00:00.000Z" });
  assert.equal(controlWins.status, "stopped");
  assert.equal(controlWins.decision, "keep_control");
});

test("builds and delivers a deduplicable alert", async () => {
  const sent = [];
  const result = await runExperimentMonitoring({ experiment: baseExperiment, analysis: analysis(), now: "2026-08-27T00:00:00.000Z", notifier: { send: async (alert) => sent.push(alert) } });
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].schemaVersion, "evidence-console.alert/v1");
  assert.equal(result.alerts[0].fingerprint, "exp_monitoring:stopped:ship_treatment");
  assert.deepEqual(result.notifications, { status: "sent", attempted: 1, sent: 1, failures: [] });
  assert.equal(sent[0].title, "Stopping rule met: ship_treatment");
});

test("validates stopping rule schema and webhook delivery", async () => {
  assert.equal(validateStoppingRule({ ...DEFAULT_STOPPING_RULE }).valid, true);
  assert.equal(validateStoppingRule({ ...DEFAULT_STOPPING_RULE, maximumRuntimeHours: 12 }).valid, false);
  const canonicalSchema = JSON.parse(await fs.readFile(new URL("../schemas/stopping-rule.v1.json", import.meta.url), "utf8"));
  assert.deepEqual(stoppingRuleSchema, canonicalSchema);
  assert.equal(stoppingRuleSchema.properties.schemaVersion.const, STOPPING_RULE_SCHEMA_VERSION);

  let request;
  const notifier = new WebhookNotifier({ url: "https://alerts.example.test/hook", fetchImpl: async (...args) => { request = args; return { ok: true, status: 202 }; } });
  await notifier.send({ fingerprint: "alert-1" });
  assert.equal(request[0], "https://alerts.example.test/hook");
  assert.equal(request[1].method, "POST");
  assert.equal(JSON.parse(request[1].body).schemaVersion, "evidence-console.alert/v1");
});
