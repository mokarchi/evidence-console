export const STOPPING_RULE_SCHEMA_VERSION = "evidence-console.stopping-rule/v1";
export const MONITORING_SCHEMA_VERSION = "evidence-console.monitoring/v1";
export const ALERT_SCHEMA_VERSION = "evidence-console.alert/v1";

export const DEFAULT_STOPPING_RULE = Object.freeze({
  schemaVersion: STOPPING_RULE_SCHEMA_VERSION,
  minSampleSize: 1000,
  minimumRuntimeHours: 24,
  maximumRuntimeHours: 336,
  minProbabilityTreatmentBetter: 0.95,
  minProbabilityControlBetter: 0.95,
  minRelativeUplift: 0.03,
  maxSrmPValue: 0.01,
});

export const stoppingRuleSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://raw.githubusercontent.com/mokarchi/evidence-console/main/schemas/stopping-rule.v1.json",
  title: "Evidence Console Stopping Rule",
  description: "Auditable Bayesian stopping and safety thresholds for an experiment.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "minSampleSize", "minimumRuntimeHours", "maximumRuntimeHours", "minProbabilityTreatmentBetter", "minProbabilityControlBetter", "minRelativeUplift", "maxSrmPValue"],
  properties: {
    schemaVersion: { const: STOPPING_RULE_SCHEMA_VERSION },
    minSampleSize: { type: "integer", minimum: 1 },
    minimumRuntimeHours: { type: "number", minimum: 0 },
    maximumRuntimeHours: { type: "number", exclusiveMinimum: 0 },
    minProbabilityTreatmentBetter: { type: "number", exclusiveMinimum: 0, maximum: 1 },
    minProbabilityControlBetter: { type: "number", exclusiveMinimum: 0, maximum: 1 },
    minRelativeUplift: { type: "number", minimum: 0 },
    maxSrmPValue: { type: "number", exclusiveMinimum: 0, maximum: 1 },
  },
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberFromPath(source, path) {
  return finiteNumber(path.reduce((value, key) => value?.[key], source));
}

export function normalizeStoppingRule(rule, metricContract = {}) {
  const input = rule === undefined || rule === null ? {} : rule;
  if (!isPlainObject(input)) return input;
  const normalized = { ...DEFAULT_STOPPING_RULE, ...input };
  if (!("schemaVersion" in input)) normalized.schemaVersion = STOPPING_RULE_SCHEMA_VERSION;
  if (!("minRelativeUplift" in input) && finiteNumber(metricContract.practicalSignificanceThreshold) !== null) normalized.minRelativeUplift = metricContract.practicalSignificanceThreshold;
  if (!("maxSrmPValue" in input) && finiteNumber(metricContract.guardrails?.maxSrmPValue) !== null) normalized.maxSrmPValue = metricContract.guardrails.maxSrmPValue;
  return normalized;
}

export function validateStoppingRule(rule) {
  const errors = [];
  if (!isPlainObject(rule)) return { valid: false, errors: ["stoppingRule must be an object"], schemaVersion: null };
  if (rule.schemaVersion !== STOPPING_RULE_SCHEMA_VERSION) errors.push(`schemaVersion must be ${STOPPING_RULE_SCHEMA_VERSION}`);
  if (!Number.isInteger(rule.minSampleSize) || rule.minSampleSize < 1) errors.push("minSampleSize must be an integer greater than or equal to 1");
  if (!Number.isFinite(rule.minimumRuntimeHours) || rule.minimumRuntimeHours < 0) errors.push("minimumRuntimeHours must be a number greater than or equal to 0");
  if (!Number.isFinite(rule.maximumRuntimeHours) || rule.maximumRuntimeHours <= 0) errors.push("maximumRuntimeHours must be greater than 0");
  if (Number.isFinite(rule.minimumRuntimeHours) && Number.isFinite(rule.maximumRuntimeHours) && rule.maximumRuntimeHours < rule.minimumRuntimeHours) errors.push("maximumRuntimeHours must be greater than or equal to minimumRuntimeHours");
  ["minProbabilityTreatmentBetter", "minProbabilityControlBetter"].forEach((field) => {
    if (!Number.isFinite(rule[field]) || rule[field] <= 0 || rule[field] > 1) errors.push(`${field} must be greater than 0 and less than or equal to 1`);
  });
  if (!Number.isFinite(rule.minRelativeUplift) || rule.minRelativeUplift < 0) errors.push("minRelativeUplift must be a number greater than or equal to 0");
  if (!Number.isFinite(rule.maxSrmPValue) || rule.maxSrmPValue <= 0 || rule.maxSrmPValue > 1) errors.push("maxSrmPValue must be greater than 0 and less than or equal to 1");
  const supported = new Set(Object.keys(stoppingRuleSchema.properties));
  Object.keys(rule).filter((field) => !supported.has(field)).forEach((field) => errors.push(`${field} is not supported by ${STOPPING_RULE_SCHEMA_VERSION}`));
  return { valid: errors.length === 0, errors, schemaVersion: rule.schemaVersion ?? null };
}

