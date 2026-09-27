import { describe, expect, it } from "vitest";
import { ReleasePolicy } from "@prisma/client";
import { allowsRelease, releasesOnClose, releasesOnGrading } from "./release-policy";

describe("releasesOnGrading", () => {
  it("releases an auto-marked attempt on an IMMEDIATE exam", () => {
    expect(releasesOnGrading(ReleasePolicy.IMMEDIATE, false)).toBe(true);
  });

  it("holds an IMMEDIATE attempt that still needs a human marker", () => {
    expect(releasesOnGrading(ReleasePolicy.IMMEDIATE, false)).toBe(true);
    expect(releasesOnGrading(ReleasePolicy.IMMEDIATE, true)).toBe(false);
  });

  it("releases nothing on grading for the other policies", () => {
    for (const policy of [ReleasePolicy.AFTER_CLOSE, ReleasePolicy.MANUAL, ReleasePolicy.NEVER]) {
      expect(releasesOnGrading(policy, false)).toBe(false);
    }
  });
});

describe("releasesOnClose", () => {
  it("is AFTER_CLOSE only", () => {
    expect(releasesOnClose(ReleasePolicy.AFTER_CLOSE)).toBe(true);
    for (const policy of [ReleasePolicy.IMMEDIATE, ReleasePolicy.MANUAL, ReleasePolicy.NEVER]) {
      expect(releasesOnClose(policy)).toBe(false);
    }
  });
});

describe("allowsRelease", () => {
  it("permits a manual release for every policy but NEVER", () => {
    for (const policy of [ReleasePolicy.IMMEDIATE, ReleasePolicy.AFTER_CLOSE, ReleasePolicy.MANUAL]) {
      expect(allowsRelease(policy)).toBe(true);
    }
    expect(allowsRelease(ReleasePolicy.NEVER)).toBe(false);
  });
});
