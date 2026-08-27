function asPeriod(value) {
  const period = Number(value);
  if (!Number.isInteger(period) || period < 1) return null;
  return period;
}

function groupBySubject(records = []) {
  const subjects = new Map();
  records.forEach((record) => {
    const subjectId = String(record.subjectId ?? "").trim();
    const period = asPeriod(record.period);
    const value = Number(record.value);
    if (!subjectId || period === null || !Number.isFinite(value)) return;
    if (!subjects.has(subjectId)) subjects.set(subjectId, new Map());
    subjects.get(subjectId).set(period, {
      ...record,
      subjectId,
      period,
      value,
      censored: record.censored === true,
    });
  });
  return subjects;
}

function terminationForSubject(records) {
  const ordered = [...records.values()].sort((left, right) => left.period - right.period);
  const event = ordered.find((record) => !record.censored && record.value <= 0.5);
  const explicitCensor = ordered.find((record) => record.censored);
  if (event && (!explicitCensor || event.period < explicitCensor.period)) return { period: event.period, event: true };
  if (explicitCensor) return { period: explicitCensor.period, event: false };
  return { period: ordered.at(-1).period, event: false };
}

export function buildKaplanMeier(records = []) {
  const subjects = groupBySubject(records);
  const terminations = [...subjects.values()].map(terminationForSubject);
  const periods = [...new Set([...subjects.values()].flatMap((timeline) => [...timeline.keys()]))].sort((left, right) => left - right);
  let survival = 1;
  const curve = periods.map((period) => {
    const atRisk = terminations.filter((termination) => termination.period >= period).length;
    const events = terminations.filter((termination) => termination.period === period && termination.event).length;
    const censored = terminations.filter((termination) => termination.period === period && !termination.event).length;
    if (atRisk > 0) survival *= 1 - events / atRisk;
    return { period, atRisk, events, censored, survival };
  });
  return { subjectCount: subjects.size, curve };
}

export function buildContributionByPeriod(records = []) {
  const byPeriod = new Map();
  const subjects = groupBySubject(records);
  for (const timeline of subjects.values()) {
    for (const record of timeline.values()) {
      if (!byPeriod.has(record.period)) byPeriod.set(record.period, new Map());
      const users = byPeriod.get(record.period);
      users.set(record.subjectId, (users.get(record.subjectId) ?? 0) + record.value);
    }
  }
  return [...byPeriod.entries()]
    .sort(([left], [right]) => left - right)
    .map(([period, users]) => {
      const totalContribution = [...users.values()].reduce((total, value) => total + value, 0);
      return {
        period,
        users: users.size,
        totalContribution,
        expectedContribution: users.size ? totalContribution / users.size : 0,
      };
    });
}

export function calculateSurvivalLtv({ survivalCurve = [], contributionByPeriod = [] } = {}) {
  const survivalByPeriod = new Map(survivalCurve.map((row) => [row.period, row.survival]));
  const components = contributionByPeriod
    .filter((row) => survivalByPeriod.has(row.period))
    .map((row) => {
      const survival = survivalByPeriod.get(row.period);
      return {
        ...row,
        survival,
        contribution: survival * row.expectedContribution,
      };
    });
  return {
    ltv: components.reduce((total, row) => total + row.contribution, 0),
    components,
    formula: "Σ [Survival(t) × Expected Contribution Margin(t)]",
  };
}

export function buildSurvivalLtv({ activityRecords = [], contributionRecords = [] } = {}) {
  const survival = buildKaplanMeier(activityRecords);
  const contributionByPeriod = buildContributionByPeriod(contributionRecords);
  return {
    subjectCount: survival.subjectCount,
    survivalCurve: survival.curve,
    contributionByPeriod,
    ...calculateSurvivalLtv({ survivalCurve: survival.curve, contributionByPeriod }),
  };
}

function createSeededRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function quantile(values, probability) {
  if (values.length === 0) return null;
  const position = (values.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}

function summarizeBootstrap(values, confidenceLevel) {
  const sorted = [...values].sort((left, right) => left - right);
  const alpha = (1 - confidenceLevel) / 2;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.length > 1 ? values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1) : 0;
  return {
    mean,
    standardError: Math.sqrt(variance),
    interval: [quantile(sorted, alpha), quantile(sorted, 1 - alpha)],
  };
}

