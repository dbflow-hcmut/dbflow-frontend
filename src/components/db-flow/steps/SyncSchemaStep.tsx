"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Button, Tooltip, Spin, Tag, Select } from "antd";
import {
    Database,
    RefreshCcw,
    ArrowLeftRight,
    PlugZap,
    Network,
    MonitorSmartphone,
    ShieldCheck,
    RotateCcw,
    Lock,
    User,
    CheckCircle2,
    XCircle,
    PencilRuler,
    ChevronRight,
} from "lucide-react";
import {
    useProjectDbConnections,
    unlinkDbConnectionFromProject,
    listSchemasDbConnection,
    getDbConnectionPlainParams,
    agentListSchemas,
} from "@/api/db-connections/client";
import { mutate } from "swr";
import { notificationProvider } from "@/providers/notification";
import type { DBConnection } from "@/types/db-connection.type";
import { usePermissionDetector } from "@/components/EditProject/features/dbms/shared/use-permission-detector";
import type { PermissionMatrix } from "@/components/EditProject/features/dbms/shared/types";
import { getCachedSchemas, setCachedSchemas, pickDefaultSchema, setCachedSelectedSchema } from "@/utils/schema-session-cache";

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

const PERM_ITEMS: { key: keyof PermissionMatrix; label: string }[] = [
    { key: "can_create_table",  label: "CREATE TABLE"  },
    { key: "can_alter_table",   label: "ALTER TABLE"   },
    { key: "can_drop_table",    label: "DROP TABLE"    },
    { key: "can_insert",        label: "INSERT"        },
    { key: "can_update",        label: "UPDATE"        },
    { key: "can_delete",        label: "DELETE"        },
    { key: "can_create_index",  label: "CREATE INDEX"  },
    { key: "can_drop_index",    label: "DROP INDEX"    },
    { key: "can_create_schema", label: "CREATE SCHEMA" },
];

interface SyncSchemaStepProps {
    open: boolean;
    projectId: string | null;
    onChangeDb: () => void;
    onClose: () => void;
    onSync: (schema: string) => void;
    isSyncing?: boolean;
}

/**
 * "Sync Schema" — pulls the live DB structure into a new physical schema.
 * Only ever rendered once a connection is linked (the 'sync-schema' flow
 * gates on connect-db first — see db-flow-config.ts), so `linkedConn` is
 * expected to be present by the time this is open.
 */
