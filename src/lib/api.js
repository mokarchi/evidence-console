import { assignVariant, analyzeExperiment, validateMetricContract } from "./experiment.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random.replaceAll("-", "").slice(0, 20)}`;
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new ApiError(400, `${field} is required`);
  return value.trim();
}

function requireExperiment(experiments, id) {
  const experiment = experiments.get(id);
  if (!experiment) throw new ApiError(404, `Experiment ${id} was not found`);
  return experiment;
}

export class ExperimentStore {
  constructor(seed = []) {
    this.experiments = new Map();
    this.assignments = new Map();
    this.exposures = new Map();
    this.outcomes = new Map();
    seed.forEach((experiment) => this.createExperiment(experiment));
  }

  createExperiment(input = {}) {
    const name = requireString(input.name, "name");
    const metricContract = input.metricContract ?? {};
    const contractStatus = validateMetricContract(metricContract);
    if (!contractStatus.valid) throw new ApiError(400, "metricContract is incomplete", contractStatus.errors);
    const id = input.id ? requireString(input.id, "id") : makeId("exp");
    if (this.experiments.has(id)) throw new ApiError(409, `Experiment ${id} already exists`);
    const analysisInput = input.analysisInput ?? (input.variants && input.conversion && input.revenue ? {
      variants: input.variants,
      conversion: input.conversion,
      revenue: input.revenue,
    } : null);
    const experiment = {
      id,
      name,
      hypothesis: input.hypothesis ?? null,
      allocation: input.allocation ?? 0.5,
      status: input.status ?? "draft",
      metricContract: clone(metricContract),
      analysisInput: analysisInput ? clone(analysisInput) : null,
      createdAt: input.createdAt ?? now(),
      updatedAt: now(),
    };
    if (!Number.isFinite(experiment.allocation) || experiment.allocation <= 0 || experiment.allocation >= 1) throw new ApiError(400, "allocation must be between 0 and 1");
    this.experiments.set(id, experiment);
    this.assignments.set(id, new Map());
    this.exposures.set(id, new Map());
    this.outcomes.set(id, new Map());
    return clone(experiment);
  }

  listExperiments() {
    return [...this.experiments.values()].map((experiment) => this.getExperimentSummary(experiment.id));
  }

  getExperiment(id) {
    return clone(requireExperiment(this.experiments, id));
  }

  getExperimentSummary(id) {
    const experiment = requireExperiment(this.experiments, id);
    return {
      ...clone(experiment),
      ingestion: this.getIngestionSummary(id),
    };
  }

  assign(id, subjectId) {
    const experiment = requireExperiment(this.experiments, id);
    const normalizedSubjectId = requireString(subjectId, "subjectId");
    const assignments = this.assignments.get(id);
    if (assignments.has(normalizedSubjectId)) return clone(assignments.get(normalizedSubjectId));
    const assignment = {
      id: makeId("asn"),
      experimentId: id,
      subjectId: normalizedSubjectId,
      variant: assignVariant({ subjectId: normalizedSubjectId, experimentId: experiment.id, allocation: experiment.allocation }),
      assignedAt: now(),
    };
    assignments.set(normalizedSubjectId, assignment);
    return clone(assignment);
  }

  recordExposure(id, input = {}) {
    const experiment = requireExperiment(this.experiments, id);
    const subjectId = requireString(input.subjectId, "subjectId");
    const eventName = requireString(input.eventName ?? experiment.metricContract.exposureEvent, "eventName");
    const assignment = this.assign(id, subjectId);
    if (input.variant && input.variant !== assignment.variant) throw new ApiError(409, "variant does not match the persisted assignment");
    const key = `${subjectId}:${eventName}`;
    const exposures = this.exposures.get(id);
    if (exposures.has(key)) return clone(exposures.get(key));
    const exposure = {
      id: makeId("exposure"),
      experimentId: id,
      subjectId,
      variant: assignment.variant,
      eventName,
      occurredAt: input.occurredAt ?? now(),
    };
    exposures.set(key, exposure);
    return clone(exposure);
  }

  recordOutcome(id, input = {}) {
    requireExperiment(this.experiments, id);
    const subjectId = requireString(input.subjectId, "subjectId");
    const metric = requireString(input.metric, "metric");
    if (!Number.isFinite(input.value)) throw new ApiError(400, "value must be a finite number");
    const assignment = this.assign(id, subjectId);
    const outcome = {
      id: input.id ? requireString(input.id, "id") : makeId("outcome"),
      experimentId: id,
      subjectId,
      variant: assignment.variant,
      metric,
      value: input.value,
      occurredAt: input.occurredAt ?? now(),
    };
    const outcomes = this.outcomes.get(id);
    if (outcomes.has(outcome.id)) return clone(outcomes.get(outcome.id));
    outcomes.set(outcome.id, outcome);
    return clone(outcome);
  }

  getIngestionSummary(id) {
    requireExperiment(this.experiments, id);
    const assignments = [...this.assignments.get(id).values()];
    const exposures = [...this.exposures.get(id).values()];
    const outcomes = [...this.outcomes.get(id).values()];
    return {
      assignments: assignments.length,
      exposures: exposures.length,
      outcomes: outcomes.length,
      variants: {
        control: assignments.filter((item) => item.variant === "control").length,
        treatment: assignments.filter((item) => item.variant === "treatment").length,
      },
      outcomeMetrics: [...new Set(outcomes.map((item) => item.metric))],
      lastEventAt: [...exposures, ...outcomes].map((item) => item.occurredAt).sort().at(-1) ?? null,
    };
  }

  getAnalysis(id) {
    const experiment = requireExperiment(this.experiments, id);
    const ingestion = this.getIngestionSummary(id);
    if (!experiment.analysisInput) return { ready: false, reason: "No aggregate analysis input configured", ingestion };
    return { ready: true, ingestion, result: analyzeExperiment({ ...experiment.analysisInput, id: experiment.id, allocation: experiment.allocation, metricContract: experiment.metricContract }) };
  }
}

export const defaultStore = new ExperimentStore();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
}

export async function handleApiRequest(request, store = defaultStore) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" } });
  try {
    if (url.pathname === "/api/health" && request.method === "GET") return json({ ok: true, service: "evidence-console-api" });
    if (url.pathname === "/api/experiments" && request.method === "GET") return json({ experiments: store.listExperiments() });
    if (url.pathname === "/api/experiments" && request.method === "POST") return json({ experiment: store.createExperiment(await readJson(request)) }, 201);
    const match = url.pathname.match(/^\/api\/experiments\/([^/]+)(?:\/(assign|exposure|outcome|analysis))?$/);
    if (!match) throw new ApiError(404, "API route was not found");
    const [, id, action] = match;
    if (!action && request.method === "GET") return json({ experiment: store.getExperimentSummary(id) });
    if (action === "assign" && request.method === "POST") return json({ assignment: store.assign(id, (await readJson(request)).subjectId) }, 201);
    if (action === "exposure" && request.method === "POST") return json({ exposure: store.recordExposure(id, await readJson(request)) }, 201);
    if (action === "outcome" && request.method === "POST") return json({ outcome: store.recordOutcome(id, await readJson(request)) }, 201);
    if (action === "analysis" && request.method === "GET") return json({ analysis: store.getAnalysis(id) });
    throw new ApiError(405, "Method is not supported for this route");
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, details: error.details ?? null }, error.status);
    return json({ error: "Internal API error" }, 500);
  }
}
