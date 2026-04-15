import { Node, Viewport, Edge } from "reactflow";
import type { NodeData } from "../index";
import type { LogicalTableData } from "@/components/erds-notations/logical-table";
import { generateDiagramId } from "./functions";

type LogicalTableEdgeData = {
    label?: string;
    controlPoints?: Array<{ x: number; y: number }>;
    sourceCardinality?: '1' | 'N';
    targetCardinality?: '1' | 'N';
};

export const getViewportStorageKey = (schemaId?: string | null) =>
    schemaId ? `logicalDiagramViewport:${schemaId}` : null;

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

export type StoredLogicalDiagramNode = {
    id: string;
    type: "table" | "note";
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

type LogicalEdgeType = "fk" | "noteLink";

export type StoredLogicalDiagramEdge = {
    id: string;
    type: LogicalEdgeType;
    source: string; // columnId (format: lid_nodeId_col_index)
    target: string; // columnId (format: lid_nodeId_col_index)
    sourceSide?: "left" | "right"; // Which side of the column (left or right handle)
    targetSide?: "left" | "right"; // Which side of the column (left or right handle)
    points?: Array<{ x: number; y: number }>;
    style?: DiagramNodeStyle;
    fkRef?: {
        tableId: string;
        foreignKeyIndex: number;
    };
    labels?: {
        text?: string;
        position?: { x: number; y: number };
    };
    sourceCardinality?: '1' | 'N';
    targetCardinality?: '1' | 'N';
};

type LegacyStoredNode = {
    data?: NodeData;
};

export type StoredLogicalNode = StoredLogicalDiagramNode & LegacyStoredNode;

const NODE_SIZE_FALLBACKS: Record<string, { w: number; h: number }> = {
    "logical-table": { w: 200, h: 120 },
    table: { w: 200, h: 120 },
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

const ensurePosition = (node: StoredLogicalNode) => node.position ?? { x: 0, y: 0 };

const ensureStyle = (node: StoredLogicalNode) =>
    node.size ? { width: node.size.w, height: node.size.h } : undefined;

const mapLogicalTableNode = (node: StoredLogicalNode): Node<LogicalTableData> => {
    const dataSource = node.data as LogicalTableData | undefined;
    
    // Prefer dataSource columns (full LogicalColumn data), otherwise use stored columns
    const columns = dataSource?.columns ?? (node.columns?.map(col => ({
        name: col.label || col.columnId,
        isKey: col.decorations?.pk || false,
    })) || []);
    
    return {
        id: node.tableId ?? node.id,
        type: "logical-table",
        position: ensurePosition(node),
        data: {
            name: node.name ?? dataSource?.name ?? node.tableId ?? node.id,
            columns,
        },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const mapNoteNode = (node: StoredLogicalNode): Node<NodeData> => {
    return {
        id: node.id,
        type: "entity",
        position: ensurePosition(node),
        data: { name: node.name ?? node.id, fields: [] },
        style: ensureStyle(node),
        zIndex: node.zIndex,
    };
};

const mapStoredNodeToReactNode = (node: StoredLogicalNode): Node<NodeData> => {
    // If node has tableId but no type, it's a table
    if (!node.type && node.tableId) {
        return mapLogicalTableNode(node);
    }
    
    switch (node.type) {
        case "table":
            return mapLogicalTableNode(node);
        case "note":
            return mapNoteNode(node);
        default:
            return mapLogicalTableNode(node);
    }
};

export const mapStoredNodesToReactNodes = (storedNodes: StoredLogicalNode[] = []): Node<NodeData>[] => {
    return storedNodes.map((node) => ({
        ...mapStoredNodeToReactNode(node),
        selected: false,
    }));
};

const mapReactLogicalTableNode = (node: Node<LogicalTableData>): StoredLogicalNode => {
    const { name, columns = [] } = node.data;

    // Map columns to stored format (following docs schema)
    const storedColumns: StoredLogicalDiagramNode["columns"] = columns.map((col, idx) => ({
        columnId: `lid_${node.id}_col_${idx}`,
        label: col.name,
        decorations: {
            pk: col.isKey ? true : undefined,
            underline: col.isKey ? true : undefined,
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
        } as LogicalTableData,
    };
};

const mapReactNodeToStoredNode = (node: Node<NodeData>): StoredLogicalNode => {
    switch (node.type) {
        case "logical-table":
            return mapReactLogicalTableNode(node as Node<LogicalTableData>);
        default:
            return {
                id: node.id,
                type: "table",
                position: node.position,
                size: getStoredNodeSize(node),
                zIndex: node.zIndex,
                data: node.data,
                style: sanitizeStyleForStorage(node.style),
            };
    }
};

export const mapReactNodesToStoredNodes = (reactNodes: Node<NodeData>[] = []): StoredLogicalNode[] => {
    return reactNodes
        .filter((node) => node.type === "logical-table")
        .map(mapReactNodeToStoredNode);
};

const mapReactEdgeToStoredEdge = (
    edge: Edge<LogicalTableEdgeData>,
    nodeMap: Map<string, Node<NodeData>>
): StoredLogicalDiagramEdge | null => {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) {
        return null;
    }

    // Both nodes should be logical tables for FK edges
    if (sourceNode.type !== "logical-table" || targetNode.type !== "logical-table") {
        return null;
    }

    // Extract columnId and side from edge handles
    // Handle format: "{columnId}-{side}"
    // Example: "lid_cid_3b6a8e47-8ab9-44ec-9278-475dbbff890a_col_0-left"
    const extractHandleInfo = (handle: string | null | undefined, fallbackNodeId: string): { columnId: string; side: "left" | "right" } => {
        if (handle) {
            // Match pattern: (columnId)-(left|right) where columnId is lid_..._col_\d+
            const match = handle.match(/^(lid_.+_col_\d+)-(left|right)$/);
            if (match) {
                return { 
                    columnId: match[1], 
                    side: match[2] as "left" | "right" 
                };
            }
        }
        // Fallback: first column of the node
        return {
            columnId: `lid_${fallbackNodeId}_col_0`,
            side: "right",
        };
    };

    const sourceHandleInfo = extractHandleInfo(edge.sourceHandle, edge.source);
    const targetHandleInfo = extractHandleInfo(edge.targetHandle, edge.target);

    // Extract column index from columnId for fkRef
    const extractColumnIndex = (columnId: string): number => {
        const match = columnId.match(/_col_(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    };

    const sourceColumnIndex = extractColumnIndex(sourceHandleInfo.columnId);

    // Extract control points from edge data
    const points = edge.data?.controlPoints?.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));

    const storedEdge: StoredLogicalDiagramEdge = {
        id: edge.id || generateDiagramId(),
        type: "fk",
        source: sourceHandleInfo.columnId,
        target: targetHandleInfo.columnId,
        sourceSide: sourceHandleInfo.side,
        targetSide: targetHandleInfo.side,
        points,
        style: sanitizeStyleForStorage(edge.style),
        fkRef: {
            tableId: sourceNode.id,
            foreignKeyIndex: sourceColumnIndex,
        },
        labels: edge.data?.label
            ? {
                  text: edge.data.label,
                  position: { x: 0, y: 0 },
              }
            : undefined,
        sourceCardinality: edge.data?.sourceCardinality,
        targetCardinality: edge.data?.targetCardinality,
    };

    return storedEdge;
};

const isSchemaStoredEdge = (edge: unknown): edge is StoredLogicalDiagramEdge => {
    if (!edge || typeof edge !== "object") return false;
    const candidate = edge as StoredLogicalDiagramEdge;
    // Stored edges have type "fk" or "noteLink" and source is a columnId (lid_xxx_col_N)
    // React edges have type "logical-table-edge" and source is a nodeId
    return (
        typeof candidate.id === "string" &&
        typeof candidate.type === "string" &&
        (candidate.type === "fk" || candidate.type === "noteLink") &&
        typeof candidate.source === "string" &&
        typeof candidate.target === "string"
    );
};

const mapSchemaEdgeToReactEdge = (
    edge: StoredLogicalDiagramEdge,
    nodeMap: Map<string, Node<NodeData>>
): Edge<LogicalTableEdgeData> | null => {
    // Extract nodeId from columnId
    // Format: lid_nodeId_col_index where nodeId can be cid_uuid or lid_uuid
    // Example: lid_cid_3b6a8e47-8ab9-44ec-9278-475dbbff890a_col_0
    // Need to extract: nodeId = cid_3b6a8e47-8ab9-44ec-9278-475dbbff890a
    const extractNodeIdFromColumnId = (columnId: string): string | null => {
        // Pattern: lid_(nodeId)_col_\d+
        const match = columnId.match(/^lid_(.+)_col_\d+$/);
        return match ? match[1] : null;
    };

    const sourceNodeId = extractNodeIdFromColumnId(edge.source);
    const targetNodeId = extractNodeIdFromColumnId(edge.target);

    if (!sourceNodeId || !targetNodeId) {
        console.warn('[Logical] Failed to extract nodeIds from columnIds:', { 
            source: edge.source, 
            target: edge.target
        });
        return null;
    }

    if (!nodeMap.has(sourceNodeId) || !nodeMap.has(targetNodeId)) {
        console.warn('[Logical] Nodes not found in nodeMap:', { 
            sourceNodeId, 
            targetNodeId,
            availableNodes: Array.from(nodeMap.keys())
        });
        return null;
    }

    const sourceNode = nodeMap.get(sourceNodeId);
    const targetNode = nodeMap.get(targetNodeId);
    if (!sourceNode || !targetNode || sourceNode.type !== "logical-table" || targetNode.type !== "logical-table") {
        console.warn('[Logical] Invalid node types:', { 
            sourceType: sourceNode?.type, 
            targetType: targetNode?.type 
        });
        return null;
    }

    // Build handles using columnId and side
    // Handle format: {columnId}-{side}
    // Example: lid_cid_3b6a8e47-8ab9-44ec-9278-475dbbff890a_col_0-left
    const sourceHandle = edge.sourceSide ? `${edge.source}-${edge.sourceSide}` : undefined;
    const targetHandle = edge.targetSide ? `${edge.target}-${edge.targetSide}` : undefined;

    const data: LogicalTableEdgeData = {
        label: edge.labels?.text,
        controlPoints: edge.points?.map((p) => ({ x: p.x, y: p.y })),
        sourceCardinality: edge.sourceCardinality || 'N',
        targetCardinality: edge.targetCardinality || '1',
    };

    const reactEdge: Edge<LogicalTableEdgeData> = {
        id: edge.id,
        source: sourceNodeId, // Use nodeId for ReactFlow
        target: targetNodeId, // Use nodeId for ReactFlow
        type: "logical-table-edge",
        data,
        ...(sourceHandle ? { sourceHandle } : {}),
        ...(targetHandle ? { targetHandle } : {}),
    };

    console.log('[Logical] Created reactEdge:', {
        id: reactEdge.id,
        source: reactEdge.source,
        target: reactEdge.target,
        sourceHandle: reactEdge.sourceHandle,
        targetHandle: reactEdge.targetHandle,
    });

    return reactEdge;
};

export const mapReactEdgesToStoredEdges = (
    reactEdges: Edge<LogicalTableEdgeData>[] = [],
    nodes: Node<NodeData>[] = []
): StoredLogicalDiagramEdge[] => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return reactEdges
        .filter((edge) => edge.type === "logical-table-edge")
        .map((edge) => mapReactEdgeToStoredEdge(edge, nodeMap))
        .filter((edge): edge is StoredLogicalDiagramEdge => Boolean(edge));
};

export const mapStoredEdgesToReactEdges = (
    storedEdges: (StoredLogicalDiagramEdge | Edge)[] = [],
    nodes: Node<NodeData>[] = []
): Edge<LogicalTableEdgeData>[] => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    return storedEdges
        .map((edge) => {
            if (isSchemaStoredEdge(edge)) {
                return mapSchemaEdgeToReactEdge(edge, nodeMap);
            }

            // Legacy/React edge format — preserve as-is with correct type
            const legacyEdge = edge as Edge;
            if (!legacyEdge.source || !legacyEdge.target) return null;

            return {
                ...legacyEdge,
                type: "logical-table-edge",
                selected: false,
                data: legacyEdge.data || {},
            };
        })
        .filter((edge): edge is Edge<LogicalTableEdgeData> => Boolean(edge));
};

