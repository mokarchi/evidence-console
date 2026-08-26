const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

function normalSample(random) {
  const u = Math.max(random(), Number.EPSILON);
  const v = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function createRandom(seed = 42) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function gammaSample(shape, random) {
  if (!Number.isFinite(shape) || shape <= 0) return null;
  if (shape < 1) return gammaSample(shape + 1, random) * Math.pow(Math.max(random(), Number.EPSILON), 1 / shape);

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normalSample(random);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = random();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(alpha, beta, random = Math.random) {
  const first = gammaSample(alpha, random);
  const second = gammaSample(beta, random);
  if (first === null || second === null || first + second === 0) return null;
  return first / (first + second);
}

export function erfc(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign === 1 ? polynomial * Math.exp(-x * x) : 2 - polynomial * Math.exp(-x * x);
}

export function normalTwoSidedPValue(zScore) {
  if (!Number.isFinite(zScore)) return null;
  return erfc(Math.abs(zScore) / Math.sqrt(2));
}

export function wilsonInterval(successes, total, z = 1.959963984540054) {
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0 || successes < 0 || successes > total) return null;
  const proportion = successes / total;
  const denominator = 1 + (z ** 2) / total;
  const centre = (proportion + (z ** 2) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((proportion * (1 - proportion)) / total + (z ** 2) / (4 * total ** 2));
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

export function analyzeBinary({ control, treatment, prior = { alpha: 1, beta: 1 }, samples = 20000, seed = 42 }) {
  const controlRate = control.successes / control.total;
  const treatmentRate = treatment.successes / treatment.total;
  const difference = treatmentRate - controlRate;
  const relativeUplift = controlRate === 0 ? null : difference / controlRate;
  const pooledRate = (control.successes + treatment.successes) / (control.total + treatment.total);
  const standardError = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / control.total + 1 / treatment.total));
  const zScore = standardError === 0 ? null : difference / standardError;
  const random = createRandom(seed);
  let treatmentWins = 0;
  let expectedDifference = 0;
  for (let index = 0; index < samples; index += 1) {
    const controlDraw = sampleBeta(prior.alpha + control.successes, prior.beta + control.total - control.successes, random);
    const treatmentDraw = sampleBeta(prior.alpha + treatment.successes, prior.beta + treatment.total - treatment.successes, random);
    if (controlDraw === null || treatmentDraw === null) continue;
    if (treatmentDraw > controlDraw) treatmentWins += 1;
    expectedDifference += treatmentDraw - controlDraw;
  }
  const effectiveSamples = samples || 1;
  return {
    controlRate,
    treatmentRate,
    difference,
    relativeUplift,
    controlInterval: wilsonInterval(control.successes, control.total),
    treatmentInterval: wilsonInterval(treatment.successes, treatment.total),
    zScore,
    pValue: normalTwoSidedPValue(zScore),
    probabilityTreatmentBetter: treatmentWins / effectiveSamples,
    expectedDifference: expectedDifference / effectiveSamples,
  };
}

export function calculateSrm({ controlCount, treatmentCount, allocation = 0.5 }) {
  const total = controlCount + treatmentCount;
  if (![controlCount, treatmentCount, allocation].every(Number.isFinite) || total <= 0 || allocation <= 0 || allocation >= 1) return null;
  const expectedControl = total * allocation;
  const expectedTreatment = total * (1 - allocation);
  const chiSquare = ((controlCount - expectedControl) ** 2) / expectedControl + ((treatmentCount - expectedTreatment) ** 2) / expectedTreatment;
  return {
    chiSquare,
    pValue: erfc(Math.sqrt(chiSquare / 2)),
    ratio: controlCount / treatmentCount,
    pass: erfc(Math.sqrt(chiSquare / 2)) > 0.01,
  };
}

export function analyzeContinuous({ control, treatment }) {
  const difference = treatment.mean - control.mean;
  const standardError = Math.sqrt((control.stdDev ** 2) / control.total + (treatment.stdDev ** 2) / treatment.total);
  const zScore = standardError === 0 ? null : difference / standardError;
  const interval = zScore === null ? null : [difference - 1.959963984540054 * standardError, difference + 1.959963984540054 * standardError];
  return { difference, standardError, zScore, pValue: normalTwoSidedPValue(zScore), interval };
}

export const STATISTICS_CONSTANTS = { SQRT_TWO_PI };
