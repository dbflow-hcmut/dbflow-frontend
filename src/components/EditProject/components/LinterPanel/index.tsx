"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { X, AlertCircle, AlertTriangle, Info, ChevronDown, ChevronRight, Minimize2, Maximize2, ShieldAlert } from "lucide-react";
import type { LintIssue, LintSeverity } from "../../utils/schema-linter";

type Props = {
    issues: LintIssue[];
    counts: { error: number; warning: number; info: number };
    isOpen: boolean;
    onClose: () => void;
    onIssueClick?: (nodeId: string) => void;
};

type FilterSeverity = LintSeverity | "all";

const SEVERITY_ORDER: LintSeverity[] = ["error", "warning", "info"];

const severityIcon = (severity: LintSeverity, size = 14) => {
    switch (severity) {
        case "error":
            return <AlertCircle size={size} className="text-red-500 shrink-0" />;
        case "warning":
            return <AlertTriangle size={size} className="text-yellow-500 shrink-0" />;
        case "info":
            return <Info size={size} className="text-blue-400 shrink-0" />;
    }
};

const severityLabel = (severity: LintSeverity) => {
    switch (severity) {
        case "error":
            return "Error";
        case "warning":
            return "Warning";
        case "info":
            return "Info";
    }
};

const severityBadgeClass = (severity: LintSeverity) => {
    switch (severity) {
        case "error":
            return "bg-red-100 text-red-700 border border-red-200";
        case "warning":
            return "bg-yellow-50 text-yellow-700 border border-yellow-200";
        case "info":
            return "bg-blue-50 text-blue-600 border border-blue-200";
    }
};

