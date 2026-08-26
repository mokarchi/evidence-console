# Metric Contract

Metric Contracts make every number in an experiment report inspectable and reproducible.

## Required fields

| Field | Meaning |
| --- | --- |
| `metric_id` | Stable identifier for the metric definition. |
| `unit` | Randomization/analysis unit, usually `user` or `account`. |
| `eligible_population` | Who is allowed into the denominator. |
| `numerator` | Exact event or value aggregation. |
| `denominator` | Exact population count or exposure set. |
| `window` | Attribution window and timezone. |
| `revenue_basis` | Gross, net, refunded, tax, shipping, and currency rules. |
| `cost_basis` | Variable costs included in Contribution LTV. |
| `exclusions` | Test users, bots, duplicate events, or other filters. |
| `primary_or_guardrail` | Whether the metric drives the decision or protects against harm. |
| `analysis_method` | Frequentist, Bayesian, bootstrap, survival, or another method. |

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

```yaml
metric_id: ltv_90d_contribution_per_user
unit: user
eligible_population: users_with_first_exposure
numerator: sum(order_revenue - variable_cost - payment_fee - refund_amount)
denominator: exposed_users
window: 90d_from_first_exposure
revenue_basis: net_revenue_excluding_tax_and_shipping
cost_basis: contribution_margin_after_variable_costs
exclusions:
  - is_test_user = false
  - duplicate_exposure = false
primary_or_guardrail: primary
analysis_method: bayesian_difference_of_means
```
