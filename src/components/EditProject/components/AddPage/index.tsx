"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SchemaType } from "@/utils/constants";
import { Form, Input, Modal, Select, Button, Segmented, Alert } from "antd";
import { FileUp } from "lucide-react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useCreateSchema } from "../../api/client";
import { createSchema, saveSchemaModel } from "../../api/client";
import { revalidateProjectSchemas } from "@/app/projects/actions";
import { mutate } from "swr";
import { notificationProvider } from "@/providers/notification";
import { parseDDL, validateDDLSyntax, ddlToPhysicalModel, detectDBMS } from "../../utils/ddl-parser";
import type { DBMSType } from "../../utils/dbms-config";
import type { ProjectSchemasResponse } from "@/types/projects.type";

export interface IAddPageProps {
    open: boolean;
    onClose: () => void;
    projectId: string | null;
    onCreated?: (schema: ProjectSchemasResponse) => void;
}

const DBMS_OPTIONS = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

const DBMS_LABELS: Record<string, string> = {
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    sqlserver: "SQL Server",
};

type CreateMode = "empty" | "ddl";

export function AddPage(props: IAddPageProps) {
    const { open, onClose, projectId, onCreated } = props;

    const [form] = Form.useForm();
    const { create, isLoading } = useCreateSchema(projectId);
    const [selectedType, setSelectedType] = useState<string>("");
    const [createMode, setCreateMode] = useState<CreateMode>("empty");
    const [isImporting, setIsImporting] = useState(false);

    // DDL state
    const [ddlText, setDdlText] = useState("");
    const [ddlDbms, setDdlDbms] = useState<DBMSType>("postgresql");
    const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);

    const applyDDLText = useCallback((text: string) => {
        setDdlText(text);
        if (text.trim()) {
            const detected = detectDBMS(text);
            if (detected) {
                setDdlDbms(detected);
                form.setFieldValue("dbms", detected);
                setMismatchWarning(null);
            }
        }
    }, [form]);

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => applyDDLText(ev.target?.result as string);
        reader.readAsText(file);
        e.target.value = "";
    }, [applyDDLText]);

    useEffect(() => {
        if (!ddlText.trim()) { setMismatchWarning(null); return; }
        const detected = detectDBMS(ddlText);
        if (detected && detected !== ddlDbms) {
            setMismatchWarning(`DDL looks like ${DBMS_LABELS[detected]} but ${DBMS_LABELS[ddlDbms]} is selected. Consider switching dialect.`);
        } else {
            setMismatchWarning(null);
        }
    }, [ddlText, ddlDbms]);

    // Monaco markers
    useEffect(() => {
        const monaco = monacoRef.current;
        const editor = editorRef.current;
        if (!monaco || !editor) return;
        const model = editor.getModel();
        if (!model) return;
        if (!ddlText.trim()) { monaco.editor.setModelMarkers(model, "ddl-validator", []); return; }
        const markers = validateDDLSyntax(ddlText).map((m) => ({
            startLineNumber: m.startLineNumber, startColumn: m.startColumn,
            endLineNumber: m.endLineNumber, endColumn: m.endColumn,
            message: m.message,
            severity: m.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
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
    const hasParseErrors = (parseResult?.errors.length ?? 0) > 0;
    const canImportDDL = syntaxErrors.length === 0 && tableCount > 0 && !hasParseErrors;

    const handleFinish = async (values: { name: string; type: string; dbms?: string }) => {
        if (!projectId) {
            notificationProvider.open({ type: "error", message: "Project ID is required" });
            return;
        }

        // DDL import mode
        if (values.type === SchemaType.PHYSICAL && createMode === "ddl") {
            if (!canImportDDL || !parseResult) return;
            setIsImporting(true);
            try {
                const schema = await createSchema(projectId, {
                    name: values.name,
                    type: SchemaType.PHYSICAL,
                    dbms: ddlDbms,
                });
                if (!schema?.id) throw new Error("Failed to create schema");

                const physicalModel = ddlToPhysicalModel(parseResult, values.name, ddlDbms);
                await saveSchemaModel(projectId, schema.id, physicalModel as unknown as Record<string, unknown>);

                await mutate(`schemas-${projectId}`);
                await revalidateProjectSchemas(projectId);
                notificationProvider.open({
                    type: "success",
                    message: `Schema created with ${tableCount} table${tableCount !== 1 ? "s" : ""} imported`,
                });
                onCreated?.(schema);
                handleClose();
            } catch (err) {
                notificationProvider.open({
                    type: "error",
                    message: err instanceof Error ? err.message : "Failed to import DDL",
                });
            } finally {
                setIsImporting(false);
            }
            return;
        }

        // Normal create mode
        try {
            const result = await create({
                name: values.name,
                type: values.type,
                ...(values.type === SchemaType.PHYSICAL && values.dbms
                    ? { dbms: values.dbms }
                    : {}),
            });

            if (result) {
                notificationProvider.open({ type: "success", message: "Schema created successfully!" });
                onCreated?.(result);
                handleClose();
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
        setCreateMode("empty");
        setDdlText("");
        setDdlDbms("postgresql");
        setMismatchWarning(null);
        onClose();
    };

    const isDDLMode = selectedType === SchemaType.PHYSICAL && createMode === "ddl";
    const canSubmit = isDDLMode ? canImportDDL : true;

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
            width={isDDLMode ? 700 : undefined}
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
                        onChange={(value) => {
                            setSelectedType(value);
                            if (value !== SchemaType.PHYSICAL) setCreateMode("empty");
                        }}
                    />
                </Form.Item>

                {selectedType === SchemaType.PHYSICAL && (
                    <>
                        <Form.Item label="Creation Method" className="!mb-3">
                            <Segmented
                                value={createMode}
                                onChange={(val) => setCreateMode(val as CreateMode)}
                                options={[
                                    { label: "Empty Schema", value: "empty" },
                                    { label: "Import from DDL", value: "ddl" },
                                ]}
                                block
                            />
                        </Form.Item>

                        {createMode === "empty" && (
                            <Form.Item
                                label="Target DBMS"
                                name="dbms"
                                initialValue="postgresql"
                                rules={[{ required: true, message: "Please select a DBMS" }]}
                            >
                                <Segmented options={DBMS_OPTIONS} block />
                            </Form.Item>
                        )}

                        {createMode === "ddl" && (
                            <>
                                <Form.Item label="SQL Dialect" className="!mb-3">
                                    <Segmented
                                        block
                                        value={ddlDbms}
                                        onChange={(val) => {
                                            setDdlDbms(val as DBMSType);
                                            form.setFieldValue("dbms", val);
                                        }}
                                        options={DBMS_OPTIONS}
                                    />
                                    {mismatchWarning ? (
                                        <Alert type="warning" showIcon message={mismatchWarning} className="!mt-2" />
                                    ) : ddlText.trim() && !detectDBMS(ddlText) ? (
                                        <Alert type="info" showIcon message={`DDL will be imported as ${DBMS_LABELS[ddlDbms]} syntax. Make sure the correct dialect is selected.`} className="!mt-2" />
                                    ) : null}
                                </Form.Item>

                                <div className="mb-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="text-sm font-medium text-gray-700">
                                            DDL Script
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
                                            height={240}
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

                                {syntaxErrors.length > 0 && (
                                    <Alert type="error" showIcon className="!mb-3" message={
                                        <div className="flex flex-col gap-0.5">
                                            {syntaxErrors.map((e, i) => (
                                                <div key={i} className="text-xs">
                                                    <span className="font-medium">Line {e.startLineNumber}:{e.startColumn}</span>
                                                    {" — "}{e.message}
                                                </div>
                                            ))}
                                        </div>
                                    } />
                                )}
                                {canImportDDL && !mismatchWarning && (
                                    <Alert type="success" showIcon className="!mb-3"
                                        message={`${tableCount} table${tableCount !== 1 ? "s" : ""}, ${columnCount} column${columnCount !== 1 ? "s" : ""} ready to import`}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}

                <div className="flex justify-end gap-2 pb-3">
                    <Button
                        type="default"
                        className="!h-10"
                        onClick={handleClose}
                        disabled={isLoading || isImporting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        className="!h-10"
                        loading={isLoading || isImporting}
                        disabled={isDDLMode && !canSubmit}
                    >
                        {isDDLMode
                            ? `Create & Import${tableCount > 0 ? ` ${tableCount} table${tableCount !== 1 ? "s" : ""}` : ""}`
                            : "Create Schema"
                        }
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
