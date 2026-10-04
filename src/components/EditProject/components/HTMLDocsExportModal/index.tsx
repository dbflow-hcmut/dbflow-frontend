import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Checkbox, Button, Tooltip, Switch } from "antd";
import { notificationProvider } from "@/providers/notification";
import { Copy, Download, ExternalLink, Link2, Pencil } from "lucide-react";
import { apiPost } from "@/lib/clientFetch";
import { PROXY_SHARE_HTML, FE_BASE } from "@/api";
import { generateHTMLDocs, DEFAULT_HTML_DOCS_OPTIONS } from "../../utils/html-docs-generator";
import type { HTMLDocsOptions, HTMLDocsResult } from "../../utils/html-docs-generator";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";
import type { LogicalModelPayload } from "../../utils/logical-model.builder";
import type { ConceptualModelPayload } from "../../utils/conceptual-model.builder";
import { trackExportUsage } from "@/api/exports/client";
import { getApiErrorMessage } from "@/utils/functions";

type SchemaModel = PhysicalModelPayload | LogicalModelPayload | ConceptualModelPayload;
type SchemaKind = "physical" | "logical" | "conceptual";

interface HTMLDocsExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    model: SchemaModel | null;
    schemaKind: SchemaKind;
    diagramName: string;
    projectId: string | null;
}

