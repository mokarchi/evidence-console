import { ingestEvents } from "./eventAdapter.js";

export const WAREHOUSE_EVENT_SCHEMA_VERSION = "evidence-console.warehouse-events/v1";

const DEFAULT_TABLE = "experiment_events";
const DEFAULT_LIMIT = 10000;
const MAX_LIMIT = 100000;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const EVENT_COLUMNS = [
  "event_id AS id",
  "experiment_id",
  "event_type AS type",
  "subject_id",
  "event_name",
  "metric",
  "value",
  "period",
  "censored",
  "occurred_at",
  "variant",
  "dimensions",
];

export class WarehouseAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "WarehouseAdapterError";
  }
}

function validateIdentifier(value, field) {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) throw new WarehouseAdapterError(`${field} must be a simple SQL identifier or dotted path`);
  return value;
}

function validateLimit(value) {
  const limit = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new WarehouseAdapterError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  return limit;
}

function placeholder(style, name, index) {
  if (style === "named") return `@${name}`;
  if (style === "numbered") return `$${index}`;
  if (style === "positional") return "?";
  throw new WarehouseAdapterError("parameterStyle must be positional, numbered, or named");
}

export function buildWarehouseEventQuery({
  table = DEFAULT_TABLE,
  experimentId,
  since,
  until,
  limit = DEFAULT_LIMIT,
  parameterStyle = "positional",
} = {}) {
  validateIdentifier(table, "table");
  if (typeof experimentId !== "string" || experimentId.trim() === "") throw new WarehouseAdapterError("experimentId is required");
  const normalizedLimit = validateLimit(limit);
  const params = parameterStyle === "named" ? {} : [];
  let parameterIndex = 0;
  const conditions = [];
  const addParameter = (name, value) => {
    parameterIndex += 1;
    if (parameterStyle === "named") params[name] = value;
    else params.push(value);
    return placeholder(parameterStyle, name, parameterIndex);
  };
  conditions.push(`experiment_id = ${addParameter("experiment_id", experimentId.trim())}`);
  if (since !== undefined && since !== null && since !== "") conditions.push(`occurred_at >= ${addParameter("since", since)}`);
  if (until !== undefined && until !== null && until !== "") conditions.push(`occurred_at < ${addParameter("until", until)}`);
  const limitParameter = addParameter("limit", normalizedLimit);
  return {
    schemaVersion: WAREHOUSE_EVENT_SCHEMA_VERSION,
    sql: `SELECT ${EVENT_COLUMNS.join(", ")} FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY occurred_at ASC LIMIT ${limitParameter}`,
    params,
  };
}

function parseDimensions(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new WarehouseAdapterError("dimensions must be a JSON object");
  }
}

export function normalizeWarehouseEvent(row = {}) {
  const type = row.type ?? row.event_type ?? row.eventType;
  const subjectId = row.subjectId ?? row.subject_id ?? row.user_id ?? row.userId;
  const event = {
    type,
    subjectId,
    ...(row.id ?? row.event_id ? { id: row.id ?? row.event_id } : {}),
    ...(row.eventName ?? row.event_name ? { eventName: row.eventName ?? row.event_name } : {}),
    ...(row.metric !== undefined ? { metric: row.metric } : {}),
    ...(row.value !== undefined ? { value: row.value } : {}),
    ...(row.period !== undefined ? { period: row.period } : {}),
    ...(row.censored !== undefined ? { censored: row.censored } : {}),
    ...(row.variant !== undefined ? { variant: row.variant } : {}),
    ...(row.occurredAt ?? row.occurred_at ? { occurredAt: row.occurredAt ?? row.occurred_at } : {}),
  };
  const dimensions = parseDimensions(row.dimensions);
  if (dimensions !== undefined) event.dimensions = dimensions;
  return event;
}

export class SqlWarehouseAdapter {
  constructor({ query, table = DEFAULT_TABLE, parameterStyle = "positional", name = "sql-warehouse" } = {}) {
    if (typeof query !== "function") throw new WarehouseAdapterError("query must be a function accepting { sql, params }");
    validateIdentifier(table, "table");
    this.query = query;
    this.table = table;
    this.parameterStyle = parameterStyle;
    this.name = name;
  }

  async fetchEvents({ experimentId, since, until, limit = DEFAULT_LIMIT } = {}) {
    const query = buildWarehouseEventQuery({ table: this.table, experimentId, since, until, limit, parameterStyle: this.parameterStyle });
    const result = await this.query(query);
    const rows = Array.isArray(result) ? result : result?.rows;
    if (!Array.isArray(rows)) throw new WarehouseAdapterError("warehouse query must return an array or an object with a rows array");
    return rows.map((row) => {
      if (row.experiment_id !== undefined && String(row.experiment_id) !== String(experimentId)) throw new WarehouseAdapterError("warehouse query returned an event for another experiment");
      return normalizeWarehouseEvent(row);
    });
  }
}

export async function importWarehouseEvents(store, experimentId, adapter, options = {}) {
  if (!adapter || typeof adapter.fetchEvents !== "function") throw new WarehouseAdapterError("adapter must implement fetchEvents(options)");
  const events = await adapter.fetchEvents({ experimentId, ...options });
  const result = ingestEvents(store, experimentId, { events });
  return {
    ...result,
    source: {
      type: "warehouse",
      adapter: adapter.name ?? "unknown",
      schemaVersion: WAREHOUSE_EVENT_SCHEMA_VERSION,
      ...(options.since ? { since: options.since } : {}),
      ...(options.until ? { until: options.until } : {}),
    },
  };
}
