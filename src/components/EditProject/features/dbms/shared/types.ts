import type { DBConnectionDBMS } from "@/types/db-connection.type";

// ── Permission Matrix ──────────────────────────────────────────────────

export interface PermissionMatrix {
    can_create_table: boolean;
    can_drop_table: boolean;
    can_alter_table: boolean;
    can_create_index: boolean;
    can_drop_index: boolean;
    can_insert: boolean;
    can_update: boolean;
    can_delete: boolean;
    can_create_schema: boolean;
    is_superuser: boolean;
    /** Quyền còn thiếu so với thao tác đang thực hiện — BE tính sẵn. */
    missing_permissions: string[];
}

// ── Export Record ──────────────────────────────────────────────────────

export type ExportRecordStatus = "success" | "partial" | "failed";
export type ExportRecordTrigger = "manual" | "auto";

export interface ExportRecord {
    id: string;
    connectionId: string;
    projectId: string;
    createdAt: string;
    triggeredBy: string;
    trigger: ExportRecordTrigger;
    status: ExportRecordStatus;
    dbms: DBConnectionDBMS;
    ddlSnapshotBefore: string;
    upMigration: string;
    downMigration: string;
    schemaVersionRef?: string;
    notes?: string;
}

export interface CreateExportRecordPayload {
    connection_id: string;
    trigger: ExportRecordTrigger;
    status: ExportRecordStatus;
    dbms: DBConnectionDBMS;
    ddl_snapshot_before: string;
    up_migration: string;
    down_migration: string;
    schema_version_ref?: string;
    notes?: string;
}

// ── Export Result ──────────────────────────────────────────────────────

export interface ExportLogEntry {
    statement: string;
    status: "ok" | "error" | "skipped";
    error_message?: string;
    execution_time_ms: number;
}

export interface ExportResult {
    status: ExportRecordStatus;
    statements_total: number;
    statements_succeeded: number;
    statements_failed: number;
    execution_time_ms: number;
    export_record_id: string;
    log: ExportLogEntry[];
}

// ── Rollback Result ────────────────────────────────────────────────────

export interface RollbackResult {
    status: ExportRecordStatus;
    statements_total: number;
    statements_succeeded: number;
    statements_failed: number;
    execution_time_ms: number;
    log: ExportLogEntry[];
}
