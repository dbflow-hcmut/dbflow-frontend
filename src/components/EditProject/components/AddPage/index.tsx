"use client";

import { SchemaType } from "@/utils/constants";
import { Form, Input, Modal, Select, Button } from "antd";
import { useCreateSchema } from "../../api/client";
import { notificationProvider } from "@/providers/notification";

export interface IAddPageProps {
    open: boolean;
    onClose: () => void;
    projectId: string | null;
}

export function AddPage(props: IAddPageProps) {
    const { open, onClose, projectId } = props;

    const [form] = Form.useForm();
    const { create, isLoading } = useCreateSchema(projectId);

    const handleFinish = async (values: { name: string; type: string }) => {
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
            });

            if (result) {
                notificationProvider.open({
                    type: "success",
                    message: "Schema created successfully!",
                });
                form.resetFields();
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

    return (
        <Modal
            open={open}
            onCancel={() => {
                form.resetFields();
                onClose();
            }}
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
                    />
                </Form.Item>

                <div className="flex justify-end gap-2 pb-3">
                    <Button
                        type="default"
                        className="!h-10"
                        onClick={onClose}
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
