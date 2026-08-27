import { demoExperiment } from "../data/demoExperiment.js";

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json", ...(options.headers ?? {}) }, ...options });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.error ?? `API request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function getOrCreateDemoExperiment() {
  try {
    return (await request(`/api/experiments/${encodeURIComponent("exp_20260811_01")}`)).experiment;
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      return (await request("/api/experiments", { method: "POST", body: JSON.stringify(demoExperiment) })).experiment;
    } catch (createError) {
      if (createError.status !== 409) throw createError;
      return (await request(`/api/experiments/${encodeURIComponent(demoExperiment.id)}`)).experiment;
    }
  }
}

export async function syncDemoExperiment() {
  const experiment = await getOrCreateDemoExperiment();
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
  for (const [index, subject] of subjects.entries()) {
    const { id: subjectId, device } = subject;
    const assignment = await request(`/api/experiments/${experiment.id}/assign`, { method: "POST", body: JSON.stringify({ subjectId }) });
    await request(`/api/experiments/${experiment.id}/exposure`, { method: "POST", body: JSON.stringify({ subjectId, eventName: experiment.metricContract.exposureEvent, occurredAt: "2026-08-25T09:00:00.000Z" }) });
    await request(`/api/experiments/${experiment.id}/outcome`, { method: "POST", body: JSON.stringify({ id: `demo_v2_purchase_${subjectId}`, subjectId, metric: "purchase_conversion", value: index === 0 ? 1 : 0, dimensions: { device }, occurredAt: "2026-08-25T09:10:00.000Z" }) });
    await request(`/api/experiments/${experiment.id}/outcome`, { method: "POST", body: JSON.stringify({ id: `demo_v2_retention_${subjectId}_1`, subjectId, metric: "retention", value: 1, period: 1, dimensions: { device }, occurredAt: "2026-08-25T09:20:00.000Z" }) });
    await request(`/api/experiments/${experiment.id}/outcome`, { method: "POST", body: JSON.stringify({ id: `demo_v2_contribution_${subjectId}_1`, subjectId, metric: "contribution_margin", value: 10 + index, period: 1, dimensions: { device }, occurredAt: "2026-08-25T09:21:00.000Z" }) });
    const retainedAtPeriodTwo = assignment.assignment.variant === "control" ? index !== 0 : true;
    await request(`/api/experiments/${experiment.id}/outcome`, { method: "POST", body: JSON.stringify({ id: `demo_v2_retention_${subjectId}_2`, subjectId, metric: "retention", value: retainedAtPeriodTwo ? 1 : 0, period: 2, censored: retainedAtPeriodTwo, dimensions: { device }, occurredAt: "2026-08-25T09:22:00.000Z" }) });
    await request(`/api/experiments/${experiment.id}/outcome`, { method: "POST", body: JSON.stringify({ id: `demo_v2_contribution_${subjectId}_2`, subjectId, metric: "contribution_margin", value: retainedAtPeriodTwo ? 8 + index : 4, period: 2, dimensions: { device }, occurredAt: "2026-08-25T09:23:00.000Z" }) });
  }
  const [summary, analysis, segmentAnalysis, monitor] = await Promise.all([
    request(`/api/experiments/${experiment.id}`),
    request(`/api/experiments/${experiment.id}/analysis`),
    request(`/api/experiments/${experiment.id}/segments?field=device`),
    request(`/api/experiments/${experiment.id}/monitor`),
  ]);
  return { experiment: summary.experiment, ingestion: summary.experiment.ingestion, analysis: analysis.analysis, segmentAnalysis: segmentAnalysis.analysis, monitor: monitor.monitor };
}
