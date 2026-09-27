import { ImpersonationMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { attemptIdFromPath, canWriteWhileViewing, isExamAction, isReadMethod } from "./impersonation-rules";

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

  const examPaths = [
    "/api/attempts/abc123/responses",
    "/api/attempts/abc123/submit",
    "/api/attempts/abc123/resume",
    "/api/attempts/abc123/events",
  ];

  it("refuses sitting an exam unless it is deliberately switched on", () => {
    for (const mode of [READ_ONLY, EDIT]) {
      for (const path of examPaths) {
        const decision = canWriteWhileViewing(mode, path, "Demo Student");
        expect(decision.ok, `${mode} ${path}`).toBe(false);
        expect(decision).toMatchObject({ reason: expect.stringMatching(/switched off/i) });
      }
    }
  });

  it("allows sitting an exam only with both switches on", () => {
    for (const path of examPaths) {
      // Editing alone is a support tool; answering an exam needs its own switch.
      expect(canWriteWhileViewing(EDIT, path, "Demo Student", true), path).toEqual({ ok: true });
      expect(canWriteWhileViewing(EDIT, path, "Demo Student", false).ok, path).toBe(false);
      // And the exam switch cannot stand in for editing.
      expect(canWriteWhileViewing(READ_ONLY, path, "Demo Student", true).ok, path).toBe(false);
    }
  });

  it("names the attempt an exam action belongs to, so it can be marked", () => {
    expect(attemptIdFromPath("/api/attempts/abc123/responses")).toBe("abc123");
    expect(attemptIdFromPath("/api/attempts/abc123/submit")).toBe("abc123");
    expect(attemptIdFromPath("/api/courses")).toBeNull();
  });

  it("knows which paths count as sitting an exam", () => {
    for (const path of examPaths) expect(isExamAction(path)).toBe(true);
    for (const path of ["/api/attempts/abc/extend", "/api/courses", "/api/impersonation"]) {
      expect(isExamAction(path)).toBe(false);
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
