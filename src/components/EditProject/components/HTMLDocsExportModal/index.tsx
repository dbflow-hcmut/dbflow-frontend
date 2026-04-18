import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Checkbox, Button, Tooltip, Segmented, Switch } from "antd";
import { notificationProvider } from "@/providers/notification";
import { Copy, Download, ExternalLink, Link2, Pencil } from "lucide-react";
import { apiPost } from "@/lib/clientFetch";
import { PROXY_SHARE_HTML, FE_BASE } from "@/api";
import { generateHTMLDocs, DEFAULT_HTML_DOCS_OPTIONS } from "../../utils/html-docs-generator";
import type { HTMLDocsOptions, HTMLDocsResult } from "../../utils/html-docs-generator";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";
import type { LogicalModelPayload } from "../../utils/logical-model.builder";
import type { ConceptualModelPayload } from "../../utils/conceptual-model.builder";

type SchemaModel = PhysicalModelPayload | LogicalModelPayload | ConceptualModelPayload;
type SchemaKind = "physical" | "logical" | "conceptual";

interface HTMLDocsExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    model: SchemaModel | null;
    schemaKind: SchemaKind;
    diagramName: string;
}

const HTMLDocsExportModal: React.FC<HTMLDocsExportModalProps> = ({
    isOpen,
    onClose,
    model,
    schemaKind,
    diagramName,
}) => {
    const [options, setOptions] = useState<HTMLDocsOptions>(DEFAULT_HTML_DOCS_OPTIONS);
    const [sharing, setSharing] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (isOpen) {
            setOptions(DEFAULT_HTML_DOCS_OPTIONS);
            setSharing(false);
            setEditMode(false);
        }
    }, [isOpen]);

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

    const handleCopy = useCallback(() => {
        const html = getCurrentHtml();
        if (!html) return;
        navigator.clipboard.writeText(html).then(() => {
            notificationProvider.open({ type: "success", message: "HTML copied to clipboard" });
        });
    }, [getCurrentHtml]);

    const handleDownload = useCallback(() => {
        const html = getCurrentHtml();
        if (!html) return;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${diagramName || "schema"}-docs.html`;
        a.click();
        URL.revokeObjectURL(url);
    }, [getCurrentHtml, diagramName]);

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
            notificationProvider.open({ type: "error", message: "Failed to create share link" });
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
            width={780}
            footer={
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                        {result?.tableCount ?? 0} {schemaKind === "conceptual" ? "entities" : "tables"} · {result?.columnCount ?? 0} {schemaKind === "conceptual" ? "attributes" : "columns"}
                    </span>
                    <div className="flex gap-2">
                        <Tooltip title="Create a public shareable link (no login required)">
                            <Button icon={<Link2 size={15} />} onClick={handleShareLink} loading={sharing} disabled={!result?.html}>
                                Copy Link
                            </Button>
                        </Tooltip>
                        <Tooltip title="Preview in browser">
                            <Button icon={<ExternalLink size={15} />} onClick={handlePreviewInBrowser} disabled={!result?.html}>
                                Preview
                            </Button>
                        </Tooltip>
                        <Tooltip title="Copy HTML source">
                            <Button icon={<Copy size={15} />} onClick={handleCopy} disabled={!result?.html}>
                                Copy
                            </Button>
                        </Tooltip>
                        <Button
                            type="primary"
                            icon={<Download size={15} />}
                            onClick={handleDownload}
                            disabled={!result?.html}
                        >
                            Download .html
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                {/* Schema kind indicator */}
                <div>
                    <div className="text-sm font-medium mb-1.5">Schema Type</div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        schemaKind === "physical" ? "bg-blue-100 text-blue-700" :
                        schemaKind === "logical" ? "bg-purple-100 text-purple-700" :
                        "bg-green-100 text-green-700"
                    }`}>
                        {schemaKind.charAt(0).toUpperCase() + schemaKind.slice(1)}
                    </span>
                </div>

                {/* Options */}
                <div>
                    <div className="text-sm font-medium mb-1.5">Options</div>
                    <div className="flex flex-col gap-1">
                        <Checkbox
                            checked={options.includeNotes}
                            onChange={(e) => updateOption("includeNotes", e.target.checked)}
                        >
                            Include notes / descriptions
                        </Checkbox>
                        {schemaKind === "physical" && (
                            <>
                                <Checkbox
                                    checked={options.includeIndexes}
                                    onChange={(e) => updateOption("includeIndexes", e.target.checked)}
                                >
                                    Include indexes
                                </Checkbox>
                                <Checkbox
                                    checked={options.includeFKDetails}
                                    onChange={(e) => updateOption("includeFKDetails", e.target.checked)}
                                >
                                    Include foreign key details
                                </Checkbox>
                            </>
                        )}
                        {schemaKind === "logical" && (
                            <Checkbox
                                checked={options.includeFKDetails}
                                onChange={(e) => updateOption("includeFKDetails", e.target.checked)}
                            >
                                Include foreign key references
                            </Checkbox>
                        )}
                    </div>
                </div>

                {/* Preview */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium">Preview</span>
                        <div className="flex items-center gap-1.5">
                            <Pencil size={13} className={editMode ? "text-amber-500" : "text-gray-400"} />
                            <Switch
                                size="small"
                                checked={editMode}
                                onChange={setEditMode}
                            />
                            <span className="text-xs text-gray-500">Edit text</span>
                        </div>
                    </div>
                    <div className={`border rounded-lg overflow-hidden bg-white ${editMode ? "border-primary-500 ring-1 ring-primary-500/30" : "border-gray-200"}`}>
                        {editableHtml ? (
                            <iframe
                                ref={iframeRef}
                                srcDoc={editableHtml}
                                title="HTML Docs Preview"
                                className="w-full border-0"
                                style={{ height: 380 }}
                                sandbox="allow-same-origin"
                            />
                        ) : (
                            <div className="flex items-center justify-center h-[380px] text-gray-400 text-sm">
                                No schema data to export
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default HTMLDocsExportModal;
