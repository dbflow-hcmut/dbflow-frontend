import { Node, Viewport, Edge } from "reactflow";
import type { NodeData } from "../index";
import type { RelationTableData } from "@/components/erds-notations/relation-table";
import { generateDiagramId } from "./functions";

import type { FKAction } from "./dbms-config";

type RelationTableEdgeData = {
    label?: string;
    controlPoints?: Array<{ x: number; y: number }>;
    onDelete?: FKAction;
    onUpdate?: FKAction;
};

export const getViewportStorageKey = (schemaId?: string | null) =>
    schemaId ? `physicalDiagramViewport:${schemaId}` : null;

export const loadViewportFromStorage = (schemaId?: string | null) => {
    if (typeof window === "undefined") return null;
    const key = getViewportStorageKey(schemaId);
    if (!key) return null;
    try {
        const stored = window.localStorage.getItem(key);
        return stored ? (JSON.parse(stored) as Viewport) : null;
    } catch (error) {
        console.error("Failed to parse stored viewport:", error);
        return null;
    }
};

export const saveViewportToStorage = (nextViewport: Viewport, schemaId?: string | null) => {
    if (typeof window === "undefined") return;
    const key = getViewportStorageKey(schemaId);
    if (!key) return;
    try {
        window.localStorage.setItem(key, JSON.stringify(nextViewport));
    } catch (error) {
        console.error("Failed to store viewport:", error);
    }
};

type DiagramNodeStyle = {
    class?: string;
    stroke?: string | null;
    fill?: string | null;
    fontSize?: number;
    [key: string]: unknown;
};

export type StoredPhysicalDiagramNode = {
    id: string;
    type: "table" | "note" | "sticky-note" | "text-label" | "drawing-path" | string;
    position: { x: number; y: number };
    size: { w: number; h: number };
    zIndex?: number;
    style?: DiagramNodeStyle;
    name?: string;
    tableId?: string;
    columns?: Array<{
        columnId: string;
        label?: string;
        decorations?: {
            pk?: boolean;
            fk?: boolean;
            underline?: boolean;
            italic?: boolean;
        };
    }>;
    text?: string;
};

type PhysicalEdgeType = "fk" | "noteLink";

export type StoredPhysicalDiagramEdge = {
    id: string;
    type: PhysicalEdgeType;
    source: string;
    target: string;
    points?: Array<{ x: number; y: number }>;
    style?: DiagramNodeStyle;
    fkRef?: {
        tableId: string;
        foreignKeyIndex: number;
        sourceColumnName?: string; // Lưu column name để map lại handle
        targetColumnName?: string; // Lưu column name để map lại handle
        onDelete?: FKAction;
        onUpdate?: FKAction;
    };
    labels?: {
        text?: string;
        position?: { x: number; y: number };
    };
};

type LegacyStoredNode = {
    data?: NodeData;
};

export type StoredPhysicalNode = StoredPhysicalDiagramNode & LegacyStoredNode;

const NODE_SIZE_FALLBACKS: Record<string, { w: number; h: number }> = {
    relation: { w: 160, h: 120 },
    table: { w: 160, h: 120 },
    note: { w: 140, h: 90 },
    default: { w: 100, h: 50 },
};

const getStoredNodeSize = (node: Node<NodeData>) => {
    const parsedSize = getNodeSize(node.style);
    if (parsedSize) return parsedSize;
    const nodeType = node.type ?? "default";
    return NODE_SIZE_FALLBACKS[nodeType] ?? NODE_SIZE_FALLBACKS.default;
};

const parseSizeValue = (value: number | string | undefined): number | undefined => {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
};

const getNodeSize = (style: Node<NodeData>["style"]) => {
    if (!style) return undefined;
    const width = parseSizeValue(style.width as number | string | undefined);
    const height = parseSizeValue(style.height as number | string | undefined);
    if (typeof width === "number" && typeof height === "number") {
        return { w: width, h: height };
    }
    return undefined;
};

const sanitizeStyleForStorage = (
    style: Node<NodeData>["style"]
): DiagramNodeStyle | undefined => {
    const cleanedStyle = style ? { ...(style as Record<string, unknown>) } : {};

    if ("width" in cleanedStyle) delete cleanedStyle.width;
    if ("height" in cleanedStyle) delete cleanedStyle.height;

    return Object.keys(cleanedStyle).length > 0 ? (cleanedStyle as DiagramNodeStyle) : undefined;
};

const ensurePosition = (node: StoredPhysicalNode) => node.position ?? { x: 0, y: 0 };

const ensureStyle = (node: StoredPhysicalNode) =>
    node.size ? { width: node.size.w, height: node.size.h } : undefined;

