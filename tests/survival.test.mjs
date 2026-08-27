import test from "node:test";
import assert from "node:assert/strict";
import { buildContributionByPeriod, buildKaplanMeier, calculateSurvivalLtv, buildSurvivalLtv } from "../src/lib/survival.js";

test("builds a Kaplan-Meier retention curve with events and censoring", () => {
  const result = buildKaplanMeier([
    { subjectId: "u1", period: 1, value: 1 },
    { subjectId: "u1", period: 2, value: 1 },
    { subjectId: "u1", period: 3, value: 0 },
    { subjectId: "u2", period: 1, value: 1 },
    { subjectId: "u2", period: 2, value: 1 },
    { subjectId: "u2", period: 3, value: 1, censored: true },
    { subjectId: "u3", period: 1, value: 1 },
    { subjectId: "u3", period: 2, value: 0 },
  ]);
  assert.equal(result.subjectCount, 3);
  assert.deepEqual(result.curve[0], { period: 1, atRisk: 3, events: 0, censored: 0, survival: 1 });
  assert.equal(result.curve[1].atRisk, 3);
  assert.equal(result.curve[1].events, 1);
  assert.ok(Math.abs(result.curve[1].survival - 2 / 3) < 1e-12);
  assert.equal(result.curve[2].atRisk, 2);
  assert.equal(result.curve[2].events, 1);
  assert.equal(result.curve[2].censored, 1);
  assert.ok(Math.abs(result.curve[2].survival - 1 / 3) < 1e-12);
});

test("aggregates contribution per user-period and calculates survival LTV", () => {
  const contributionByPeriod = buildContributionByPeriod([
    { subjectId: "u1", period: 1, value: 10 },
    { subjectId: "u2", period: 1, value: 14 },
    { subjectId: "u1", period: 2, value: 20 },
  ]);
  assert.deepEqual(contributionByPeriod, [
    { period: 1, users: 2, totalContribution: 24, expectedContribution: 12 },
    { period: 2, users: 1, totalContribution: 20, expectedContribution: 20 },
  ]);
  const result = calculateSurvivalLtv({
    survivalCurve: [{ period: 1, survival: 1 }, { period: 2, survival: 0.5 }],
    contributionByPeriod,
  });
  assert.equal(result.ltv, 22);
  assert.match(result.formula, /Survival/);
});

test("combines raw retention and contribution observations", () => {
  const result = buildSurvivalLtv({
    activityRecords: [
      { subjectId: "u1", period: 1, value: 1 },
      { subjectId: "u1", period: 2, value: 0 },
      { subjectId: "u2", period: 1, value: 1 },
      { subjectId: "u2", period: 2, value: 1, censored: true },
    ],
    contributionRecords: [
      { subjectId: "u1", period: 1, value: 10 },
      { subjectId: "u2", period: 1, value: 12 },
      { subjectId: "u1", period: 2, value: 8 },
    ],
  });
  assert.equal(result.ltv, 15);
  assert.equal(result.survivalCurve.length, 2);
  assert.equal(result.components[1].survival, 0.5);
});
