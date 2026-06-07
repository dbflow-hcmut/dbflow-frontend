"use client";

import useSWR from "swr";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/clientFetch";
import {
    PROXY_DB_CONNECTIONS,
    PROXY_DB_CONNECTION_DETAIL,
    PROXY_DB_CONNECTION_TEST,
    PROXY_DB_CONNECTION_TEST_SAVED,
    PROXY_DB_CONNECTION_PLAIN_PARAMS,
    PROXY_DB_CONNECTION_SCHEMAS,
    PROXY_DB_CONNECTION_INTROSPECT,
    PROXY_DB_CONNECTION_EXECUTE,
    PROXY_PROJECT_DB_CONNECTIONS,
    PROXY_PROJECT_DB_CONNECTION_LINK,
    PROXY_PROJECT_DB_CONNECTION_UNLINK,
} from "@/api";
import type {
    DBConnection,
    DBConnectionFormValues,
} from "@/types/db-connection.type";

// ─── Types ──────────────────────────────────────────────

interface TestResult {
    success: boolean;
    message: string;
    latencyMs?: number;
}

export interface QueryResultDto {
    success: boolean;
    rowCount: number;
    columns: string[];
    rows: Record<string, unknown>[];
    executionTimeMs: number;
    message?: string;
}

export interface IntrospectedColumn {
    name: string;
    dataType: string;
    length?: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isUnique: boolean;
    autoIncrement: boolean;
    defaultValue?: string;
}

export interface IntrospectedForeignKey {
    constraintName: string;
    columns: string[];
    refTable: string;
    refColumns: string[];
    onDelete: string;
    onUpdate: string;
}

export interface IntrospectedIndex {
    name: string;
    columns: { columnName: string; order: "ASC" | "DESC" }[];
    isUnique: boolean;
    type: string;
}

export interface IntrospectedTable {
    name: string;
    columns: IntrospectedColumn[];
    foreignKeys: IntrospectedForeignKey[];
    indexes: IntrospectedIndex[];
}

// ─── CRUD ───────────────────────────────────────────────

export async function createDbConnection(
    values: DBConnectionFormValues & { projectId?: string },
): Promise<DBConnection> {
    return apiPost<DBConnection, typeof values>(PROXY_DB_CONNECTIONS, values);
}

export async function getMyDbConnections(): Promise<DBConnection[]> {
    return apiGet<DBConnection[]>(PROXY_DB_CONNECTIONS);
}

export async function getDbConnection(connId: string): Promise<DBConnection> {
    return apiGet<DBConnection>(PROXY_DB_CONNECTION_DETAIL(connId));
}

export async function updateDbConnection(
    connId: string,
    values: Partial<DBConnectionFormValues>,
): Promise<DBConnection> {
    return apiPatch<DBConnection, typeof values>(
        PROXY_DB_CONNECTION_DETAIL(connId),
        values,
    );
}

export async function deleteDbConnection(connId: string): Promise<void> {
    return apiDelete<void>(PROXY_DB_CONNECTION_DETAIL(connId));
}

// ─── Test ───────────────────────────────────────────────

export async function testDbConnectionUnsaved(
    values: Omit<DBConnectionFormValues, "name">,
): Promise<TestResult> {
    return apiPost<TestResult, typeof values>(PROXY_DB_CONNECTION_TEST, values);
}

export async function testDbConnectionSaved(
    connId: string,
): Promise<TestResult> {
    return apiPost<TestResult, Record<string, never>>(
        PROXY_DB_CONNECTION_TEST_SAVED(connId),
        {},
    );
}

// ─── Local Agent ────────────────────────────────────────────────────────

export const LOCAL_AGENT_PORT = 27182;
export const LOCAL_AGENT_BASE = `http://localhost:${LOCAL_AGENT_PORT}`;

export interface AgentConnectionParams {
    dbms: string;
    host: string;
    port: number | null;
    database: string;
    username: string | null;
    password: string | null;
    ssl: boolean;
}

/**
 * Fetches decrypted connection params from the backend so the frontend
 * can forward them to the local agent running at localhost:27182.
 * Only the connection owner can call this endpoint.
 */
export async function getDbConnectionPlainParams(
    connId: string,
): Promise<AgentConnectionParams> {
    return apiPost<AgentConnectionParams, Record<string, never>>(
        PROXY_DB_CONNECTION_PLAIN_PARAMS(connId),
        {},
    );
}

export async function agentTestConnection(
    params: AgentConnectionParams,
): Promise<TestResult> {
    const res = await fetch(`${LOCAL_AGENT_BASE}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Agent error: ${res.status}`);
    return res.json() as Promise<TestResult>;
}

export async function agentListSchemas(
    params: AgentConnectionParams,
): Promise<string[]> {
    const res = await fetch(`${LOCAL_AGENT_BASE}/schemas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Agent error: ${res.status}`);
    return res.json() as Promise<string[]>;
}

export async function agentIntrospect(
    params: AgentConnectionParams,
    schema?: string,
): Promise<IntrospectedTable[]> {
    const res = await fetch(`${LOCAL_AGENT_BASE}/introspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, schema }),
        signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Agent error: ${res.status}`);
    return res.json() as Promise<IntrospectedTable[]>;
}

// ─── Introspect ─────────────────────────────────────────

export async function listSchemasDbConnection(
    connId: string,
): Promise<string[]> {
    return apiPost<string[], Record<string, never>>(
        PROXY_DB_CONNECTION_SCHEMAS(connId),
        {},
    );
}

export async function introspectDbConnection(
    connId: string,
    schema?: string,
): Promise<IntrospectedTable[]> {
    const url = schema
        ? `${PROXY_DB_CONNECTION_INTROSPECT(connId)}?schema=${encodeURIComponent(schema)}`
        : PROXY_DB_CONNECTION_INTROSPECT(connId);
    return apiPost<IntrospectedTable[], Record<string, never>>(url, {});
}

// ─── Execute Query ──────────────────────────────────────

export async function executeQueryDbConnection(
    connId: string,
    query: string,
    parameters?: unknown[],
    options?: { timeoutMs?: number; resultLimit?: number },
): Promise<QueryResultDto> {
    return apiPost<QueryResultDto, { query: string; parameters?: unknown[]; timeoutMs?: number; resultLimit?: number }>(
        PROXY_DB_CONNECTION_EXECUTE(connId),
        {
            query,
            parameters,
            ...options,
        },
    );
}

// ─── Project linking ────────────────────────────────────

export async function getProjectDbConnections(
    projectId: string,
): Promise<DBConnection[]> {
    return apiGet<DBConnection[]>(PROXY_PROJECT_DB_CONNECTIONS(projectId));
}

export async function linkDbConnectionToProject(
    projectId: string,
    dbConnectionId: string,
) {
    return apiPost(PROXY_PROJECT_DB_CONNECTION_LINK(projectId), {
        dbConnectionId,
    });
}

export async function unlinkDbConnectionFromProject(
    projectId: string,
    connId: string,
) {
    return apiDelete(PROXY_PROJECT_DB_CONNECTION_UNLINK(projectId, connId));
}

// ─── SWR Hooks ──────────────────────────────────────────

export function useMyDbConnections() {
    return useSWR<DBConnection[]>("my-db-connections", () =>
        getMyDbConnections(),
    );
}

export function useProjectDbConnections(projectId: string | null) {
    return useSWR<DBConnection[]>(
        projectId ? `project-db-connections-${projectId}` : null,
        () => getProjectDbConnections(projectId!),
    );
}
