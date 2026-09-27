/**
 * Database-backed tests for "view as": who may be viewed, who may not, and that the
 * cookie can only be used by the administrator it was issued to.
 *
 * The cookie itself is mocked, because `next/headers` is only available inside a
 * request. What is under test is the rules, the signature and the audit trail.
 *
 * Skipped when no DATABASE_URL is configured; CI provides one.
 */
import { OrgKind, PrismaClient, Role } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "./authz";

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = `viewas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

process.env.AUTH_SECRET ??= "test-secret-0123456789abcdef0123456789abcdef";

/** A cookie jar standing in for the request's, so the module can be exercised directly. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (options: { name: string; value: string }) => jar.set(options.name, options.value),
    delete: (name: string) => jar.delete(name),
  }),
}));

let orgId = "";
let admin: Actor;
let officer: Actor;
let candidateId = "";
let superAdminId = "";

function actorFor(userId: string, role: Role, name: string = role): Actor {
  return {
    userId,
    orgId,
    name,
    roles: [role],
    memberships: [{ role, departmentId: null, courseId: null }],
    isStaff: role !== Role.CANDIDATE,
    isCandidate: role === Role.CANDIDATE,
  };
}

describe.skipIf(!hasDb)("viewing as another user", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: stamp, slug: stamp, kind: OrgKind.UNIVERSITY },
      select: { id: true },
    });
    orgId = org.id;
    const make = async (name: string, role: Role) => {
      const user = await prisma.user.create({
        data: {
          orgId,
          name,
          email: `${stamp}-${name.toLowerCase()}@test.local`,
          passwordHash: "x",
          memberships: { create: [{ orgId, role }] },
        },
        select: { id: true },
      });
      return user.id;
    };
    const adminId = await make("Admin", Role.ORG_ADMIN);
    const officerId = await make("Officer", Role.EXAM_OFFICER);
    candidateId = await make("Candidate", Role.CANDIDATE);
    superAdminId = await make("Super", Role.SUPER_ADMIN);
    admin = actorFor(adminId, Role.ORG_ADMIN, "Ada Admin");
    officer = actorFor(officerId, Role.EXAM_OFFICER);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.membership.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  beforeEach(() => jar.clear());

  it("lets an administrator start viewing as a candidate", async () => {
    const { startImpersonation } = await import("./impersonation");

    const result = await startImpersonation(admin, candidateId);

    expect(result).toMatchObject({ userId: candidateId, viewingAs: "Candidate" });
    expect(jar.get("cibiti.view-as")).toBeTruthy();
    const entry = await prisma.auditLog.findFirst({ where: { orgId, action: "impersonation.start" }, orderBy: { createdAt: "desc" } });
    // Recorded against the administrator, not the person being viewed.
    expect(entry?.actorId).toBe(admin.userId);
    expect(entry?.entityId).toBe(candidateId);
  });

  it("resolves the cookie into the target's actor, carrying the real identity", async () => {
    const { startImpersonation, resolveImpersonation } = await import("./impersonation");
    await startImpersonation(admin, candidateId);

    const resolved = await resolveImpersonation(admin);

    expect(resolved).toMatchObject({ userId: candidateId, isCandidate: true });
    expect(resolved?.viewAs).toMatchObject({ realUserId: admin.userId, realName: "Ada Admin" });
  });

  it("refuses an exam officer, who does not administer the organisation", async () => {
    const { startImpersonation } = await import("./impersonation");
    await expect(startImpersonation(officer, candidateId)).rejects.toThrow(/only administrators/i);
  });

  it("refuses viewing as a super administrator, or as yourself", async () => {
    const { startImpersonation } = await import("./impersonation");
    await expect(startImpersonation(admin, superAdminId)).rejects.toThrow(/super administrator/i);
    await expect(startImpersonation(admin, admin.userId)).rejects.toThrow(/already signed in as yourself/i);
  });

  it("refuses a disabled account and a user from another organisation", async () => {
    const { startImpersonation } = await import("./impersonation");
    const disabled = await prisma.user.create({
      data: { orgId, name: "Gone", email: `${stamp}-gone@test.local`, passwordHash: "x", isActive: false },
      select: { id: true },
    });
    await expect(startImpersonation(admin, disabled.id)).rejects.toThrow(/disabled/i);

    const other = await prisma.organization.create({
      data: { name: `${stamp}-other`, slug: `${stamp}-other`, kind: OrgKind.SCHOOL },
      select: { id: true },
    });
    const outsider = await prisma.user.create({
      data: { orgId: other.id, name: "Outsider", email: `${stamp}-out@test.local`, passwordHash: "x" },
      select: { id: true },
    });
    await expect(startImpersonation(admin, outsider.id)).rejects.toThrow(/not found/i);

    await prisma.user.deleteMany({ where: { orgId: other.id } });
    await prisma.organization.delete({ where: { id: other.id } });
  });

  it("ignores a cookie issued to a different administrator", async () => {
    const { startImpersonation, resolveImpersonation } = await import("./impersonation");
    await startImpersonation(admin, candidateId);

    // Somebody else's session presenting the same cookie gets nothing.
    expect(await resolveImpersonation(officer)).toBeNull();
  });

  it("ignores a tampered cookie", async () => {
    const { startImpersonation, resolveImpersonation } = await import("./impersonation");
    await startImpersonation(admin, candidateId);
    const [body] = jar.get("cibiti.view-as")!.split(".");
    // Re-sign nothing: a forged body with a stale signature must not resolve.
    jar.set("cibiti.view-as", `${body}.not-a-real-signature`);

    expect(await resolveImpersonation(admin)).toBeNull();
  });

  it("ignores an expired cookie", async () => {
    const { resolveImpersonation } = await import("./impersonation");
    const { createHmac } = await import("node:crypto");
    const stale = Buffer.from(
      JSON.stringify({ targetUserId: candidateId, adminUserId: admin.userId, startedAt: Date.now() - 2 * 60 * 60 * 1000 }),
    ).toString("base64url");
    const signature = createHmac("sha256", process.env.AUTH_SECRET!).update(stale).digest("base64url");
    jar.set("cibiti.view-as", `${stale}.${signature}`);

    expect(await resolveImpersonation(admin)).toBeNull();
  });

  it("is read-only until an administrator says otherwise", async () => {
    const { impersonationMode } = await import("./impersonation");
    const mode = await impersonationMode(orgId);
    expect(mode).toEqual({ mode: "READ_ONLY", allowExamActions: false, isDefault: true });
  });

  it("saves the editing setting, and records who changed it", async () => {
    const { impersonationMode, setImpersonationMode } = await import("./impersonation");

    const saved = await setImpersonationMode(admin, "EDIT");

    expect(saved).toEqual({ mode: "EDIT", allowExamActions: false, isDefault: false });
    expect(await impersonationMode(orgId)).toMatchObject({ mode: "EDIT" });
    const entry = await prisma.auditLog.findFirst({
      where: { orgId, action: "impersonation-policy.set" },
      orderBy: { createdAt: "desc" },
    });
    expect(entry?.actorId).toBe(admin.userId);
    expect(entry?.after).toMatchObject({ mode: "EDIT" });

    await setImpersonationMode(admin, "READ_ONLY");
  });

  it("refuses an exam officer, and refuses anyone in the middle of a view", async () => {
    const { setImpersonationMode } = await import("./impersonation");
    await expect(setImpersonationMode(officer, "EDIT")).rejects.toThrow(/only administrators/i);

    // Raising your own permissions from inside a view is the move to prevent.
    const viewing = { ...admin, viewAs: { realUserId: admin.userId, realName: "Ada Admin", startedAt: Date.now() } };
    await expect(setImpersonationMode(viewing, "EDIT")).rejects.toThrow(/stop viewing as another user/i);
  });

  it("marks an attempt staff acted on, once, with a timeline entry and an audit row", async () => {
    const { markStaffActedOnAttempt } = await import("./impersonation");
    const exam = await prisma.exam.create({
      data: { orgId, title: `${stamp} acted`, authorId: admin.userId, status: "PUBLISHED", publishedAt: new Date() },
      select: { id: true },
    });
    const attempt = await prisma.attempt.create({
      data: { examId: exam.id, userId: candidateId, attemptNo: 1, maxScore: 5 },
      select: { id: true },
    });
    const viewing = {
      ...actorFor(candidateId, Role.CANDIDATE, "Candidate"),
      viewAs: { realUserId: admin.userId, realName: "Ada Admin", startedAt: Date.now() },
    };

    await markStaffActedOnAttempt(attempt.id, viewing);
    // Autosave fires constantly; the mark must not pile up with it.
    await markStaffActedOnAttempt(attempt.id, viewing);

    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.staffActedById).toBe(admin.userId);
    expect(after.staffActedAt).not.toBeNull();
    const events = await prisma.proctorEvent.findMany({ where: { attemptId: attempt.id, type: "attempt.staff-acted" } });
    expect(events).toHaveLength(1);
    const entry = await prisma.auditLog.findFirst({ where: { orgId, action: "attempt.staff-acted", entityId: attempt.id } });
    // Recorded against the administrator who was really there.
    expect(entry?.actorId).toBe(admin.userId);

    await prisma.attempt.deleteMany({ where: { examId: exam.id } });
    await prisma.exam.delete({ where: { id: exam.id } });
  });

  it("does not mark anything when nobody is viewing as anybody", async () => {
    const { markStaffActedOnAttempt } = await import("./impersonation");
    const exam = await prisma.exam.create({
      data: { orgId, title: `${stamp} unacted`, authorId: admin.userId, status: "PUBLISHED", publishedAt: new Date() },
      select: { id: true },
    });
    const attempt = await prisma.attempt.create({
      data: { examId: exam.id, userId: candidateId, attemptNo: 1, maxScore: 5 },
      select: { id: true },
    });

    // A candidate sitting their own exam, with no view in progress.
    await markStaffActedOnAttempt(attempt.id, actorFor(candidateId, Role.CANDIDATE, "Candidate"));

    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.staffActedById).toBeNull();

    await prisma.attempt.deleteMany({ where: { examId: exam.id } });
    await prisma.exam.delete({ where: { id: exam.id } });
  });

  it("clears the exam-answering switch when editing is switched off", async () => {
    const { impersonationMode, setImpersonationMode } = await import("./impersonation");
    await setImpersonationMode(admin, "EDIT", true);
    expect(await impersonationMode(orgId)).toMatchObject({ mode: "EDIT", allowExamActions: true });

    await setImpersonationMode(admin, "READ_ONLY");

    // Answering exams means nothing without editing; leaving it set would be a trap
    // waiting for the next time editing is turned on.
    expect(await impersonationMode(orgId)).toMatchObject({ mode: "READ_ONLY", allowExamActions: false });
  });

  it("stops, clearing the cookie and recording it", async () => {
    const { startImpersonation, stopImpersonation, resolveImpersonation } = await import("./impersonation");
    await startImpersonation(admin, candidateId);

    await stopImpersonation(admin, candidateId);

    expect(jar.has("cibiti.view-as")).toBe(false);
    expect(await resolveImpersonation(admin)).toBeNull();
    const entry = await prisma.auditLog.findFirst({ where: { orgId, action: "impersonation.stop" } });
    expect(entry?.actorId).toBe(admin.userId);
  });
});