function normalizedDate(value, fallback = new Date()) {
  const candidate = value === undefined || value === null ? fallback : new Date(value);
  return candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate : null;
}

function sampleSummary(analysis, experiment) {
  const ingestion = analysis?.ingestion ?? {};
  const controlIngestion = finiteNumber(ingestion.variants?.control);
  const treatmentIngestion = finiteNumber(ingestion.variants?.treatment);
  const ingestionExposures = finiteNumber(ingestion.exposures);
  if (ingestionExposures !== null && ingestionExposures > 0) {
    return { sampleSize: ingestionExposures, sampleSizeSource: "persisted exposures", control: controlIngestion, treatment: treatmentIngestion };
  }
  const configuredVariants = experiment?.analysisInput?.variants ?? experiment?.variants;
  const controlAggregate = numberFromPath(configuredVariants, ["control", "exposedUsers"]);
  const treatmentAggregate = numberFromPath(configuredVariants, ["treatment", "exposedUsers"]);
  if (controlAggregate !== null || treatmentAggregate !== null) {
    return { sampleSize: (controlAggregate ?? 0) + (treatmentAggregate ?? 0), sampleSizeSource: "configured aggregate variants", control: controlAggregate, treatment: treatmentAggregate };
  }
  return { sampleSize: ingestionExposures ?? 0, sampleSizeSource: "persisted exposures", control: controlIngestion, treatment: treatmentIngestion };
}

function metricEvidence(analysis) {
  const result = analysis?.result ?? {};
  const survival = result.survivalLtv;
  const probabilityTreatmentBetter = numberFromPath(survival, ["uncertainty", "probabilityTreatmentBetter"]) ?? finiteNumber(result.conversion?.probabilityTreatmentBetter);
  const contributionControl = finiteNumber(result.ltv?.contribution?.control);
  const contributionDifference = finiteNumber(result.ltv?.contribution?.difference);
  const contributionRelativeUplift = contributionControl !== null && contributionControl !== 0 && contributionDifference !== null ? contributionDifference / contributionControl : null;
  const relativeUplift = finiteNumber(survival?.relativeUplift) ?? contributionRelativeUplift;
  const conversionUplift = finiteNumber(result.conversion?.relativeUplift);
  const resolvedRelativeUplift = survival && finiteNumber(survival.relativeUplift) !== null ? survival.relativeUplift : relativeUplift ?? conversionUplift;
  return {
    probabilityTreatmentBetter,
    probabilityControlBetter: probabilityTreatmentBetter === null ? null : 1 - probabilityTreatmentBetter,
    relativeUplift: resolvedRelativeUplift,
    srmPValue: finiteNumber(result.srm?.pValue),
  };
}

export function evaluateStoppingRule({ experiment, analysis, now, stoppingRule } = {}) {
  const rule = normalizeStoppingRule(stoppingRule ?? experiment?.stoppingRule, experiment?.metricContract);
  const ruleStatus = validateStoppingRule(rule);
  const evaluatedDate = normalizedDate(now);
  const startedDate = normalizedDate(experiment?.startedAt ?? experiment?.createdAt, evaluatedDate);
  const runtimeHours = evaluatedDate && startedDate ? Math.max(0, (evaluatedDate.getTime() - startedDate.getTime()) / 3600000) : null;
  const sample = sampleSummary(analysis, experiment);
  const evidence = metricEvidence(analysis);
  const checks = {
    analysisReady: { pass: analysis?.ready === true, actual: Boolean(analysis?.ready) },
    minimumSample: { pass: ruleStatus.valid && sample.sampleSize >= rule.minSampleSize, actual: sample.sampleSize, required: rule.minSampleSize },
    minimumRuntime: { pass: ruleStatus.valid && runtimeHours !== null && runtimeHours >= rule.minimumRuntimeHours, actual: runtimeHours, required: rule.minimumRuntimeHours },
    srm: { pass: evidence.srmPValue !== null && ruleStatus.valid && evidence.srmPValue > rule.maxSrmPValue, actual: evidence.srmPValue, maximum: rule.maxSrmPValue },
    treatmentBenefit: { pass: evidence.probabilityTreatmentBetter !== null && evidence.relativeUplift !== null && ruleStatus.valid && evidence.probabilityTreatmentBetter >= rule.minProbabilityTreatmentBetter && evidence.relativeUplift >= rule.minRelativeUplift, probability: evidence.probabilityTreatmentBetter, relativeUplift: evidence.relativeUplift },
    treatmentHarm: { pass: evidence.probabilityControlBetter !== null && evidence.relativeUplift !== null && ruleStatus.valid && evidence.probabilityControlBetter >= rule.minProbabilityControlBetter && evidence.relativeUplift <= -rule.minRelativeUplift, probability: evidence.probabilityControlBetter, relativeUplift: evidence.relativeUplift },
  };
  const blockingReasons = [];
  if (!ruleStatus.valid) blockingReasons.push("invalid_stopping_rule");
  if (!checks.analysisReady.pass) blockingReasons.push("analysis_not_ready");
  if (!checks.minimumSample.pass) blockingReasons.push("minimum_sample_not_reached");
  if (!checks.minimumRuntime.pass) blockingReasons.push("minimum_runtime_not_reached");
  if (evidence.srmPValue === null) blockingReasons.push("srm_not_available");
  if (evidence.srmPValue !== null && !checks.srm.pass) blockingReasons.push("srm_failed");

  let status = "running";
  let decision = "continue";
  let reason = "Evidence has not met the stopping rule yet.";
  if (!ruleStatus.valid) {
    status = "blocked";
    decision = "hold";
    reason = "The stopping rule is invalid and requires review.";
  } else if (evidence.srmPValue !== null && !checks.srm.pass) {
    status = "blocked";
    decision = "hold";
    reason = "Sample Ratio Mismatch is outside the configured guardrail.";
  } else if (checks.minimumSample.pass && checks.minimumRuntime.pass && checks.srm.pass && checks.treatmentBenefit.pass) {
    status = "stopped";
    decision = "ship_treatment";
    reason = "Treatment met the probability and practical-uplift thresholds.";
  } else if (checks.minimumSample.pass && checks.minimumRuntime.pass && checks.srm.pass && checks.treatmentHarm.pass) {
    status = "stopped";
    decision = "keep_control";
    reason = "Control met the probability and practical-downside thresholds.";
  } else if (runtimeHours !== null && runtimeHours >= rule.maximumRuntimeHours) {
    status = "review";
    decision = "review";
    reason = "Maximum runtime reached without a stopping decision.";
  }
  return {
    schemaVersion: MONITORING_SCHEMA_VERSION,
    evaluatedAt: evaluatedDate?.toISOString() ?? null,
    experimentId: experiment?.id ?? null,
    rule: ruleStatus.valid ? rule : null,
    ruleStatus,
    status,
    decision,
    reason,
    blockingReasons,
    sample: { ...sample, runtimeHours },
    evidence,
    checks,
  };
}

