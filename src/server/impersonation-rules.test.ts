import { ImpersonationMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canWriteWhileViewing, isReadMethod } from "./impersonation-rules";

const { READ_ONLY, EDIT } = ImpersonationMode;

describe("isReadMethod", () => {
  it("knows which methods change nothing", () => {
    for (const method of ["GET", "head", "OPTIONS"]) expect(isReadMethod(method)).toBe(true);
    for (const method of ["POST", "put", "PATCH", "DELETE"]) expect(isReadMethod(method)).toBe(false);
  });
});

describe("canWriteWhileViewing", () => {
  it("refuses every write in read-only mode, and says how to change that", () => {
    const decision = canWriteWhileViewing(READ_ONLY, "/api/courses", "Demo Student");
    expect(decision).toMatchObject({ ok: false });
    expect(decision).toMatchObject({ reason: expect.stringMatching(/read-only/i) });
    expect(decision).toMatchObject({ reason: expect.stringMatching(/allow editing in Settings/i) });
  });

  it("allows an ordinary write once editing is switched on", () => {
    expect(canWriteWhileViewing(EDIT, "/api/courses", "Demo Student")).toEqual({ ok: true });
    expect(canWriteWhileViewing(EDIT, "/api/questions/abc", "Demo Student")).toEqual({ ok: true });
  });

  it("never allows sitting an exam, in either mode", () => {
    const paths = [
      "/api/attempts/abc123/responses",
      "/api/attempts/abc123/submit",
      "/api/attempts/abc123/resume",
      "/api/attempts/abc123/events",
    ];
    for (const mode of [READ_ONLY, EDIT]) {
      for (const path of paths) {
        const decision = canWriteWhileViewing(mode, path, "Demo Student");
        expect(decision.ok, `${mode} ${path}`).toBe(false);
        expect(decision).toMatchObject({ reason: expect.stringMatching(/never permitted/i) });
      }
    }
  });

  it("still allows the staff actions on an attempt in edit mode", () => {
    // Adding time, restarting and force-submitting are staff actions, audited, and
    // reachable as yourself — they are not the candidate writing their own paper.
    for (const path of ["/api/attempts/abc/extend", "/api/attempts/abc/restart", "/api/attempts/abc/force-submit"]) {
      expect(canWriteWhileViewing(EDIT, path, "Demo Student")).toEqual({ ok: true });
    }
  });

  it("always lets the view be ended, whatever the mode", () => {
    for (const mode of [READ_ONLY, EDIT]) {
      expect(canWriteWhileViewing(mode, "/api/impersonation", "Demo Student")).toEqual({ ok: true });
    }
  });
});
