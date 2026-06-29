"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Modal, Select, Button, Segmented, Spin, Tooltip } from "antd";
import { CheckCircle, XCircle, AlertTriangle, Database, ArrowLeftRight, Lock, User, PlugZap, Network, MonitorSmartphone, GripHorizontal, RotateCcw } from "lucide-react";
import Editor from "@monaco-editor/react";
import {
    useProjectDbConnections,
    executeQueryDbConnection,
    listSchemasDbConnection,
    getDbConnectionPlainParams,
    agentListSchemas,
} from "@/api/db-connections/client";
import { generateDDL } from "../../../utils/ddl-generator";
import type { PhysicalModelPayload } from "../../../utils/physical-model.builder";
import type { DBMSType } from "../../../utils/dbms-config";
import type { DBConnectionDBMS } from "@/types/db-connection.type";
import { usePermissionDetector, getMissingForExport } from "../shared/use-permission-detector";
import { useExportHistory } from "../shared/use-export-history";
import type { ExportLogEntry, ExportRecordStatus, ExportRecordTrigger } from "../shared/types";

// ── Types ──────────────────────────────────────────────────────────────

type ConflictStrategy = "add_only" | "drop_and_recreate";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    model: PhysicalModelPayload | null;
    projectId: string | null;
    /** Called when the user needs to connect/change a DB (flow controller handles this) */
    onNeedConnection?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────

const DBMS_COLORS: Record<string, string> = {
    postgresql: "#336791",
    mysql: "#e47911",
    sqlserver: "#cc2927",
};

const DBMS_LABELS: Record<string, string> = {
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    sqlserver: "SQL Server",
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
    direct: <PlugZap size={11} />,
    ssh: <Network size={11} />,
    local_agent: <MonitorSmartphone size={11} />,
};

const METHOD_LABELS: Record<string, string> = {
    direct: "Direct",
    ssh: "SSH Tunnel",
    local_agent: "Local Agent",
};

const DBMS_MAP: Record<DBConnectionDBMS, DBMSType> = {
    postgresql: "postgresql",
    mysql: "mysql",
    sqlserver: "sqlserver",
};

import { getCachedSchemas, setCachedSchemas, pickDefaultSchema, setCachedSelectedSchema } from "@/utils/schema-session-cache";

function splitStatements(sql: string): string[] {
    return sql
        .split(/;\s*(?:\n|$)/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s + ";");
}

// ── Component ──────────────────────────────────────────────────────────

