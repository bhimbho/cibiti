import type { TableConfig } from "./table-params";

export const auditTableConfig: TableConfig = {
  sortable: ["createdAt"],
  filters: ["action", "entityType", "actor"],
  defaultSort: { id: "createdAt", desc: true },
};

export type AuditRow = {
  id: string;
  createdAt: string;
  actor: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: string | null;
  after: string | null;
  ipAddress: string | null;
};