const mapRelationNode = (node: StoredPhysicalNode): Node<RelationTableData> => {
    const dataSource = node.data as RelationTableData | undefined;

    // Prefer dataSource columns (full RelationColumn data), otherwise use empty array
    // node.columns is stored format and doesn't have full column info
    const columns = dataSource?.columns ?? [];

    return {
        id: node.tableId ?? node.id,
        type: "relation",
        position: ensurePosition(node),
        data: {
            name: node.name ?? dataSource?.name ?? node.tableId ?? node.id,
            columns,
            indexes: dataSource?.indexes,
        },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const mapNoteNode = (node: StoredPhysicalNode): Node<NodeData> => {
    return {
        id: node.id,
        type: "entity",
        position: ensurePosition(node),
        data: { name: node.name ?? node.id, fields: [] },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const ANNOTATION_NODE_TYPES = new Set(["sticky-note", "text-label", "drawing-path"]);

const mapStoredNodeToReactNode = (node: StoredPhysicalNode): Node<NodeData> => {
    // If node has tableId but no type, it's a table
    if (!node.type && node.tableId) {
        return mapRelationNode(node);
    }
    
    // Annotation nodes: preserve as-is
    if (ANNOTATION_NODE_TYPES.has(node.type)) {
        return {
            id: node.id,
            type: node.type,
            position: ensurePosition(node),
            data: (node.data ?? {}) as NodeData,
            style: ensureStyle(node),
            zIndex: node.zIndex,
        };
    }

    switch (node.type) {
        case "table":
            return mapRelationNode(node);
        case "note":
            return mapNoteNode(node);
        default:
            return mapRelationNode(node);
    }
};

export const mapStoredNodesToReactNodes = (storedNodes: StoredPhysicalNode[] = []): Node<NodeData>[] => {
    return storedNodes.map((node) => ({
        ...mapStoredNodeToReactNode(node),
        selected: false,
    }));
};

const mapReactRelationNode = (node: Node<RelationTableData>): StoredPhysicalNode => {
    const { name, columns = [], indexes } = node.data;

    // Map columns to stored format
    const storedColumns: StoredPhysicalDiagramNode["columns"] = columns.map((col, idx) => ({
        columnId: `pid_${node.id}_col_${idx}`,
        label: col.name,
        decorations: {
            pk: col.isPrimary ? true : undefined,
            fk: false, // Will be determined from edges
            underline: col.isPrimary ? true : undefined,
        },
    }));

    return {
        id: node.id,
        type: "table",
        position: node.position,
        size: getStoredNodeSize(node),
        zIndex: node.zIndex,
        name,
        tableId: node.id,
        columns: storedColumns.length > 0 ? storedColumns : undefined,
        style: sanitizeStyleForStorage(node.style),
        // Store full column data for model building
        data: {
            name,
            columns,
            ...(indexes && indexes.length > 0 ? { indexes } : {}),
        } as RelationTableData,
    };
};

const mapReactNodeToStoredNode = (node: Node<NodeData>): StoredPhysicalNode => {
    switch (node.type) {
        case "relation":
            return mapReactRelationNode(node as Node<RelationTableData>);
        default:
            return {
                id: node.id,
                type: ANNOTATION_NODE_TYPES.has(node.type!) ? node.type! : "table",
                position: node.position,
                size: getStoredNodeSize(node),
                zIndex: node.zIndex,
                data: node.data,
                style: sanitizeStyleForStorage(node.style),
            };
    }
};

export const mapReactNodesToStoredNodes = (reactNodes: Node<NodeData>[] = []): StoredPhysicalNode[] => {
    return reactNodes
        .filter((node) => node.type === "relation" || ANNOTATION_NODE_TYPES.has(node.type!))
        .map(mapReactNodeToStoredNode);
};

const mapReactEdgeToStoredEdge = (
    edge: Edge<RelationTableEdgeData>,
    nodeMap: Map<string, Node<NodeData>>
): StoredPhysicalDiagramEdge | null => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) {
        return null;
    }

    // Both nodes should be relation tables for FK edges
    if (sourceNode.type !== "relation" || targetNode.type !== "relation") {
        return null;
    }

    const sourceData = sourceNode.data as RelationTableData;
    const targetData = targetNode.data as RelationTableData;

    // Extract FK information from edge handles
    // Handle IDs are plain column names (no suffix) from relation-table component
    const sourceColumnName = edge.sourceHandle?.replace("-source", "")?.replace("-target", "") || "";
    const targetColumnName = edge.targetHandle?.replace("-target", "")?.replace("-source", "") || "";

    // Find the column indices
    const sourceColumnIndex = sourceData.columns?.findIndex((col) => col.name === sourceColumnName) ?? -1;
    const targetColumnIndex = targetData.columns?.findIndex((col) => col.name === targetColumnName) ?? -1;

    if (sourceColumnIndex === -1 || targetColumnIndex === -1) {
        return null;
    }

    // Extract control points from edge data
    const points = edge.data?.controlPoints?.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));

    const storedEdge: StoredPhysicalDiagramEdge = {
        id: edge.id || generateDiagramId(),
        type: "fk",
        source: edge.source,
        target: edge.target,
        points,
        style: sanitizeStyleForStorage(edge.style),
        fkRef: {
            tableId: sourceNode.id,
            foreignKeyIndex: sourceColumnIndex,
            sourceColumnName, // Lưu column name để map lại handle (giống conceptual lưu portId)
            targetColumnName, // Lưu column name để map lại handle
            onDelete: edge.data?.onDelete,
            onUpdate: edge.data?.onUpdate,
        },
        labels: edge.data?.label
            ? {
                  text: edge.data.label,
                  position: { x: 0, y: 0 }, // Will be calculated from control points
              }
            : undefined,
    };

    return storedEdge;
};

