# Metric Contract

Metric Contracts make every number in an experiment report inspectable and reproducible.

## Canonical schema

The runtime contract is defined by [`schemas/metric-contract.v1.json`](../schemas/metric-contract.v1.json) and identified as `evidence-console.metric-contract/v1`. It is also available from a running API at `GET /api/metric-contract/schema`. This is the version stored alongside each experiment and included in exported reports.

## Required fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Immutable schema identifier for the contract shape. |
| `name` | Human-readable metric name. |
| `unit` | Analysis unit, usually `user` or `account`. |
| `definition` | Plain-language statement of what the metric means. |
| `numerator` | Exact event or value aggregation. |
| `denominator` | Exact population count or exposure set. |
| `exposureEvent` | Event that starts eligibility and attribution. |
| `attributionWindow` | Time window used to attribute outcomes. |
| `guardrails` | SRM thresholds: `minSampleRatio` and `maxSrmPValue`. |

Optional metadata includes `population`, `primary`, `analysisMethod`, `minimumDetectableEffect`, and `practicalSignificanceThreshold`.

## Canonical LTV definitions

```text
AOV = Net Revenue / Completed Orders
Purchase Frequency = Completed Orders / Unique Paying Customers / Period
ARPPU = AOV × Purchase Frequency
Lifetime ≈ 1 / Churn Rate
Revenue LTV ≈ ARPPU × Lifetime
Contribution LTV ≈ Revenue LTV × Contribution Margin
```

The lifetime approximation assumes a stable per-period churn rate and the same time unit throughout. For a changing cohort, use retention or survival probability:

```text
LTV = Σ [P(active at t) × E(contribution margin at t)] / (1 + discount_rate)^t
```

`Purchase Recency` is a predictor for future activity, not a direct multiplicative term in the LTV identity.

## Example

```json
{
  "schemaVersion": "evidence-console.metric-contract/v1",
  "name": "90-Day Contribution LTV per User",
  "unit": "USD per exposed user",
  "definition": "Total contribution margin attributable to a user within 90 days of first exposure.",
  "numerator": "sum(order_revenue - variable_cost - payment_fee - refund_amount)",
  "denominator": "exposed_users",
  "exposureEvent": "checkout_view",
  "attributionWindow": "90 days from first exposure",
  "population": "users with a first checkout_view exposure",
  "primary": true,
  "analysisMethod": "survival plus subject-level bootstrap",
  "minimumDetectableEffect": 0.05,
  "practicalSignificanceThreshold": 0.03,
  "guardrails": {
    "minSampleRatio": 0.8,
    "maxSrmPValue": 0.01
  }
}
```
