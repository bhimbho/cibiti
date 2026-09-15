import { describe, expect, it } from "vitest";
import { computeDeadline, isPastDeadline } from "./deadline";

const startedAt = new Date("2026-09-15T09:00:00Z");
const base = { startedAt, timeLimitMin: 60, extraTimePct: 0, extensionSec: 0, sessionEndsAt: null };

describe("computeDeadline", () => {
  it("adds the time limit to the start", () => {
    expect(computeDeadline(base)?.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });

  it("returns null for untimed exams without a sitting", () => {
    expect(computeDeadline({ ...base, timeLimitMin: null })).toBeNull();
  });

  it("stretches the time limit for accommodations", () => {
    expect(computeDeadline({ ...base, extraTimePct: 25 })?.toISOString()).toBe("2026-09-15T10:15:00.000Z");
  });

  it("caps at the end of the sitting", () => {
    const sessionEndsAt = new Date("2026-09-15T09:45:00Z");
    expect(computeDeadline({ ...base, sessionEndsAt })?.toISOString()).toBe("2026-09-15T09:45:00.000Z");
  });

  it("lets invigilator extensions go past the sitting end", () => {
    const sessionEndsAt = new Date("2026-09-15T09:45:00Z");
    expect(computeDeadline({ ...base, sessionEndsAt, extensionSec: 600 })?.toISOString()).toBe("2026-09-15T09:55:00.000Z");
  });

  it("uses the sitting end for untimed exams inside a sitting", () => {
    const sessionEndsAt = new Date("2026-09-15T11:00:00Z");
    expect(computeDeadline({ ...base, timeLimitMin: null, sessionEndsAt })?.toISOString()).toBe("2026-09-15T11:00:00.000Z");
  });
});

describe("isPastDeadline", () => {
  const deadline = new Date("2026-09-15T10:00:00Z");

  it("allows writes inside the grace period", () => {
    expect(isPastDeadline(deadline, new Date("2026-09-15T10:00:20Z"))).toBe(false);
  });

  it("rejects writes after the grace period", () => {
    expect(isPastDeadline(deadline, new Date("2026-09-15T10:00:31Z"))).toBe(true);
  });

  it("never expires untimed attempts", () => {
    expect(isPastDeadline(null, new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });
});
