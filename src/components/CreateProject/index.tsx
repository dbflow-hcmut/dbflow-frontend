"use client";

import React, { useEffect, useState } from "react";
import { Form, Input, Button, Select } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { revalidateProjects } from "@/app/projects/actions";
import { notificationProvider } from "@/providers/notification";
import { CreateProjectFormValues } from "@/types/projects.type";
import { useCreateProject } from "./api/client";
import { getWorkspaces, WorkspaceSummary } from "@/api/workspaces/client";

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
                const preferred = localStorage.getItem("active_workspace_id");
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
                    <span className="text-lg font-bold text-gray-900">DB Flow</span>
                </Link>
            </header>
            <Sidebar
                mobile
                mobileOpen={isMobileSidebarOpen}
                onMobileClose={() => setIsMobileSidebarOpen(false)}
            />

            <div className="flex-1 pt-2 sm:pt-6 md:pt-10 justify-center items-center overflow-auto mx-auto w-full px-3 sm:px-6">
                <div className="max-w-2xl mx-auto border border-gray-200 rounded-lg shadow-md w-full">
                    <div className="p-3 sm:p-6 pb-3 sm:pb-4">
                        <div className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                            Create a new project
                        </div>
                        <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                            Start a new database design project, from conceptual modeling to physical schema
                            generation. You can define entities, relationships, constraints, and export the
                            final schema in your preferred DBMS format.
                        </p>
                    </div>

                    <div className="border-t border-gray-200" />

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
                                <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-6">
                                    <div className="w-full sm:w-1/5 text-gray-900 font-semibold pt-0 sm:pt-2 text-sm">
                                        Workspace
                                    </div>
                                    <div className="w-full sm:w-4/5">
                                        <Select
                                            className="w-full"
                                            value={selectedWorkspaceId}
                                            loading={isLoadingWorkspaces}
                                            placeholder="Select workspace"
                                            options={workspaces.map((workspace) => ({
                                                value: workspace.id,
                                                label: `${workspace.name} (${workspace.type})`,
                                            }))}
                                            onChange={(workspaceId) => {
                                                form.setFieldValue("workspaceId", workspaceId);
                                                localStorage.setItem("active_workspace_id", workspaceId);
                                            }}
                                        />
                                    </div>
                                </div>
                            </Form.Item>

                            <div className="border-t border-gray-200" />

                            <Form.Item
                                label={null}
                                name="name"
                                rules={[
                                    { required: true, message: "" },
                                    { max: 100, message: "" },
                                ]}
                            >
                                <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-6">
                                    <div className="w-full sm:w-1/5 text-gray-900 font-semibold pt-0 sm:pt-2 text-sm">
                                        Project Name
                                    </div>
                                    <div className="w-full sm:w-4/5">
                                        <Input
                                            placeholder="Enter project name"
                                            className="!h-10"
                                        />
                                    </div>
                                </div>
                            </Form.Item>

                            <div className="border-t border-gray-200" />


                            <Form.Item
                                label={null}
                                name="description"
                                rules={[
                                    { max: 500, message: "" },
                                ]}
                            >
                                <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-6">
                                    <div className="w-full sm:w-1/5 text-gray-900 font-semibold pt-0 sm:pt-2 text-sm">
                                        Description
                                    </div>
                                    <div className="w-full sm:w-4/5">
                                        <Input.TextArea
                                            placeholder="Enter project description (optional)"
                                            rows={4}
                                        />
                                    </div>
                                </div>
                            </Form.Item>

                            <div className="flex flex-col sm:flex-row justify-end gap-3 p-3 sm:p-6 border-t border-gray-200">
                                <Button 
                                    onClick={handleCancel}
                                    className="!h-10 w-full sm:w-auto order-2 sm:order-1"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={isLoading}
                                    disabled={isLoading || !projectName?.trim()}
                                    className="!h-10 !font-medium w-full sm:w-auto order-1 sm:order-2"
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
