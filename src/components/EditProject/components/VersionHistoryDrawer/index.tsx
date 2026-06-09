"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer, Button, Tag, Empty, Input, Select, Segmented, Tooltip, Skeleton } from "antd";
import { Plus, GitCompare, Copy, Download, ArrowLeft, RotateCcw } from "lucide-react";
import ReactFlow, { Node, Edge, ReactFlowProvider, Background, BackgroundVariant, EdgeTypes, type NodeTypes } from "reactflow";
import { apiGet, apiPost } from "@/lib/clientFetch";
import { PROXY_SCHEMA_VERSIONS, PROXY_SCHEMA_VERSION_DETAIL } from "@/api";
import { notificationProvider } from "@/providers/notification";
import type { PhysicalModelPayload } from "../../utils/physical-model.builder";
import { buildPhysicalModel } from "../../utils/physical-model.builder";
import {
    mapReactNodesToStoredNodes as mapPhysicalReactToStored,
    mapReactEdgesToStoredEdges as mapPhysicalEdgesReactToStored,
    mapStoredNodesToReactNodes as mapPhysicalStoredToReact,
    mapStoredEdgesToReactEdges as mapPhysicalEdgesStoredToReact,
} from "../../utils/physical-diagram.builder";
import type { StoredPhysicalNode, StoredPhysicalDiagramEdge } from "../../utils/physical-diagram.builder";
import {
    mapReactNodesToStoredNodes as mapLogicalReactToStored,
    mapReactEdgesToStoredEdges as mapLogicalEdgesReactToStored,
    mapStoredNodesToReactNodes as mapLogicalStoredToReact,
    mapStoredEdgesToReactEdges as mapLogicalEdgesStoredToReact,
} from "../../utils/logical-diagram.builder";
import type { StoredLogicalNode, StoredLogicalDiagramEdge } from "../../utils/logical-diagram.builder";
import {
    mapReactNodesToStoredNodes as mapConceptualReactToStored,
    mapReactEdgesToStoredEdges as mapConceptualEdgesReactToStored,
    mapStoredNodesToReactNodes as mapConceptualStoredToReact,
    mapStoredEdgesToReactEdges as mapConceptualEdgesStoredToReact,
} from "../../utils/conceptual-diagram.builder";
import type { StoredDiagramNode, StoredDiagramEdge } from "../../utils/conceptual-diagram.builder";
import RelationTableNode from "@/components/erds-notations/relation-table";
import RelationTableEdge from "@/components/relation-table-edge";
import LogicalTableNode from "@/components/erds-notations/logical-table";
import LogicalTableEdge from "@/components/logical-table-edge";
import RelationshipNode from "@/components/erds-notations/relationship";
import AttributeNode from "@/components/erds-notations/attribute";
import EntityNode from "@/components/erds-notations/entity";
import ConstraintNode from "@/components/erds-notations/constraint";
import ErdEdge from "@/components/erd-edge";
import { diffSchemas, type SchemaDiff, type ColumnChange } from "../../utils/schema-diff";
import { generateDDL, DEFAULT_DDL_OPTIONS } from "../../utils/ddl-generator";
import { generateMigration, type MigrationResult } from "../../utils/migration-generator";
import type { DBMSType } from "../../utils/dbms-config";
import type { NodeData } from "../../index";
import { SchemaType } from "@/utils/constants";
import LazyDiffEditor from "./LazyDiffEditor";

// ── Types ────────────────────────────────────────────────────────────

type VersionSummary = {
    id: string;
    version: number;
    label: string;
    createdBy: string;
    createdAt: string;
};

type VersionDetail = VersionSummary & {
    model: PhysicalModelPayload;
    // S3 stores physical as { nodes, edges } and conceptual/logical as { diagram: { nodes, edges } }
    diagram?: Record<string, unknown> | null;
};

interface VersionHistoryDrawerProps {
    open: boolean;
    onClose: () => void;
    projectId: string | null;
    schemaId: string | null;
    schemaName?: string;
    diagramName: string;
    diagramType?: string;
    nodes: Node<NodeData>[];
    edges: Edge[];
    liveNodes?: Node<NodeData>[];
    liveEdges?: Edge[];
    onPreviewVersion?: (storedNodes: unknown[], storedEdges: unknown[], version: VersionSummary) => void;
    onExitPreview?: () => void;
    onRestoreVersion?: () => void;
    previewingVersionId?: string | null;
}

type DiffView = "ddl" | "migration" | "diagram";

const DBMS_OPTIONS: { label: string; value: DBMSType }[] = [
    { label: "PostgreSQL", value: "postgresql" },
    { label: "MySQL", value: "mysql" },
    { label: "SQL Server", value: "sqlserver" },
];

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string) {
    return new Date(iso).toLocaleString();
}

/** Unwrap diagram from version detail — handles both flat { nodes, edges } and wrapped { diagram: { nodes, edges } } */
function unwrapDiagram(raw: Record<string, unknown> | null | undefined): { nodes: unknown[]; edges: unknown[] } | null {
    if (!raw) return null;
    // Wrapped format: { diagram: { nodes, edges } }
    const inner = raw.diagram as Record<string, unknown> | undefined;
    if (inner && Array.isArray(inner.nodes)) {
        return { nodes: inner.nodes as unknown[], edges: (inner.edges as unknown[] ?? []) };
    }
    // Flat format: { nodes, edges }
    if (Array.isArray(raw.nodes)) {
        return { nodes: raw.nodes as unknown[], edges: (raw.edges as unknown[] ?? []) };
    }
    return null;
}

