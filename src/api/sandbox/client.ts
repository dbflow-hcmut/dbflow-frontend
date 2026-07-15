import useSWR from "swr";
import { PROXY_SCHEMA_SANDBOX_EXECUTE, PROXY_SCHEMA_SANDBOX_RESET, PROXY_SCHEMA_SANDBOX_STATUS } from "@/api";
import { apiGet, apiPost } from "@/lib/clientFetch";
import type { QueryResultDto } from "@/api/db-connections/client";

export type SandboxSyncAction = "unchanged" | "created" | "dropped" | "migrated" | "reset";

export interface SandboxSyncReportEntry {
    table: string;
    action: SandboxSyncAction;
    reason?: string;
}

export interface SandboxQueryResultDto extends QueryResultDto {
    syncReport?: SandboxSyncReportEntry[];
    /** Present only when a multi-statement batch (seed data or an ad-hoc
     * multi-statement query) failed partway through. */
    statementProgress?: {
        total: number;
        succeeded: number;
        failedStatement: string;
    };
}

/**
 * Run a query/seed statement against a schema's SQLite sandbox. Provisions
 * the sandbox on first use, or drift-syncs it against the current model.json
 * if the schema changed since the sandbox was last built.
 */
export async function executeSandboxQuery(
    projectId: string,
    schemaId: string,
    query: string,
    resultLimit?: number,
): Promise<SandboxQueryResultDto> {
    return apiPost<SandboxQueryResultDto, { query: string; resultLimit?: number }>(
        PROXY_SCHEMA_SANDBOX_EXECUTE(projectId, schemaId),
        { query, resultLimit },
    );
}

/** Wipe and re-provision a schema's sandbox from the current model.json. */
export async function resetSandbox(
    projectId: string,
    schemaId: string,
): Promise<{ success: boolean; syncReport: SandboxSyncReportEntry[] }> {
    return apiPost<{ success: boolean; syncReport: SandboxSyncReportEntry[] }, undefined>(
        PROXY_SCHEMA_SANDBOX_RESET(projectId, schemaId),
        undefined,
    );
}

export interface SandboxStatusDto {
    exists: boolean;
    inSync: boolean;
    lastUsedAt: string | null;
    createdAt: string | null;
}

/** Read-only sandbox status — does not provision anything. */
export async function getSandboxStatus(
    projectId: string,
    schemaId: string,
): Promise<SandboxStatusDto> {
    return apiGet<SandboxStatusDto>(PROXY_SCHEMA_SANDBOX_STATUS(projectId, schemaId));
}

export function useSandboxStatus(projectId: string | null, schemaId: string | null) {
    return useSWR<SandboxStatusDto>(
        projectId && schemaId ? `sandbox-status-${projectId}-${schemaId}` : null,
        () => getSandboxStatus(projectId!, schemaId!),
    );
}
