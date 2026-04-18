import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Segmented, Checkbox, Alert, Button, Tooltip } from "antd";
import { notificationProvider } from "@/providers/notification";
import { Copy, Download } from "lucide-react";
import Editor from "@monaco-editor/react";
import { generateDDL, DEFAULT_DDL_OPTIONS } from "../../utils/ddl-generator";
import type { DDLOptions, DDLResult } from "../../utils/ddl-generator";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";
import type { DBMSType } from "../../utils/dbms-config";

interface DDLExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    model: PhysicalModelPayload | null;
    diagramName: string;
}

const DBMS_OPTIONS: { label: string; value: DBMSType }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
    { label: "SQLite", value: "sqlite" },
];

const DDLExportModal: React.FC<DDLExportModalProps> = ({
    isOpen,
    onClose,
    model,
    diagramName,
}) => {
    const [options, setOptions] = useState<DDLOptions>(DEFAULT_DDL_OPTIONS);

    // Reset options when modal opens
    useEffect(() => {
        if (isOpen) {
            setOptions(DEFAULT_DDL_OPTIONS);
        }
    }, [isOpen]);

    const result: DDLResult | null = useMemo(() => {
        if (!model || !isOpen) return null;
        return generateDDL(model, options);
    }, [model, options, isOpen]);

    const updateOption = useCallback(<K extends keyof DDLOptions>(key: K, value: DDLOptions[K]) => {
        setOptions((prev) => ({ ...prev, [key]: value }));
    }, []);

    const handleCopy = useCallback(() => {
        if (!result?.sql) return;
        navigator.clipboard.writeText(result.sql).then(() => {
            notificationProvider.open({ type: "success", message: "Copied to clipboard" });
        });
    }, [result?.sql]);

    const handleDownload = useCallback(() => {
        if (!result?.sql) return;
        const blob = new Blob([result.sql], { type: "text/sql;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${diagramName || "schema"}.sql`;
        a.click();
        URL.revokeObjectURL(url);
    }, [result?.sql, diagramName]);

    const tableCount = model?.tables?.length ?? 0;
    const fkCount = result?.statements.filter((s) => s.type === "ALTER_TABLE_FK").length ?? 0;
    const indexCount = result?.statements.filter((s) => s.type === "CREATE_INDEX").length ?? 0;

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            title="Export DDL (SQL Script)"
            width={720}
            footer={
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                        {tableCount} table{tableCount !== 1 ? "s" : ""} · {fkCount} FK{fkCount !== 1 ? "s" : ""} · {indexCount} index{indexCount !== 1 ? "es" : ""}
                    </span>
                    <div className="flex gap-2">
                        <Tooltip title="Copy to clipboard">
                            <Button icon={<Copy size={15} />} onClick={handleCopy} disabled={!result?.sql}>
                                Copy
                            </Button>
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<Download size={15} />}
                            onClick={handleDownload}
                            disabled={!result?.sql}
                        >
                            Download .sql
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                {/* DBMS selector */}
                <div>
                    <div className="text-sm font-medium mb-1.5">Target DBMS</div>
                    <Segmented
                        block
                        value={options.dbms}
                        onChange={(val) => updateOption("dbms", val as DBMSType)}
                        options={DBMS_OPTIONS}
                    />
                </div>

                {/* Options */}
                <div>
                    <div className="text-sm font-medium mb-1.5">Options</div>
                    <div className="flex flex-col gap-1">
                        <Checkbox
                            checked={options.includeCreateTable}
                            onChange={(e) => updateOption("includeCreateTable", e.target.checked)}
                        >
                            CREATE TABLE statements
                        </Checkbox>
                        <Checkbox
                            checked={options.includeForeignKeys}
                            onChange={(e) => updateOption("includeForeignKeys", e.target.checked)}
                        >
                            FOREIGN KEY constraints (ALTER TABLE)
                        </Checkbox>
                        <Checkbox
                            checked={options.includeIndexes}
                            onChange={(e) => updateOption("includeIndexes", e.target.checked)}
                        >
                            CREATE INDEX statements
                        </Checkbox>
                        <Checkbox
                            checked={options.includeDropIfExists}
                            onChange={(e) => updateOption("includeDropIfExists", e.target.checked)}
                        >
                            Add DROP TABLE IF EXISTS before each table
                        </Checkbox>
                        <Checkbox
                            checked={options.includeIfNotExists}
                            onChange={(e) => updateOption("includeIfNotExists", e.target.checked)}
                        >
                            Add IF NOT EXISTS to CREATE TABLE
                        </Checkbox>
                    </div>
                </div>

                {/* Warnings */}
                {result && result.warnings.length > 0 && (
                    <Alert
                        type="warning"
                        showIcon
                        message={result.warnings.length === 1 ? result.warnings[0] : undefined}
                        description={
                            result.warnings.length > 1 ? (
                                <ul className="list-disc pl-4 mb-0">
                                    {result.warnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            ) : undefined
                        }
                    />
                )}

                {/* SQL Preview */}
                <div>
                    <div className="text-sm font-medium mb-1.5">SQL Preview</div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <Editor
                            height={340}
                            language="sql"
                            value={result?.sql || "-- No tables to export"}
                            theme="vs-dark"
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fontSize: 13,
                                lineNumbers: "on",
                                renderLineHighlight: "none",
                                overviewRulerLanes: 0,
                                scrollbar: {
                                    vertical: "auto",
                                    horizontal: "auto",
                                    verticalScrollbarSize: 8,
                                    horizontalScrollbarSize: 8,
                                },
                                padding: { top: 8, bottom: 8 },
                                wordWrap: "on",
                                domReadOnly: true,
                            }}
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default DDLExportModal;
