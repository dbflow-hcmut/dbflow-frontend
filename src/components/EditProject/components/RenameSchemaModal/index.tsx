"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Modal, Input } from "antd";
import { ProjectSchemasResponse } from "@/types/projects.type";
import { updateSchemaName } from "./api";
import { notificationProvider } from "@/providers/notification";
import { getApiErrorMessage } from "@/utils/functions";

type RenameSchemaModalProps = {
    open: boolean;
    schema: ProjectSchemasResponse | null;
    projectId: string | null;
    onClose: () => void;
    onSuccess: () => void;
};

const RenameSchemaModal: React.FC<RenameSchemaModalProps> = ({
    open,
    schema,
    projectId,
    onClose,
    onSuccess,
}) => {
    const [newName, setNewName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);
    const isDisabled = useMemo(() => {
        return !newName.trim() || newName.trim() === schema?.name;
    }, [newName, schema]);

    useEffect(() => {
        if (open && schema) {
            setNewName(schema.name);
        } else {
            setNewName("");
        }
    }, [open, schema]);

    const handleConfirmRename = async () => {
        if (!schema || !projectId || !newName.trim()) {
            notificationProvider.open({
                type: "error",
                message: "Schema name cannot be empty",
            });
            return;
        }

        if (newName.trim() === schema.name) {
            onClose();
            return;
        }

        setIsRenaming(true);
        try {
            await updateSchemaName(projectId, schema.id, newName.trim());
            notificationProvider.open({
                type: "success",
                message: "Schema renamed successfully",
            });
            onSuccess();
            onClose();
        } catch (error) {
            notificationProvider.open({
                type: "error",
                message: getApiErrorMessage(error, "Failed to rename schema. Please try again."),
            });
        } finally {
            setIsRenaming(false);
        }
    };

    const handleCancel = () => {
        setNewName(schema?.name || "");
        onClose();
    };

    return (
        <Modal
            title="Rename Schema"
            open={open}
            onOk={handleConfirmRename}
            onCancel={handleCancel}
            confirmLoading={isRenaming}
            okText="Rename"
            cancelText="Cancel"
            okButtonProps={{ disabled: isDisabled }}
        >
            <div className="py-4">
                <label className="block text-sm font-medium mb-2">
                    Schema Name
                </label>
                <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Enter schema name"
                    onPressEnter={handleConfirmRename}
                    autoFocus
                    className="!h-10"
                    required
                />
            </div>
        </Modal>
    );
};

export default RenameSchemaModal;

