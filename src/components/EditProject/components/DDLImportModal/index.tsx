import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Button, Alert, Segmented } from "antd";
import { Upload, FileCode2 } from "lucide-react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { parseDDL, ddlToPhysicalModel, validateDDLSyntax } from "../../utils/ddl-parser";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";
import type { DBMSType } from "../../utils/dbms-config";

const DBMS_OPTIONS: { label: string; value: DBMSType }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

const SAMPLE_DDL: Record<DBMSType, string> = {
    postgresql: `-- PostgreSQL DDL
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
`,
    mysql: `-- MySQL DDL
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
`,
    sqlserver: `-- SQL Server DDL
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    name NVARCHAR(100),
    created_at DATETIME DEFAULT GETDATE()
);

CREATE TABLE posts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    title NVARCHAR(255) NOT NULL,
    body NVARCHAR(MAX),
    user_id INT NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
`,
};

interface DDLImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (model: PhysicalModelPayload) => void;
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
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);

    // Run structural validation and push markers into Monaco
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

    const handleImport = useCallback(() => {
        if (!parseResult || !canImport) return;
        setImporting(true);
        try {
            const model = ddlToPhysicalModel(parseResult, diagramName || "Imported Schema");
            onImport(model);
            setDdlText("");
            onClose();
        } finally {
            setImporting(false);
        }
    }, [parseResult, canImport, diagramName, onImport, onClose]);

    const handleLoadSample = useCallback(() => {
        setDdlText(SAMPLE_DDL[dbms]);
    }, [dbms]);

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
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Paste {DBMS_OPTIONS.find(o => o.value === dbms)?.label} DDL (CREATE TABLE statements) to generate a physical schema.
                    </p>
                    <Button size="small" type="link" onClick={handleLoadSample} className="!px-0 text-xs">
                        Load sample
                    </Button>
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
                            placeholder: "Paste CREATE TABLE ... statements here",
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

                {canImport && parseWarnings.length === 0 && (
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
