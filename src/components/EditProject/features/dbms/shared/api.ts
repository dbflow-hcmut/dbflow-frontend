"use client";

import { apiGet, apiPost, apiDelete } from "@/lib/clientFetch";
import {
    PROXY_DB_CONNECTION_PERMISSIONS,
    PROXY_PROJECT_EXPORT_RECORDS,
    PROXY_PROJECT_EXPORT_RECORD_DETAIL,
    PROXY_PROJECT_EXPORT_RECORD_ROLLBACK,
} from "@/api";
import type {
    PermissionMatrix,
    ExportRecord,
    CreateExportRecordPayload,
    RollbackResult,
} from "./types";

// ── Permission ─────────────────────────────────────────────────────────

export async function fetchPermissionMatrix(
    connId: string,
): Promise<PermissionMatrix> {
    return apiPost<PermissionMatrix, Record<string, never>>(
        PROXY_DB_CONNECTION_PERMISSIONS(connId),
        {},
    );
}

// ── Export Records ─────────────────────────────────────────────────────

export async function getExportRecords(
    projectId: string,
): Promise<ExportRecord[]> {
    return apiGet<ExportRecord[]>(PROXY_PROJECT_EXPORT_RECORDS(projectId));
}

export async function createExportRecord(
    projectId: string,
    payload: CreateExportRecordPayload,
): Promise<ExportRecord> {
    return apiPost<ExportRecord, CreateExportRecordPayload>(
        PROXY_PROJECT_EXPORT_RECORDS(projectId),
        payload,
    );
}

export async function deleteExportRecord(
    projectId: string,
    recordId: string,
): Promise<void> {
    return apiDelete<void>(
        PROXY_PROJECT_EXPORT_RECORD_DETAIL(projectId, recordId),
    );
}

export async function rollbackExportRecord(
    projectId: string,
    recordId: string,
): Promise<RollbackResult> {
    return apiPost<RollbackResult, Record<string, never>>(
        PROXY_PROJECT_EXPORT_RECORD_ROLLBACK(projectId, recordId),
        {},
    );
}
