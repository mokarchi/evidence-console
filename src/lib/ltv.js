export function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

export function calculateAov({ netRevenue, completedOrders }) {
  return safeDivide(netRevenue, completedOrders);
}

export function calculatePurchaseFrequency({ completedOrders, payingCustomers, period = 1 }) {
  if (!Number.isFinite(period) || period <= 0) return null;
  const ordersPerCustomer = safeDivide(completedOrders, payingCustomers);
  return ordersPerCustomer === null ? null : ordersPerCustomer / period;
}

export function calculateLifetimeFromChurn(churnRate) {
  if (!Number.isFinite(churnRate) || churnRate <= 0 || churnRate >= 1) return null;
  return 1 / churnRate;
}

export function calculateLtv({ aov, purchaseFrequency, lifetime, contributionMargin = 1 }) {
  const values = [aov, purchaseFrequency, lifetime, contributionMargin];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  return aov * purchaseFrequency * lifetime * contributionMargin;
}

export function buildLtvTrace({ aov, purchaseFrequency, lifetime, contributionMargin = 1 }) {
  const ltv = calculateLtv({ aov, purchaseFrequency, lifetime, contributionMargin });
  return {
    inputs: { aov, purchaseFrequency, lifetime, contributionMargin },
    formula: "AOV × Purchase Frequency × Lifetime × Contribution Margin",
    revenueLtv: calculateLtv({ aov, purchaseFrequency, lifetime }),
    contributionLtv: ltv,
  };
}
