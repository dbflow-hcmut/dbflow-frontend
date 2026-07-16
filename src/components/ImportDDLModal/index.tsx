"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Form, Input, Button, Alert, Segmented } from "antd";
import { Upload, FileCode2, FileUp } from "lucide-react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useRouter } from "next/navigation";
import { notificationProvider } from "@/providers/notification";
import { useCreateProject } from "@/components/CreateProject/api/client";
import { createSchema, saveSchemaModel } from "@/components/EditProject/api/client";
import { revalidateProjects } from "@/app/projects/actions";
import { parseDDL, validateDDLSyntax, ddlToPhysicalModel, detectDBMS } from "@/components/EditProject/utils/ddl-parser";
import { SchemaType } from "@/utils/constants";
import type { DBMSType } from "@/components/EditProject/utils/dbms-config";

const DBMS_OPTIONS: { label: string; value: DBMSType }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

const DBMS_LABELS: Record<string, string> = {
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    sqlserver: "SQL Server",
};

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
    const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);

    useEffect(() => {
        if (!open) {
            setDdlText("");
            setDbms("postgresql");
            setMismatchWarning(null);
            form.resetFields();
        }
    }, [open, form]);

    const applyDDLText = useCallback((text: string) => {
        setDdlText(text);
        if (text.trim()) {
            const detected = detectDBMS(text);
            if (detected) {
                setDbms(detected);
                setMismatchWarning(null);
            }
        }
    }, []);

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            applyDDLText(text);
        };
        reader.readAsText(file);
        e.target.value = "";
    }, [applyDDLText]);

    useEffect(() => {
        if (!ddlText.trim()) {
            setMismatchWarning(null);
            return;
        }
        const detected = detectDBMS(ddlText);
        if (detected && detected !== dbms) {
            setMismatchWarning(`DDL looks like ${DBMS_LABELS[detected]} but ${DBMS_LABELS[dbms]} is selected. Consider switching dialect.`);
        } else {
            setMismatchWarning(null);
        }
    }, [ddlText, dbms]);

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
                const project = await create({
                    name: values.name,
                    description: values.description,
                    skipDefaultSchema: true,
                });
                if (!project) return;

                const schema = await createSchema(project.id, {
                    name: values.name,
                    type: SchemaType.PHYSICAL,
                    dbms,
                });
                const schemaId = schema.id;
                if (!schemaId) throw new Error("Failed to create physical schema");

                const physicalModel = ddlToPhysicalModel(parseResult, values.name, dbms);
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
        [canImport, parseResult, create, dbms, tableCount, router, onClose]
    );

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <div className="flex items-center gap-2">
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
                            : "Paste or upload DDL to preview tables"}
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

                <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 mb-1.5">SQL Dialect</div>
                    <Segmented
                        block
                        value={dbms}
                        onChange={(val) => setDbms(val as DBMSType)}
                        options={DBMS_OPTIONS}
                    />
                    {mismatchWarning ? (
                        <Alert type="warning" showIcon message={mismatchWarning} className="!mt-2" />
                    ) : ddlText.trim() && !detectDBMS(ddlText) ? (
                        <Alert type="info" showIcon message={`DDL will be imported as ${DBMS_LABELS[dbms]} syntax. Make sure the correct dialect is selected.`} className="!mt-2" />
                    ) : null}
                </div>

                <div className="mb-1">
                    <div className="flex items-center justify-between mb-1.5">
                        <div className="text-sm font-medium text-gray-700">
                            DDL Script
                            <span className="ml-1.5 font-normal text-gray-400 text-xs">
                                (CREATE TABLE statements)
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".sql,.ddl,.txt"
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <Button
                                size="small"
                                icon={<FileUp size={14} />}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Upload .sql
                            </Button>
                        </div>
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <Editor
                            height={280}
                            language="sql"
                            theme="light"
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
                    {canImport && parseWarnings.length === 0 && !mismatchWarning && (
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
