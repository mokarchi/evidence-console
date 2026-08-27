import { assignVariant, analyzeExperiment, validateMetricContract } from "./experiment.js";
import { ingestEvents } from "./eventAdapter.js";
import { ApiError } from "./errors.js";
import { metricContractSchema, normalizeMetricContract } from "./metricContract.js";
import { buildExperimentReport, renderMarkdownReport } from "./report.js";
import { adjustBenjaminiHochberg, analyzeSurvivalByVariant } from "./survival.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

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

function optionalPeriod(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const period = Number(value);
  if (!Number.isInteger(period) || period < 1) throw new ApiError(400, "period must be a positive integer");
  return period;
}

function optionalBoolean(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || String(value).toLowerCase() === "true") return true;
  if (value === 0 || value === "0" || String(value).toLowerCase() === "false") return false;
  throw new ApiError(400, `${field} must be a boolean`);
}

function optionalString(value, field) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new ApiError(400, `${field} must be a non-empty string`);
  return value.trim();
}

function optionalDimensions(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new ApiError(400, "dimensions must be an object");
  return clone(value);
}

function getDimensionValue(outcome, field) {
  const value = field === "segment" ? outcome.segment ?? outcome.dimensions?.segment : outcome.dimensions?.[field];
  return value === undefined || value === null || value === "" ? undefined : String(value);
}

function requireExperiment(experiments, id) {
  const experiment = experiments.get(id);
  if (!experiment) throw new ApiError(404, `Experiment ${id} was not found`);
  return experiment;
}

export class ExperimentStore {
  constructor(seed = [], { onChange = null } = {}) {
    this.experiments = new Map();
    this.assignments = new Map();
    this.exposures = new Map();
    this.outcomes = new Map();
    this.onChange = onChange;
    this.pendingSave = Promise.resolve();
    seed.forEach((experiment) => this.createExperiment(experiment));
  }

  snapshot() {
    return {
      experiments: [...this.experiments.values()].map((experiment) => clone(experiment)),
      assignments: [...this.assignments.entries()].map(([experimentId, values]) => ({ experimentId, values: [...values.values()].map((value) => clone(value)) })),
      exposures: [...this.exposures.entries()].map(([experimentId, values]) => ({ experimentId, values: [...values.values()].map((value) => clone(value)) })),
      outcomes: [...this.outcomes.entries()].map(([experimentId, values]) => ({ experimentId, values: [...values.values()].map((value) => clone(value)) })),
    };
  }

  restore(snapshot = {}) {
    this.experiments.clear();
    this.assignments.clear();
    this.exposures.clear();
    this.outcomes.clear();
    (snapshot.experiments ?? []).forEach((experiment) => this.experiments.set(experiment.id, clone(experiment)));
    for (const experiment of this.experiments.values()) {
      this.assignments.set(experiment.id, new Map());
      this.exposures.set(experiment.id, new Map());
      this.outcomes.set(experiment.id, new Map());
    }
    for (const bucket of snapshot.assignments ?? []) this.assignments.set(bucket.experimentId, new Map((bucket.values ?? []).map((value) => [value.subjectId, clone(value)])));
    for (const bucket of snapshot.exposures ?? []) this.exposures.set(bucket.experimentId, new Map((bucket.values ?? []).map((value) => [`${value.subjectId}:${value.eventName}`, clone(value)])));
    for (const bucket of snapshot.outcomes ?? []) this.outcomes.set(bucket.experimentId, new Map((bucket.values ?? []).map((value) => [value.id, clone(value)])));
  }

  async flush() {
    if (!this.onChange) return;
    this.pendingSave = this.pendingSave.then(() => this.onChange(this.snapshot()));
    return this.pendingSave;
  }

