"use client";

import React, { useState } from "react";
import { Modal, Button, Spin, Tag, Divider, Empty, Tooltip } from "antd";
import {
    DatabaseZap,
    Plus,
    CheckCircle2,
    Plug,
    Database,
    ChevronRight,
    Sparkles,
    Layers,
    RefreshCcw,
    ArrowLeftRight,
} from "lucide-react";
import {
    useMyDbConnections,
    useProjectDbConnections,
    linkDbConnectionToProject,
    unlinkDbConnectionFromProject,
} from "@/api/db-connections/client";
import { mutate } from "swr";
import { notificationProvider } from "@/providers/notification";
import type { DBConnection } from "@/types/db-connection.type";
import DBConnectionModal from "@/components/DBConnectionModal";

interface ProjectDBConnectionModalProps {
    open: boolean;
    onClose: () => void;
    projectId: string;
}

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

export default function ProjectDBConnectionModal({
    open,
    onClose,
    projectId,
}: ProjectDBConnectionModalProps) {
    const [isChangeOpen, setIsChangeOpen] = useState(false);
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

    const { data: projectConns, isLoading: loadingProject } =
        useProjectDbConnections(open ? projectId : null);
    const { data: allConns, isLoading: loadingAll } = useMyDbConnections();

    const linkedIds = new Set((projectConns ?? []).map((c) => c.id));
    const hasLinked = (projectConns?.length ?? 0) > 0;

    async function handleLink(conn: DBConnection) {
        setLinkingId(conn.id);
        try {
            await linkDbConnectionToProject(projectId, conn.id);
            await mutate(`project-db-connections-${projectId}`);
            notificationProvider.open({
                type: "success",
                message: "Connected",
                description: `"${conn.name}" is now linked to this project.`,
            });
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

    async function handleUnlink(conn: DBConnection) {
        setUnlinkingId(conn.id);
        try {
            await unlinkDbConnectionFromProject(projectId, conn.id);
            const cacheKey = `project-db-connections-${projectId}`;
            await mutate(
                cacheKey,
                (current: DBConnection[] | undefined) =>
                    (current ?? []).filter((item) => item.id !== conn.id),
                { revalidate: false },
            );
            await mutate(cacheKey);
            notificationProvider.open({
                type: "success",
                message: "Disconnected",
                description: `"${conn.name}" has been unlinked from this project.`,
            });
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

    const isLoading = loadingProject || loadingAll;

    // ── Management view (project already has at least one linked DB) ──
    if (!isLoading && hasLinked) {
        const linkedConn = (projectConns ?? [])[0];
        return (
            <>
                <Modal
                    open={open && !isChangeOpen}
                    onCancel={onClose}
                    footer={null}
                    title={
                        <div className="flex items-center gap-2">
                            <DatabaseZap size={18} className="text-blue-500" />
                            <span>Database Management</span>
                        </div>
                    }
                    width={680}
                    destroyOnClose
                >
                    {/* Linked connection */}
                    {linkedConn && (
                        <div className="mb-4">
                            <p className="text-sm text-gray-500 mb-3">Connected database</p>
                            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <Database
                                        size={16}
                                        style={{ color: DBMS_COLORS[linkedConn.dbms] ?? "#666" }}
                                    />
                                    <div>
                                        <div className="font-medium text-sm leading-none mb-1">
                                            {linkedConn.name}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {DBMS_LABELS[linkedConn.dbms] ?? linkedConn.dbms} · {linkedConn.host}:{linkedConn.port}/{linkedConn.database}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Tag
                                        color={linkedConn.status === "connected" ? "green" : linkedConn.status === "failed" ? "red" : "default"}
                                        className="!text-xs !leading-none !py-0.5"
                                    >
                                        {linkedConn.status}
                                    </Tag>
                                    <Tooltip title="Change database">
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<ArrowLeftRight size={14} />}
                                            onClick={async () => {
                                                await handleUnlink(linkedConn);
                                                setIsChangeOpen(true);
                                            }}
                                            loading={unlinkingId === linkedConn.id}
                                        />
                                    </Tooltip>
                                </div>
                            </div>
                        </div>
                    )}

                    <Divider className="!my-3" />

                    {/* Feature placeholders */}
                    <p className="text-sm text-gray-500 mb-3">Available actions</p>
                    <div className="flex flex-col gap-2 mb-4">
                        {[
                            {
                                icon: <Sparkles size={16} className="text-purple-500" />,
                                label: "Generate Query",
                                desc: "AI-powered SQL query generator",
                                disabled: true,
                            },
                            {
                                icon: <Layers size={16} className="text-orange-500" />,
                                label: "Seed Data",
                                desc: "Generate and insert sample data",
                                disabled: true,
                            },
                            {
                                icon: <RefreshCcw size={16} className="text-green-500" />,
                                label: "Sync Schema",
                                desc: "Pull latest schema from database",
                                disabled: true,
                            },
                        ].map((item) => (
                            <button
                                key={item.label}
                                disabled={item.disabled}
                                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    {item.icon}
                                    <div>
                                        <div className="font-medium text-sm leading-none mb-0.5">
                                            {item.label}
                                        </div>
                                        <div className="text-xs text-gray-400">{item.desc}</div>
                                    </div>
                                </div>
                                <ChevronRight size={14} className="text-gray-300" />
                            </button>
                        ))}
                    </div>

                </Modal>

                {/* Change connection flow — only shown after user clicks the swap icon */}
                <SelectOrCreateDBModal
                    open={isChangeOpen}
                    onClose={() => setIsChangeOpen(false)}
                    projectId={projectId}
                    linkedIds={linkedIds}
                    allConns={allConns ?? []}
                    loadingAll={loadingAll}
                    linkingId={linkingId}
                    onLink={async (conn) => {
                        await handleLink(conn);
                        setIsChangeOpen(false);
                    }}
                />
            </>
        );
    }

    // ── Select / connect view (no linked DB yet) ──
    return (
        <>
            <SelectOrCreateDBModal
                open={open && !isLoading}
                onClose={onClose}
                projectId={projectId}
                linkedIds={linkedIds}
                allConns={allConns ?? []}
                loadingAll={isLoading}
                linkingId={linkingId}
                onLink={handleLink}
            />
        </>
    );
}

// ── Inner: select from existing or create new ─────────────────────────────

interface SelectOrCreateProps {
    open: boolean;
    onClose: () => void;
    projectId: string;
    linkedIds: Set<string>;
    allConns: DBConnection[];
    loadingAll: boolean;
    linkingId: string | null;
    onLink: (conn: DBConnection) => Promise<void>;
}

function SelectOrCreateDBModal({
    open,
    onClose,
    projectId,
    linkedIds,
    allConns,
    loadingAll,
    linkingId,
    onLink,
}: SelectOrCreateProps) {
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const available = allConns.filter((c) => !linkedIds.has(c.id));

    return (
        <>
            <Modal
                open={open && !isCreateOpen}
                onCancel={onClose}
                footer={null}
                title={
                    <div className="flex items-center gap-2">
                        <Plug size={18} className="text-blue-500" />
                        <span>Connect to Database</span>
                    </div>
                }
                width={680}
                destroyOnClose
            >
                {loadingAll ? (
                    <div className="flex justify-center py-8">
                        <Spin />
                    </div>
                ) : (
                    <>
                        {available.length > 0 ? (
                            <>
                                <p className="text-sm text-gray-500 mb-3">
                                    Select a saved connection to link to this project
                                </p>
                                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-4">
                                    {available.map((conn) => (
                                        <div
                                            key={conn.id}
                                            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
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
                                                size="small"
                                                icon={<CheckCircle2 size={13} />}
                                                loading={linkingId === conn.id}
                                                onClick={() => onLink(conn)}
                                                className="flex items-center"
                                            >
                                                Connect
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <Divider className="!my-3" />
                            </>
                        ) : (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="No saved connections yet"
                                className="!my-4"
                            />
                        )}

                        <Button
                            block
                            icon={<Plus size={15} />}
                            className="flex items-center justify-center gap-1 h-10!"
                            onClick={() => setIsCreateOpen(true)}
                        >
                            Add new database connection
                        </Button>
                    </>
                )}
            </Modal>

            <DBConnectionModal
                open={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                projectId={projectId}
                onSaved={async () => {
                    setIsCreateOpen(false);
                    // newly created connection is already linked via projectId in form
                    await mutate(`project-db-connections-${projectId}`);
                    await mutate("my-db-connections");
                    onClose();
                }}
            />
        </>
    );
}
