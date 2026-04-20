"use client";

import React, { useState, useCallback } from "react";
import { Button, Empty, Spin, Tag, Tooltip, Modal } from "antd";
import {
    PlugZap,
    Plus,
    Trash2,
    Unlink,
    CheckCircle2,
    XCircle,
    HelpCircle,
    RefreshCw,
    Database,
} from "lucide-react";
import {
    useProjectDbConnections,
    testDbConnectionSaved,
    deleteDbConnection,
    unlinkDbConnectionFromProject,
} from "@/api/db-connections/client";
import { notificationProvider } from "@/providers/notification";
import type { DBConnection } from "@/types/db-connection.type";
import IntrospectSchemaModal from "@/components/IntrospectSchemaModal";

interface DBConnectionListPanelProps {
    projectId: string;
    onAddNew: () => void;
    onLink: () => void;
}

const STATUS_CONFIG = {
    connected: {
        color: "success" as const,
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        label: "Connected",
    },
    failed: {
        color: "error" as const,
        icon: <XCircle className="w-3.5 h-3.5" />,
        label: "Failed",
    },
    untested: {
        color: "default" as const,
        icon: <HelpCircle className="w-3.5 h-3.5" />,
        label: "Untested",
    },
};

const DBMS_LABELS: Record<string, string> = {
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    sqlserver: "SQL Server",
};

export default function DBConnectionListPanel({
    projectId,
    onAddNew,
    onLink,
}: DBConnectionListPanelProps) {
    const { data: connections, isLoading, mutate } = useProjectDbConnections(projectId);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [introspectOpen, setIntrospectOpen] = useState(false);

    const handleTest = useCallback(
        async (conn: DBConnection) => {
            setTestingId(conn.id);
            try {
                const result = await testDbConnectionSaved(conn.id);
                notificationProvider.open({
                    type: result.success ? "success" : "error",
                    message: result.success
                        ? `${conn.name}: Connection OK (${result.latencyMs}ms)`
                        : `${conn.name}: ${result.message}`,
                });
                mutate();
            } catch (err) {
                notificationProvider.open({
                    type: "error",
                    message: err instanceof Error ? err.message : "Test failed",
                });
            } finally {
                setTestingId(null);
            }
        },
        [mutate],
    );

    const handleUnlink = useCallback(
        (conn: DBConnection) => {
            Modal.confirm({
                title: "Unlink Connection",
                content: `Remove "${conn.name}" from this project? The connection itself will not be deleted.`,
                okText: "Unlink",
                okButtonProps: { danger: true },
                onOk: async () => {
                    await unlinkDbConnectionFromProject(projectId, conn.id);
                    notificationProvider.open({
                        type: "success",
                        message: `"${conn.name}" unlinked`,
                    });
                    mutate();
                },
            });
        },
        [projectId, mutate],
    );

    const handleDelete = useCallback(
        (conn: DBConnection) => {
            Modal.confirm({
                title: "Delete Connection",
                content: `Permanently delete "${conn.name}"? This will remove it from all projects that use it.`,
                okText: "Delete",
                okButtonProps: { danger: true },
                onOk: async () => {
                    await deleteDbConnection(conn.id);
                    notificationProvider.open({
                        type: "success",
                        message: `"${conn.name}" deleted`,
                    });
                    mutate();
                },
            });
        },
        [mutate],
    );

    if (isLoading) {
        return (
            <div className="flex justify-center py-8">
                <Spin />
            </div>
        );
    }

    if (!connections || connections.length === 0) {
        return (
            <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No database connections"
            >
                <div className="flex gap-2 justify-center">
                    <Button
                        type="primary"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={onAddNew}
                    >
                        New Connection
                    </Button>
                    <Button icon={<PlugZap className="w-4 h-4" />} onClick={onLink}>
                        Link Existing
                    </Button>
                </div>
            </Empty>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                    Database Connections ({connections.length})
                </h3>
                <div className="flex gap-2">
                    <Button
                        size="small"
                        icon={<Database className="w-3.5 h-3.5" />}
                        onClick={() => setIntrospectOpen(true)}
                    >
                        Import from DB
                    </Button>
                    <Button
                        size="small"
                        icon={<PlugZap className="w-3.5 h-3.5" />}
                        onClick={onLink}
                    >
                        Link Existing
                    </Button>
                    <Button
                        size="small"
                        type="primary"
                        icon={<Plus className="w-3.5 h-3.5" />}
                        onClick={onAddNew}
                    >
                        New
                    </Button>
                </div>
            </div>

            {connections.map((conn) => {
                const statusCfg = STATUS_CONFIG[conn.status] ?? STATUS_CONFIG.untested;
                return (
                    <div
                        key={conn.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <PlugZap className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                    {conn.name}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                    {DBMS_LABELS[conn.dbms] ?? conn.dbms} &middot;{" "}
                                    {conn.host}
                                    {conn.port ? `:${conn.port}` : ""} / {conn.database}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Tag
                                color={statusCfg.color}
                                icon={statusCfg.icon}
                                className="flex items-center gap-1"
                            >
                                {statusCfg.label}
                            </Tag>

                            <Tooltip title="Test connection">
                                <Button
                                    type="text"
                                    size="small"
                                    loading={testingId === conn.id}
                                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                                    onClick={() => handleTest(conn)}
                                />
                            </Tooltip>
                            <Tooltip title="Unlink from project">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<Unlink className="w-3.5 h-3.5" />}
                                    onClick={() => handleUnlink(conn)}
                                />
                            </Tooltip>
                            <Tooltip title="Delete connection">
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<Trash2 className="w-3.5 h-3.5" />}
                                    onClick={() => handleDelete(conn)}
                                />
                            </Tooltip>
                        </div>
                    </div>
                );
            })}

            <IntrospectSchemaModal
                open={introspectOpen}
                onClose={() => setIntrospectOpen(false)}
            />
        </div>
    );
}