/** Compare diagram nodes by name for logical / conceptual schemas (node-level diff). */
function computeDiagramDiff(
    fromNodes: unknown[],
    toNodes: unknown[],
): { added: Set<string>; removed: Set<string>; modified: Set<string> } {
    const getName = (n: unknown): string => {
        const node = n as { name?: string; data?: { name?: string } };
        return node.name ?? node.data?.name ?? "";
    };
    // Serialize semantic data only (exclude layout-only props)
    const getSemanticKey = (n: unknown): string => {
        const node = n as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { position, size, zIndex, style, id, ...semantic } = node;
        return JSON.stringify(semantic);
    };

    const fromMap = new Map<string, string>();
    for (const n of fromNodes) {
        const name = getName(n);
        if (name) fromMap.set(name, getSemanticKey(n));
    }
    const toMap = new Map<string, string>();
    for (const n of toNodes) {
        const name = getName(n);
        if (name) toMap.set(name, getSemanticKey(n));
    }

    const added = new Set<string>();
    const removed = new Set<string>();
    const modified = new Set<string>();

    for (const name of toMap.keys()) {
        if (!fromMap.has(name)) {
            added.add(name);
        } else if (fromMap.get(name) !== toMap.get(name)) {
            modified.add(name);
        }
    }
    for (const name of fromMap.keys()) {
        if (!toMap.has(name)) {
            removed.add(name);
        }
    }

    return { added, removed, modified };
}

// ── Visual Diagram Diff types ────────────────────────────────────────

type TableDiffStatus = "added" | "removed" | "modified" | "unchanged";
type ColumnDiffStatus = "added" | "removed" | "modified" | "unchanged";

type ColumnVisual = {
    name: string;
    type?: string;
    isPK?: boolean;
    isFK?: boolean;
    status: ColumnDiffStatus;
};

type TableVisual = {
    name: string;
    status: TableDiffStatus;
    columns: ColumnVisual[];
};

function buildVisualDiff(diff: SchemaDiff, oldModel: PhysicalModelPayload, newModel: PhysicalModelPayload): TableVisual[] {
    const tables: TableVisual[] = [];

    const addedTableNames = new Set(diff.tableChanges.filter(tc => tc.type === "CREATE_TABLE").map(tc => tc.table.name));
    const removedTableNames = new Set(diff.tableChanges.filter(tc => tc.type === "DROP_TABLE").map(tc => tc.table.name));

    // Column changes grouped by table
    const colChangesByTable = new Map<string, ColumnChange[]>();
    for (const cc of diff.columnChanges) {
        const list = colChangesByTable.get(cc.tableName) ?? [];
        list.push(cc);
        colChangesByTable.set(cc.tableName, list);
    }

    // Modified table names (have column/constraint/index changes but are not added/removed)
    const modifiedTableNames = new Set<string>();
    for (const cc of diff.columnChanges) modifiedTableNames.add(cc.tableName);
    for (const cc of diff.constraintChanges) modifiedTableNames.add(cc.tableName);
    for (const ic of diff.indexChanges) modifiedTableNames.add(ic.tableName);

    // Collect all table names from new model (show current state + removed tables)
    const allTableNames = new Set<string>();
    for (const t of newModel.tables ?? []) allTableNames.add(t.name);
    for (const t of oldModel.tables ?? []) allTableNames.add(t.name);

    for (const tableName of allTableNames) {
        const isAdded = addedTableNames.has(tableName);
        const isRemoved = removedTableNames.has(tableName);
        const isModified = !isAdded && !isRemoved && modifiedTableNames.has(tableName);
        const status: TableDiffStatus = isAdded ? "added" : isRemoved ? "removed" : isModified ? "modified" : "unchanged";

        // Use new model columns for added/modified/unchanged, old model for removed
        const modelTable = isRemoved
            ? (oldModel.tables ?? []).find(t => t.name === tableName)
            : (newModel.tables ?? []).find(t => t.name === tableName);

        const colChanges = colChangesByTable.get(tableName) ?? [];
        const addedCols = new Set(colChanges.filter(c => c.type === "ADD_COLUMN").map(c => c.column.name));
        const removedCols = new Set(colChanges.filter(c => c.type === "DROP_COLUMN").map(c => c.column.name));
        const modifiedCols = new Set(colChanges.filter(c => c.type === "MODIFY_COLUMN").map(c => c.columnName));

        // Build column list
        const columns: ColumnVisual[] = [];
        if (modelTable) {
            for (const col of modelTable.columns ?? []) {
                let colStatus: ColumnDiffStatus = "unchanged";
                if (isAdded) colStatus = "added";
                else if (isRemoved) colStatus = "removed";
                else if (addedCols.has(col.name)) colStatus = "added";
                else if (modifiedCols.has(col.name)) colStatus = "modified";
                columns.push({
                    name: col.name,
                    type: col.dataType,
                    isPK: col.roles?.primaryKey,
                    isFK: !!col.roles?.foreignKey,
                    status: colStatus,
                });
            }
        }
        // Add removed columns that aren't in new model
        if (!isRemoved && !isAdded) {
            for (const colName of removedCols) {
                const oldTable = (oldModel.tables ?? []).find(t => t.name === tableName);
                const oldCol = oldTable?.columns?.find(c => c.name === colName);
                columns.push({
                    name: colName,
                    type: oldCol?.dataType,
                    isPK: oldCol?.roles?.primaryKey,
                    isFK: !!oldCol?.roles?.foreignKey,
                    status: "removed",
                });
            }
        }

        tables.push({ name: tableName, status, columns });
    }

    // Sort: added first, then removed, then modified, then unchanged
    const order: Record<TableDiffStatus, number> = { added: 0, removed: 1, modified: 2, unchanged: 3 };
    tables.sort((a, b) => order[a.status] - order[b.status]);

    return tables;
}

