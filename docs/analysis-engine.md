# Analysis engine

The UI is backed by small, dependency-free JavaScript modules so the same calculations can be reused by an API, CLI, warehouse adapter, or notebook later.

## Experiment analysis

`src/lib/experiment.js` exposes:

- `assignVariant({ subjectId, experimentId, allocation })`: deterministic assignment that keeps a subject in the same variant across sessions.
- `validateMetricContract(contract)`: checks that a metric has a name, unit, definition, numerator, denominator, exposure event, and attribution window.
- `analyzeExperiment(experiment)`: calculates LTV traces, conversion analysis, continuous revenue analysis, and SRM checks from a normalized experiment object.

## Statistical methods

`src/lib/statistics.js` exposes:

- Wilson intervals for binary rates.
- A two-sided normal approximation for a binary rate difference.
- A seeded Beta-Binomial Monte Carlo estimate for `P(Treatment > Control)`.
- A chi-square one-degree-of-freedom SRM check with a configurable allocation.
- A Welch-style normal approximation for continuous metrics using group means and standard deviations.

The Bayesian probability is deliberately seeded in the demo so a report is reproducible. Production runs should record the prior, seed, draw count, raw counts, and software commit alongside the result.

## Data contract

The demo object in `src/data/demoExperiment.js` separates:

1. exposure counts and assignment;
2. revenue and contribution inputs for LTV;
3. binary conversion counts;
4. continuous revenue summaries;
5. the versioned metric contract.

This separation prevents an outcome metric from silently changing its population or attribution window.

## Versioned Metric Contract schema

The canonical machine-readable schema is checked into [`schemas/metric-contract.v1.json`](../schemas/metric-contract.v1.json). Every stored contract is normalized to the `evidence-console.metric-contract/v1` schema version, so legacy create requests without a version are upgraded before persistence. Invalid types, unsupported fields, missing required fields, and out-of-range guardrails are rejected with row-level API details.

The same schema is available to external tools without reading the repository:

```text
GET /api/metric-contract/schema
```

The core contract fields are `name`, `unit`, `definition`, `numerator`, `denominator`, `exposureEvent`, `attributionWindow`, and `guardrails`. Optional metadata includes `population`, `primary`, `analysisMethod`, `minimumDetectableEffect`, and `practicalSignificanceThreshold`. Reports expose both the report schema version and `metricContractSchemaVersion`.

## Persistence and event import

The local Vite API uses `JsonFilePersistence` and stores the current state in `.data/experiments.json`. Writes use a temporary file followed by a rename, so a process restart can restore experiments and ingested events without committing local data to Git.

`POST /api/experiments/:id/import` accepts either JSON events or a CSV payload. The normalized event columns are:

```text
type,subject_id,event_name,metric,value,period,censored,occurred_at,variant,dimensions
```

Use `assignment`, `exposure`, and `outcome` as event types. Exposure events are deduplicated by subject and event name; outcome events can be made idempotent by providing `event_id` (or `id`). Import returns `received`, `accepted`, `skipped`, and row-level errors.

`GET /api/experiments/:id/report` returns a versioned JSON report by default. Add `?format=md` to receive a downloadable Markdown report containing the metric contract, ingestion summary, LTV trace, conversion analysis, data-quality result, and Bayesian seed.

The same operations are available through `scripts/evidence-console.mjs`:

```text
npm run cli -- validate --contract metric-contract.json --json
npm run cli -- import --experiment <id> --events events.json [--data .data/experiments.json]
npm run cli -- report --experiment <id> --format md --output report.md
```

The CLI uses the same `ExperimentStore`, persistence format, event adapter, and report renderer as the API. It returns exit code `1` for validation or partial-import failures, making it suitable for a CI gate.

## Warehouse adapter boundary

`src/lib/warehouseAdapter.js` provides a dependency-free integration boundary for production event sources:

- `buildWarehouseEventQuery(options)` creates a parameterized query for one experiment, optional time bounds, and a bounded row limit.
- `SqlWarehouseAdapter({ query, table, parameterStyle })` executes that query through an injected warehouse client and normalizes common snake_case columns.
- `importWarehouseEvents(store, experimentId, adapter, options)` routes normalized rows through the same idempotent `ingestEvents` path used by the API and returns source metadata with `evidence-console.warehouse-events/v1`.

The adapter rejects unsafe table identifiers and rows returned for another experiment. It does not own authentication, connection pooling, partition scheduling, or persistence; the host application supplies those concerns and saves `store.snapshot()` after a successful import. Use `named` parameters for clients such as BigQuery, `numbered` for `$1`-style clients, or `positional` for `?`-style clients.

## Scheduled monitoring and alerts

`src/lib/monitoring.js` evaluates a versioned stopping rule with four gates: minimum sample, minimum runtime, SRM safety, and Bayesian probability plus practical uplift. The result distinguishes `running`, `stopped`, `blocked`, and `review` states. Treatment can stop on `ship_treatment`, control can stop on `keep_control`, and SRM failure always yields `hold`.

The API exposes the evaluated result at:

```text
GET /api/experiments/:id/monitor
GET /api/stopping-rule/schema
```

For scheduler-friendly execution, use:

```text
npm run cli -- monitor --experiment <id> --webhook https://alerts.example/hook
```

Webhook delivery is injected and testable; the monitor uses a stable alert fingerprint (`experimentId:status:decision`) so the receiving system can deduplicate repeated scheduler runs.

## Raw-event survival LTV

When an experiment has no configured aggregate analysis input, the API can derive LTV directly from persisted outcome events. Add period-level outcomes using:

- `retention` or `active`: `value > 0.5` means active; the first non-censored value at or below `0.5` is a churn event.
- `contribution_margin` or `contribution`: contribution margin for that user and period. The MVP normalizes one observation per user-period.
- `period`: a positive integer such as week 1, week 2, or month 1.
- `censored`: optional boolean indicating that the observation ended without an observed churn event.

`GET /api/experiments/:id/analysis` returns `mode: "event-derived"` and calculates a Kaplan–Meier retention curve for each variant. The LTV trace is:

```text
LTV = Σ [Survival(t) × Expected Contribution Margin(t)]
```

The report endpoint includes the survival-based LTV table, observed subject counts, number of periods in each trace, and reproducible subject-level bootstrap intervals. Each bootstrap draw resamples users with all of their retention and contribution observations, preserving the within-user dependency. The output records the method, seed, draw count, confidence level, standard error, and interval for control, treatment, and their difference.

## Subgroup analysis

Outcome events may include a `dimensions` object such as `{ "device": "mobile", "source": "paid" }`. `GET /api/experiments/:id/segments?field=device` builds the same event-derived Survival LTV independently for each device value that has usable data in both variants. Subjects whose events disagree on the dimension are excluded from subgroup analysis and counted in `excludedAmbiguousSubjects`.

Each subgroup receives a bootstrap sign-test p-value for the treatment-minus-control LTV difference. The API then applies Benjamini–Hochberg correction across the tested subgroups and exposes `rawPValue`, `adjustedPValue`, and `significant` at α = 0.05. This is an exploratory subgroup layer; it should not replace pre-registered interaction hypotheses or a properly powered primary analysis.

## Limitations

The current engine is intentionally an MVP. It does not yet provide a production database adapter or correct for repeated peeking in a Frequentist workflow. The bootstrap interval is a point-estimate uncertainty summary, not a causal guarantee; the survival estimator should be validated against the warehouse’s cohort definitions and contribution attribution rules before using it for production decisions.
