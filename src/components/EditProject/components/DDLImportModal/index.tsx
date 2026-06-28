import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Button, Alert, Segmented } from "antd";
import { Upload, FileCode2, FileUp } from "lucide-react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { parseDDL, ddlToPhysicalModel, validateDDLSyntax, detectDBMS } from "../../utils/ddl-parser";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";
import type { DBMSType } from "../../utils/dbms-config";

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

interface DDLImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (model: PhysicalModelPayload, dbms: DBMSType) => void | Promise<void>;
    diagramName: string;
}

const DDLImportModal: React.FC<DDLImportModalProps> = ({
    isOpen,
    onClose,
    onImport,
    diagramName,
}) => {
    const [ddlText, setDdlText] = useState("");
    const [dbms, setDbms] = useState<DBMSType>("postgresql");
    const [importing, setImporting] = useState(false);
    const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);

    const applyDDLText = useCallback((text: string) => {
        setDdlText(text);
        if (text.trim()) {
            const detected = detectDBMS(text);
            if (detected && detected !== dbms) {
                setDbms(detected);
                setMismatchWarning(null);
            }
        }
    }, [dbms]);

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
            severity: m.severity === "error"
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

    const handleImport = useCallback(async () => {
        if (!parseResult || !canImport) return;
        setImporting(true);
        try {
            const model = ddlToPhysicalModel(parseResult, diagramName || "Imported Schema", dbms);
            await onImport(model, dbms);
            setDdlText("");
            onClose();
        } finally {
            setImporting(false);
        }
    }, [parseResult, canImport, diagramName, dbms, onImport, onClose]);

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            title={
                <div className="flex items-center gap-2">
                    <FileCode2 size={18} />
                    <span>Import DDL</span>
                </div>
            }
            width={720}
            footer={
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                        {tableCount > 0 && (
                            <>{tableCount} table{tableCount !== 1 ? "s" : ""} · {columnCount} column{columnCount !== 1 ? "s" : ""}{fkCount > 0 ? ` · ${fkCount} FK${fkCount !== 1 ? "s" : ""}` : ""}</>
                        )}
                    </span>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            type="primary"
                            icon={<Upload size={15} />}
                            onClick={handleImport}
                            loading={importing}
                            disabled={!canImport}
                        >
                            Import {tableCount > 0 ? `${tableCount} table${tableCount !== 1 ? "s" : ""}` : ""}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                <div>
                    <div className="text-sm font-medium mb-1.5">SQL Dialect</div>
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

                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Paste or upload {DBMS_LABELS[dbms]} DDL (CREATE TABLE statements).
                    </p>
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
                        height={320}
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
                        message={`Ready to import ${tableCount} table${tableCount !== 1 ? "s" : ""} with ${columnCount} column${columnCount !== 1 ? "s" : ""}.`}
                    />
                )}
            </div>
        </Modal>
    );
};

export default DDLImportModal;
