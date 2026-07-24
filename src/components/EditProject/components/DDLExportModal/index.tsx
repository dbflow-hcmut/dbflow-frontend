import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Segmented, Checkbox, Button, Tooltip } from "antd";
import { notificationProvider } from "@/providers/notification";
import { Copy, Download } from "lucide-react";
import Editor from "@monaco-editor/react";
import { generateDDL, DEFAULT_DDL_OPTIONS } from "../../utils/ddl-generator";
import type { DDLOptions, DDLResult } from "../../utils/ddl-generator";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";
import type { DBMSType } from "../../utils/dbms-config";
import { trackExportUsage } from "@/api/exports/client";

interface DDLExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    model: PhysicalModelPayload | null;
    diagramName: string;
    projectId: string | null;
}

const DBMS_OPTIONS: { label: string; value: DBMSType }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

const DDLExportModal: React.FC<DDLExportModalProps> = ({
    isOpen,
    onClose,
    model,
    diagramName,
    projectId,
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

    const handleDownload = useCallback(async () => {
        if (!result?.sql || !projectId) return;
        try {
            await trackExportUsage(projectId, "sql");
        } catch (error) {
            notificationProvider.open({ type: "error", message: error instanceof Error ? error.message : "Unable to export SQL" });
            return;
        }
        const blob = new Blob([result.sql], { type: "text/sql;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${diagramName || "schema"}.sql`;
        a.click();
        URL.revokeObjectURL(url);
    }, [result?.sql, diagramName, projectId]);

    const tableCount = model?.tables?.length ?? 0;
    const fkCount = result?.statements.filter((s) => s.type === "ALTER_TABLE_FK").length ?? 0;
    const indexCount = result?.statements.filter((s) => s.type === "CREATE_INDEX").length ?? 0;

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            title="Export DDL (SQL Script)"
            width={760}
            styles={{ body: { height: "calc(80vh - 132px)" } }}
            centered
            className="[&_.ant-modal-content]:!overflow-hidden [&_.ant-modal-content]:!rounded-[20px] [&_.ant-modal-content]:!p-0 [&_.ant-modal-content]:!shadow-[0_24px_80px_rgba(15,23,42,0.16)] [&_.ant-modal-header]:!mb-0 [&_.ant-modal-header]:!px-6 [&_.ant-modal-header]:!pb-4 [&_.ant-modal-header]:!pt-5 [&_.ant-modal-title]:!text-base [&_.ant-modal-title]:!font-semibold [&_.ant-modal-title]:!text-gray-900 [&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:!grid [&_.ant-modal-close]:!size-9 [&_.ant-modal-close]:!place-items-center [&_.ant-modal-close]:!rounded-xl [&_.ant-modal-close]:!text-gray-400 hover:[&_.ant-modal-close]:!bg-gray-100 hover:[&_.ant-modal-close]:!text-gray-700 [&_.ant-modal-body]:!overflow-y-auto [&_.ant-modal-body]:!p-0 [&_.ant-modal-footer]:!m-0 [&_.ant-modal-footer]:!border-t [&_.ant-modal-footer]:!border-gray-100 [&_.ant-modal-footer]:!px-6 [&_.ant-modal-footer]:!py-4"
            footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-gray-400">
                        {tableCount} table{tableCount !== 1 ? "s" : ""} · {fkCount} FK{fkCount !== 1 ? "s" : ""} · {indexCount} index{indexCount !== 1 ? "es" : ""}
                    </span>
                    <div className="flex gap-2">
                        <Tooltip title="Copy to clipboard">
                            <Button icon={<Copy size={15} />} onClick={handleCopy} disabled={!result?.sql} className="!h-9 !rounded-xl !border-0 !bg-gray-100 !px-4 !text-xs !font-semibold !text-gray-700 !shadow-none hover:!bg-gray-200">
                                Copy
                            </Button>
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<Download size={15} />}
                            onClick={handleDownload}
                            disabled={!result?.sql}
                            className="!h-9 !rounded-xl !border-0 !px-4 !text-xs !font-semibold !shadow-none"
                        >
                            Download .sql
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex min-h-full flex-col gap-5 px-6 pb-6 text-xs">
                {/* DBMS selector */}
                <section>
                    <div className="mb-2 text-xs font-semibold text-gray-700">Target DBMS</div>
                    <Segmented
                        block
                        value={options.dbms}
                        onChange={(val) => updateOption("dbms", val as DBMSType)}
                        options={DBMS_OPTIONS}
                        className="!rounded-2xl !bg-gray-100 !p-1 [&_.ant-segmented-item]:!rounded-xl [&_.ant-segmented-item]:!py-1 [&_.ant-segmented-item]:!text-xs [&_.ant-segmented-item]:!font-medium [&_.ant-segmented-item-selected]:!shadow-sm"
                    />
                </section>

                {/* Options */}
                <section>
                    <div className="mb-2 text-xs font-semibold text-gray-700">Options</div>
                    <div className="grid gap-1 rounded-2xl bg-gray-50 p-3 sm:grid-cols-2">
                        <Checkbox
                            checked={options.includeCreateTable}
                            onChange={(e) => updateOption("includeCreateTable", e.target.checked)}
                            className="min-h-9 rounded-xl px-2 transition-colors hover:bg-white [&_.ant-checkbox+span]:!text-xs [&_.ant-checkbox+span]:!text-gray-700"
                        >
                            CREATE TABLE statements
                        </Checkbox>
                        <Checkbox
                            checked={options.includeForeignKeys}
                            onChange={(e) => updateOption("includeForeignKeys", e.target.checked)}
                            className="min-h-9 rounded-xl px-2 transition-colors hover:bg-white [&_.ant-checkbox+span]:!text-xs [&_.ant-checkbox+span]:!text-gray-700"
                        >
                            FOREIGN KEY constraints (ALTER TABLE)
                        </Checkbox>
                        <Checkbox
                            checked={options.includeIndexes}
                            onChange={(e) => updateOption("includeIndexes", e.target.checked)}
                            className="min-h-9 rounded-xl px-2 transition-colors hover:bg-white [&_.ant-checkbox+span]:!text-xs [&_.ant-checkbox+span]:!text-gray-700"
                        >
                            CREATE INDEX statements
                        </Checkbox>
                        <Checkbox
                            checked={options.includeDropIfExists}
                            onChange={(e) => updateOption("includeDropIfExists", e.target.checked)}
                            className="min-h-9 rounded-xl px-2 transition-colors hover:bg-white [&_.ant-checkbox+span]:!text-xs [&_.ant-checkbox+span]:!text-gray-700"
                        >
                            Add DROP TABLE IF EXISTS before each table
                        </Checkbox>
                        <Checkbox
                            checked={options.includeIfNotExists}
                            onChange={(e) => updateOption("includeIfNotExists", e.target.checked)}
                            className="min-h-9 rounded-xl px-2 transition-colors hover:bg-white [&_.ant-checkbox+span]:!text-xs [&_.ant-checkbox+span]:!text-gray-700"
                        >
                            Add IF NOT EXISTS to CREATE TABLE
                        </Checkbox>
                    </div>
                </section>

                {/* Warnings */}
                {result && result.warnings.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-2xl bg-amber-50 px-4 py-3">
                        {result.warnings.map((w, i) => (
                            <span key={i} className="text-xs text-amber-700">{w}</span>
                        ))}
                    </div>
                )}

                {/* SQL Preview */}
                <section className="min-h-0 flex-1">
                    <div className="mb-2 text-xs font-semibold text-gray-700">SQL Preview</div>
                    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
                        <Editor
                            height={340}
                            language="sql"
                            value={result?.sql || "-- No tables to export"}
                            theme="light"
                            options={{
                                readOnly: false,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fontSize: 12,
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
                </section>
            </div>
        </Modal>
    );
};

export default DDLExportModal;
