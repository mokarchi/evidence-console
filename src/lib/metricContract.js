export const METRIC_CONTRACT_SCHEMA_VERSION = "evidence-console.metric-contract/v1";

export const DEFAULT_METRIC_GUARDRAILS = Object.freeze({
  minSampleRatio: 0.8,
  maxSrmPValue: 0.01,
});

export const metricContractSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://raw.githubusercontent.com/mokarchi/evidence-console/main/schemas/metric-contract.v1.json",
  title: "Evidence Console Metric Contract",
  description: "Versioned definition of an experiment metric and its analysis guardrails.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "name", "unit", "definition", "numerator", "denominator", "exposureEvent", "attributionWindow", "guardrails"],
  properties: {
    schemaVersion: { const: METRIC_CONTRACT_SCHEMA_VERSION },
    name: { type: "string", minLength: 1 },
    unit: { type: "string", minLength: 1 },
    definition: { type: "string", minLength: 1 },
    numerator: { type: "string", minLength: 1 },
    denominator: { type: "string", minLength: 1 },
    exposureEvent: { type: "string", minLength: 1 },
    attributionWindow: { type: "string", minLength: 1 },
    population: { type: "string", minLength: 1 },
    primary: { type: "boolean" },
    analysisMethod: { type: "string", minLength: 1 },
    minimumDetectableEffect: { type: "number", minimum: 0 },
    practicalSignificanceThreshold: { type: "number", minimum: 0 },
    guardrails: {
      type: "object",
      additionalProperties: false,
      required: ["minSampleRatio", "maxSrmPValue"],
      properties: {
        minSampleRatio: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        maxSrmPValue: { type: "number", exclusiveMinimum: 0, maximum: 1 },
      },
    },
  },
};

const requiredStringFields = ["name", "unit", "definition", "numerator", "denominator", "exposureEvent", "attributionWindow"];
const optionalStringFields = ["population", "analysisMethod"];
const optionalNumberFields = ["minimumDetectableEffect", "practicalSignificanceThreshold"];

export function normalizeMetricContract(contract = {}) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return contract;
  const normalized = { ...contract };
  if (!("schemaVersion" in normalized)) normalized.schemaVersion = METRIC_CONTRACT_SCHEMA_VERSION;
  if (!("guardrails" in normalized)) normalized.guardrails = { ...DEFAULT_METRIC_GUARDRAILS };
  return normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateNonEmptyString(value, field, errors) {
  if (!(field in value)) {
    errors.push(`${field} is required`);
  } else if (typeof value[field] !== "string" || value[field].trim() === "") {
    errors.push(`${field} must be a non-empty string`);
  }
}

export function validateMetricContract(contract) {
  const errors = [];
  if (!isPlainObject(contract)) return { valid: false, errors: ["metricContract must be an object"], schemaVersion: null, schema: metricContractSchema.$id };

  if (contract.schemaVersion !== METRIC_CONTRACT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${METRIC_CONTRACT_SCHEMA_VERSION}`);
  requiredStringFields.forEach((field) => validateNonEmptyString(contract, field, errors));

  optionalStringFields.forEach((field) => {
    if (field in contract && (typeof contract[field] !== "string" || contract[field].trim() === "")) errors.push(`${field} must be a non-empty string`);
  });
  if ("primary" in contract && typeof contract.primary !== "boolean") errors.push("primary must be a boolean");
  optionalNumberFields.forEach((field) => {
    if (field in contract && (!Number.isFinite(contract[field]) || contract[field] < 0)) errors.push(`${field} must be a number greater than or equal to 0`);
  });

  if (!isPlainObject(contract.guardrails)) {
    errors.push("guardrails must be an object");
  } else {
    ["minSampleRatio", "maxSrmPValue"].forEach((field) => {
      if (!(field in contract.guardrails)) {
        errors.push(`guardrails.${field} is required`);
      } else if (!Number.isFinite(contract.guardrails[field]) || contract.guardrails[field] <= 0 || contract.guardrails[field] > 1) {
        errors.push(`guardrails.${field} must be greater than 0 and less than or equal to 1`);
      }
    });
    Object.keys(contract.guardrails).filter((field) => !["minSampleRatio", "maxSrmPValue"].includes(field)).forEach((field) => errors.push(`guardrails.${field} is not supported`));
  }

  const supportedFields = new Set(["schemaVersion", ...requiredStringFields, ...optionalStringFields, "primary", ...optionalNumberFields, "guardrails"]);
  Object.keys(contract).filter((field) => !supportedFields.has(field)).forEach((field) => errors.push(`${field} is not supported by ${METRIC_CONTRACT_SCHEMA_VERSION}`));

  return {
    valid: errors.length === 0,
    errors,
    schemaVersion: contract.schemaVersion ?? null,
    schema: metricContractSchema.$id,
  };
}
