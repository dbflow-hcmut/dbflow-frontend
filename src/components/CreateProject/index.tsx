"use client";

import React from "react";
import { Form, Input, Button } from "antd";
import { useRouter } from "next/navigation";
import { revalidateProjects } from "@/app/projects/actions";
import { notificationProvider } from "@/providers/notification";
import { CreateProjectFormValues } from "@/types/projects.type";
import Header from "@/components/Header";
import { useCreateProject } from "./api/client";

export default function CreateProject() {
    const router = useRouter();
    const [form] = Form.useForm();
    const { create, isLoading } = useCreateProject();
    
    const projectName = Form.useWatch("name", form);

    const handleSubmit = async (values: CreateProjectFormValues) => {
        try {
            const result = await create({
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
        router.push("/projects");
    };

    return (
        <div className="flex flex-col h-screen">
            <Header />        
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

