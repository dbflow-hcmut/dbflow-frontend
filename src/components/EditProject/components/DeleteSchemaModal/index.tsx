"use client";

import React, { useState } from "react";
import { Modal } from "antd";
import { ProjectSchemasResponse } from "@/types/projects.type";
import { deleteSchema } from "./api";

type DeleteSchemaModalProps = {
    open: boolean;
    schema: ProjectSchemasResponse | null;
    projectId: string | null;
    onClose: () => void;
    onSuccess: () => void;
};

const DeleteSchemaModal: React.FC<DeleteSchemaModalProps> = ({
    open,
    schema,
    projectId,
    onClose,
    onSuccess,
}) => {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleConfirmDelete = async () => {
        if (!schema || !projectId) return;

        setIsDeleting(true);
        try {
            await deleteSchema(projectId, schema.id);
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Failed to delete schema:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Modal
            title="Delete Schema"
            open={open}
            onOk={handleConfirmDelete}
            onCancel={onClose}
            confirmLoading={isDeleting}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true }}
        >
            <p>Are you sure you want to delete the schema &quot;{schema?.name}&quot;? This action cannot be undone.</p>
        </Modal>
    );
};

export default DeleteSchemaModal;

