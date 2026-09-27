import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "./audit";
import { actorForUser, canAnywhere, type Actor } from "./authz";
import { badRequest, forbidden, notFound } from "./http";

/**
 * "View as": an administrator sees the app exactly as one of their users does, to
 * answer "what is this candidate actually looking at?" without knowing anyone's
 * password or resetting it.
 *
 * Three decisions worth stating, because this is the most dangerous feature in the
 * app if it is built casually:
 *
 * 1. **The real session is untouched.** Viewing as somebody adds a signed cookie
 *    beside the administrator's own session; it never mints a session for the target.
 *    So the administrator's identity is always recoverable, and stopping is instant.
 * 2. **It is read-only.** Every mutating request is refused while it is active (see
 *    `route()` in http.ts). An administrator who could *write* as a candidate could
 *    answer their exam, and no audit trail would make that acceptable.
 * 3. **It is audited at both ends**, with the administrator's id, not the target's.
 */

const COOKIE = "cibiti.view-as";
/** An hour is long enough to look around and short enough to be forgotten safely. */
const MAX_AGE_SECONDS = 60 * 60;

type Payload = { targetUserId: string; adminUserId: string; startedAt: number };

function secret(): string {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to sign a view-as cookie.");
  return value;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Constant-time compare, so a forged cookie cannot be tuned byte by byte. */
function signatureMatches(body: string, provided: string): boolean {
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function encode(payload: Payload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(value: string): Payload | null {
  const [body, signature] = value.split(".");
  if (!body || !signature || !signatureMatches(body, signature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
    if (!payload.targetUserId || !payload.adminUserId) return null;
    if (Date.now() - payload.startedAt > MAX_AGE_SECONDS * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Who may be viewed as, and by whom. */
export async function assertMayImpersonate(admin: Actor, targetUserId: string) {
  if (!canAnywhere(admin, "org:manage")) throw forbidden("Only administrators can view the app as another user.");
  if (targetUserId === admin.userId) throw badRequest("You are already signed in as yourself.");

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, orgId: admin.orgId },
    select: { id: true, name: true, isActive: true, memberships: { select: { role: true } } },
  });
  if (!target) throw notFound("User");
  if (!target.isActive) throw badRequest("That account is disabled.");
  // Another administrator's view would grant nothing extra but would muddy the audit
  // trail of who did what; a super admin's is a step up and is refused outright.
  if (target.memberships.some((m) => m.role === Role.SUPER_ADMIN)) {
    throw forbidden("You cannot view the app as a super administrator.");
  }
  return target;
}

export async function startImpersonation(admin: Actor, targetUserId: string) {
  const target = await assertMayImpersonate(admin, targetUserId);

  await audit({
    actor: admin,
    action: "impersonation.start",
    entityType: "user",
    entityId: target.id,
    after: { target: target.name, readOnly: true },
  });

  const store = await cookies();
  store.set({
    name: COOKIE,
    value: encode({ targetUserId: target.id, adminUserId: admin.userId, startedAt: Date.now() }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return { viewingAs: target.name, userId: target.id };
}

export async function stopImpersonation(
  admin: Pick<Actor, "userId" | "orgId"> | null,
  targetUserId?: string,
) {
  const store = await cookies();
  store.delete(COOKIE);
  if (admin && targetUserId) {
    await audit({ actor: admin, action: "impersonation.stop", entityType: "user", entityId: targetUserId });
  }
  return { ok: true };
}

/**
 * The impersonated actor, if a valid cookie is present for this administrator.
 * Re-checked on every request: an administrator who loses `org:manage`, or a target
 * who is disabled, stops being viewable immediately.
 */
export async function resolveImpersonation(sessionActor: Actor): Promise<Actor | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const payload = decode(raw);
  if (!payload) return null;
  if (payload.adminUserId !== sessionActor.userId) return null;
  if (!canAnywhere(sessionActor, "org:manage")) return null;

  const target = await actorForUser(payload.targetUserId);
  if (!target || target.orgId !== sessionActor.orgId) return null;

  return {
    ...target,
    viewAs: { realUserId: sessionActor.userId, realName: sessionActor.name, startedAt: payload.startedAt },
  };
}