export default function SyncSchemaStep({
    open,
    projectId,
    onChangeDb,
    onClose,
    onSync,
    isSyncing = false,
}: SyncSchemaStepProps) {
    const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

    const { data: projectConns } = useProjectDbConnections(open ? projectId : null);
    const linkedConn: DBConnection | undefined = projectConns?.[0];

    const { matrix, loading: permLoading, check, recheck } = usePermissionDetector();

    // Schema picker state
    const [dbSchemas, setDbSchemas]           = useState<string[]>([]);
    const [schemasLoading, setSchemasLoading] = useState(false);
    const [selectedSchema, setSelectedSchema] = useState<string>("");

    // Animated progress (0 → 95 while syncing)
    const [syncProgress, setSyncProgress] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!isSyncing) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setSyncProgress(0);
            return;
        }
        setSyncProgress(0);
        let val = 0;
        intervalRef.current = setInterval(() => {
            val += val < 30 ? 4 : val < 60 ? 2.5 : val < 82 ? 1.2 : 0.4;
            if (val >= 95) {
                val = 95;
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
            setSyncProgress(Math.round(val * 10) / 10);
        }, 150);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [isSyncing]);

    const loadSchemas = useCallback((force = false) => {
        if (!linkedConn) { setDbSchemas([]); setSelectedSchema(""); return; }
        if (!force) {
            const cached = getCachedSchemas(linkedConn.id);
            if (cached) { setDbSchemas(cached); setSelectedSchema(pickDefaultSchema(cached, linkedConn.id)); return; }
        }
        setSchemasLoading(true);
        const id = linkedConn.id;
        const isAgent = linkedConn.method === "local_agent";
        const load = isAgent
            ? getDbConnectionPlainParams(id).then((p) => agentListSchemas(p))
            : listSchemasDbConnection(id);
        load
            .then((s) => { setCachedSchemas(id, s); setDbSchemas(s); setSelectedSchema(pickDefaultSchema(s, id)); })
            .catch(() => setDbSchemas([]))
            .finally(() => setSchemasLoading(false));
    }, [linkedConn]);

    useEffect(() => {
        if (!open || !linkedConn) { setDbSchemas([]); setSelectedSchema(""); setSchemasLoading(false); return; }
        loadSchemas();
    }, [open, linkedConn?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (open && linkedConn?.id) {
            check(linkedConn.id);
        }
    }, [open, linkedConn?.id, check]);

    async function handleUnlinkAndChange() {
        if (!projectId || !linkedConn) return;
        setUnlinkingId(linkedConn.id);
        try {
            await unlinkDbConnectionFromProject(projectId, linkedConn.id);
            const key = `project-db-connections-${projectId}`;
            await mutate(
                key,
                (current: DBConnection[] | undefined) =>
                    (current ?? []).filter((c) => c.id !== linkedConn.id),
                { revalidate: false },
            );
            await mutate(key);
            onChangeDb();
        } catch {
            notificationProvider.open({
                type: "error",
                message: "Failed to disconnect",
                description: "Could not unlink the database from this project.",
            });
        } finally {
            setUnlinkingId(null);
        }
    }

    const handleSyncClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if (selectedSchema) onSync(selectedSchema);
    }, [selectedSchema, onSync]);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            title={
                <div className="flex items-center gap-2">
                    <span>Sync Schema</span>
                </div>
            }
            width={680}
            destroyOnHidden
        >
            {/* Connected DB */}
            {linkedConn && (
                <div className="mb-4">
                    <div className="rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Database
                                    size={16}
                                    style={{ color: DBMS_COLORS[linkedConn.dbms] ?? "#666" }}
                                />
                                <div>
                                    <div className="font-medium text-xs leading-none mb-1">
                                        {linkedConn.name}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {DBMS_LABELS[linkedConn.dbms] ?? linkedConn.dbms} ·{" "}
                                        {linkedConn.host}:{linkedConn.port}/{linkedConn.database}
                                    </div>
                                    <div className="flex items-center gap-3 pt-0.5">
                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <User size={11} className="shrink-0" />
                                            <span>{linkedConn.username}</span>
                                        </div>
                                        <span className="text-gray-200">·</span>
                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                            {METHOD_ICONS[linkedConn.method]}
                                            <span>{METHOD_LABELS[linkedConn.method] ?? linkedConn.method}</span>
                                        </div>
                                        {linkedConn.ssl && (
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
                            <Tooltip title="Change database">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<ArrowLeftRight size={14} />}
                                    onClick={handleUnlinkAndChange}
                                    loading={unlinkingId === linkedConn.id}
                                />
                            </Tooltip>
                        </div>
                    </div>
                </div>
            )}

            {linkedConn && (
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-gray-400">Target Schema:</span>
                        {schemasLoading ? (
                            <div className="h-5 w-20 rounded bg-gray-200 animate-pulse" />
                        ) : dbSchemas.length >= 1 ? (
                            <div className="[&_.ant-select-selection-item]:!text-xs [&_.ant-select-selector]:!text-xs [&_.ant-select-selector]:!bg-transparent [&_.ant-select-selector]:!border-none [&_.ant-select-selector]:!shadow-none">
                                <Select
                                    size="small"
                                    variant="borderless"
                                    value={selectedSchema}
                                    onChange={(s) => { setSelectedSchema(s); if (linkedConn?.id) setCachedSelectedSchema(linkedConn.id, s); }}
                                    options={dbSchemas.map((s) => ({ label: s, value: s }))}
                                    style={{ width: 110 }}
                                />
                            </div>
                        ) : selectedSchema ? (
                            <span className="text-xs text-gray-500 font-mono">{selectedSchema}</span>
                        ) : null}
                        <Tooltip title="Reload schemas">
                            <button
                                onClick={() => loadSchemas(true)}
                                disabled={schemasLoading || !linkedConn}
                                className="cursor-pointer text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <RotateCcw size={12} />
                            </button>
                        </Tooltip>
                </div>
            )}

            {/* Permissions */}
            {linkedConn && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                            <ShieldCheck size={13} />
                            <span>Permissions</span>
                        </div>
                        <Button
                            type="text"
                            size="small"
                            icon={<RotateCcw size={11} />}
                            loading={permLoading}
                            onClick={() => recheck(linkedConn.id)}
                            className="!text-xs !text-gray-400 !h-6 !px-1.5"
                        >
                            Recheck
                        </Button>
                    </div>

                    {permLoading && !matrix ? (
                        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                            <Spin size="small" />
                            <span>Checking permissions…</span>
                        </div>
                    ) : matrix ? (
                        <div className="rounded-lg bg-gray-50 px-3 py-2.5">
                            {matrix.is_superuser && (
                                <div className="mb-2">
                                    <Tag color="blue" className="!text-xs">Superuser</Tag>
                                </div>
                            )}
                            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                                {PERM_ITEMS.map(({ key, label }) => (
                                    <div key={key} className="flex items-center gap-1">
                                        {matrix[key] ? (
                                            <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                                        ) : (
                                            <XCircle size={11} className="text-red-400 shrink-0" />
                                        )}
                                        <span className={`text-xs ${matrix[key] ? "text-gray-600" : "text-gray-400"}`}>
                                            {label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            <div className="flex flex-col gap-2 mb-1">
                {/* Sync Schema row — uses shared selectedSchema */}
                <div
                    className={`flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 ${
                        !linkedConn || isSyncing
                            ? "opacity-60 cursor-not-allowed"
                            : "hover:bg-gray-100 cursor-pointer"
                    } transition-colors`}
                    onClick={!linkedConn || isSyncing ? undefined : handleSyncClick}
                >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <RefreshCcw size={16} className={isSyncing ? "animate-spin text-primary-500" : ""} />
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-xs leading-none mb-0.5">Sync Schema</div>
                            <div className="text-xs text-gray-400">
                                {isSyncing
                                    ? `Syncing ${selectedSchema}…`
                                    : `Pull latest schema from database`}
                            </div>
                            {isSyncing && (
                                <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary-500 rounded-full transition-all duration-150"
                                        style={{ width: `${syncProgress}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    {!isSyncing && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
                </div>
            </div>
        </Modal>
    );
}