  createExperiment(input = {}) {
    const name = requireString(input.name, "name");
    const metricContract = normalizeMetricContract(input.metricContract ?? {});
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
    const period = optionalPeriod(input.period);
    const censored = optionalBoolean(input.censored, "censored");
    const segment = optionalString(input.segment, "segment");
    const dimensions = optionalDimensions(input.dimensions);
    const assignment = this.assign(id, subjectId);
    const outcome = {
      id: input.id ? requireString(input.id, "id") : makeId("outcome"),
      experimentId: id,
      subjectId,
      variant: assignment.variant,
      metric,
      value: input.value,
      occurredAt: input.occurredAt ?? now(),
      ...(period === undefined ? {} : { period }),
      ...(censored === undefined ? {} : { censored }),
      ...(segment === undefined ? {} : { segment }),
      ...(dimensions === undefined ? {} : { dimensions }),
    };
    const outcomes = this.outcomes.get(id);
    if (outcomes.has(outcome.id)) return clone(outcomes.get(outcome.id));
    outcomes.set(outcome.id, outcome);
    return clone(outcome);
  }

  importEvents(id, input) {
    requireExperiment(this.experiments, id);
    return ingestEvents(this, id, input);
  }

  getOutcomeRecords(id) {
    requireExperiment(this.experiments, id);
    return [...this.outcomes.get(id).values()].map((outcome) => clone(outcome));
  }

  getEventDerivedAnalysis(id) {
    const outcomes = this.getOutcomeRecords(id);
    const activityMetrics = new Set(["active", "activity", "retained", "retention"]);
    const contributionMetrics = new Set(["contribution", "contribution_margin", "contribution_profit", "net_contribution"]);
    const variants = { control: { activityRecords: [], contributionRecords: [] }, treatment: { activityRecords: [], contributionRecords: [] } };
    outcomes.forEach((outcome) => {
      if (!outcome.period || !variants[outcome.variant]) return;
      const metric = outcome.metric.toLowerCase();
      if (activityMetrics.has(metric)) variants[outcome.variant].activityRecords.push(outcome);
      if (contributionMetrics.has(metric)) variants[outcome.variant].contributionRecords.push(outcome);
    });
    const complete = Object.values(variants).every(({ activityRecords, contributionRecords }) => activityRecords.length > 0 && contributionRecords.length > 0);
    if (!complete) return null;
    return analyzeSurvivalByVariant(variants);
  }

  getSegmentAnalysis(id, field = "segment") {
    requireExperiment(this.experiments, id);
    const segmentField = requireString(field, "field");
    const outcomes = this.getOutcomeRecords(id);
    const activityMetrics = new Set(["active", "activity", "retained", "retention"]);
    const contributionMetrics = new Set(["contribution", "contribution_margin", "contribution_profit", "net_contribution"]);
    const bySegment = new Map();
    const subjectSegments = new Map();
    const ambiguousSubjects = new Set();
    outcomes.forEach((outcome) => {
      if (!outcome.period || !["control", "treatment"].includes(outcome.variant)) return;
      const segment = getDimensionValue(outcome, segmentField);
      if (segment === undefined) return;
      const subjectKey = `${outcome.variant}:${outcome.subjectId}`;
      if (!subjectSegments.has(subjectKey)) subjectSegments.set(subjectKey, new Set());
      subjectSegments.get(subjectKey).add(segment);
    });
    subjectSegments.forEach((segments, subjectKey) => {
      if (segments.size > 1) ambiguousSubjects.add(subjectKey);
    });
    outcomes.forEach((outcome) => {
      if (!outcome.period || !["control", "treatment"].includes(outcome.variant)) return;
      const segment = getDimensionValue(outcome, segmentField);
      if (segment === undefined) return;
      const subjectKey = `${outcome.variant}:${outcome.subjectId}`;
      if (ambiguousSubjects.has(subjectKey)) return;
      if (!bySegment.has(segment)) bySegment.set(segment, { control: { activityRecords: [], contributionRecords: [] }, treatment: { activityRecords: [], contributionRecords: [] } });
      const target = bySegment.get(segment)[outcome.variant];
      const metric = outcome.metric.toLowerCase();
      if (activityMetrics.has(metric)) target.activityRecords.push(outcome);
      if (contributionMetrics.has(metric)) target.contributionRecords.push(outcome);
    });
    const candidates = [...bySegment.entries()]
      .filter(([, variants]) => Object.values(variants).every(({ activityRecords, contributionRecords }) => activityRecords.length > 0 && contributionRecords.length > 0))
      .map(([value, variants]) => {
        const survivalLtv = analyzeSurvivalByVariant(variants);
        return { value, ...survivalLtv, rawPValue: survivalLtv.uncertainty.difference.pValue };
      });
    const adjustedPValues = adjustBenjaminiHochberg(candidates.map((candidate) => candidate.rawPValue));
    const segments = candidates.map((candidate, index) => ({
      ...candidate,
      adjustedPValue: adjustedPValues[index],
      significant: adjustedPValues[index] !== null && adjustedPValues[index] <= 0.05,
    }));
    return {
      ready: segments.length > 0,
      field: segmentField,
      correction: "Benjamini-Hochberg",
      alpha: 0.05,
      testedSegments: segments.length,
      excludedAmbiguousSubjects: ambiguousSubjects.size,
      segments,
    };
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
    const survivalLtv = this.getEventDerivedAnalysis(id);
    if (!experiment.analysisInput && survivalLtv) return { ready: true, mode: "event-derived", ingestion, result: { survivalLtv } };
    if (!experiment.analysisInput) return { ready: false, reason: "No aggregate analysis input configured", ingestion };
    const result = analyzeExperiment({ ...experiment.analysisInput, id: experiment.id, allocation: experiment.allocation, metricContract: experiment.metricContract });
    return { ready: true, ingestion, result: survivalLtv ? { ...result, survivalLtv } : result };
  }
}

