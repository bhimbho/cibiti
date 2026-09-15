import { redirect } from "next/navigation";
import { canAnywhere, getActor, type Actor, type Permission } from "./authz";

/** For server components: send signed-out visitors to sign in. */
export async function requirePageActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  return actor;
}

/** For staff pages: signed-out visitors sign in, others without the permission go home. */
export async function requirePagePermission(permission: Permission): Promise<Actor> {
  const actor = await requirePageActor();
  if (!canAnywhere(actor, permission)) redirect("/");
  return actor;
}
