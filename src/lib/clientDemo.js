import { demoExperiment } from "../data/demoExperiment.js";
import { ExperimentStore } from "./api.js";

const subjects = [
  { id: "demo_seed_1", device: "mobile" },
  { id: "demo_seed_2", device: "mobile" },
  { id: "demo_seed_3", device: "desktop" },
  { id: "demo_seed_4", device: "desktop" },
  { id: "demo_seed_18", device: "mobile" },
  { id: "demo_seed_19", device: "mobile" },
  { id: "demo_seed_20", device: "desktop" },
  { id: "demo_seed_21", device: "desktop" },
];

export async function buildClientDemo() {
  const store = new ExperimentStore();
  store.createExperiment({ ...demoExperiment, createdAt: "2026-08-25T09:00:00.000Z", status: "running" });
  subjects.forEach(({ id: subjectId, device }, index) => {
    const assignment = store.assign(demoExperiment.id, subjectId);
    store.recordExposure(demoExperiment.id, { subjectId, eventName: demoExperiment.metricContract.exposureEvent, occurredAt: "2026-08-25T09:00:00.000Z" });
    store.recordOutcome(demoExperiment.id, { id: `demo_v2_purchase_${subjectId}`, subjectId, metric: "purchase_conversion", value: index === 0 ? 1 : 0, dimensions: { device }, occurredAt: "2026-08-25T09:10:00.000Z" });
    store.recordOutcome(demoExperiment.id, { id: `demo_v2_retention_${subjectId}_1`, subjectId, metric: "retention", value: 1, period: 1, dimensions: { device }, occurredAt: "2026-08-25T09:20:00.000Z" });
    store.recordOutcome(demoExperiment.id, { id: `demo_v2_contribution_${subjectId}_1`, subjectId, metric: "contribution_margin", value: 10 + index, period: 1, dimensions: { device }, occurredAt: "2026-08-25T09:21:00.000Z" });
    const retainedAtPeriodTwo = assignment.variant === "control" ? index !== 0 : true;
    store.recordOutcome(demoExperiment.id, { id: `demo_v2_retention_${subjectId}_2`, subjectId, metric: "retention", value: retainedAtPeriodTwo ? 1 : 0, period: 2, censored: retainedAtPeriodTwo, dimensions: { device }, occurredAt: "2026-08-25T09:22:00.000Z" });
    store.recordOutcome(demoExperiment.id, { id: `demo_v2_contribution_${subjectId}_2`, subjectId, metric: "contribution_margin", value: retainedAtPeriodTwo ? 8 + index : 4, period: 2, dimensions: { device }, occurredAt: "2026-08-25T09:23:00.000Z" });
  });

  const experiment = store.getExperimentSummary(demoExperiment.id);
  const analysis = store.getAnalysis(demoExperiment.id);
  const segmentAnalysis = store.getSegmentAnalysis(demoExperiment.id, "device");
  const monitor = await store.getMonitoring(demoExperiment.id, { now: "2026-08-25T10:06:00.000Z" });
  return { experiment, ingestion: experiment.ingestion, analysis, segmentAnalysis, monitor, subjects, events: store.getOutcomeRecords(demoExperiment.id) };
}
