# Evidence Console

Evidence Console is an open-source workspace for designing, validating, and reviewing A/B experiments with a transparent LTV calculation trail.

The current release is a runnable MVP built around one core job: help a product or data team decide whether an experiment should ship without hiding the assumptions behind the result.

## What is in this MVP

- A four-stage experiment storyline: Hypothesis → Assignment → Evidence → Decision.
- Control/Treatment outcome review with uncertainty intervals and synthetic data.
- Data-quality checks for SRM, event integrity, schema changes, exposure uniqueness, missingness, and late events.
- A versioned Metric Contract with explicit unit, numerator, denominator, exposure event, window, and guardrails.
- A Formula Trace that separates Revenue LTV from Contribution LTV.
- Interactive LTV mode switching, snapshot selection, contract expansion, stage navigation, Decision Brief, and reproducible-report feedback.
- A pure JavaScript analysis layer for deterministic assignment, SRM detection, binary Frequentist/Bayesian analysis, continuous-metric analysis, and Metric Contract validation.

The analysis API and its assumptions are documented in [docs/analysis-engine.md](docs/analysis-engine.md).

## API

The Worker exposes a small JSON API for local development and future adapters:

```text
GET  /api/health
GET  /api/experiments
POST /api/experiments
GET  /api/experiments/:id
POST /api/experiments/:id/assign
POST /api/experiments/:id/exposure
POST /api/experiments/:id/outcome
GET  /api/experiments/:id/analysis
```

Example assignment flow:

```bash
curl -X POST http://localhost:4173/api/experiments/exp_demo/assign \
  -H "content-type: application/json" \
  -d '{"subjectId":"user_123"}'
```

The current store is process-local by design. Connect `ExperimentStore` to a durable database or warehouse before using it for production traffic.

## LTV contract

The prototype uses the following auditable path:

```text
AOV = Net Revenue / Completed Orders
Purchase Frequency = Completed Orders / Unique Paying Customers / Period
Lifetime ≈ 1 / Churn Rate       # only when churn is stable and units match
Contribution LTV ≈ AOV × Purchase Frequency × Lifetime × Contribution Margin
```

For non-contractual businesses or changing cohorts, LTV should be estimated from retention/survival curves instead of blindly applying `1 / churn`:

```text
LTV = Σ [Survival(t) × Expected Contribution Margin(t)]
```

Revenue LTV and Contribution LTV must be named separately. The latter is the decision metric because it reflects variable costs, payment fees, refunds, and other contribution-level deductions.

## Experiment principles

1. Write a falsifiable hypothesis with a defined unit, population, primary metric, guardrails, time window, and MDE.
2. Randomize at a stable unit such as user or account and persist assignment across sessions.
3. Log assignment and first exposure separately from outcome events.
4. Check SRM, event integrity, missingness, and A/A behavior before interpreting an effect.
5. Use a binary proportion model for user-level conversion and a robust or model-based approach for heavy-tailed revenue.
6. Predefine the stopping rule, minimum sample, maximum runtime, and practical decision threshold.
7. Report effect size, uncertainty, practical impact, and expected downside together.

## Run locally

```bash
npm install --prefer-offline --no-audit --no-fund
npm run dev
```

The app runs locally with a seeded synthetic experiment. The analysis engine is separated from the UI so it can later be connected to a warehouse adapter or API. Build validation is available with:

```bash
npm run build
npm test
```

## Project status

This is an early open-source MVP, not a production experimentation service. The next implementation layers are:

- machine-readable Metric Contract schemas;
- warehouse adapters and event ingestion;
- cohort retention and survival-based LTV estimators;
- reproducible report export and CLI workflows.

## License

Apache-2.0. See [LICENSE](LICENSE).