const STATUS_STYLES: Record<TableDiffStatus, { border: string; bg: string; headerBg: string; badge: string }> = {
    added:     { border: "border-green-400", bg: "bg-green-50",  headerBg: "bg-green-100", badge: "bg-green-500" },
    removed:   { border: "border-red-400",   bg: "bg-red-50",    headerBg: "bg-red-100",   badge: "bg-red-500" },
    modified:  { border: "border-yellow-400", bg: "bg-yellow-50", headerBg: "bg-yellow-100", badge: "bg-yellow-500" },
    unchanged: { border: "border-gray-200",  bg: "bg-white",     headerBg: "bg-gray-50",   badge: "bg-gray-400" },
};

const COL_STATUS_STYLES: Record<ColumnDiffStatus, string> = {
    added:     "bg-green-100 text-green-800",
    removed:   "bg-red-100 text-red-800 line-through",
    modified:  "bg-yellow-100 text-yellow-800",
    unchanged: "",
};

// ── Component ────────────────────────────────────────────────────────

const VersionHistoryDrawer: React.FC<VersionHistoryDrawerProps> = ({
    open,
    onClose,
    projectId,
    schemaId,
    schemaName,
    diagramName,
    nodes,
    edges,
    liveNodes,
    liveEdges,
    diagramType,
    onPreviewVersion,
    onExitPreview,
    onRestoreVersion,
    previewingVersionId,
}) => {
    const isPhysical = diagramType === SchemaType.PHYSICAL;
    const isLogical = diagramType === SchemaType.LOGICAL;
    const [versions, setVersions] = useState<VersionSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState<string | null>(null);
    const [newLabel, setNewLabel] = useState("");
    const [restoring, setRestoring] = useState(false);

    // Compare
    const [compareFrom, setCompareFrom] = useState<string | null>(null);
    const [compareTo, setCompareTo] = useState<string | null>(null);
    const [comparing, setComparing] = useState(false);
    const [diffResult, setDiffResult] = useState<{
        diff: SchemaDiff;
        oldModel: PhysicalModelPayload;
        newModel: PhysicalModelPayload;
        fromVersion: VersionSummary;
        toVersion: VersionSummary;
        fromDiagram?: { nodes: unknown[]; edges: unknown[] } | null;
        toDiagram?: { nodes: unknown[]; edges: unknown[] } | null;
    } | null>(null);
    const [diffView, setDiffView] = useState<DiffView>("diagram");
    const [dbms, setDbms] = useState<DBMSType>("postgresql");
    const [diagramsReady, setDiagramsReady] = useState<{ from: boolean; to: boolean }>({ from: false, to: false });

    // ── Fetch versions ───────────────────────────────────────────

    const fetchVersions = useCallback(async () => {
        if (!projectId || !schemaId) return;
        setLoading(true);
        try {
            const data = await apiGet<VersionSummary[]>(PROXY_SCHEMA_VERSIONS(projectId, schemaId));
            setVersions(data ?? []);
        } catch (err) {
            notificationProvider.open({ type: "error", message: "Failed to load versions" });
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [projectId, schemaId]);

    useEffect(() => {
        if (open) {
            fetchVersions();
            setDiffResult(null);
            setCompareFrom(null);
            setCompareTo(null);
        }
    }, [open, fetchVersions]);
    // ── Preview version ──────────────────────────────────────────

    const handlePreviewClick = useCallback(async (v: VersionSummary) => {
        if (!projectId || !schemaId || !onPreviewVersion) return;
        if (previewingVersionId === v.id) return; // already previewing this
        setLoadingPreview(v.id);
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const detail = await apiGet<VersionDetail>(PROXY_SCHEMA_VERSION_DETAIL(projectId, schemaId, v.id) + cacheBuster);
            const diag = unwrapDiagram(detail?.diagram);
            if (diag?.nodes && diag?.edges) {
                onPreviewVersion(diag.nodes, diag.edges, v);
            } else {
                notificationProvider.open({ type: "error", message: "This version has no diagram snapshot. Try creating a new snapshot." });
            }
        } catch (err) {
            notificationProvider.open({ type: "error", message: "Failed to load version" });
            console.error(err);
        } finally {
            setLoadingPreview(null);
        }
    }, [projectId, schemaId, onPreviewVersion, previewingVersionId]);

    // ── Create version ───────────────────────────────────────────

    // Use liveNodes/liveEdges (pre-preview state) when available, otherwise fall back to nodes/edges
    const effectiveLiveNodes = liveNodes ?? nodes;
    const effectiveLiveEdges = liveEdges ?? edges;

    const { currentModel, currentStoredNodes, currentStoredEdges } = useMemo(() => {
        let sNodes: unknown[];
        let sEdges: unknown[];
        if (isLogical) {
            sNodes = mapLogicalReactToStored(effectiveLiveNodes);
            sEdges = mapLogicalEdgesReactToStored(effectiveLiveEdges, effectiveLiveNodes);
        } else if (isPhysical) {
            sNodes = mapPhysicalReactToStored(effectiveLiveNodes);
            sEdges = mapPhysicalEdgesReactToStored(effectiveLiveEdges, effectiveLiveNodes);
        } else {
            sNodes = mapConceptualReactToStored(effectiveLiveNodes);
            sEdges = mapConceptualEdgesReactToStored(effectiveLiveEdges, effectiveLiveNodes);
        }
        const model = isPhysical
            ? buildPhysicalModel({ storedNodes: sNodes as StoredPhysicalNode[], storedEdges: sEdges as StoredPhysicalDiagramEdge[], schemaId: schemaId ?? undefined, schemaName, diagramName })
            : null;
        return { currentModel: model, currentStoredNodes: sNodes, currentStoredEdges: sEdges };
    }, [effectiveLiveNodes, effectiveLiveEdges, schemaId, schemaName, diagramName, isPhysical, isLogical]);

    const handleCreateVersion = useCallback(async () => {
        if (!projectId || !schemaId) return;
        setCreating(true);
        try {
            await apiPost(PROXY_SCHEMA_VERSIONS(projectId, schemaId), {
                label: newLabel || undefined,
            });
            notificationProvider.open({ type: "success", message: "Version snapshot created" });
            setNewLabel("");
            await fetchVersions();
        } catch (err) {
            notificationProvider.open({ type: "error", message: "Failed to create version" });
            console.error(err);
        } finally {
            setCreating(false);
        }
    }, [projectId, schemaId, newLabel, fetchVersions]);

    // ── Restore version ──────────────────────────────────────────

    const handleRestoreVersion = useCallback(async () => {
        if (!projectId || !schemaId || !previewingVersionId || !onRestoreVersion) return;
        setRestoring(true);
        try {
            const restoredVersion = versions.find(v => v.id === previewingVersionId);

            // Save the current (live) state as a snapshot first so it's not lost
            await apiPost(PROXY_SCHEMA_VERSIONS(projectId, schemaId), {
                label: `Before restore to v${restoredVersion?.version ?? "?"}`,
            });

            // Make the previewed state permanent in the parent
            onRestoreVersion();

            notificationProvider.open({ type: "success", message: "Version restored. A backup of your previous state was saved." });
            await fetchVersions();
        } catch (err) {
            notificationProvider.open({ type: "error", message: "Failed to restore version" });
            console.error(err);
        } finally {
            setRestoring(false);
        }
    }, [projectId, schemaId, previewingVersionId, onRestoreVersion, versions, fetchVersions]);

    // ── Compare ──────────────────────────────────────────────────

    const handleCompare = useCallback(async () => {
        if (!projectId || !schemaId || !compareFrom || !compareTo) return;
        setComparing(true);
        try {
            const cacheBuster = `?t=${Date.now()}`;

            const loadVersion = async (id: string): Promise<{ model: PhysicalModelPayload | null; summary: VersionSummary; diagram?: { nodes: unknown[]; edges: unknown[] } | null }> => {
                if (id === "__current__") {
                    return {
                        model: currentModel,
                        summary: { id: "__current__", version: 0, label: "Current (live)", createdBy: "", createdAt: new Date().toISOString() },
                        diagram: { nodes: currentStoredNodes, edges: currentStoredEdges },
                    };
                }
                const detail = await apiGet<VersionDetail>(PROXY_SCHEMA_VERSION_DETAIL(projectId, schemaId, id) + cacheBuster);
                if (!detail) throw new Error("Could not load version data");
                const summary = versions.find((v) => v.id === id)!;
                const diag = unwrapDiagram(detail.diagram);
                return { model: detail.model ?? null, summary, diagram: diag };
            };

            const [from, to] = await Promise.all([loadVersion(compareFrom), loadVersion(compareTo)]);
            const diff = (isPhysical && from.model && to.model) ? diffSchemas(from.model, to.model) : null;
            setDiffResult({
                diff: diff ?? { tableChanges: [], columnChanges: [], constraintChanges: [], indexChanges: [], hasChanges: false, summary: "" },
                oldModel: from.model ?? { model: { id: "", name: "", version: 0 }, tables: [] },
                newModel: to.model ?? { model: { id: "", name: "", version: 0 }, tables: [] },
                fromVersion: from.summary,
                toVersion: to.summary,
                fromDiagram: from.diagram,
                toDiagram: to.diagram,
            });
            setDiffView("diagram");
            setDiagramsReady({ from: false, to: false });
        } catch (err) {
            notificationProvider.open({ type: "error", message: "Failed to compare versions" });
            console.error(err);
            setComparing(false);
        }
    }, [projectId, schemaId, compareFrom, compareTo, versions, currentModel, currentStoredNodes, currentStoredEdges]);

    // ── DDL diff ─────────────────────────────────────────────────

    const ddlDiff = useMemo(() => {
        if (!diffResult) return null;
        const opts = { ...DEFAULT_DDL_OPTIONS, dbms };
        const oldDDL = generateDDL(diffResult.oldModel, opts);
        const newDDL = generateDDL(diffResult.newModel, opts);
        return { old: oldDDL.sql, new: newDDL.sql };
    }, [diffResult, dbms]);

    // ── Migration ────────────────────────────────────────────────

    const migrationResult: MigrationResult | null = useMemo(() => {
        if (!diffResult) return null;
        return generateMigration(diffResult.diff, {
            dbms,
            oldModel: diffResult.oldModel,
            newModel: diffResult.newModel,
            versionFrom: diffResult.fromVersion.version,
            versionTo: diffResult.toVersion.version,
        });
    }, [diffResult, dbms]);

    // ── Copy / Download ──────────────────────────────────────────

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            notificationProvider.open({ type: "success", message: "Copied to clipboard" });
        });
    }, []);

    const handleDownload = useCallback((text: string, filename: string) => {
        const blob = new Blob([text], { type: "text/sql;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    // ── Select options ───────────────────────────────────────────

    const versionOptions = useMemo(
        () => [
            { label: "Current (live)", value: "__current__" },
            ...versions.map((v) => ({ label: v.label || `v${v.version}`, value: v.id })),
        ],
        [versions],
    );

    // ── Render helpers ──────────────────────────────────────────

    const drawerWidth = diffResult ? (diffView === "diagram" ? "90vw" : 1100) : 420;

    const renderLeftPanel = () => (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* ── Create Snapshot ────────────────────── */}
            <div className="mb-5 border border-gray-200 rounded-lg p-3">
                <div className="text-sm font-medium mb-2">Create Snapshot</div>
                <div className="flex gap-2">
                    <Input
                        placeholder="Label (optional)"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onPressEnter={handleCreateVersion}
                        className="flex-1 !h-8"
                    />
                    <Button
                        type="primary"
                        icon={<Plus size={14} />}
                        loading={creating}
                        onClick={handleCreateVersion}
                        disabled={!projectId || !schemaId}
                        className="!h-8"
                    >
                        Snapshot
                    </Button>
                </div>
            </div>

            {/* ── Timeline ──────────────────────────── */}
            <div className="mb-5 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Versions</span>
                    {previewingVersionId && (
                        <div className="flex items-center gap-2">
                            <Button
                                size="small"
                                type="primary"
                                icon={<RotateCcw size={12} />}
                                loading={restoring}
                                onClick={handleRestoreVersion}
                                className="text-xs"
                            >
                                Restore
                            </Button>
                            <Button size="small" type="link" onClick={onExitPreview} className="text-xs !px-0">
                                Exit preview
                            </Button>
                        </div>
                    )}
                </div>
                {loading ? (
                    <div className="py-4 px-2">
                        <Skeleton active paragraph={{ rows: 4, width: ['60%', '80%', '50%', '70%'] }} title={false} />
                    </div>
                ) : (
                    <div className="overflow-y-auto flex-1 min-h-0 pr-1 pl-1">
                        <div className="relative pl-7 flex flex-col gap-1">
                            {/* Timeline line */}
                            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />

                            {/* Current (live) entry */}
                            {(() => {
                                const isCurrent = !previewingVersionId;
                                return (
                                    <div
                                        className={`relative py-2 px-2 rounded-md transition-colors flex ${
                                            isCurrent
                                                ? "bg-blue-50"
                                                : "hover:bg-gray-50 cursor-pointer"
                                        }`}
                                        onClick={() => {
                                            if (!isCurrent && onExitPreview) onExitPreview();
                                        }}
                                    >
                                        {/* Dot */}
                                        <div
                                            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white ${
                                                isCurrent
                                                    ? "bg-blue-500 ring-2 ring-blue-200"
                                                    : "bg-green-500"
                                            }`}
                                            style={{ zIndex: 1, left: "-22px" }}
                                        />
                                        {/* Content */}
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            <Tag
                                                color={isCurrent ? "blue" : "green"}
                                                className="text-[11px] leading-none shrink-0"
                                                style={{ marginRight: 0 }}
                                            >
                                                Current
                                            </Tag>
                                            <span className="text-xs font-medium truncate text-gray-500">Live</span>
                                            <span className="flex-1" />
                                            {isCurrent && (
                                                <Tag color="geekblue" className="shrink-0 text-[10px] leading-none" style={{ marginRight: 0 }}>
                                                    viewing
                                                </Tag>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            {versions.map((v) => {
                                const isPreviewing = previewingVersionId === v.id;
                                const isLoadingThis = loadingPreview === v.id;
                                return (
                                    <div
                                        key={v.id}
                                        className={`relative py-2 px-2 rounded-md cursor-pointer transition-colors flex ${
                                            isPreviewing
                                                ? "bg-blue-50"
                                                : "hover:bg-gray-50"
                                        }`}
                                        onClick={() => handlePreviewClick(v)}
                                    >
                                        {/* Dot */}
                                        <div
                                            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white ${
                                                isPreviewing
                                                    ? "bg-blue-500 ring-2 ring-blue-200"
                                                    : "bg-gray-300"
                                            }`}
                                            style={{ zIndex: 1, left: "-22px" }}
                                        />
                                        {/* Content */}
                                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <Tag
                                                    color={isPreviewing ? "blue" : "default"}
                                                    className="text-[11px] leading-none shrink-0"
                                                    style={{ marginRight: 0 }}
                                                >
                                                    v{v.version}
                                                </Tag>
                                                {v.label && <span className="text-xs font-medium truncate">{v.label}</span>}
                                                <span className="flex-1" />
                                                {isLoadingThis && <Skeleton.Button active size="small" style={{ width: 40, height: 16, minWidth: 40 }} />}
                                                {isPreviewing && !isLoadingThis && (
                                                    <Tag color="geekblue" className="shrink-0 text-[10px] leading-none" style={{ marginRight: 0 }}>
                                                        viewing
                                                    </Tag>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-gray-400">{formatDate(v.createdAt)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Compare Controls ───────────────────── */}
            {versions.length >= 1 && (
                <div className="border border-gray-200 rounded-lg p-3 shrink-0">
                    <div className="text-sm font-medium mb-2">Compare</div>
                    <div className="flex items-center gap-1.5 mb-2">
                        <Select
                            placeholder="From"
                            value={compareFrom}
                            onChange={setCompareFrom}
                            options={versionOptions}
                            className="flex-1"
                            size="middle"
                        />
                        <span className="text-xs text-gray-400 shrink-0">→</span>
                        <Select
                            placeholder="To"
                            value={compareTo}
                            onChange={setCompareTo}
                            options={versionOptions}
                            className="flex-1"
                            size="middle"
                        />
                    </div>
                    <Button
                        icon={<GitCompare size={14} />}
                        onClick={handleCompare}
                        loading={comparing}
                        disabled={!compareFrom || !compareTo || compareFrom === compareTo}
                        block
                        className="!h-8"
                    >
                        Compare
                    </Button>
                </div>
            )}
        </div>
    );

    const renderDiffPanel = () => {
        if (!diffResult) return null;
        return (
            <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
                {/* Back + Tabs + DBMS */}
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap shrink-0">
                    <div className="flex items-center gap-2">
                        <Button
                            type="text"
                            icon={<ArrowLeft size={16} />}
                            onClick={() => setDiffResult(null)}
                            className="!px-2 !h-8"
                        >
                            Back
                        </Button>
                        <Segmented
                        value={diffView}
                        onChange={(val) => setDiffView(val as DiffView)}
                        options={isPhysical ? [
                            { label: "Diagram", value: "diagram" },
                            { label: "DDL Diff", value: "ddl" },
                            { label: "Migration", value: "migration" },
                        ] : [
                            { label: "Diagram", value: "diagram" },
                        ]}
                        size="small"
                    />
                    </div>
                    {isPhysical && (diffView === "ddl" || diffView === "migration") && (
                        <Select
                            value={dbms}
                            onChange={setDbms}
                            options={DBMS_OPTIONS}
                            style={{ width: 130 }}
                            size="small"
                        />
                    )}
                </div>

                {/* Content area — fills remaining height */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Diagram Diff — visual split view */}
                    {diffView === "diagram" && (() => {
                        let addedTableNames: Set<string>;
                        let removedTableNames: Set<string>;
                        let modifiedTableNames: Set<string>;

                        if (isPhysical) {
                            addedTableNames = new Set(diffResult.diff.tableChanges.filter(tc => tc.type === "CREATE_TABLE").map(tc => tc.table.name));
                            removedTableNames = new Set(diffResult.diff.tableChanges.filter(tc => tc.type === "DROP_TABLE").map(tc => tc.table.name));
                            modifiedTableNames = new Set<string>();
                            for (const cc of diffResult.diff.columnChanges) modifiedTableNames.add(cc.tableName);
                            for (const cc of diffResult.diff.constraintChanges) modifiedTableNames.add(cc.tableName);
                            for (const ic of diffResult.diff.indexChanges) modifiedTableNames.add(ic.tableName);
                        } else {
                            const diagramDiff = computeDiagramDiff(
                                diffResult.fromDiagram?.nodes ?? [],
                                diffResult.toDiagram?.nodes ?? [],
                            );
                            addedTableNames = diagramDiff.added;
                            removedTableNames = diagramDiff.removed;
                            modifiedTableNames = diagramDiff.modified;
                        }

                        const isConceptual = !isPhysical && !isLogical;
                        const applyDiffStyles = (reactNodes: Node<NodeData>[], side: "from" | "to"): Node<NodeData>[] => {
                            return reactNodes.map((node) => {
                                const tableName = (node.data as { name?: string })?.name ?? "";
                                let borderColor = "";
                                let bgColor = "";
                                let opacity = 1;
                                if (side === "to" && addedTableNames.has(tableName)) {
                                    borderColor = "#22c55e"; bgColor = "rgba(34,197,94,0.08)";
                                } else if (side === "from" && removedTableNames.has(tableName)) {
                                    borderColor = "#ef4444"; bgColor = "rgba(239,68,68,0.08)";
                                } else if (modifiedTableNames.has(tableName)) {
                                    borderColor = "#eab308"; bgColor = "rgba(234,179,8,0.08)";
                                } else {
                                    opacity = 0.85;
                                }

                                // Conceptual nodes use SVG shapes (diamond, ellipse, circle),
                                // so use drop-shadow filter to highlight the actual shape contour
                                // instead of a rectangular outline.
                                const diffStyle: React.CSSProperties = borderColor
                                    ? { filter: `drop-shadow(0 0 3px ${borderColor}) drop-shadow(0 0 1px ${borderColor})` }
                                    : {};

                                return {
                                    ...node,
                                    style: {
                                        ...node.style,
                                        ...diffStyle,
                                        opacity,
                                    },
                                };
                            });
                        };

                        const fromNodes = diffResult.fromDiagram?.nodes
                            ? applyDiffStyles(
                                isLogical
                                    ? mapLogicalStoredToReact(diffResult.fromDiagram.nodes as StoredLogicalNode[])
                                    : isPhysical
                                    ? mapPhysicalStoredToReact(diffResult.fromDiagram.nodes as StoredPhysicalNode[])
                                    : mapConceptualStoredToReact(diffResult.fromDiagram.nodes as StoredDiagramNode[]),
                                "from",
                              )
                            : [];
                        const fromEdges = diffResult.fromDiagram?.edges
                            ? isLogical
                                ? mapLogicalEdgesStoredToReact(diffResult.fromDiagram.edges as StoredLogicalDiagramEdge[], fromNodes)
                                : isPhysical
                                ? mapPhysicalEdgesStoredToReact(diffResult.fromDiagram.edges as StoredPhysicalDiagramEdge[], fromNodes)
                                : mapConceptualEdgesStoredToReact(diffResult.fromDiagram.edges as StoredDiagramEdge[], fromNodes)
                            : [];
                        const toNodes = diffResult.toDiagram?.nodes
                            ? applyDiffStyles(
                                isLogical
                                    ? mapLogicalStoredToReact(diffResult.toDiagram.nodes as StoredLogicalNode[])
                                    : isPhysical
                                    ? mapPhysicalStoredToReact(diffResult.toDiagram.nodes as StoredPhysicalNode[])
                                    : mapConceptualStoredToReact(diffResult.toDiagram.nodes as StoredDiagramNode[]),
                                "to",
                              )
                            : [];
                        const toEdges = diffResult.toDiagram?.edges
                            ? isLogical
                                ? mapLogicalEdgesStoredToReact(diffResult.toDiagram.edges as StoredLogicalDiagramEdge[], toNodes)
                                : isPhysical
                                ? mapPhysicalEdgesStoredToReact(diffResult.toDiagram.edges as StoredPhysicalDiagramEdge[], toNodes)
                                : mapConceptualEdgesStoredToReact(diffResult.toDiagram.edges as StoredDiagramEdge[], toNodes)
                            : [];

                        const miniNodeTypes: NodeTypes = isLogical
                            ? { "logical-table": LogicalTableNode as unknown as NodeTypes[string] }
                            : isPhysical
                            ? { relation: RelationTableNode }
                            : { relationship: RelationshipNode, attribute: AttributeNode, entity: EntityNode, constraint: ConstraintNode };
                        const miniEdgeTypes: EdgeTypes = isLogical
                            ? { "logical-table-edge": LogicalTableEdge }
                            : isPhysical
                            ? { "relation-table-edge": RelationTableEdge }
                            : { "erd-edge": ErdEdge };

                        const hasBothDiagrams = fromNodes.length > 0 && toNodes.length > 0;
                        const hasNoDiagrams = fromNodes.length === 0 && toNodes.length === 0;
                        const showLoading = comparing && !hasNoDiagrams;

                        // If no diagrams at all, turn off loading immediately
                        if (hasNoDiagrams && comparing) {
                            setTimeout(() => setComparing(false), 0);
                        }
                        // If only one side has diagrams, that side's onInit will handle it

                        return (
                            <div className="flex flex-col h-full gap-2 relative">
                                {/* Loading overlay — shown until diagrams have rendered */}
                                {showLoading && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-lg">
                                        <Skeleton active paragraph={{ rows: 6 }} title={false} style={{ width: 300 }} />
                                    </div>
                                )}
                                {/* Legend */}
                                <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-500" /> Added</span>
                                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-500" /> Removed</span>
                                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-500" /> Modified</span>
                                </div>

                                {/* Split panels */}
                                <div className="flex-1 min-h-0 flex gap-3">
                                    {/* FROM */}
                                    <div className="flex-1 min-w-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 border-b border-gray-200 shrink-0">
                                            {diffResult.fromVersion.label || `v${diffResult.fromVersion.version}`}
                                        </div>
                                        <div className="flex-1 min-h-0">
                                            {fromNodes.length > 0 ? (
                                                <ReactFlowProvider>
                                                    <ReactFlow
                                                        nodes={fromNodes}
                                                        edges={fromEdges}
                                                        nodeTypes={miniNodeTypes}
                                                        edgeTypes={miniEdgeTypes}
                                                        nodesDraggable={false}
                                                        nodesConnectable={false}
                                                        elementsSelectable={false}
                                                        panOnDrag
                                                        zoomOnScroll
                                                        fitView
                                                        fitViewOptions={{ padding: 0.05, maxZoom: 1 }}
                                                        minZoom={0.05}
                                                        proOptions={{ hideAttribution: true }}
                                                        onInit={(instance) => {
                                                            setTimeout(() => instance.fitView({ padding: 0.05, maxZoom: 1 }), 300);
                                                            setDiagramsReady((prev) => {
                                                                const next = { ...prev, from: true };
                                                                if (next.from && (next.to || toNodes.length === 0)) setComparing(false);
                                                                return next;
                                                            });
                                                        }}
                                                    >
                                                        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                                                    </ReactFlow>
                                                </ReactFlowProvider>
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-400 text-sm">No diagram snapshot</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* TO */}
                                    <div className="flex-1 min-w-0 flex flex-col border border-gray-200 rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 border-b border-gray-200 shrink-0">
                                            {diffResult.toVersion.label || `v${diffResult.toVersion.version}`}
                                        </div>
                                        <div className="flex-1 min-h-0">
                                            {toNodes.length > 0 ? (
                                                <ReactFlowProvider>
                                                    <ReactFlow
                                                        nodes={toNodes}
                                                        edges={toEdges}
                                                        nodeTypes={miniNodeTypes}
                                                        edgeTypes={miniEdgeTypes}
                                                        nodesDraggable={false}
                                                        nodesConnectable={false}
                                                        elementsSelectable={false}
                                                        panOnDrag
                                                        zoomOnScroll
                                                        fitView
                                                        fitViewOptions={{ padding: 0.05, maxZoom: 1 }}
                                                        minZoom={0.05}
                                                        proOptions={{ hideAttribution: true }}
                                                        onInit={(instance) => {
                                                            setTimeout(() => instance.fitView({ padding: 0.05, maxZoom: 1 }), 300);
                                                            setDiagramsReady((prev) => {
                                                                const next = { ...prev, to: true };
                                                                if (next.to && (next.from || fromNodes.length === 0)) setComparing(false);
                                                                return next;
                                                            });
                                                        }}
                                                    >
                                                        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                                                    </ReactFlow>
                                                </ReactFlowProvider>
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-400 text-sm">No diagram snapshot</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* DDL Diff */}
                    {diffView === "ddl" && ddlDiff && (
                        <div className="border border-gray-200 rounded-lg overflow-hidden h-full">
                            <LazyDiffEditor original={ddlDiff.old} modified={ddlDiff.new} language="sql" height="100%" />
                        </div>
                    )}

                    {/* Migration */}
                    {diffView === "migration" && migrationResult && (
                        <div className="flex flex-col h-full gap-2">
                            {/* Action bar */}
                            <div className="flex items-center justify-between shrink-0">
                                <span className="text-xs text-gray-500">
                                    {diffResult.fromVersion.label || `v${diffResult.fromVersion.version}`} → {diffResult.toVersion.label || `v${diffResult.toVersion.version}`}
                                </span>
                                <div className="flex gap-1">
                                    <Tooltip title="Copy UP">
                                        <Button size="small" type="text" icon={<Copy size={13} />} onClick={() => handleCopy(migrationResult.up)}>UP</Button>
                                    </Tooltip>
                                    <Tooltip title="Copy DOWN">
                                        <Button size="small" type="text" icon={<Copy size={13} />} onClick={() => handleCopy(migrationResult.down)}>DOWN</Button>
                                    </Tooltip>
                                    <Tooltip title="Download UP">
                                        <Button size="small" type="text" icon={<Download size={13} />} onClick={() => handleDownload(migrationResult.up, `migration_up_v${diffResult.fromVersion.version}_to_v${diffResult.toVersion.version}.sql`)} />
                                    </Tooltip>
                                    <Tooltip title="Download DOWN">
                                        <Button size="small" type="text" icon={<Download size={13} />} onClick={() => handleDownload(migrationResult.down, `migration_down_v${diffResult.toVersion.version}_to_v${diffResult.fromVersion.version}.sql`)} />
                                    </Tooltip>
                                </div>
                            </div>
                            {/* Side-by-side UP vs DOWN */}
                            <div className="flex-1 min-h-0 border border-gray-200 rounded-lg overflow-hidden">
                                <LazyDiffEditor
                                    original={migrationResult.up}
                                    modified={migrationResult.down}
                                    language="sql"
                                    height="100%"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Render ───────────────────────────────────────────────────

    return (
        <Drawer
            title="Version History"
            placement="right"
            width={drawerWidth}
            open={open}
            onClose={onClose}
            destroyOnHidden
            styles={{ body: { display: "flex", flexDirection: "row", padding: "16px 24px", height: "100%", overflow: "hidden" } }}
        >
            {diffResult ? renderDiffPanel() : renderLeftPanel()}
        </Drawer>
    );
};

export default VersionHistoryDrawer;
