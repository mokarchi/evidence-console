import test from "node:test";
import assert from "node:assert/strict";
import { ExperimentStore } from "../src/lib/api.js";
import { demoExperiment } from "../src/data/demoExperiment.js";
import { buildWarehouseEventQuery, importWarehouseEvents, SqlWarehouseAdapter, WAREHOUSE_EVENT_SCHEMA_VERSION, WarehouseAdapterError } from "../src/lib/warehouseAdapter.js";

test("builds a parameterized warehouse event query", () => {
  const query = buildWarehouseEventQuery({ table: "analytics.experiment_events", experimentId: "exp_warehouse", since: "2026-08-01T00:00:00Z", until: "2026-08-08T00:00:00Z", limit: 500, parameterStyle: "numbered" });
  assert.equal(query.schemaVersion, WAREHOUSE_EVENT_SCHEMA_VERSION);
  assert.match(query.sql, /FROM analytics\.experiment_events/);
  assert.match(query.sql, /experiment_id = \$1/);
  assert.match(query.sql, /occurred_at >= \$2/);
  assert.match(query.sql, /occurred_at < \$3/);
  assert.match(query.sql, /LIMIT \$4/);
  assert.deepEqual(query.params, ["exp_warehouse", "2026-08-01T00:00:00Z", "2026-08-08T00:00:00Z", 500]);
  assert.throws(() => buildWarehouseEventQuery({ table: "events; DROP TABLE users", experimentId: "exp_warehouse" }), WarehouseAdapterError);
});

test("normalizes warehouse rows and imports them into the experiment store", async () => {
  const requests = [];
  const adapter = new SqlWarehouseAdapter({
    name: "fake-bigquery",
    table: "analytics.experiment_events",
    parameterStyle: "named",
    query: async (request) => {
      requests.push(request);
      return {
        rows: [
          { event_id: "warehouse_exposure_1", experiment_id: "exp_warehouse", event_type: "exposure", subject_id: "warehouse_user_1", event_name: "checkout_view", occurred_at: "2026-08-27T09:00:00Z" },
          { event_id: "warehouse_outcome_1", experiment_id: "exp_warehouse", event_type: "outcome", subject_id: "warehouse_user_1", metric: "purchase_conversion", value: "1", dimensions: '{"device":"mobile"}', occurred_at: "2026-08-27T09:01:00Z" },
        ],
      };
    },
  });
  const store = new ExperimentStore([{ ...demoExperiment, id: "exp_warehouse" }]);
  const result = await importWarehouseEvents(store, "exp_warehouse", adapter, { since: "2026-08-27T00:00:00Z", limit: 250 });
  assert.equal(result.accepted, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.source.adapter, "fake-bigquery");
  assert.equal(result.source.schemaVersion, WAREHOUSE_EVENT_SCHEMA_VERSION);
  assert.equal(store.getIngestionSummary("exp_warehouse").outcomes, 1);
  assert.deepEqual(store.getOutcomeRecords("exp_warehouse")[0].dimensions, { device: "mobile" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].params.experiment_id, "exp_warehouse");
  assert.equal(requests[0].params.since, "2026-08-27T00:00:00Z");
  assert.equal(requests[0].params.limit, 250);
});

test("rejects rows that cross the requested experiment boundary", async () => {
  const adapter = new SqlWarehouseAdapter({ query: async () => ({ rows: [{ experiment_id: "another_experiment", event_type: "exposure", subject_id: "user_1" }] }) });
  await assert.rejects(() => adapter.fetchEvents({ experimentId: "exp_warehouse" }), WarehouseAdapterError);
});
