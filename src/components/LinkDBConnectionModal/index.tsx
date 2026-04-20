"use client";

import React, { useCallback, useState } from "react";
import { Modal, Select, Empty, Spin } from "antd";
import { PlugZap } from "lucide-react";
import {
    useMyDbConnections,
    linkDbConnectionToProject,
} from "@/api/db-connections/client";
import { notificationProvider } from "@/providers/notification";

interface LinkDBConnectionModalProps {
    open: boolean;
    onClose: () => void;
    projectId: string;
    onLinked?: () => void;
}

const DBMS_LABELS: Record<string, string> = {
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    sqlserver: "SQL Server",
};

export default function LinkDBConnectionModal({
    open,
    onClose,
    projectId,
    onLinked,
}: LinkDBConnectionModalProps) {
    const { data: connections, isLoading } = useMyDbConnections();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isLinking, setIsLinking] = useState(false);

    const handleOk = useCallback(async () => {
        if (!selectedId) return;
        setIsLinking(true);
        try {
            await linkDbConnectionToProject(projectId, selectedId);
            notificationProvider.open({
                type: "success",
                message: "Connection linked to project",
            });
            setSelectedId(null);
            onLinked?.();
            onClose();
        } catch (err) {
            notificationProvider.open({
                type: "error",
                message:
                    err instanceof Error ? err.message : "Failed to link connection",
            });
        } finally {
            setIsLinking(false);
        }
    }, [selectedId, projectId, onClose, onLinked]);

    const handleClose = useCallback(() => {
        setSelectedId(null);
        onClose();
    }, [onClose]);

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={
                <div className="flex items-center gap-2">
                    <PlugZap className="w-5 h-5 text-primary-500" />
                    <span>Link Existing Connection</span>
                </div>
            }
            okText="Link"
            okButtonProps={{ disabled: !selectedId, loading: isLinking }}
            onOk={handleOk}
            width={480}
        >
            {isLoading ? (
                <div className="flex justify-center py-6">
                    <Spin />
                </div>
            ) : !connections || connections.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No saved connections found. Create one first."
                />
            ) : (
                <div className="py-2">
                    <p className="text-sm text-gray-500 mb-3">
                        Select a connection you&apos;ve previously created to link it to this project.
                    </p>
                    <Select
                        className="w-full"
                        placeholder="Choose a connection..."
                        value={selectedId}
                        onChange={setSelectedId}
                        showSearch
                        optionFilterProp="label"
                        options={connections.map((c) => ({
                            value: c.id,
                            label: c.name,
                            desc: `${DBMS_LABELS[c.dbms] ?? c.dbms} · ${c.host}${c.port ? `:${c.port}` : ""} / ${c.database}`,
                        }))}
                        optionRender={(opt) => (
                            <div>
                                <div className="text-sm font-medium">{opt.label}</div>
                                <div className="text-xs text-gray-400">
                                    {(opt.data as { desc: string }).desc}
                                </div>
                            </div>
                        )}
                    />
                </div>
            )}
        </Modal>
    );
}