export function buildMonitoringAlerts(evaluation) {
  if (!evaluation || ["running"].includes(evaluation.status)) return [];
  const base = {
    schemaVersion: ALERT_SCHEMA_VERSION,
    fingerprint: `${evaluation.experimentId}:${evaluation.status}:${evaluation.decision}`,
    experimentId: evaluation.experimentId,
    occurredAt: evaluation.evaluatedAt,
  };
  if (evaluation.status === "blocked") return [{ ...base, type: "data_quality", severity: "critical", title: "Experiment blocked by data quality", message: evaluation.reason, action: "Hold the experiment and investigate SRM before making a decision." }];
  if (evaluation.status === "stopped") return [{ ...base, type: "stopping_rule", severity: "info", title: `Stopping rule met: ${evaluation.decision}`, message: evaluation.reason, action: evaluation.decision === "ship_treatment" ? "Review the decision brief before shipping treatment." : "Review the decision brief before keeping control." }];
  return [{ ...base, type: "maximum_runtime", severity: "warning", title: "Experiment needs review", message: evaluation.reason, action: "Review the evidence or extend the maximum runtime explicitly." }];
}

export async function deliverMonitoringAlerts(alerts, notifier) {
  if (!alerts.length) return { status: "no_alerts", attempted: 0, sent: 0, failures: [] };
  if (!notifier || typeof notifier.send !== "function") return { status: "not_configured", attempted: 0, sent: 0, failures: [] };
  const failures = [];
  let sent = 0;
  for (const alert of alerts) {
    try {
      await notifier.send(alert);
      sent += 1;
    } catch (error) {
      failures.push({ fingerprint: alert.fingerprint, message: error.message });
    }
  }
  return { status: failures.length ? "partial_failure" : "sent", attempted: alerts.length, sent, failures };
}

export class WebhookNotifier {
  constructor({ url, fetchImpl = globalThis.fetch, headers = {} } = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("Webhook URL must be a valid URL"); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Webhook URL must use http or https");
    if (typeof fetchImpl !== "function") throw new Error("fetchImpl must be a function");
    this.url = parsed.toString();
    this.fetchImpl = fetchImpl;
    this.headers = headers;
  }

  async send(alert) {
    const response = await this.fetchImpl(this.url, { method: "POST", headers: { "content-type": "application/json", ...this.headers }, body: JSON.stringify({ schemaVersion: ALERT_SCHEMA_VERSION, alert }) });
    if (!response?.ok) throw new Error(`Webhook request failed with status ${response?.status ?? "unknown"}`);
    return { status: response.status };
  }
}

export async function runExperimentMonitoring({ experiment, analysis, now, notifier, stoppingRule } = {}) {
  const evaluation = evaluateStoppingRule({ experiment, analysis, now, stoppingRule });
  const alerts = buildMonitoringAlerts(evaluation);
  const notifications = await deliverMonitoringAlerts(alerts, notifier);
  return { schemaVersion: MONITORING_SCHEMA_VERSION, evaluation, alerts, notifications };
}
