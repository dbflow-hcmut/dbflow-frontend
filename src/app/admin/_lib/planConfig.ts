export type PlanLimitField = {
  key: string;
  label: string;
  /** Convert the raw stored value (as the backend reads it) into the unit shown in the form. */
  fromStored?: (value: number) => number;
  /** Convert a form value back into the raw unit the backend expects. */
  toStored?: (value: number) => number;
};

const MB = 1024 * 1024;

// Keys must match what the backend actually reads: dbflow-backend's
// SubscriptionsService/UsageService index plan.limits/plan.features by these
// exact strings. Add a row here only after the backend reads the new key.
export const PLAN_LIMIT_FIELDS: PlanLimitField[] = [
  { key: "workspace_seats", label: "Workspace seats" },
  { key: "projects", label: "Projects" },
  { key: "schemas_per_project", label: "Schemas per project" },
  { key: "schema_versions_per_schema", label: "Schema versions per schema" },
  { key: "db_connections", label: "DB connections" },
  { key: "ai_requests_monthly", label: "AI requests / month (credits)" },
  {
    key: "document_storage_bytes",
    label: "Document storage (MB)",
    fromStored: (bytes) => Math.round(bytes / MB),
    toStored: (mb) => Math.round(mb * MB),
  },
  { key: "exports_monthly", label: "Exports / month" },
];

export const PLAN_FEATURE_FIELDS: { key: string; label: string }[] = [
  { key: "export", label: "Schema & DDL export" },
  { key: "rollback", label: "Schema version rollback" },
  { key: "team_roles", label: "Team roles & permissions" },
];
