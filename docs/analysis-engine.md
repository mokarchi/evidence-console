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

## Persistence and event import

The local Vite API uses `JsonFilePersistence` and stores the current state in `.data/experiments.json`. Writes use a temporary file followed by a rename, so a process restart can restore experiments and ingested events without committing local data to Git.

`POST /api/experiments/:id/import` accepts either JSON events or a CSV payload. The normalized event columns are:

```text
type,subject_id,event_name,metric,value,occurred_at,variant
```

Use `assignment`, `exposure`, and `outcome` as event types. Exposure events are deduplicated by subject and event name; outcome events can be made idempotent by providing `event_id` (or `id`). Import returns `received`, `accepted`, `skipped`, and row-level errors.

`GET /api/experiments/:id/report` returns a versioned JSON report by default. Add `?format=md` to receive a downloadable Markdown report containing the metric contract, ingestion summary, LTV trace, conversion analysis, data-quality result, and Bayesian seed.

## Limitations

The current engine is intentionally an MVP. It does not yet provide a production database adapter, correct for repeated peeking in a Frequentist workflow, model retention as a survival curve, or calculate uncertainty for the LTV product itself. Those layers should be added before using the project for production decisions.