const HTMLDocsExportModal: React.FC<HTMLDocsExportModalProps> = ({
    isOpen,
    onClose,
    model,
    schemaKind,
    diagramName,
    projectId,
}) => {
    const [options, setOptions] = useState<HTMLDocsOptions>(DEFAULT_HTML_DOCS_OPTIONS);
    const [sharing, setSharing] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [previewHeight, setPreviewHeight] = useState(0);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const previewResizeObserverRef = useRef<ResizeObserver | null>(null);

    useEffect(() => {
        if (isOpen) {
            setOptions(DEFAULT_HTML_DOCS_OPTIONS);
            setSharing(false);
            setEditMode(false);
            setPreviewHeight(0);
        }
    }, [isOpen]);

    useEffect(() => {
        return () => previewResizeObserverRef.current?.disconnect();
    }, []);

    const result: HTMLDocsResult | null = useMemo(() => {
        if (!model || !isOpen) return null;
        return generateHTMLDocs(model, schemaKind, options);
    }, [model, schemaKind, options, isOpen]);

    const updateOption = useCallback(<K extends keyof HTMLDocsOptions>(key: K, value: HTMLDocsOptions[K]) => {
        setOptions((prev) => ({ ...prev, [key]: value }));
    }, []);

    /** Read current HTML from iframe (includes user edits) or fall back to generated result */
    const getCurrentHtml = useCallback((): string | null => {
        if (editMode && iframeRef.current?.contentDocument) {
            return `<!DOCTYPE html>\n<html>${iframeRef.current.contentDocument.documentElement.innerHTML}</html>`;
        }
        return result?.html ?? null;
    }, [editMode, result?.html]);

    /** Inject contenteditable into HTML body tag */
    const editableHtml = useMemo(() => {
        if (!result?.html) return null;
        if (!editMode) return result.html;
        // Add contenteditable to body and a subtle edit-mode indicator
        return result.html.replace(
            "<body>",
            `<body contenteditable="true" style="outline:none;">`,
        );
    }, [result?.html, editMode]);

    const syncPreviewHeight = useCallback(() => {
        const iframe = iframeRef.current;
        const document = iframe?.contentDocument;
        if (!document) return;

        const updateHeight = () => {
            setPreviewHeight(Math.max(
                document.body?.scrollHeight ?? 0,
                document.documentElement?.scrollHeight ?? 0,
            ));
        };

        previewResizeObserverRef.current?.disconnect();
        updateHeight();

        const observer = new ResizeObserver(updateHeight);
        if (document.body) observer.observe(document.body);
        observer.observe(document.documentElement);
        previewResizeObserverRef.current = observer;
    }, []);

    const handleCopy = useCallback(() => {
        const html = getCurrentHtml();
        if (!html) return;
        navigator.clipboard.writeText(html).then(() => {
            notificationProvider.open({ type: "success", message: "HTML copied to clipboard" });
        });
    }, [getCurrentHtml]);

    const handleDownload = useCallback(async () => {
        const html = getCurrentHtml();
        if (!html || !projectId) return;
        try {
            await trackExportUsage(projectId, "html");
        } catch (error) {
            notificationProvider.open({ type: "error", message: error instanceof Error ? error.message : "Unable to export HTML" });
            return;
        }
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${diagramName || "schema"}-docs.html`;
        a.click();
        URL.revokeObjectURL(url);
    }, [getCurrentHtml, diagramName, projectId]);

    const handlePreviewInBrowser = useCallback(() => {
        const html = getCurrentHtml();
        if (!html) return;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
    }, [getCurrentHtml]);

    const handleShareLink = useCallback(async () => {
        const html = getCurrentHtml();
        if (!html) return;
        setSharing(true);
        try {
            const data = await apiPost<{ id: string }>(PROXY_SHARE_HTML, { html });
            const shareUrl = `${FE_BASE}/shared-docs/${data.id}`;
            await navigator.clipboard.writeText(shareUrl);
            notificationProvider.open({ type: "success", message: "Share link copied to clipboard" });
        } catch (err) {
            notificationProvider.open({ type: "error", message: getApiErrorMessage(err, "Failed to create share link") });
            console.error(err);
        } finally {
            setSharing(false);
        }
    }, [getCurrentHtml]);

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            title="Export HTML Documentation"
            width={820}
            className="[&_.ant-modal-content]:!overflow-hidden [&_.ant-modal-content]:!rounded-[20px] [&_.ant-modal-content]:!p-0 [&_.ant-modal-content]:!shadow-[0_24px_80px_rgba(15,23,42,0.16)] [&_.ant-modal-header]:!mb-0 [&_.ant-modal-header]:!px-6 [&_.ant-modal-header]:!pb-4 [&_.ant-modal-header]:!pt-5 [&_.ant-modal-title]:!text-base [&_.ant-modal-title]:!font-semibold [&_.ant-modal-title]:!text-gray-900 [&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:!grid [&_.ant-modal-close]:!size-9 [&_.ant-modal-close]:!place-items-center [&_.ant-modal-close]:!rounded-xl [&_.ant-modal-close]:!text-gray-400 hover:[&_.ant-modal-close]:!bg-gray-100 hover:[&_.ant-modal-close]:!text-gray-700 [&_.ant-modal-body]:!overflow-y-auto [&_.ant-modal-body]:!p-0 [&_.ant-modal-footer]:!m-0 [&_.ant-modal-footer]:!border-t [&_.ant-modal-footer]:!border-gray-100 [&_.ant-modal-footer]:!px-6 [&_.ant-modal-footer]:!py-4"
            styles={{ body: { padding: 0, height: "calc(80vh - 132px)" } }}
            centered
            footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-gray-400">
                        {result?.tableCount ?? 0} {schemaKind === "conceptual" ? "entities" : "tables"} · {result?.columnCount ?? 0} {schemaKind === "conceptual" ? "attributes" : "columns"}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                        <Tooltip title="Create a public shareable link (no login required)">
                            <Button icon={<Link2 size={15} />} onClick={handleShareLink} loading={sharing} disabled={!result?.html} className="!h-9 !rounded-xl !border-0 !bg-gray-100 !px-3.5 !text-xs !font-semibold !text-gray-700 !shadow-none hover:!bg-gray-200">
                                Copy Link
                            </Button>
                        </Tooltip>
                        <Tooltip title="Preview in browser">
                            <Button icon={<ExternalLink size={15} />} onClick={handlePreviewInBrowser} disabled={!result?.html} className="!h-9 !rounded-xl !border-0 !bg-gray-100 !px-3.5 !text-xs !font-semibold !text-gray-700 !shadow-none hover:!bg-gray-200">
                                Preview
                            </Button>
                        </Tooltip>
                        <Tooltip title="Copy HTML source">
                            <Button icon={<Copy size={15} />} onClick={handleCopy} disabled={!result?.html} className="!h-9 !rounded-xl !border-0 !bg-gray-100 !px-3.5 !text-xs !font-semibold !text-gray-700 !shadow-none hover:!bg-gray-200">
                                Copy
                            </Button>
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<Download size={15} />}
                            onClick={handleDownload}
                            disabled={!result?.html}
                            className="!h-9 !rounded-xl !border-0 !px-4 !text-xs !font-semibold !shadow-none"
                        >
                            Download .html
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex min-h-full flex-col gap-5 px-6 pb-6">
                    <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                    {/* Schema kind indicator */}
                    <section className="rounded-2xl bg-gray-50 p-4">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Schema type</div>
                        <span className={`inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold ${
                            schemaKind === "physical" ? "bg-blue-100 text-blue-700" :
                            schemaKind === "logical" ? "bg-purple-100 text-purple-700" :
                            "bg-green-100 text-green-700"
                        }`}>
                            {schemaKind.charAt(0).toUpperCase() + schemaKind.slice(1)}
                        </span>
                    </section>

                    {/* Options */}
                    <section className="rounded-2xl bg-gray-50 p-4">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Options</div>
                        <div className="grid gap-1 sm:grid-cols-2">
                        <Checkbox
                            className="min-h-8 rounded-lg px-2 text-xs transition-colors hover:bg-white"
                            checked={options.includeNotes}
                            onChange={(e) => updateOption("includeNotes", e.target.checked)}
                        >
                            <span className="text-xs text-gray-700">Include notes / descriptions</span>
                        </Checkbox>
                        {schemaKind === "physical" && (
                            <>
                                <Checkbox
                                    className="min-h-8 rounded-lg px-2 text-xs transition-colors hover:bg-white"
                                    checked={options.includeIndexes}
                                    onChange={(e) => updateOption("includeIndexes", e.target.checked)}
                                >
                                    <span className="text-xs text-gray-700">Include indexes</span>
                                </Checkbox>
                                <Checkbox
                                    className="min-h-8 rounded-lg px-2 text-xs transition-colors hover:bg-white"
                                    checked={options.includeFKDetails}
                                    onChange={(e) => updateOption("includeFKDetails", e.target.checked)}
                                >
                                    <span className="text-xs text-gray-700">Include foreign key details</span>
                                </Checkbox>
                            </>
                        )}
                        {schemaKind === "logical" && (
                            <Checkbox
                                className="min-h-8 rounded-lg px-2 text-xs transition-colors hover:bg-white"
                                checked={options.includeFKDetails}
                                onChange={(e) => updateOption("includeFKDetails", e.target.checked)}
                            >
                                <span className="text-xs text-gray-700">Include foreign key references</span>
                            </Checkbox>
                        )}
                        </div>
                    </section>
                    </div>

                    {/* Preview */}
                    <section className="min-h-0 flex-1">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">Preview</span>
                            <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-1.5">
                                <Pencil size={13} className={editMode ? "text-primary-500" : "text-gray-400"} />
                                <Switch
                                    size="small"
                                    checked={editMode}
                                    onChange={setEditMode}
                                />
                                <span className="text-xs font-medium text-gray-500">Edit text</span>
                            </div>
                        </div>
                        <div className={`overflow-hidden rounded-2xl bg-white transition-shadow ${
                            editMode
                                ? "ring-2 ring-primary-400/40 shadow-[0_12px_36px_rgba(66,165,245,0.12)]"
                                : "ring-1 ring-gray-100 shadow-[0_12px_36px_rgba(15,23,42,0.06)]"
                        }`}>
                            {editableHtml ? (
                                <iframe
                                    ref={iframeRef}
                                    srcDoc={editableHtml}
                                    title="HTML Docs Preview"
                                    className="block w-full border-0"
                                    style={{ height: previewHeight || 1 }}
                                    scrolling="no"
                                    onLoad={syncPreviewHeight}
                                    sandbox="allow-same-origin"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-[380px] text-gray-400 text-sm">
                                    No schema data to export
                                </div>
                            )}
                        </div>
                    </section>
            </div>
        </Modal>
    );
};

export default HTMLDocsExportModal;
