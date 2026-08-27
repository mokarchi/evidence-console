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

export function analyzeSurvivalByVariant({ control, treatment } = {}) {
  const controlResult = buildSurvivalLtv(control);
  const treatmentResult = buildSurvivalLtv(treatment);
  const difference = treatmentResult.ltv - controlResult.ltv;
  return {
    control: controlResult,
    treatment: treatmentResult,
    difference,
    relativeUplift: controlResult.ltv === 0 ? null : difference / controlResult.ltv,
  };
}
