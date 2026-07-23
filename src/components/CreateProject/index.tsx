"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, Select } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { revalidateProjects } from "@/app/projects/actions";
import { notificationProvider } from "@/providers/notification";
import { CreateProjectFormValues } from "@/types/projects.type";
import { useCreateProject } from "./api/client";
import { getWorkspaces, WorkspaceSummary } from "@/api/workspaces/client";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "@/utils/active-workspace";

export default function CreateProject() {
    const router = useRouter();
    const [form] = Form.useForm();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
    const { create, isLoading } = useCreateProject();
    
    const projectName = Form.useWatch("name", form);
    const selectedWorkspaceId = Form.useWatch("workspaceId", form);

    useEffect(() => {
        void getWorkspaces()
            .then((items) => {
                setWorkspaces(items);
                const personal = items.find((item) => item.type === "personal");
                const preferred = getActiveWorkspaceId();
                const selected =
                    items.find((item) => item.id === preferred) ?? personal ?? items[0];
                if (selected) form.setFieldValue("workspaceId", selected.id);
            })
            .catch(() => {
                notificationProvider.open({
                    type: "error",
                    message: "Failed to load workspaces",
                });
            })
            .finally(() => setIsLoadingWorkspaces(false));
    }, [form]);

    const handleSubmit = async (values: CreateProjectFormValues) => {
        try {
            const result = await create({
                workspaceId: values.workspaceId,
                name: values.name,
                description: values.description,
            });

            if (result) {
                router.push(`/projects/${result.id}`);
                notificationProvider.open({
                    type: "success",
                    message: "Project created successfully!",
                });
                form.resetFields();
                await revalidateProjects();
            }
        } catch (err) {
            console.error("Error creating project:", err);
            notificationProvider.open({
                type: "error",
                message: err instanceof Error ? err.message : "Failed to create project",
            });
        }
    };

    const handleCancel = () => {
        router.push("/ai-chat");
    };

    return (
        <div className="flex min-h-screen flex-col bg-[#FCFCFC]">
            <header className="flex h-14 items-center gap-3 bg-white px-4">
                <button
                    type="button"
                    aria-label="Open sidebar"
                    className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 lg:hidden"
                    onClick={() => setIsMobileSidebarOpen(true)}
                >
                    <Menu className="h-5 w-5" />
                </button>
                <Link href="/ai-chat" prefetch className="flex cursor-pointer items-center gap-2">
                    <Image src="/favicon.ico" alt="DB Flow" width={24} height={24} priority />
                    <span className="text-lg font-bold text-primary-500">DB Flow</span>
                </Link>
            </header>
            <Sidebar
                mobile
                mobileOpen={isMobileSidebarOpen}
                onMobileClose={() => setIsMobileSidebarOpen(false)}
            />

            <div className="mx-auto flex w-full flex-1 items-start justify-center overflow-auto px-3 pb-8 pt-6 sm:px-6 sm:pt-8 md:pt-10">
                <div className="mx-auto w-full max-w-2xl rounded-[20px] bg-white p-5 sm:p-7">
                    <div className="pb-5">
                        <div className="mb-2 text-lg font-semibold text-gray-900 sm:text-xl">
                            Create a new project
                        </div>
                        <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                            Start a new database design project, from conceptual modeling to physical schema
                            generation. You can define entities, relationships, constraints, and export the
                            final schema in your preferred DBMS format.
                        </p>
                    </div>

                        <Form
                            form={form}
                            layout="horizontal"
                            onFinish={handleSubmit}
                            autoComplete="off"
                        >
                            <Form.Item
                                label={null}
                                name="workspaceId"
                                rules={[{ required: true, message: "Select a workspace" }]}
                            >
                                <div className="flex flex-col items-start gap-3 py-3 sm:flex-row sm:gap-4">
                                    <div className="w-full sm:w-1/5 text-gray-900 font-semibold pt-0 sm:pt-2 text-sm">
                                        Workspace
                                    </div>
                                    <div className="w-full sm:w-4/5">
                                        <Select
                                            className="w-full [&_.ant-select-selector]:!h-11 [&_.ant-select-selector]:!rounded-xl [&_.ant-select-selector]:!border-0 [&_.ant-select-selector]:!bg-gray-100 [&_.ant-select-selector]:!px-4 [&_.ant-select-selector]:!shadow-none"
                                            suffixIcon={<ChevronDown className="relative top-0.5 h-4 w-4 text-gray-400" />}
                                            value={selectedWorkspaceId}
                                            loading={isLoadingWorkspaces}
                                            placeholder="Select workspace"
                                            options={workspaces.map((workspace) => ({
                                                value: workspace.id,
                                                label: `${workspace.name} (${workspace.type})`,
                                            }))}
                                            onChange={(workspaceId) => {
                                                form.setFieldValue("workspaceId", workspaceId);
                                                setActiveWorkspaceId(workspaceId);
                                            }}
                                        />
                                    </div>
                                </div>
                            </Form.Item>

                            <Form.Item
                                label={null}
                                name="name"
                                rules={[
                                    { required: true, message: "" },
                                    { max: 100, message: "" },
                                ]}
                            >
                                <div className="flex flex-col items-start gap-3 py-3 sm:flex-row sm:gap-4">
                                    <div className="w-full sm:w-1/5 text-gray-900 font-semibold pt-0 sm:pt-2 text-sm">
                                        Project Name
                                    </div>
                                    <div className="w-full sm:w-4/5">
                                        <Input
                                            placeholder="Enter project name"
                                            className="!h-11 !rounded-xl !border-0 !bg-gray-100 !px-4 !shadow-none"
                                        />
                                    </div>
                                </div>
                            </Form.Item>

                            <Form.Item
                                label={null}
                                name="description"
                                rules={[
                                    { max: 500, message: "" },
                                ]}
                            >
                                <div className="flex flex-col items-start gap-3 py-3 sm:flex-row sm:gap-4">
                                    <div className="w-full sm:w-1/5 text-gray-900 font-semibold pt-0 sm:pt-2 text-sm">
                                        Description
                                    </div>
                                    <div className="w-full sm:w-4/5">
                                        <Input.TextArea
                                            placeholder="Enter project description (optional)"
                                            rows={4}
                                            className="!resize-none !rounded-xl !border-0 !bg-gray-100 !px-4 !py-3 !shadow-none"
                                        />
                                    </div>
                                </div>
                            </Form.Item>

                            <div className="flex flex-col justify-end gap-3 pt-5 sm:flex-row">
                                <Button 
                                    onClick={handleCancel}
                                    className="order-2 !h-10 w-full !rounded-xl !border-0 !bg-gray-100 !px-5 !shadow-none hover:!bg-gray-200 sm:order-1 sm:w-auto"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={isLoading}
                                    disabled={isLoading || !projectName?.trim()}
                                    className="order-1 !h-10 w-full !rounded-xl !border-0 !px-5 !font-medium !shadow-none sm:order-2 sm:w-auto"
                                >
                                    Create new project
                                </Button>
                            </div>
                        </Form>
                </div>
            </div>
        </div>
    );
}