function bootstrapVariantSamples({ activityRecords = [], contributionRecords = [] }, random, draws) {
  const activityBySubject = new Map();
  const contributionBySubject = new Map();
  activityRecords.forEach((record) => {
    const subjectId = String(record.subjectId);
    if (!activityBySubject.has(subjectId)) activityBySubject.set(subjectId, []);
    activityBySubject.get(subjectId).push(record);
  });
  contributionRecords.forEach((record) => {
    const subjectId = String(record.subjectId);
    if (!contributionBySubject.has(subjectId)) contributionBySubject.set(subjectId, []);
    contributionBySubject.get(subjectId).push(record);
  });
  const subjects = [...activityBySubject.keys()];
  const samples = [];
  for (let draw = 0; draw < draws; draw += 1) {
    const sampledActivity = [];
    const sampledContribution = [];
    for (let index = 0; index < subjects.length; index += 1) {
      const sourceSubject = subjects[Math.floor(random() * subjects.length)];
      const bootstrapSubject = `bootstrap_${draw}_${index}`;
      for (const record of activityBySubject.get(sourceSubject) ?? []) sampledActivity.push({ ...record, subjectId: bootstrapSubject });
      for (const record of contributionBySubject.get(sourceSubject) ?? []) sampledContribution.push({ ...record, subjectId: bootstrapSubject });
    }
    samples.push(buildSurvivalLtv({ activityRecords: sampledActivity, contributionRecords: sampledContribution }).ltv);
  }
  return samples;
}

export function bootstrapSurvivalLtv({ control, treatment, seed = 20260827, draws = 1000, confidenceLevel = 0.95 } = {}) {
  const normalizedDraws = Number(draws);
  const normalizedConfidence = Number(confidenceLevel);
  if (!Number.isInteger(normalizedDraws) || normalizedDraws < 100) throw new Error("draws must be an integer greater than or equal to 100");
  if (!Number.isFinite(normalizedConfidence) || normalizedConfidence <= 0 || normalizedConfidence >= 1) throw new Error("confidenceLevel must be between 0 and 1");
  const random = createSeededRandom(seed);
  const controlSamples = bootstrapVariantSamples(control, random, normalizedDraws);
  const treatmentSamples = bootstrapVariantSamples(treatment, random, normalizedDraws);
  const differenceSamples = controlSamples.map((value, index) => treatmentSamples[index] - value);
  const positiveDraws = differenceSamples.filter((value) => value > 0).length;
  const probabilityTreatmentBetter = (positiveDraws + 1) / (differenceSamples.length + 2);
  return {
    method: "subject-level bootstrap",
    seed: Number(seed) >>> 0,
    draws: normalizedDraws,
    confidenceLevel: normalizedConfidence,
    control: summarizeBootstrap(controlSamples, normalizedConfidence),
    treatment: summarizeBootstrap(treatmentSamples, normalizedConfidence),
    difference: { ...summarizeBootstrap(differenceSamples, normalizedConfidence), pValue: Math.min(1, 2 * Math.min(probabilityTreatmentBetter, 1 - probabilityTreatmentBetter)) },
    probabilityTreatmentBetter,
  };
}

export function adjustBenjaminiHochberg(pValues = []) {
  const adjusted = Array(pValues.length).fill(null);
  const ranked = pValues
    .map((value, index) => ({ value: value === null || value === undefined || value === "" ? null : Number(value), index }))
    .filter(({ value }) => Number.isFinite(value))
    .sort((left, right) => left.value - right.value);
  let runningMinimum = 1;
  for (let index = ranked.length - 1; index >= 0; index -= 1) {
    const rank = index + 1;
    runningMinimum = Math.min(runningMinimum, (ranked[index].value * ranked.length) / rank);
    adjusted[ranked[index].index] = Math.min(1, runningMinimum);
  }
  return adjusted;
}

export function analyzeSurvivalByVariant({ control, treatment, uncertainty = {} } = {}) {
  const controlResult = buildSurvivalLtv(control);
  const treatmentResult = buildSurvivalLtv(treatment);
  const difference = treatmentResult.ltv - controlResult.ltv;
  return {
    control: controlResult,
    treatment: treatmentResult,
    difference,
    relativeUplift: controlResult.ltv === 0 ? null : difference / controlResult.ltv,
    uncertainty: bootstrapSurvivalLtv({ control, treatment, ...uncertainty }),
  };
}
