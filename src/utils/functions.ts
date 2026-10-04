import { ROUTES_WITH_LAYOUT, EXACT_MATCH_ROUTES } from "./constants";

export function shouldShowLayout(pathname: string | null): boolean {
    if (!pathname) return false;

    return ROUTES_WITH_LAYOUT.some((route) => {
        if (EXACT_MATCH_ROUTES.includes(route)) {
            return pathname === route;
        }
        return pathname === route || pathname.startsWith(route + "/");
    });
}

export function formatDateTimeVN(input: string | number | Date): string {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(input));
  }

export function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return "Unlimited";
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % 1024 ** 3 === 0 ? 0 : 1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes % 1024 ** 2 === 0 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

export const getToken = async () => {
  try {
      const response = await fetch('/api/auth/token', {
          credentials: 'include',
      });
      if (!response.ok) {
          return '';
      }
      const data = await response.json();
      return data.token || '';
  } catch {
      return '';
  }
};
// Plan limit keys (backend SubscriptionsService/UsageService) -> text shown to the user.
const QUOTA_LABELS: Record<string, string> = {
    projects: "projects",
    schemas_per_project: "schemas per project",
    schema_versions_per_schema: "versions per schema",
    db_connections: "database connections",
    ai_requests_monthly: "AI requests this month",
    exports_monthly: "exports this month",
    document_storage_bytes: "document storage",
    workspace_seats: "workspace seats",
};

const FEATURE_LABELS: Record<string, string> = {
    export: "Schema & DDL export",
    rollback: "Schema version rollback",
    team_roles: "Team roles & permissions",
};

/** Turns backend quota/feature messages into readable text; other messages pass through. */
export function mapQuotaMessage(message: string): string {
    const quota = /^([a-z_]+) quota exceeded$/.exec(message);
    if (quota && QUOTA_LABELS[quota[1]]) {
        return `You have reached the limit of ${QUOTA_LABELS[quota[1]]} for your current plan. Please upgrade your plan to continue.`;
    }
    const feature = /^([a-z_]+) feature is not included in the current plan$/.exec(message);
    if (feature && FEATURE_LABELS[feature[1]]) {
        return `${FEATURE_LABELS[feature[1]]} is not included in your current plan. Please upgrade your plan to use it.`;
    }
    if (message === "Workspace seat limit reached") {
        return "You have reached the limit of workspace seats for your current plan. Please upgrade your plan to continue.";
    }
    return message;
}

/**
 * Message returned by the backend (`meta.message`, surfaced by clientFetch as Error.message),
 * or `fallback` when the error carries no usable message. Quota/feature messages are mapped to readable text.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
    const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    const msg = raw.trim();
    return msg && msg !== "Request failed" ? mapQuotaMessage(msg) : fallback;
}
