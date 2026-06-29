"use client";

import React, { useState } from "react";
import { Drawer, Button, Empty, Spin, Modal, Tooltip } from "antd";
import { RotateCcw, Code2, Trash2, ChevronRight, AlertTriangle } from "lucide-react";
import Editor from "@monaco-editor/react";
import { useExportHistory } from "../shared/use-export-history";
import type { ExportRecord } from "../shared/types";

interface Props {
    open: boolean;
    onClose: () => void;
    projectId: string | null;
}

const STATUS_LABEL: Record<string, string> = {
    success: "Success",
    partial: "Partial",
    failed:  "Failed",
};

const STATUS_CLASS: Record<string, string> = {
    success: "text-green-600",
    partial: "text-amber-500",
    failed:  "text-red-500",
};

function formatDate(raw: string): string {
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Record row ────────────────────────────────────────────────────────────────

interface RecordCardProps {
    record: ExportRecord;
    onView: (r: ExportRecord, tab: "up" | "down") => void;
    onRollback: (r: ExportRecord) => Promise<void>;
    onDelete: (r: ExportRecord) => Promise<void>;
}

function RecordRow({ record, onView, onRollback, onDelete }: RecordCardProps) {
    const [rolling, setRolling]         = useState(false);
    const [deleting, setDeleting]       = useState(false);
    const [result, setResult]           = useState<{ ok: boolean; msg: string } | null>(null);
    const [rollbackOpen, setRollbackOpen] = useState(false);
    const [deleteOpen, setDeleteOpen]   = useState(false);

    async function handleRollback() {
        setRollbackOpen(false);
        setRolling(true);
        setResult(null);
        try {
            await onRollback(record);
            setResult({ ok: true, msg: "Rollback applied." });
        } catch (e) {
            setResult({ ok: false, msg: e instanceof Error ? e.message : "Rollback failed." });
        } finally {
            setRolling(false);
        }
    }

    async function handleDelete() {
        setDeleteOpen(false);
        setDeleting(true);
        try { await onDelete(record); } finally { setDeleting(false); }
    }

    return (
        <>
        <div className="py-3 border-b border-gray-100 last:border-b-0">
            {/* Top row: status · dbms · date + actions */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-xs font-medium ${STATUS_CLASS[record.status] ?? "text-gray-500"}`}>
                        {STATUS_LABEL[record.status] ?? record.status}
                    </span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400 capitalize">{record.dbms}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs text-gray-400 truncate">{formatDate(record.createdAt)}</span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0 ml-2">
                    <Tooltip title="View SQL">
                        <Button
                            type="text" size="small"
                            icon={<Code2 size={13} />}
                            onClick={() => onView(record, "up")}
                            className="!text-gray-400 hover:!text-gray-700 !cursor-pointer"
                        />
                    </Tooltip>
                    <Tooltip title="Rollback">
                        <Button
                            type="text" size="small"
                            icon={<RotateCcw size={13} />}
                            loading={rolling}
                            onClick={() => setRollbackOpen(true)}
                            className="!text-gray-400 hover:!text-gray-700 !cursor-pointer"
                        />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Button
                            type="text" size="small" danger
                            icon={<Trash2 size={13} />}
                            loading={deleting}
                            onClick={() => setDeleteOpen(true)}
                            className="!cursor-pointer"
                        />
                    </Tooltip>
                </div>
            </div>

            {/* SQL links */}
            <div className="flex gap-3 mt-1">
                <button
                    className="flex items-center gap-0.5 !text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    onClick={() => onView(record, "up")}
                >
                    <ChevronRight size={10} /> UP migration
                </button>
                <button
                    className="flex items-center gap-0.5 !text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    onClick={() => onView(record, "down")}
                >
                    <ChevronRight size={10} /> DOWN (rollback)
                </button>
            </div>

            {/* Rollback result */}
            {result && (
                <div className={`mt-1 text-[11px] ${result.ok ? "text-green-600" : "text-red-500"}`}>
                    {result.msg}
                </div>
            )}
        </div>

        {/* Rollback confirmation modal */}
        <Modal
            open={rollbackOpen}
            onCancel={() => setRollbackOpen(false)}
            footer={null}
            width={420}
            centered
            closable={false}
        >
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                    <div>
                        <div className="font-semibold text-sm text-gray-900 mb-1">Apply rollback?</div>
                        <div className="text-xs text-gray-500 leading-relaxed">
                            This will run the <span className="font-medium text-amber-600">DOWN migration</span> and reverse the changes applied to the database. Make sure no critical data will be lost.
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <Button size="small" onClick={() => setRollbackOpen(false)} className="!text-xs !h-7 !px-3">Cancel</Button>
                    <Button danger type="primary" size="small" onClick={handleRollback} loading={rolling} className="!text-xs !h-7 !px-3">Apply rollback</Button>
                </div>
            </div>
        </Modal>

        {/* Delete confirmation modal */}
        <Modal
            open={deleteOpen}
            onCancel={() => setDeleteOpen(false)}
            footer={null}
            width={420}
            centered
            closable={false}
        >
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                    <div>
                        <div className="font-semibold text-sm text-gray-900 mb-1">Delete this record?</div>
                        <div className="text-xs text-gray-500 leading-relaxed">
                            This removes the history entry only. <span className="font-medium text-gray-700">Database changes will not be affected.</span>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <Button size="small" onClick={() => setDeleteOpen(false)} className="!text-xs !h-7 !px-3">Cancel</Button>
                    <Button danger type="primary" size="small" onClick={handleDelete} loading={deleting} className="!text-xs !h-7 !px-3">Delete</Button>
                </div>
            </div>
        </Modal>
        </>
    );
}

// ── SQL Viewer modal ──────────────────────────────────────────────────────────

interface SQLViewerProps {
    record: ExportRecord | null;
    tab: "up" | "down";
    onClose: () => void;
}

function SQLViewer({ record, tab, onClose }: SQLViewerProps) {
    const sql = tab === "up" ? record?.upMigration : record?.downMigration;
    const isEmpty = !sql?.trim();

    return (
        <Modal
            open={!!record}
            onCancel={onClose}
            footer={null}
            width={760}
            destroyOnClose
            title={
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-800">Export SQL</span>
                    <span className="text-xs text-gray-800"> - {tab === "up" ? "UP migration" : "DOWN (rollback)"}</span>
                </div>
            }
        >
            {isEmpty ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
                    <Code2 size={28} strokeWidth={1} />
                    <span className="text-xs">No SQL recorded for this migration.</span>
                </div>
            ) : (
                <div className="rounded-lg overflow-hidden mt-1">
                    <Editor
                        height={380}
                        language="sql"
                        value={sql}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 12,
                            scrollBeyondLastLine: false,
                            lineNumbers: "on",
                            lineNumbersMinChars: 2,
                            lineDecorationsWidth: 4,
                            wordWrap: "on",
                            renderLineHighlight: "none",
                            scrollbar: { vertical: "hidden", horizontal: "hidden" },
                            overviewRulerLanes: 0,
                        }}
                        theme="vs"
                    />
                </div>
            )}
        </Modal>
    );
}

// ── Main drawer ───────────────────────────────────────────────────────────────

const ExportHistoryDrawer: React.FC<Props> = ({ open, onClose, projectId }) => {
    const { records, isLoading, removeRecord, rollback } = useExportHistory(open ? projectId : null);
    const [viewState, setViewState] = useState<{ record: ExportRecord; tab: "up" | "down" } | null>(null);

    return (
        <>
            <Drawer
                open={open}
                onClose={onClose}
                title={
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-800">Export History</span>
                        {records.length > 0 && (
                            <span className="text-xs text-gray-400">{records.length}</span>
                        )}
                    </div>
                }
                width={460}
                styles={{ body: { padding: "0 16px" } }}
            >
                {isLoading ? (
                    <div className="flex justify-center py-16">
                        <Spin />
                    </div>
                ) : records.length === 0 ? (
                    <Empty
                        description={
                            <span className="text-xs text-gray-400">
                                No exports yet.
                            </span>
                        }
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        className="py-16"
                    />
                ) : (
                    <div>
                        {records.map((record) => (
                            <RecordRow
                                key={record.id}
                                record={record}
                                onView={(r, t) => setViewState({ record: r, tab: t })}
                                onRollback={async (r) => { await rollback(r.id); }}
                                onDelete={(r) => removeRecord(r.id)}
                            />
                        ))}
                    </div>
                )}
            </Drawer>

            <SQLViewer
                record={viewState?.record ?? null}
                tab={viewState?.tab ?? "up"}
                onClose={() => setViewState(null)}
            />
        </>
    );
};

export default ExportHistoryDrawer;