const isSchemaStoredEdge = (edge: unknown): edge is StoredPhysicalDiagramEdge => {
    if (!edge || typeof edge !== "object") return false;
    const candidate = edge as StoredPhysicalDiagramEdge;
    return (
        typeof candidate.id === "string" &&
        typeof candidate.type === "string" &&
        typeof candidate.source === "string" &&
        typeof candidate.target === "string"
    );
};

const mapSchemaEdgeToReactEdge = (
    edge: StoredPhysicalDiagramEdge,
    nodeMap: Map<string, Node<NodeData>>
): Edge<RelationTableEdgeData> | null => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
        return null;
    }

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode || sourceNode.type !== "relation" || targetNode.type !== "relation") {
        return null;
    }

    const sourceData = sourceNode.data as RelationTableData;
    const targetData = targetNode.data as RelationTableData;

    // Determine source and target handles from FK reference
    // Handle IDs on relation-table component are just col.name (NO suffix)
    let sourceHandle: string | undefined;
    let targetHandle: string | undefined;

    if (edge.fkRef) {
        // Source: prefer stored sourceColumnName, fallback to index lookup
        if (edge.fkRef.sourceColumnName) {
            sourceHandle = edge.fkRef.sourceColumnName;
        } else {
            const fkColumn = sourceData.columns?.[edge.fkRef.foreignKeyIndex];
            if (fkColumn) {
                sourceHandle = fkColumn.name;
            }
        }
        // Target: prefer stored targetColumnName, fallback to PK lookup
        if (edge.fkRef.targetColumnName) {
            targetHandle = edge.fkRef.targetColumnName;
        } else {
            const pkColumn = targetData.columns?.find((col) => col.isPrimary);
            if (pkColumn) {
                targetHandle = pkColumn.name;
            }
        }
    }

    const data: RelationTableEdgeData = {
        label: edge.labels?.text,
        controlPoints: edge.points?.map((p) => ({ x: p.x, y: p.y })),
        onDelete: edge.fkRef?.onDelete,
        onUpdate: edge.fkRef?.onUpdate,
    };

    const reactEdge: Edge<RelationTableEdgeData> = {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "relation-table-edge",
        data,
        ...(sourceHandle ? { sourceHandle } : {}),
        ...(targetHandle ? { targetHandle } : {}),
    };

    return reactEdge;
};

export const mapReactEdgesToStoredEdges = (
    reactEdges: Edge<RelationTableEdgeData>[] = [],
    nodes: Node<NodeData>[] = []
): StoredPhysicalDiagramEdge[] => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return reactEdges
        .filter((edge) => edge.type === "relation-table-edge")
        .map((edge) => mapReactEdgeToStoredEdge(edge, nodeMap))
        .filter((edge): edge is StoredPhysicalDiagramEdge => Boolean(edge));
};

export const mapStoredEdgesToReactEdges = (
    storedEdges: (StoredPhysicalDiagramEdge | Edge)[] = [],
    nodes: Node<NodeData>[] = []
): Edge<RelationTableEdgeData>[] => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    return storedEdges
        .map((edge) => {
            if (isSchemaStoredEdge(edge)) {
                return mapSchemaEdgeToReactEdge(edge, nodeMap);
            }

            // Legacy edge format
            const legacyEdge = edge as Edge;
            if (!legacyEdge.source || !legacyEdge.target) return null;

            return {
                ...legacyEdge,
                type: "relation-table-edge",
                data: legacyEdge.data || {},
            };
        })
        .filter((edge): edge is Edge<RelationTableEdgeData> => Boolean(edge));
};
