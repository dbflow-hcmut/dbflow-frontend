"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Form, Input, Button, Alert, Segmented } from "antd";
import { Upload, FileCode2 } from "lucide-react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useRouter } from "next/navigation";
import { notificationProvider } from "@/providers/notification";
import { useCreateProject } from "@/components/CreateProject/api/client";
import { createSchema, saveSchemaModel } from "@/components/EditProject/api/client";
import { revalidateProjects } from "@/app/projects/actions";
import { parseDDL, validateDDLSyntax, ddlToPhysicalModel } from "@/components/EditProject/utils/ddl-parser";
import { SchemaType } from "@/utils/constants";
import type { DBMSType } from "@/components/EditProject/utils/dbms-config";

const DBMS_OPTIONS: { label: string; value: DBMSType }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

interface ImportDDLModalProps {
    open: boolean;
    onClose: () => void;
}

export default function ImportDDLModal({ open, onClose }: ImportDDLModalProps) {
    const router = useRouter();
    const [form] = Form.useForm<{ name: string; description?: string }>();
    const { create, isLoading: isCreating } = useCreateProject();

    const [ddlText, setDdlText] = useState("");
    const [dbms, setDbms] = useState<DBMSType>("postgresql");
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);

    // Reset when modal closes
    useEffect(() => {
        if (!open) {
            setDdlText("");
            setDbms("postgresql");
            form.resetFields();
        }
    }, [open, form]);

    // Sync Monaco markers
    useEffect(() => {
        const monaco = monacoRef.current;
        const editor = editorRef.current;
        if (!monaco || !editor) return;
        const model = editor.getModel();
        if (!model) return;
        if (!ddlText.trim()) {
            monaco.editor.setModelMarkers(model, "ddl-validator", []);
            return;
        }
        const markers = validateDDLSyntax(ddlText).map((m) => ({
            startLineNumber: m.startLineNumber,
            startColumn: m.startColumn,
            endLineNumber: m.endLineNumber,
            endColumn: m.endColumn,
            message: m.message,
            severity:
                m.severity === "error"
                    ? monaco.MarkerSeverity.Error
                    : monaco.MarkerSeverity.Warning,
        }));
        monaco.editor.setModelMarkers(model, "ddl-validator", markers);
    }, [ddlText]);

    const syntaxErrors = useMemo(() => {
        if (!ddlText.trim()) return [];
        return validateDDLSyntax(ddlText).filter((m) => m.severity === "error");
    }, [ddlText]);

    const parseResult = useMemo(() => {
        if (!ddlText.trim() || syntaxErrors.length > 0) return null;
        return parseDDL(ddlText);
    }, [ddlText, syntaxErrors]);

    const tableCount = parseResult?.tables.length ?? 0;
    const columnCount = parseResult?.tables.reduce((s, t) => s + t.columns.length, 0) ?? 0;
    const fkCount = parseResult?.tables.reduce((s, t) => s + t.foreignKeys.length, 0) ?? 0;
    const hasParseErrors = (parseResult?.errors.length ?? 0) > 0;
    const parseWarnings = parseResult?.warnings ?? [];
    const canImport = syntaxErrors.length === 0 && tableCount > 0 && !hasParseErrors;

    const handleSubmit = useCallback(
        async (values: { name: string; description?: string }) => {
            if (!canImport || !parseResult) return;
            try {
                // Step 1: Create project
                const project = await create({
                    name: values.name,
                    description: values.description,
                    skipDefaultSchema: true,
                });
                if (!project) return;

                // Step 2: Create a physical schema under the new project
                const schema = await createSchema(project.id, {
                    name: values.name,
                    type: SchemaType.PHYSICAL,
                });
                const schemaId = schema.id;
                if (!schemaId) throw new Error("Failed to create physical schema");

                // Step 3: Convert DDL → PhysicalModelPayload and save via REST
                const physicalModel = ddlToPhysicalModel(parseResult, values.name);
                await saveSchemaModel(project.id, schemaId, physicalModel as unknown as Record<string, unknown>);

                await revalidateProjects();
                notificationProvider.open({
                    type: "success",
                    message: `Project "${values.name}" created with ${tableCount} table${tableCount !== 1 ? "s" : ""} imported`,
                });
                onClose();
                router.push(`/projects/${project.id}`);
            } catch (err) {
                notificationProvider.open({
                    type: "error",
                    message: err instanceof Error ? err.message : "Failed to import DDL",
                });
            }
        },
        [canImport, parseResult, create, tableCount, router, onClose]
    );

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <div className="flex items-center gap-2">
                    <FileCode2 className="w-5 h-5 text-primary-500" />
                    <span>Import from DDL</span>
                </div>
            }
            width={740}
            styles={{
                content: { padding: 0 },
                header: { padding: "20px 24px 8px" },
                body: { padding: 0, overflow: "hidden" },
                footer: { padding: "12px 24px 16px" },
            }}
            footer={
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                        {tableCount > 0
                            ? `${tableCount} table${tableCount !== 1 ? "s" : ""} · ${columnCount} column${columnCount !== 1 ? "s" : ""}${fkCount > 0 ? ` · ${fkCount} FK${fkCount !== 1 ? "s" : ""}` : ""}`
                            : "Paste DDL to preview tables"}
                    </span>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            type="primary"
                            icon={<Upload size={15} />}
                            loading={isCreating}
                            disabled={!canImport}
                            onClick={() => form.submit()}
                        >
                            Create Project{tableCount > 0 ? ` & Import ${tableCount} table${tableCount !== 1 ? "s" : ""}` : ""}
                        </Button>
                    </div>
                </div>
            }
            forceRender
        >
            <div style={{ maxHeight: "70vh", overflowY: "auto", padding: "4px 24px 8px" }}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    autoComplete="off"
                    className="pt-0 pb-2"
                >
                {/* Project name + description */}
                <div className="grid grid-cols-2 gap-3">
                    <Form.Item
                        name="name"
                        label="Project Name"
                        rules={[
                            { required: true, message: "Enter a project name" },
                            { max: 100, message: "" },
                        ]}
                    >
                        <Input placeholder="e.g. E-Commerce DB" className="!h-9" />
                    </Form.Item>
                    <Form.Item name="description" label="Description (optional)" rules={[{ max: 500, message: "" }]}>
                        <Input placeholder="Short description" className="!h-9" />
                    </Form.Item>
                </div>

                {/* DBMS */}
                <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-1.5">SQL Dialect</div>
                    <Segmented
                        block
                        value={dbms}
                        onChange={(val) => setDbms(val as DBMSType)}
                        options={DBMS_OPTIONS}
                    />
                </div>

                {/* DDL Editor */}
                <div className="mb-1">
                    <div className="text-sm font-medium text-gray-700 mb-1.5">
                        DDL Script
                        <span className="ml-1.5 font-normal text-gray-400 text-xs">
                            (CREATE TABLE statements)
                        </span>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <Editor
                            height={280}
                            language="sql"
                            theme="vs-dark"
                            value={ddlText}
                            onChange={(v) => setDdlText(v ?? "")}
                            onMount={(editor, monaco) => {
                                editorRef.current = editor;
                                monacoRef.current = monaco;
                            }}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineNumbers: "on",
                                scrollBeyondLastLine: false,
                                wordWrap: "on",
                                padding: { top: 8 },
                            }}
                        />
                    </div>
                </div>

                {/* Feedback */}
                <div className="flex flex-col gap-2 mt-2">
                    {syntaxErrors.length > 0 && (
                        <Alert
                            type="error"
                            showIcon
                            message={
                                <div className="flex flex-col gap-0.5">
                                    {syntaxErrors.map((e, i) => (
                                        <div key={i} className="text-xs">
                                            <span className="font-medium">Line {e.startLineNumber}:{e.startColumn}</span>
                                            {" — "}{e.message}
                                        </div>
                                    ))}
                                </div>
                            }
                        />
                    )}
                    {syntaxErrors.length === 0 && hasParseErrors && (
                        <Alert
                            type="error"
                            showIcon
                            message={parseResult!.errors.map((e, i) => <div key={i}>{e}</div>)}
                        />
                    )}
                    {syntaxErrors.length === 0 && parseWarnings.length > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            message={
                                <div className="flex flex-col gap-0.5">
                                    {parseWarnings.map((w, i) => <div key={i}>{w}</div>)}
                                </div>
                            }
                        />
                    )}
                    {canImport && parseWarnings.length === 0 && (
                        <Alert
                            type="success"
                            showIcon
                            message={`Ready — ${tableCount} table${tableCount !== 1 ? "s" : ""}, ${columnCount} column${columnCount !== 1 ? "s" : ""}${fkCount > 0 ? `, ${fkCount} FK${fkCount !== 1 ? "s" : ""}` : ""}`}
                        />
                    )}
                </div>
            </Form>
            </div>
        </Modal>
    );
}
