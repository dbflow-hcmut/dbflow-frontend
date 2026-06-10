"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
    X,
    Minimize2,
    Maximize2,
    ChevronDown,
    ChevronRight,
    CheckCircle2,
    AlertTriangle,
    Layers,
    Table2,
} from "lucide-react";
import { Button, Tag, Modal, Select } from "antd";
import {
    analyzeTable,
    decompose3NF,
    decomposeBCNF,
    findCandidateKeys,
    minimalCover,
    type AnalyzeTableInput,
    type NormalizationResult,
    type NormalizationViolation,
    type DecomposedTable,
} from "../../utils/normalization";
import type { LogicalModelPayload } from "../../utils/logical-model.builder";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";

// ─── Types ───────────────────────────────────────────────────────────────────

type TargetNF = "2NF" | "3NF" | "BCNF";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    schemaLevel: "logical" | "physical";
    modelData: LogicalModelPayload | PhysicalModelPayload | null;
    onApplyDecomposition?: (tableName: string, decomposition: DecomposedTable[]) => void;
    onTableClick?: (nodeId: string) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NF_LEVELS: TargetNF[] = ["2NF", "3NF", "BCNF"];

const NF_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    "1NF": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    "2NF": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
    "3NF": { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
    BCNF: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
};

const nfRank = (nf: string): number => {
    switch (nf) {
        case "1NF": return 1;
        case "2NF": return 2;
        case "3NF": return 3;
        case "BCNF": return 4;
        default: return 0;
    }
};

