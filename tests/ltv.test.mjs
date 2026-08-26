import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLtvTrace,
  calculateAov,
  calculateLifetimeFromChurn,
  calculateLtv,
  calculatePurchaseFrequency,
} from "../src/lib/ltv.js";

test("calculates AOV from net revenue and completed orders", () => {
  assert.equal(calculateAov({ netRevenue: 1200, completedOrders: 20 }), 60);
});

test("calculates purchase frequency per paying customer and period", () => {
  assert.equal(calculatePurchaseFrequency({ completedOrders: 240, payingCustomers: 100, period: 2 }), 1.2);
});

test("uses stable churn as a lifetime approximation", () => {
  assert.equal(calculateLifetimeFromChurn(0.05), 20);
});

test("builds a revenue and contribution LTV trace", () => {
  const trace = buildLtvTrace({ aov: 50, purchaseFrequency: 2, lifetime: 2, contributionMargin: 0.5 });
  assert.equal(trace.revenueLtv, 200);
  assert.equal(trace.contributionLtv, 100);
  assert.match(trace.formula, /Contribution Margin/);
});

test("returns null for invalid divisions and churn values", () => {
  assert.equal(calculateAov({ netRevenue: 10, completedOrders: 0 }), null);
  assert.equal(calculatePurchaseFrequency({ completedOrders: 10, payingCustomers: 2, period: 0 }), null);
  assert.equal(calculateLifetimeFromChurn(0), null);
  assert.equal(calculateLtv({ aov: 10, purchaseFrequency: 1, lifetime: 2, contributionMargin: -1 }), null);
});
