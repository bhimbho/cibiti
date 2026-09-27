import { describe, expect, it } from "vitest";
import {
  canExtendAttempt,
  canRestartAttempt,
  DEFAULT_EXAM_DAY_POLICY,
  policyProblems,
  type ExamDayPolicy,
  type Standing,
} from "./policy";

const officer: Standing = { canManageExams: true, canInvigilate: true };
const invigilator: Standing = { canManageExams: false, canInvigilate: true };
const outsider: Standing = { canManageExams: false, canInvigilate: false };

function policy(patch: Partial<ExamDayPolicy> = {}): ExamDayPolicy {
  return { ...DEFAULT_EXAM_DAY_POLICY, ...patch };
}

describe("default policy", () => {
  it("allows added time but no restarts until configured", () => {
    expect(DEFAULT_EXAM_DAY_POLICY.allowRestart).toBe(false);
    expect(DEFAULT_EXAM_DAY_POLICY.invigilatorCanExtend).toBe(true);
  });
});

describe("canRestartAttempt", () => {
  it("refuses everyone while restarting is switched off", () => {
    expect(canRestartAttempt(policy(), officer, 0)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/switched off/i),
    });
  });

  it("allows an exam officer once restarting is on", () => {
    expect(canRestartAttempt(policy({ allowRestart: true }), officer, 0)).toEqual({ ok: true });
  });

  it("refuses an invigilator until invigilators are allowed, then permits them", () => {
    const on = policy({ allowRestart: true });
    expect(canRestartAttempt(on, invigilator, 0)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/invigilators cannot restart/i),
    });
    expect(canRestartAttempt({ ...on, invigilatorCanRestart: true }, invigilator, 0)).toEqual({ ok: true });
  });

  it("refuses somebody with neither standing", () => {
    expect(canRestartAttempt(policy({ allowRestart: true }), outsider, 0)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/permission/i),
    });
  });

  it("stops at the restart limit", () => {
    const twice = policy({ allowRestart: true, maxRestartsPerCandidate: 2 });
    expect(canRestartAttempt(twice, officer, 1)).toEqual({ ok: true });
    expect(canRestartAttempt(twice, officer, 2)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/already been restarted 2 times/i),
    });
  });
});

describe("canExtendAttempt", () => {
  it("lets an officer add time within the cap", () => {
    expect(canExtendAttempt(policy(), officer, 0, 30)).toEqual({ ok: true });
  });

  it("counts time already added, so small grants cannot walk past the cap", () => {
    expect(canExtendAttempt(policy({ maxExtraMinutesPerAttempt: 60 }), officer, 50, 20)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/You can add 10 more/),
    });
  });

  it("says so when an attempt is already at the cap", () => {
    expect(canExtendAttempt(policy({ maxExtraMinutesPerAttempt: 30 }), officer, 30, 5)).toMatchObject({
      reason: expect.stringMatching(/already has the maximum 30 minutes/i),
    });
  });

  it("allows exactly the cap", () => {
    expect(canExtendAttempt(policy({ maxExtraMinutesPerAttempt: 45 }), officer, 15, 30)).toEqual({ ok: true });
  });

  it("refuses an invigilator when they are not allowed to add time, without affecting officers", () => {
    expect(canExtendAttempt(policy({ invigilatorCanExtend: false }), invigilator, 0, 5)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/invigilators cannot add time/i),
    });
    expect(canExtendAttempt(policy({ invigilatorCanExtend: false }), officer, 0, 5)).toEqual({ ok: true });
  });

  it("treats a zero cap as switching added time off", () => {
    expect(canExtendAttempt(policy({ maxExtraMinutesPerAttempt: 0 }), officer, 0, 1)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/switched off/i),
    });
  });
});

describe("policyProblems", () => {
  it("passes the default", () => {
    expect(policyProblems(DEFAULT_EXAM_DAY_POLICY)).toEqual([]);
  });

  it("catches limits outside what can be allowed", () => {
    expect(policyProblems(policy({ maxRestartsPerCandidate: 0 }))).toContainEqual(
      expect.stringMatching(/at least one restart/i),
    );
    expect(policyProblems(policy({ maxRestartsPerCandidate: 11 }))).toContainEqual(expect.stringMatching(/ten restarts/i));
    expect(policyProblems(policy({ maxExtraMinutesPerAttempt: -5 }))).toContainEqual(expect.stringMatching(/negative/i));
    expect(policyProblems(policy({ maxExtraMinutesPerAttempt: 600 }))).toContainEqual(expect.stringMatching(/eight hours/i));
  });

  it("points out a setting that would have no effect", () => {
    expect(policyProblems(policy({ invigilatorCanRestart: true, allowRestart: false }))).toContainEqual(
      expect.stringMatching(/no effect/i),
    );
  });
});

describe("who the settings screen adds up to", () => {
  // The same matrix the Settings copy promises, kept honest in one place: the master
  // switch beats everything, officers pass on their own, invigilators need their own
  // switch, and everyone else is out.
  const cases: { policy: Partial<ExamDayPolicy>; standing: Standing; label: string; allowed: boolean }[] = [
    { policy: {}, standing: officer, label: "officer, restarts off", allowed: false },
    { policy: { allowRestart: true }, standing: officer, label: "officer, restarts on", allowed: true },
    { policy: { allowRestart: true }, standing: invigilator, label: "invigilator, their switch off", allowed: false },
    { policy: { allowRestart: true, invigilatorCanRestart: true }, standing: invigilator, label: "invigilator, their switch on", allowed: true },
    { policy: { allowRestart: true, invigilatorCanRestart: true }, standing: outsider, label: "neither standing", allowed: false },
  ];

  for (const { policy: patch, standing, label, allowed } of cases) {
    it(`${allowed ? "allows" : "refuses"}: ${label}`, () => {
      expect(canRestartAttempt(policy(patch), standing, 0).ok).toBe(allowed);
    });
  }
});