const nfLabel = (nf: string) => {
    const colors = NF_COLORS[nf] ?? NF_COLORS["1NF"];
    return (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${colors.bg} ${colors.text} border ${colors.border}`}>
            {nf}
        </span>
    );
};

const violationSeverity = (nf: string) => {
    if (nf === "2NF") return "error";
    if (nf === "3NF") return "warning";
    return "info";
};

/** Check if a table needs decomposition to reach the target NF. */
const needsDecomposition = (result: NormalizationResult, targetNF: TargetNF): boolean => {
    return nfRank(result.currentNF) < nfRank(targetNF);
};

/** Filter violations relevant for the chosen target NF. */
const filterViolations = (violations: NormalizationViolation[], targetNF: TargetNF): NormalizationViolation[] => {
    return violations.filter((v) => nfRank(v.normalForm) <= nfRank(targetNF));
};

/** Compute decomposition for a specific target NF (not always BCNF). */
const computeDecomposition = (
    result: NormalizationResult,
    targetNF: TargetNF,
): DecomposedTable[] => {
    if (!needsDecomposition(result, targetNF)) return [];

    if (targetNF === "2NF" || targetNF === "3NF") {
        // 3NF synthesis handles both 2NF and 3NF violations
        return decompose3NF(
            result.tableName,
            result.attributes,
            result.minimalCover,
            result.candidateKeys,
        );
    }
    // BCNF
    if (nfRank(result.currentNF) < nfRank("3NF")) {
        // If below 3NF, use 3NF synthesis first (preserves deps)
        return decompose3NF(
            result.tableName,
            result.attributes,
            result.minimalCover,
            result.candidateKeys,
        );
    }
    // Already 3NF but not BCNF → use BCNF decomposition
    return decomposeBCNF(result.tableName, result.attributes, result.minimalCover);
};

/** Extract AnalyzeTableInput[] from a logical or physical model. */
const extractTablesFromModel = (
    modelData: LogicalModelPayload | PhysicalModelPayload | null,
): AnalyzeTableInput[] => {
    if (!modelData?.tables) return [];

    return modelData.tables.map((table) => {
        const columns = table.columns.map((c) => c.name);
        const primaryKey = table.columns
            .filter((c) => c.roles?.primaryKey)
            .map((c) => c.name);

        const candidateKeys = table.columns
            .filter((c) => c.roles?.candidateKey)
            .map((c) => c.name);

        const fds = (table.functionalDependencies ?? []).map((fd) => ({
            left: fd.left,
            right: fd.right,
        }));

        return {
            tableName: table.name,
            columns,
            primaryKey,
            candidateKeys: candidateKeys.length > 0 ? [candidateKeys] : undefined,
            functionalDependencies: fds,
        };
    });
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const ViolationRow: React.FC<{ v: NormalizationViolation }> = ({ v }) => {
    const sev = violationSeverity(v.normalForm);
    return (
        <div className="flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0">
            <div className="mt-0.5 shrink-0">
                {sev === "error" ? (
                    <AlertTriangle size={13} className="text-red-500" />
                ) : sev === "warning" ? (
                    <AlertTriangle size={13} className="text-yellow-500" />
                ) : (
                    <AlertTriangle size={13} className="text-blue-400" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    {nfLabel(v.normalForm)}
                    <span className="text-[10px] text-gray-400 font-mono">
                        {`{${v.fd.left.join(", ")}} → {${v.fd.right.join(", ")}}`}
                    </span>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed break-words">
                    {v.message}
                </p>
            </div>
        </div>
    );
};

const DecompositionPreview: React.FC<{
    tables: DecomposedTable[];
    tableName: string;
    targetNF: TargetNF;
    onApply?: () => void;
}> = ({ tables, tableName, targetNF, onApply }) => {
    if (tables.length === 0) return null;

    const handleApplyClick = () => {
        Modal.confirm({
            title: `Normalize to ${targetNF}`,
            content: (
                <div>
                    <p>This will replace table <strong>{tableName}</strong> with {tables.length} new tables:</p>
                    <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
                        {tables.map((t, i) => (
                            <li key={i}><strong>{t.name}</strong> ({t.attributes.join(", ")})</li>
                        ))}
                    </ul>
                    <p style={{ color: "#ff4d4f", marginBottom: 4 }}>This action cannot be undone. Make sure to save a version before proceeding.</p>
                    <p style={{ color: "#8c8c8c", fontSize: 12 }}>FK relationships will be rewired automatically.</p>
                </div>
            ),
            okText: "Apply",
            cancelText: "Cancel",
            okType: "primary",
            onOk: onApply,
        });
    };

    return (
        <div className="px-3 py-2 bg-blue-50/50 border-t border-blue-100">
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                    <Layers size={12} />
                    Decompose to {targetNF} ({tables.length} tables)
                </span>
                {onApply && (
                    <Button
                        size="small"
                        type="primary"
                        onClick={handleApplyClick}
                        className="!text-[10px] !h-5 !px-2"
                    >
                        Apply
                    </Button>
                )}
            </div>
            <div className="space-y-1">
                {tables.map((t, i) => (
                    <div key={i} className="text-[10px] bg-white rounded px-2 py-1.5 border border-blue-100">
                        <div className="font-semibold text-gray-700 flex items-center gap-1">
                            <Table2 size={10} />
                            {t.name}
                            {t.isKeyPreservation && (
                                <Tag color="blue" className="!text-[9px] !leading-none !px-1 !py-0 !m-0">key preservation</Tag>
                            )}
                        </div>
                        <div className="text-gray-500 mt-0.5">
                            Columns: {t.attributes.join(", ")}
                        </div>
                        <div className="text-gray-500">
                            PK: {t.primaryKey.join(", ")}
                        </div>
                        {t.fds.length > 0 && (
                            <div className="text-gray-400 mt-0.5">
                                FDs: {t.fds.map((fd) => `{${fd.left.join(", ")}} → {${fd.right.join(", ")}}`).join("; ")}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const TableResultCard: React.FC<{
    result: NormalizationResult;
    targetNF: TargetNF;
    isExpanded: boolean;
    onToggle: () => void;
    onApplyDecomposition?: () => void;
    onTableClick?: () => void;
}> = ({ result, targetNF, isExpanded, onToggle, onApplyDecomposition, onTableClick }) => {
    const meetsTarget = nfRank(result.currentNF) >= nfRank(targetNF);
    const relevantViolations = filterViolations(result.violations, targetNF);
    const decomposition = computeDecomposition(result, targetNF);
    const hasViolations = relevantViolations.length > 0;

    return (
        <div className="border border-gray-200 rounded-lg mb-2 overflow-hidden">
            <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={onToggle}
            >
                {isExpanded ? (
                    <ChevronDown size={12} className="shrink-0 text-gray-400" />
                ) : (
                    <ChevronRight size={12} className="shrink-0 text-gray-400" />
                )}

                {meetsTarget ? (
                    <CheckCircle2 size={14} className="shrink-0 text-green-500" />
                ) : (
                    <AlertTriangle size={14} className="shrink-0 text-amber-500" />
                )}

                <span
                    className="text-sm font-medium text-gray-700 truncate flex-1 hover:underline"
                    onClick={(e) => {
                        e.stopPropagation();
                        onTableClick?.();
                    }}
                    title="Click to focus on canvas"
                >
                    {result.tableName}
                </span>

                {nfLabel(result.currentNF)}

                {hasViolations && (
                    <span className="text-[10px] text-gray-400">
                        {relevantViolations.length} violation{relevantViolations.length !== 1 ? "s" : ""}
                    </span>
                )}
            </button>

            {isExpanded && (
                <div className="border-t border-gray-100">
                    <div className="px-3 py-2 bg-gray-50/50 text-[11px] text-gray-500 space-y-1">
                        <div>
                            <span className="font-medium text-gray-600">Columns:</span>{" "}
                            {result.attributes.join(", ")}
                        </div>
                        <div>
                            <span className="font-medium text-gray-600">Candidate Keys:</span>{" "}
                            {result.candidateKeys.map((ck) => `{${ck.join(", ")}}`).join(", ")}
                        </div>
                        <div>
                            <span className="font-medium text-gray-600">Prime Attributes:</span>{" "}
                            {result.primeAttributes.length > 0 ? result.primeAttributes.join(", ") : "—"}
                        </div>
                        {result.minimalCover.length > 0 && (
                            <div>
                                <span className="font-medium text-gray-600">Minimal Cover:</span>{" "}
                                {result.minimalCover.map((fd) => `{${fd.left.join(", ")}} → {${fd.right.join(", ")}}`).join("; ")}
                            </div>
                        )}
                    </div>

                    {hasViolations ? (
                        <div>
                            {relevantViolations.map((v, i) => (
                                <ViolationRow key={i} v={v} />
                            ))}
                        </div>
                    ) : (
                        <div className="px-3 py-3 text-center text-[11px] text-green-600 flex items-center justify-center gap-1.5">
                            <CheckCircle2 size={14} />
                            This table already meets {targetNF}.
                        </div>
                    )}

                    {decomposition.length > 0 && (
                        <DecompositionPreview
                            tables={decomposition}
                            tableName={result.tableName}
                            targetNF={targetNF}
                            onApply={onApplyDecomposition
                                ? () => onApplyDecomposition()
                                : undefined
                            }
                        />
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main Panel ──────────────────────────────────────────────────────────────

export const NormalizationPanel: React.FC<Props> = ({
    isOpen,
    onClose,
    schemaLevel,
    modelData,
    onApplyDecomposition,
    onTableClick,
}) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [targetNF, setTargetNF] = useState<TargetNF>("3NF");
    const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
    const [position, setPosition] = useState({ x: 0, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const panelRef = useRef<HTMLDivElement>(null);

    const initialised = useRef(false);
    useEffect(() => {
        if (isOpen && !initialised.current) {
            initialised.current = true;
            setPosition({ x: 16, y: 80 });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isDragging) return;
        const handleMouseMove = (e: MouseEvent) => {
            setPosition({
                x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 400)),
                y: Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 50)),
            });
        };
        const handleMouseUp = () => setIsDragging(false);
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, dragOffset]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            setIsDragging(true);
        }
    }, []);

    // Full analysis (always compute to BCNF for completeness)
    const results = useMemo((): NormalizationResult[] => {
        if (!modelData) return [];
        const tables = extractTablesFromModel(modelData);
        return tables.map(analyzeTable);
    }, [modelData]);

    // Auto-expand tables with violations for current target
    useEffect(() => {
        if (results.length > 0) {
            const withViolations = new Set(
                results
                    .filter((r) => needsDecomposition(r, targetNF))
                    .map((r) => r.tableName),
            );
            setExpandedTables(withViolations);
        }
    }, [results, targetNF]);

    // Summary relative to target NF
    const summary = useMemo(() => {
        let meetsTarget = 0;
        let belowTarget = 0;
        let totalViolations = 0;
        for (const r of results) {
            if (nfRank(r.currentNF) >= nfRank(targetNF)) {
                meetsTarget++;
            } else {
                belowTarget++;
                totalViolations += filterViolations(r.violations, targetNF).length;
            }
        }
        return { meetsTarget, belowTarget, totalViolations };
    }, [results, targetNF]);

    const toggleTable = (tableName: string) => {
        setExpandedTables((prev) => {
            const next = new Set(prev);
            if (next.has(tableName)) next.delete(tableName);
            else next.add(tableName);
            return next;
        });
    };

    const findTableNodeId = useCallback((tableName: string): string | undefined => {
        if (!modelData?.tables) return undefined;
        const table = modelData.tables.find((t) => t.name === tableName);
        return table?.id;
    }, [modelData]);

    if (!isOpen) return null;

    const allMeetTarget = results.length > 0 && summary.belowTarget === 0;

    return (
        <div
            ref={panelRef}
            className="fixed z-50 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: "400px",
                height: isMinimized ? "50px" : "560px",
                maxWidth: "calc(100vw - 20px)",
                maxHeight: "calc(100vh - 20px)",
                cursor: isDragging ? "grabbing" : "default",
                overflow: "hidden",
            }}
        >
            {/* Header */}
            <div
                onMouseDown={handleMouseDown}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-200 cursor-grab active:cursor-grabbing shrink-0"
                style={{ background: "linear-gradient(to right, #6366f1, #8b5cf6)" }}
            >
                <div className="flex items-center gap-2">
                    <Layers size={15} className="text-white shrink-0" />
                    <span className="text-white font-semibold text-sm">Normalization</span>
                    {results.length > 0 && (
                        <span
                            className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1.5 leading-4"
                            style={{
                                minWidth: 18,
                                height: 18,
                                backgroundColor: summary.totalViolations > 0
                                    ? "rgba(239,68,68,0.85)"
                                    : "rgba(34,197,94,0.85)",
                            }}
                        >
                            {summary.totalViolations > 0 ? summary.totalViolations : "✓"}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsMinimized((v) => !v)}
                        className="text-white hover:bg-white/20 rounded p-1 transition-colors cursor-pointer"
                    >
                        {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white/20 rounded p-1 transition-colors cursor-pointer"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Target NF selector + summary */}
                    <div className="shrink-0 px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        <span className="font-medium text-gray-600 whitespace-nowrap">Target:</span>
                        <Select
                            size="small"
                            value={targetNF}
                            onChange={(v) => setTargetNF(v)}
                            options={NF_LEVELS.map((nf) => ({ label: nf, value: nf }))}
                            className="!w-[80px]"
                            popupMatchSelectWidth={80}
                        />
                        <span className="text-gray-300">|</span>
                        <span className="font-medium text-gray-600">{results.length} tables</span>
                        {summary.meetsTarget > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle2 size={11} />
                                {summary.meetsTarget} OK
                            </span>
                        )}
                        {summary.belowTarget > 0 && (
                            <span className="text-red-600">
                                {summary.belowTarget} need fix
                            </span>
                        )}
                    </div>

                    {/* Table list */}
                    <div className="flex-1 overflow-y-auto p-3">
                        {results.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 px-6 text-center">
                                <Table2 size={36} strokeWidth={1.5} />
                                <span className="text-sm font-medium">No tables to analyze</span>
                                <span className="text-xs">
                                    Add tables with functional dependencies to see normalization analysis.
                                </span>
                            </div>
                        ) : allMeetTarget ? (
                            <div className="flex flex-col items-center justify-center gap-3 text-gray-400 px-6 text-center">
                                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                                    <CheckCircle2 size={28} className="text-green-500" />
                                </div>
                                <span className="text-sm font-medium text-green-700">All tables meet {targetNF}</span>
                                <span className="text-xs text-gray-400">
                                    No decomposition needed for the selected target.
                                </span>
                                <div className="w-full mt-3">
                                    {results.map((result, idx) => (
                                        <TableResultCard
                                            key={`${result.tableName}-${idx}`}
                                            result={result}
                                            targetNF={targetNF}
                                            isExpanded={expandedTables.has(result.tableName)}
                                            onToggle={() => toggleTable(result.tableName)}
                                            onTableClick={() => {
                                                const nodeId = findTableNodeId(result.tableName);
                                                if (nodeId) onTableClick?.(nodeId);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            results.map((result, idx) => {
                                const decomposition = computeDecomposition(result, targetNF);
                                return (
                                    <TableResultCard
                                        key={`${result.tableName}-${idx}`}
                                        result={result}
                                        targetNF={targetNF}
                                        isExpanded={expandedTables.has(result.tableName)}
                                        onToggle={() => toggleTable(result.tableName)}
                                        onApplyDecomposition={
                                            decomposition.length > 0 && onApplyDecomposition
                                                ? () => onApplyDecomposition(result.tableName, decomposition)
                                                : undefined
                                        }
                                        onTableClick={() => {
                                            const nodeId = findTableNodeId(result.tableName);
                                            if (nodeId) onTableClick?.(nodeId);
                                        }}
                                    />
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 border-t border-gray-100 px-4 py-2 bg-gray-50 flex items-center justify-between text-[10px] text-gray-400">
                        <span>
                            {schemaLevel === "logical" ? "Logical" : "Physical"} Schema
                        </span>
                        <span>
                            {summary.totalViolations} violation{summary.totalViolations !== 1 ? "s" : ""} for {targetNF}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
};

export default NormalizationPanel;