export const LinterPanel: React.FC<Props> = ({ issues, counts, isOpen, onClose, onIssueClick }) => {
    const [filter, setFilter] = useState<FilterSeverity>("all");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["error", "warning", "info"]));
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const panelRef = useRef<HTMLDivElement>(null);

    // Initialise to bottom-right corner on first open
    const initialised = useRef(false);
    useEffect(() => {
        if (isOpen && !initialised.current) {
            initialised.current = true;
            const w = window.innerWidth;
            const panelWidth = 360;
            setPosition({ x: w - panelWidth - 16, y: 80 });
        }
    }, [isOpen]);

    // Drag logic
    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            setPosition({
                x: Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 360)),
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

    const filtered = useMemo(
        () => (filter === "all" ? issues : issues.filter((i) => i.severity === filter)),
        [issues, filter],
    );

    // Group by severity in display order
    const grouped = useMemo(() => {
        const map = new Map<LintSeverity, LintIssue[]>();
        for (const sev of SEVERITY_ORDER) {
            const items = filtered.filter((i) => i.severity === sev);
            if (items.length > 0) map.set(sev, items);
        }
        return map;
    }, [filtered]);

    const totalIssues = counts.error + counts.warning + counts.info;

    const toggleGroup = (sev: LintSeverity) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(sev)) next.delete(sev);
            else next.add(sev);
            return next;
        });
    };

    if (!isOpen) return null;

    return (
        <div
            ref={panelRef}
            className="fixed z-50 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: "360px",
                height: isMinimized ? "50px" : "520px",
                maxWidth: "calc(100vw - 20px)",
                maxHeight: "calc(100vh - 20px)",
                cursor: isDragging ? "grabbing" : "default",
                overflow: "hidden",
            }}
        >
            {/* Draggable header */}
            <div
                onMouseDown={handleMouseDown}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-primary-600 to-primary-400 cursor-grab active:cursor-grabbing shrink-0"
            >
                <div className="flex items-center gap-2">
                    <ShieldAlert size={15} className="text-white shrink-0" />
                    <span className="text-white font-semibold text-sm">Linter & Safety Warnings</span>
                    {totalIssues > 0 && (
                        <span
                            className="inline-flex items-center justify-center rounded-full text-white text-[10px] font-bold px-1.5 leading-4"
                            style={{
                                minWidth: 18,
                                height: 18,
                                backgroundColor: counts.error > 0 ? "rgba(239,68,68,0.85)" : "rgba(245,158,11,0.85)",
                            }}
                        >
                            {totalIssues}
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
            {/* Filter tabs */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 shrink-0 bg-gray-50">
                {(["all", "error", "warning", "info"] as const).map((f) => {
                    const cnt =
                        f === "all"
                            ? totalIssues
                            : f === "error"
                            ? counts.error
                            : f === "warning"
                            ? counts.warning
                            : counts.info;
                    return (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`flex items-center gap-1 px-2 py-1 text-xs! font-medium transition-colors cursor-pointer ${
                                filter === f
                                    ? "text-gray-500 hover:text-gray-700 border-b-2 border-primary-500"
                                    : "text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {f !== "all" && severityIcon(f, 12)}
                            <span className="capitalize">{f === "all" ? "All" : severityLabel(f as LintSeverity)}</span>
                            {cnt > 0 && (
                                <span
                                    className={`rounded-full text-[10px] font-bold px-1.5 leading-4 ${
                                        f === "error"
                                            ? "bg-red-100 text-red-600"
                                            : f === "warning"
                                            ? "bg-yellow-100 text-yellow-600"
                                            : f === "info"
                                            ? "bg-blue-100 text-blue-500"
                                            : "bg-gray-200 text-gray-600"
                                    }`}
                                >
                                    {cnt}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Issue list */}
            <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 px-6 text-center">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="12" r="9" />
                        </svg>
                        <span className="text-sm font-medium">No issues found</span>
                        {filter !== "all" && (
                            <span className="text-xs">
                                No {filter} issues. Try the &quot;All&quot; filter to see other issue types.
                            </span>
                        )}
                    </div>
                ) : (
                    <div className="py-2">
                        {SEVERITY_ORDER.map((sev) => {
                            const items = grouped.get(sev);
                            if (!items) return null;
                            const isExpanded = expandedGroups.has(sev);
                            return (
                                <div key={sev} className="mb-1">
                                    {/* Group header */}
                                    <button
                                        className="w-full flex items-center gap-2 px-4 py-1.5 text-sm! font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => toggleGroup(sev)}
                                    >
                                        {isExpanded ? (
                                            <ChevronDown size={12} className="shrink-0" />
                                        ) : (
                                            <ChevronRight size={12} className="shrink-0" />
                                        )}
                                        {severityIcon(sev, 12)}
                                        <span>{severityLabel(sev)}s</span>
                                        <span
                                            className={`ml-auto rounded-full text-[10px] font-bold px-1.5 leading-4 ${severityBadgeClass(sev)}`}
                                        >
                                            {items.length}
                                        </span>
                                    </button>

                                    {/* Issue rows */}
                                    {isExpanded && (
                                        <div>
                                            {items.map((issue, idx) => (
                                                <div
                                                    key={`${issue.ruleId}-${idx}`}
                                                    className={`flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 ${issue.targetId ? 'cursor-pointer' : ''}`}
                                                    onClick={() => issue.targetId && onIssueClick?.(issue.targetId)}
                                                >
                                                    <div className="mt-0.5">{severityIcon(issue.severity)}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-gray-700 leading-relaxed break-words">
                                                            {issue.message}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                                                                {issue.ruleId}
                                                            </span>
                                                            {issue.target && (
                                                                <span className="text-[10px] text-gray-400 truncate max-w-[140px]" title={issue.target}>
                                                                    {issue.target}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer summary */}
            <div className="shrink-0 border-t border-gray-100 px-4 py-2 bg-gray-50 flex items-center gap-3 text-xs text-gray-500">
                {counts.error > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                        <AlertCircle size={12} />
                        {counts.error} error{counts.error !== 1 ? "s" : ""}
                    </span>
                )}
                {counts.warning > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600">
                        <AlertTriangle size={12} />
                        {counts.warning} warning{counts.warning !== 1 ? "s" : ""}
                    </span>
                )}
                {counts.info > 0 && (
                    <span className="flex items-center gap-1 text-blue-500">
                        <Info size={12} />
                        {counts.info} hint{counts.info !== 1 ? "s" : ""}
                    </span>
                )}
                {totalIssues === 0 && <span>Schema looks good!</span>}
            </div>
            </>
            )}
        </div>
    );
};

export default LinterPanel;
