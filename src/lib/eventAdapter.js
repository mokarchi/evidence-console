import { ApiError } from "./errors.js";

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseCsv(csv) {
  if (typeof csv !== "string" || csv.trim() === "") throw new ApiError(400, "CSV data is required");
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) throw new ApiError(400, "CSV must contain a header and at least one row");
  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ""));
  if (headers.some((header) => header === "")) throw new ApiError(400, "CSV headers cannot be empty");
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    if (values.length !== headers.length) throw new ApiError(400, `CSV row ${index + 2} has ${values.length} cells; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex]]));
  });
}

function normalizeType(row) {
  return String(row.type ?? row.event_type ?? row.eventType ?? "").toLowerCase();
}

function normalizeSubjectId(row) {
  return row.subjectId ?? row.subject_id ?? row.user_id ?? row.userId;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function optionalBoolean(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const normalized = String(value).toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return value;
}

export function ingestEvents(store, experimentId, input = {}) {
  const rows = input.format === "csv" ? parseCsv(input.data) : input.events;
  if (!Array.isArray(rows)) throw new ApiError(400, "events must be an array or provide format=csv with data");
  const result = { received: rows.length, accepted: 0, skipped: 0, errors: [] };
  rows.forEach((row, index) => {
    try {
      const type = normalizeType(row);
      const subjectId = normalizeSubjectId(row);
      if (type === "assignment" || type === "assign") {
        store.assign(experimentId, subjectId);
      } else if (type === "exposure" || type === "expose") {
        store.recordExposure(experimentId, { subjectId, variant: row.variant, eventName: row.eventName ?? row.event_name, occurredAt: row.occurredAt ?? row.occurred_at });
      } else if (type === "outcome") {
        const value = typeof row.value === "number" ? row.value : Number(row.value);
        store.recordOutcome(experimentId, {
          id: row.id ?? row.event_id,
          subjectId,
          metric: row.metric,
          value,
          period: optionalNumber(row.period),
          censored: optionalBoolean(row.censored),
          occurredAt: row.occurredAt ?? row.occurred_at,
        });
      } else {
        result.skipped += 1;
        result.errors.push({ row: index + 1, message: "type must be assignment, exposure, or outcome" });
        return;
      }
      result.accepted += 1;
    } catch (error) {
      result.skipped += 1;
      result.errors.push({ row: index + 1, message: error.message });
    }
  });
  return result;
}