const SchemaExportModal: React.FC<Props> = ({ isOpen, onClose, model, projectId, onNeedConnection }) => {
    const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
    const [strategy, setStrategy] = useState<ConflictStrategy>("add_only");
    const [applying, setApplying] = useState(false);
    const [log, setLog] = useState<ExportLogEntry[]>([]);
    const [done, setDone] = useState(false);
    const [logHeight, setLogHeight] = useState(80);
    const [dragging, setDragging] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [targetSchema, setTargetSchema] = useState("public");
    const [dbSchemas, setDbSchemas] = useState<string[]>([]);
    const [schemasLoading, setSchemasLoading] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const topSectionRef = useRef<HTMLDivElement>(null);
    const dragStartY = useRef(0);
    const dragStartVal = useRef(0);

    const { data: connections, isLoading: loadingConns } = useProjectDbConnections(isOpen ? projectId : null);
    const { matrix, loading: permLoading, check: checkPermissions } = usePermissionDetector();
    const { addRecord } = useExportHistory(projectId);

    const selectedConn = useMemo(
        () => connections?.find((c) => c.id === selectedConnId) ?? null,
        [connections, selectedConnId],
    );

    // Auto-select first connection if only one
    useEffect(() => {
        if (isOpen && connections?.length === 1 && !selectedConnId) {
            setSelectedConnId(connections[0].id);
        }
    }, [isOpen, connections, selectedConnId]);

    // Check permissions when connection selected
    useEffect(() => {
        if (selectedConnId) {
            checkPermissions(selectedConnId);
        }
    }, [selectedConnId, checkPermissions]);

    const applySchemas = useCallback((connId: string, schemas: string[]) => {
        setDbSchemas(schemas);
        setTargetSchema(pickDefaultSchema(schemas, connId));
    }, []);

    const loadSchemas = useCallback((force = false) => {
        if (!selectedConnId || !selectedConn) {
            setDbSchemas([]);
            setTargetSchema("public");
            return;
        }
        if (!force) {
            const cached = getCachedSchemas(selectedConnId);
            if (cached) { applySchemas(selectedConnId, cached); return; }
        }
        setSchemasLoading(true);
        const isAgent = selectedConn.method === "local_agent";
        const load = isAgent
            ? getDbConnectionPlainParams(selectedConnId).then((p) => agentListSchemas(p))
            : listSchemasDbConnection(selectedConnId);
        load
            .then((schemas) => {
                setCachedSchemas(selectedConnId, schemas);
                applySchemas(selectedConnId, schemas);
            })
            .catch(() => setDbSchemas([]))
            .finally(() => setSchemasLoading(false));
    }, [selectedConnId, selectedConn, applySchemas]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadSchemas(); }, [selectedConnId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setSelectedConnId(null);
            setLog([]);
            setDone(false);
            setStrategy("add_only");
            setTargetSchema("public");
            setDbSchemas([]);
        }
    }, [isOpen]);

    const startDrag = useCallback(
        (currentVal: number) => (e: React.MouseEvent) => {
            e.preventDefault();
            dragStartY.current = e.clientY;
            dragStartVal.current = currentVal;
            setDragging(true);
        },
        [],
    );

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
            const delta = e.clientY - dragStartY.current;
            const containerH = containerRef.current?.clientHeight ?? 600;
            const topH = topSectionRef.current?.clientHeight ?? 160;
            const FOOTER_H = 52;
            const HANDLE_H = 6;
            const MIN_EDITOR = 80;
            const available = containerH - topH - FOOTER_H - HANDLE_H;
            // dragging handle UP (negative delta) → log grows
            setLogHeight(Math.max(40, Math.min(available - MIN_EDITOR, dragStartVal.current - delta)));
        };
        const onUp = () => setDragging(false);
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        return () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
    }, [dragging]);

    const ddlResult = useMemo(() => {
        if (!model || !selectedConn) return null;
        return generateDDL(model, {
            dbms: DBMS_MAP[selectedConn.dbms],
            includeCreateTable: true,
            includeForeignKeys: true,
            includeIndexes: true,
            includeDropIfExists: strategy === "drop_and_recreate",
            includeIfNotExists: strategy === "add_only",
        });
    }, [model, selectedConn, strategy]);

    const missingPerms = useMemo(() => {
        if (!matrix) return [];
        return getMissingForExport(matrix, strategy === "drop_and_recreate");
    }, [matrix, strategy]);

    const handleApply = useCallback(async () => {
        if (!ddlResult?.sql || !selectedConnId || !selectedConn) return;

        setApplying(true);
        setLog([]);
        const ddlStatements = splitStatements(ddlResult.sql);
        const setSchema = selectedConn?.dbms === "postgresql" && targetSchema
            ? [`SET search_path TO "${targetSchema}";`]
            : [];
        const statements = [...setSchema, ...ddlStatements];
        const runLog: ExportLogEntry[] = [];
        let succeeded = 0;
        let failed = 0;

        for (const stmt of statements) {
            const start = Date.now();
            try {
                const result = await executeQueryDbConnection(selectedConnId, stmt);
                const ms = Date.now() - start;
                if (result.success) {
                    succeeded++;
                    runLog.push({ statement: stmt, status: "ok", execution_time_ms: ms });
                } else {
                    failed++;
                    runLog.push({ statement: stmt, status: "error", error_message: result.message, execution_time_ms: ms });
                    break;
                }
            } catch (err) {
                failed++;
                runLog.push({
                    statement: stmt,
                    status: "error",
                    error_message: err instanceof Error ? err.message : String(err),
                    execution_time_ms: Date.now() - start,
                });
                break;
            }
            setLog([...runLog]);
        }

        const status: ExportRecordStatus =
            failed > 0 ? (succeeded > 0 ? "partial" : "failed") : "success";

        // Generate minimal DOWN migration (DROP TABLE for each table)
        const downMigration = (model?.tables ?? [])
            .map((t) => `DROP TABLE IF EXISTS "${t.name}";`)
            .join("\n");

        try {
            await addRecord({
                connection_id: selectedConnId,
                trigger: "manual" as ExportRecordTrigger,
                status,
                dbms: selectedConn.dbms,
                ddl_snapshot_before: "",
                up_migration: setSchema.length > 0 ? `${setSchema[0]}\n${ddlResult.sql}` : ddlResult.sql,
                down_migration: downMigration,
            });
        } catch {
            // non-blocking — record saving failure should not block UX
        }

        setLog(runLog);
        setApplying(false);
        setDone(true);
    }, [ddlResult, selectedConnId, selectedConn, model, addRecord]);

    const resultStatus = useMemo(() => {
        if (!done) return null;
        if (log.some((e) => e.status === "error")) return "error";
        return "success";
    }, [done, log]);

    const handleApplyClick = useCallback(() => {
        if (strategy === "drop_and_recreate") {
            setConfirmOpen(true);
        } else {
            handleApply();
        }
    }, [strategy, handleApply]);

    const handleConfirm = useCallback(async () => {
        setConfirmOpen(false);
        await handleApply();
    }, [handleApply]);

    return (
        <>
        <Modal
            open={isOpen}
            onCancel={onClose}
            title={
                <div className="flex items-center gap-2">
                    <span>Apply Schema to Database</span>
                </div>
            }
            width={1000}
            styles={{ body: { padding: 0, height: "calc(90vh - 55px)", overflow: "hidden" } }}
            footer={null}
            destroyOnClose
            centered
        >
            <div ref={containerRef} className="h-full flex flex-col overflow-hidden">

                {/* ── Top: connection / permissions / strategy / DDL label ── */}
                <div ref={topSectionRef} className="py-3 flex flex-col gap-3 flex-shrink-0 border-b border-gray-100">
                    {/* Connection selector */}
                    {!selectedConn ? (
                        <Select
                            placeholder="Select a database connection"
                            loading={loadingConns}
                            value={selectedConnId ?? undefined}
                            onChange={(v) => setSelectedConnId(v)}
                            style={{ width: "100%" }}
                            options={connections?.map((c) => ({
                                value: c.id,
                                label: (
                                    <div className="flex items-center gap-2">
                                        <Database size={13} style={{ color: DBMS_COLORS[c.dbms] ?? "#666" }} />
                                        <span>{c.name}</span>
                                        <span className="text-gray-400 text-xs">{c.host}:{c.port}/{c.database}</span>
                                    </div>
                                ),
                            }))}
                        />
                    ) : (
                        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Database size={16} style={{ color: DBMS_COLORS[selectedConn.dbms] ?? "#666" }} />
                                <div>
                                    <div className="font-medium text-xs leading-none mb-1">{selectedConn.name}</div>
                                    <div className="text-xs text-gray-400">
                                        {DBMS_LABELS[selectedConn.dbms] ?? selectedConn.dbms} ·{" "}
                                        {selectedConn.host}:{selectedConn.port}/{selectedConn.database}
                                    </div>
                                    <div className="flex items-center gap-3 pt-0.5">
                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <User size={11} className="shrink-0" />
                                            <span>{selectedConn.username}</span>
                                        </div>
                                        <span className="text-gray-200">·</span>
                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                            {METHOD_ICONS[selectedConn.method]}
                                            <span>{METHOD_LABELS[selectedConn.method] ?? selectedConn.method}</span>
                                        </div>
                                        {selectedConn.ssl && (
                                            <>
                                                <span className="text-gray-200">·</span>
                                                <div className="flex items-center gap-1 text-xs text-green-600">
                                                    <Lock size={11} className="shrink-0" />
                                                    <span>SSL</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Target schema */}
                    {selectedConn && (
                        <div className="flex items-center gap-2 px-1">
                            <span className="text-xs text-gray-500">Target schema:</span>
                            {schemasLoading ? (
                                <div className="h-5 w-24 rounded bg-gray-200 animate-pulse" />
                            ) : dbSchemas.length > 0 ? (
                                <div className="[&_.ant-select-selection-item]:!text-xs [&_.ant-select-selector]:!text-xs [&_.ant-select-selector]:!bg-transparent [&_.ant-select-selector]:!border-none [&_.ant-select-selector]:!shadow-none">
                                    <Select
                                        size="small"
                                        variant="borderless"
                                        value={targetSchema}
                                        onChange={(s) => { setTargetSchema(s); if (selectedConnId) setCachedSelectedSchema(selectedConnId, s); }}
                                        options={dbSchemas.map((s) => ({ label: s, value: s }))}
                                        style={{ width: 130 }}
                                    />
                                </div>
                            ) : (
                                <span className="text-xs text-gray-500 font-mono">{targetSchema}</span>
                            )}
                            <Tooltip title="Reload schemas">
                                <button
                                    onClick={() => loadSchemas(true)}
                                    disabled={schemasLoading}
                                    className="cursor-pointer text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    <RotateCcw size={12} />
                                </button>
                            </Tooltip>
                        </div>
                    )}

                    {/* Permission check */}
                    {selectedConnId && (
                        <div>
                            {permLoading ? (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <Spin size="small" /> Checking permissions...
                                </div>
                            ) : matrix ? (
                                missingPerms.length === 0 ? (
                                    <div className="flex items-center gap-1 text-green-600 text-xs">
                                        <CheckCircle size={14} /> Sufficient permissions
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 text-red-600 text-xs">
                                        <AlertTriangle size={14} /> {`Missing permissions: ${missingPerms.join(", ")}`}
                                    </div>
                                )
                            ) : null}
                        </div>
                    )}

                    {/* Conflict strategy */}
                    {selectedConn && (
                        <div>
                            <div className="text-xs font-medium mb-1 text-gray-700">Conflict strategy</div>
                            <Segmented
                                className="!text-xs"
                                value={strategy}
                                onChange={(v) => setStrategy(v as ConflictStrategy)}
                                options={[
                                    { label: <span style={{ color: "inherit" }}>Add only (IF NOT EXISTS)</span>, value: "add_only" },
                                    { label: <span style={{ color: "inherit" }}>Drop &amp; recreate</span>, value: "drop_and_recreate" },
                                ]}
                            />
                        </div>
                    )}

                    {/* DDL label */}
                    {ddlResult && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">SQL to apply</span>
                            <span className="text-xs text-gray-400">({ddlResult.statements.length} statements)</span>
                            {ddlResult.warnings.length > 0 && (
                                <span className="text-xs text-amber-500">⚠ {ddlResult.warnings.join(" • ")}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* ── SQL Editor (fills remaining space) ── */}
                {ddlResult && (
                    <div className="flex-1 min-h-0">
                        <Editor
                            height="100%"
                            language="sql"
                            value={ddlResult.sql}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
                            theme="light"
                        />
                    </div>
                )}

                {/* ── Drag handle between editor and log ── */}
                {ddlResult && (
                    <div
                        className={`h-1.5 flex-shrink-0 flex items-center justify-center cursor-row-resize select-none transition-colors ${dragging ? "bg-blue-200" : "bg-gray-100 hover:bg-blue-100"}`}
                        onMouseDown={startDrag(logHeight)}
                    >
                        <GripHorizontal size={10} className="text-gray-300" />
                    </div>
                )}

                {/* ── Log (fixed initial height, resizable via drag) ── */}
                <div className="flex-shrink-0 flex flex-col overflow-hidden border-t border-gray-100" style={{ height: logHeight }}>
                    <div className="flex items-center justify-between px-3 h-7 border-b border-gray-100 flex-shrink-0 bg-gray-50">
                        <span className="text-xs font-medium text-gray-400">Log</span>
                        {log.length > 0 && (
                            <button
                                onClick={() => setLog([])}
                                className="text-xs! cursor-pointer text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5 font-mono">
                        {log.length === 0 ? (
                            <span className="text-xs text-gray-400">No log entries.</span>
                        ) : (
                            log.map((entry, i) => (
                                <div key={i} className="flex items-start gap-1.5 mb-1 last:mb-0">
                                    {entry.status === "ok"
                                        ? <CheckCircle size={11} className="text-green-400 shrink-0 mt-0.5" />
                                        : <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />
                                    }
                                    <span className={`text-[11px] leading-4 break-all ${entry.status === "error" ? "text-red-500" : "text-green-600"}`}>
                                        {entry.statement.slice(0, 120)}{entry.statement.length > 120 ? "…" : ""}
                                        {entry.error_message && (
                                            <span className="block text-red-400 mt-0.5">{entry.error_message}</span>
                                        )}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="shrink-0 flex justify-end gap-2">
                    <Button onClick={onClose} disabled={applying} className="!text-xs !h-8 !px-4 !font-medium">
                        Cancel
                    </Button>
                    <Button
                        type="primary"
                        loading={applying}
                        disabled={!selectedConnId || !ddlResult || applying}
                        onClick={handleApplyClick}
                        className="!text-xs !h-8 !px-4 !font-medium"
                    >
                        Apply to Database
                    </Button>
                </div>

            </div>
        </Modal>

        {/* ── Drop & recreate confirmation ── */}
        <Modal
            open={confirmOpen}
            onCancel={() => setConfirmOpen(false)}
            footer={null}
            width={420}
            centered
            closable={false}
        >
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                    <div>
                        <div className="font-semibold text-sm text-gray-900 mb-1">Drop &amp; recreate all tables?</div>
                        <div className="text-xs text-gray-500 leading-relaxed">
                            This will <span className="font-medium text-red-600">permanently delete all existing data</span> in the affected tables before recreating them. This cannot be undone.
                        </div>
                    </div>
                </div>

                {(model?.tables?.length ?? 0) > 0 && (
                    <div className="bg-red-50 rounded-lg px-3 py-2.5">
                        <div className="text-xs text-red-600 font-medium mb-1.5">Tables that will be dropped:</div>
                        <div className="flex flex-wrap gap-1">
                            {model!.tables.map((t) => (
                                <span key={t.name} className="text-[11px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-mono">
                                    {t.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                    <Button size="small" onClick={() => setConfirmOpen(false)} className="!text-xs !h-7 !px-3">
                        Cancel
                    </Button>
                    <Button
                        danger
                        type="primary"
                        size="small"
                        onClick={handleConfirm}
                        className="!text-xs !h-7 !px-3"
                    >
                        Yes, drop &amp; recreate
                    </Button>
                </div>
            </div>
        </Modal>
        </>
    );
};

export default SchemaExportModal;