export const defaultStore = new ExperimentStore();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" } });
}

function textResponse(data, status = 200, contentType = "text/plain; charset=utf-8") {
  return new Response(data, { status, headers: { "content-type": contentType, "content-disposition": "attachment; filename=experiment-report.md", "access-control-allow-origin": "*" } });
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
    if (url.pathname === "/api/metric-contract/schema" && request.method === "GET") return json({ schema: metricContractSchema });
    if (url.pathname === "/api/experiments" && request.method === "GET") return json({ experiments: store.listExperiments() });
    if (url.pathname === "/api/experiments" && request.method === "POST") { const experiment = store.createExperiment(await readJson(request)); await store.flush(); return json({ experiment }, 201); }
    const match = url.pathname.match(/^\/api\/experiments\/([^/]+)(?:\/(assign|exposure|outcome|analysis|segments|import|report))?$/);
    if (!match) throw new ApiError(404, "API route was not found");
    const [, id, action] = match;
    if (!action && request.method === "GET") return json({ experiment: store.getExperimentSummary(id) });
    if (action === "assign" && request.method === "POST") { const assignment = store.assign(id, (await readJson(request)).subjectId); await store.flush(); return json({ assignment }, 201); }
    if (action === "exposure" && request.method === "POST") { const exposure = store.recordExposure(id, await readJson(request)); await store.flush(); return json({ exposure }, 201); }
    if (action === "outcome" && request.method === "POST") { const outcome = store.recordOutcome(id, await readJson(request)); await store.flush(); return json({ outcome }, 201); }
    if (action === "import" && request.method === "POST") { const result = store.importEvents(id, await readJson(request)); await store.flush(); return json({ result }, result.skipped > 0 ? 207 : 201); }
    if (action === "analysis" && request.method === "GET") return json({ analysis: store.getAnalysis(id) });
    if (action === "segments" && request.method === "GET") return json({ analysis: store.getSegmentAnalysis(id, url.searchParams.get("field") ?? "segment") });
    if (action === "report" && request.method === "GET") {
      const analysis = store.getAnalysis(id);
      const segmentField = url.searchParams.get("segmentField");
      const segmentAnalysis = segmentField ? store.getSegmentAnalysis(id, segmentField) : null;
      const report = buildExperimentReport({ experiment: store.getExperiment(id), analysis: segmentAnalysis ? { ...analysis, segmentAnalysis } : analysis });
      if (["md", "markdown"].includes(url.searchParams.get("format"))) return textResponse(renderMarkdownReport(report), 200, "text/markdown; charset=utf-8");
      return json({ report });
    }
    throw new ApiError(405, "Method is not supported for this route");
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, details: error.details ?? null }, error.status);
    return json({ error: "Internal API error" }, 500);
  }
}
