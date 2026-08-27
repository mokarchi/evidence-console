import { calculateLtv, calculateAov, calculateLifetimeFromChurn, calculatePurchaseFrequency, buildLtvTrace } from "./ltv.js";
import { analyzeBinary, analyzeContinuous, calculateSrm } from "./statistics.js";
import { validateMetricContract } from "./metricContract.js";

export { validateMetricContract } from "./metricContract.js";

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function assignVariant({ subjectId, experimentId, allocation = 0.5 }) {
  if (!subjectId || !experimentId || !Number.isFinite(allocation) || allocation <= 0 || allocation >= 1) return null;
  const bucket = hashString(`${experimentId}:${subjectId}`) / 4294967296;
  return bucket < allocation ? "control" : "treatment";
}

function calculateVariantLtv(variant) {
  const aov = variant.aov ?? calculateAov({ netRevenue: variant.netRevenue, completedOrders: variant.completedOrders });
  const purchaseFrequency = variant.purchaseFrequency ?? calculatePurchaseFrequency({ completedOrders: variant.completedOrders, payingCustomers: variant.payingCustomers, period: variant.period ?? 1 });
  const lifetime = variant.lifetime ?? calculateLifetimeFromChurn(variant.churnRate);
  const trace = buildLtvTrace({ aov, purchaseFrequency, lifetime, contributionMargin: variant.contributionMargin ?? 1 });
  return { ...trace, aov, purchaseFrequency, lifetime };
}

export function analyzeExperiment(experiment) {
  const contractStatus = validateMetricContract(experiment.metricContract);
  const control = calculateVariantLtv(experiment.variants.control);
  const treatment = calculateVariantLtv(experiment.variants.treatment);
  const conversion = analyzeBinary({ control: experiment.conversion.control, treatment: experiment.conversion.treatment, samples: experiment.conversion.samples ?? 20000, seed: experiment.conversion.seed ?? 42 });
  const revenue = analyzeContinuous({ control: experiment.revenue.control, treatment: experiment.revenue.treatment });
  const srm = calculateSrm({ controlCount: experiment.variants.control.exposedUsers, treatmentCount: experiment.variants.treatment.exposedUsers, allocation: experiment.allocation ?? 0.5 });
  return {
    contractStatus,
    variants: { control, treatment },
    ltv: {
      revenue: { control: control.revenueLtv, treatment: treatment.revenueLtv, difference: treatment.revenueLtv - control.revenueLtv },
      contribution: { control: control.contributionLtv, treatment: treatment.contributionLtv, difference: treatment.contributionLtv - control.contributionLtv },
    },
    conversion,
    revenue,
    srm,
  };
}
