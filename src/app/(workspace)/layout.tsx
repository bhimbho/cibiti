import { Sidebar } from "@/components/sidebar";
import { navFor, primaryRoleLabel } from "@/components/nav";
import { prisma } from "@/lib/prisma";
import { permissionsFor } from "@/server/authz";
import { requirePageActor } from "@/server/page-auth";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.orgId }, select: { name: true } });

  return (
    <div className="app-shell">
      <Sidebar name={actor.name} roleLabel={primaryRoleLabel(actor.roles)} orgName={org.name} nav={navFor(permissionsFor(actor))} />
      <div className="page-wrap">{children}</div>
    </div>
  );
}
