"use client";

import React, { useState } from "react";
import { Modal, Button, Spin, Empty } from "antd";
import { Plus, Database } from "lucide-react";
import {
    useMyDbConnections,
    useProjectDbConnections,
    linkDbConnectionToProject,
} from "@/api/db-connections/client";
import { mutate } from "swr";
import { notificationProvider } from "@/providers/notification";
import type { DBConnection } from "@/types/db-connection.type";

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

interface ConnectDbStepProps {
    open: boolean;
    projectId: string | null;
    onConnected: () => void;
    onCreateNew: () => void;
    onClose: () => void;
}

export default function ConnectDbStep({
    open,
    projectId,
    onConnected,
    onCreateNew,
    onClose,
}: ConnectDbStepProps) {
    const [linkingId, setLinkingId] = useState<string | null>(null);

    const { data: allConns, isLoading: loadingAll } = useMyDbConnections();
    const { data: projectConns, isLoading: loadingProject } = useProjectDbConnections(
        open ? projectId : null,
    );

    const linkedIds = new Set((projectConns ?? []).map((c) => c.id));
    const available = (allConns ?? []).filter((c) => !linkedIds.has(c.id));
    const isLoading = loadingAll || loadingProject;

    async function handleLink(conn: DBConnection) {
        if (!projectId) return;
        setLinkingId(conn.id);
        try {
            await linkDbConnectionToProject(projectId, conn.id);
            await mutate(`project-db-connections-${projectId}`);
            notificationProvider.open({
                type: "success",
                message: "Connected",
                description: `"${conn.name}" is now linked to this project.`,
            });
            onConnected();
        } catch {
            notificationProvider.open({
                type: "error",
                message: "Failed to connect",
                description: "Could not link the database to this project.",
            });
        } finally {
            setLinkingId(null);
        }
    }

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            title="Connect to Database"
            width={680}
            destroyOnClose
        >
            <div className="flex h-[400px] flex-col">
                <p className="text-xs text-gray-500 mb-4">
                    Connect a database to this project to enable schema exploration, query
                    generation, and other database-related features.
                </p>

                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Spin />
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {available.length > 0 ? (
                                <div className="flex flex-col gap-2 pr-1">
                                    {available.map((conn) => (
                                        <div
                                            key={conn.id}
                                            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Database
                                                    size={16}
                                                    style={{ color: DBMS_COLORS[conn.dbms] ?? "#666" }}
                                                />
                                                <div>
                                                    <div className="font-medium text-sm leading-none mb-1">
                                                        {conn.name}
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        {DBMS_LABELS[conn.dbms] ?? conn.dbms} · {conn.host}:{conn.port}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                type="primary"
                                                className="!h-8 !px-3 !text-xs !font-medium"
                                                loading={linkingId === conn.id}
                                                onClick={() => handleLink(conn)}
                                            >
                                                Connect
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description="No saved connections yet"
                                    className="!my-4 !text-xs"
                                />
                            )}
                        </div>

                        <Button
                            block
                            icon={<Plus size={15} />}
                            className="mt-4 flex !h-10 shrink-0 items-center justify-center gap-1"
                            onClick={onCreateNew}
                        >
                            Add new database connection
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
}
