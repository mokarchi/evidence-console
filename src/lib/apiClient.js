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
  const subjects = ["demo_user_001", "demo_user_002", "demo_user_003"];
  for (const [index, subjectId] of subjects.entries()) {
    await request(`/api/experiments/${experiment.id}/assign`, { method: "POST", body: JSON.stringify({ subjectId }) });
    await request(`/api/experiments/${experiment.id}/exposure`, { method: "POST", body: JSON.stringify({ subjectId, eventName: experiment.metricContract.exposureEvent, occurredAt: "2026-08-25T09:00:00.000Z" }) });
    await request(`/api/experiments/${experiment.id}/outcome`, { method: "POST", body: JSON.stringify({ id: `demo_purchase_${index + 1}`, subjectId, metric: "purchase_conversion", value: index === 0 ? 1 : 0, occurredAt: "2026-08-25T09:10:00.000Z" }) });
  }
  const [summary, analysis] = await Promise.all([
    request(`/api/experiments/${experiment.id}`),
    request(`/api/experiments/${experiment.id}/analysis`),
  ]);
  return { experiment: summary.experiment, ingestion: summary.experiment.ingestion, analysis: analysis.analysis };
}
