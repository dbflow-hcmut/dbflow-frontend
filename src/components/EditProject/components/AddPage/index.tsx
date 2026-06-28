"use client";

import { useState } from "react";
import { SchemaType } from "@/utils/constants";
import { Form, Input, Modal, Select, Button, Segmented } from "antd";
import { useCreateSchema } from "../../api/client";
import { notificationProvider } from "@/providers/notification";

export interface IAddPageProps {
    open: boolean;
    onClose: () => void;
    projectId: string | null;
}

const DBMS_OPTIONS = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

export function AddPage(props: IAddPageProps) {
    const { open, onClose, projectId } = props;

    const [form] = Form.useForm();
    const { create, isLoading } = useCreateSchema(projectId);
    const [selectedType, setSelectedType] = useState<string>("");

    const handleFinish = async (values: { name: string; type: string; dbms?: string }) => {
        if (!projectId) {
            notificationProvider.open({
                type: "error",
                message: "Project ID is required",
            });
            return;
        }

        try {
            const result = await create({
                name: values.name,
                type: values.type,
                ...(values.type === SchemaType.PHYSICAL && values.dbms
                    ? { dbms: values.dbms }
                    : {}),
            });

            if (result) {
                notificationProvider.open({
                    type: "success",
                    message: "Schema created successfully!",
                });
                form.resetFields();
                setSelectedType("");
                onClose();
            }
        } catch (err) {
            console.error("Error creating schema:", err);
            notificationProvider.open({
                type: "error",
                message: err instanceof Error ? err.message : "Failed to create schema",
            });
        }
    };

    const handleClose = () => {
        form.resetFields();
        setSelectedType("");
        onClose();
    };

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            footer={null}
            title="Create New Schema"
            closable={false}
            mask={false}
            maskClosable={true}
            className="add-page-modal"
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleFinish}
                className="pt-3"
            >
                <Form.Item
                    label="Schema Name"
                    name="name"
                    rules={[{ required: true, message: "Please enter schema name" }]}
                >
                    <Input
                        placeholder="Enter page name"
                        className="!h-10 !shadow-none"
                    />
                </Form.Item>
                <Form.Item
                    label="Schema Type"
                    name="type"
                    rules={[{ required: true, message: "Please select schema type" }]}
                >
                    <Select
                        placeholder="Select schema type"
                        options={[
                            { label: "Conceptual", value: SchemaType.CONCEPTUAL },
                            { label: "Logical", value: SchemaType.LOGICAL },
                            { label: "Physical", value: SchemaType.PHYSICAL },
                        ]}
                        className="!h-10 !shadow-none"
                        onChange={(value) => setSelectedType(value)}
                    />
                </Form.Item>

                {selectedType === SchemaType.PHYSICAL && (
                    <Form.Item
                        label="Target DBMS"
                        name="dbms"
                        initialValue="postgresql"
                        rules={[{ required: true, message: "Please select a DBMS" }]}
                    >
                        <Segmented
                            options={DBMS_OPTIONS}
                            block
                        />
                    </Form.Item>
                )}

                <div className="flex justify-end gap-2 pb-3">
                    <Button
                        type="default"
                        className="!h-10"
                        onClick={handleClose}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        className="!h-10"
                        loading={isLoading}
                    >
                        Create Schema
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
