import type { StoredLogicalDiagramEdge, StoredLogicalDiagramNode, StoredLogicalNode } from "./logical-diagram.builder";
import type { NodeData } from "../index";
import { computeELKTableLayout, type LayoutTable } from "./auto-layout";

const generateLid = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `lid_${crypto.randomUUID()}`;
    }
    const randomSuffix = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `lid_${randomSuffix}`;
};

type ModelColumn = {
    id: string;
    name: string;
    nullable: boolean;
    unique: boolean;
    roles?: {
        primaryKey?: boolean;
        foreignKey?: {
            refTableId: string;
            refColumnId: string;
        };
        candidateKey?: boolean;
    };
    notes?: string;
};

type ModelTable = {
    id: string;
    name: string;
    columns: ModelColumn[];
    functionalDependencies?: ModelFunctionalDependency[];
    notes?: string;
};

type ModelFunctionalDependency = {
    id: string;
    name?: string;
    left: string[];
    right: string[];
    notes?: string;
};

export type LogicalModelPayload = {
    model: {
        id: string;
        name: string;
        version: number;
        notes?: string;
    };
    tables: ModelTable[];
};

type BuildLogicalModelParams = {
    storedNodes: StoredLogicalNode[];
    storedEdges: StoredLogicalDiagramEdge[];
    schemaId?: string;
    schemaName?: string;
    diagramName?: string;
};

const FALLBACK_MODEL_NAME = "Untitled logical model";

export const createEmptyLogicalModel = (modelId?: string, modelName?: string): LogicalModelPayload => ({
    model: {
        id: modelId ?? generateLid(),
        name: modelName ?? FALLBACK_MODEL_NAME,
        version: 1,
    },
    tables: [],
});

const buildLogicalModel = ({
    storedNodes,
    storedEdges,
    schemaId,
    schemaName,
    diagramName,
}: BuildLogicalModelParams): LogicalModelPayload => {
    const modelId = schemaId ?? generateLid();
    const modelName = schemaName ?? diagramName ?? FALLBACK_MODEL_NAME;

    if (!storedNodes.length) {
        return createEmptyLogicalModel(modelId, modelName);
    }

    // Filter only table nodes
    const tableNodes = storedNodes.filter((node) => node.type === "table" && node.tableId);

    // Build a map of table nodes by ID
    const tableNodeMap = new Map(tableNodes.map((node) => [node.tableId!, node]));

    // Build a map of FK relationships: tableId -> columnIndex -> { refTableId, refColumnId }
    const fkMap = new Map<string, Map<number, { refTableId: string; refColumnId: string }>>();

    // Helper to extract nodeId from columnId (lid_{nodeId}_col_N)
    const extractNodeIdFromColumnId = (columnId: string): string | null => {
        const match = columnId.match(/^lid_(.+)_col_\d+$/);
        return match ? match[1] : null;
    };

    storedEdges
        .filter((edge) => edge.type === "fk" && edge.fkRef)
        .forEach((edge) => {
            if (!edge.fkRef) return;

            const sourceTableId = edge.fkRef.tableId;
            const columnIndex = edge.fkRef.foreignKeyIndex;

            // edge.target is a columnId (lid_nodeId_col_N) — extract nodeId
            const targetNodeId = extractNodeIdFromColumnId(edge.target);
            if (!targetNodeId) return;

            const targetTableNode = tableNodeMap.get(targetNodeId);
            if (!targetTableNode) return;

            // Find key column in target table (pk decoration)
            const targetColumns = targetTableNode.columns || [];
            const keyColumn = targetColumns.find((col) => col.decorations?.pk);

            // Extract target column index from columnId
            const targetColMatch = edge.target.match(/_col_(\d+)$/);
            const targetColIdx = targetColMatch ? parseInt(targetColMatch[1], 10) : 0;
            const targetColId = keyColumn?.columnId ?? `lid_${targetNodeId}_col_${targetColIdx}`;

            if (!fkMap.has(sourceTableId)) {
                fkMap.set(sourceTableId, new Map());
            }
            fkMap.get(sourceTableId)!.set(columnIndex, {
                refTableId: targetNodeId,
                refColumnId: targetColId,
            });
        });

    // Build tables with columns
    // Get column data from stored node data (LogicalTableData)
    const tableDataMap = new Map<string, { name: string; columns: Array<{ name: string; isKey?: boolean }> }>();
    
    tableNodes.forEach((tableNode) => {
        if (tableNode.tableId) {
            // Get column data from node data (LogicalTableData)
            const nodeData = tableNode.data as { name?: string; columns?: Array<{ name: string; isKey?: boolean }> } | undefined;
            if (nodeData && nodeData.columns) {
                tableDataMap.set(tableNode.tableId, {
                    name: nodeData.name || tableNode.name || tableNode.tableId,
                    columns: nodeData.columns,
                });
            }
        }
    });

    const tables: ModelTable[] = tableNodes.map((tableNode) => {
        const tableId = tableNode.tableId!;
        const tableName = tableNode.name ?? tableId;

        // Get column data from tableDataMap or use stored columns
        const tableData = tableDataMap.get(tableId);
        const actualColumns = tableData?.columns || [];
        const storedColumns = tableNode.columns || [];

        // Build columns - prefer actual column data, fallback to stored columns
        const columns: ModelColumn[] = actualColumns.length > 0
            ? actualColumns.map((actualCol, idx) => {
                  const columnId = `lid_${tableId}_col_${idx}`;
                  const columnName = actualCol.name || `column_${idx}`;

                  // Check if this column is a foreign key
                  const fkInfo = fkMap.get(tableId)?.get(idx);
                  const isPrimaryKey = actualCol.isKey ?? false;

                  const column: ModelColumn = {
                      id: columnId,
                      name: columnName,
                      nullable: true, // Default to nullable for logical schema
                      unique: false,
                      roles: {
                          primaryKey: isPrimaryKey,
                          ...(fkInfo
                              ? {
                                    foreignKey: {
                                        refTableId: fkInfo.refTableId,
                                        refColumnId: fkInfo.refColumnId,
                                    },
                                }
                              : {}),
                      },
                  };

                  return column;
              })
            : storedColumns.map((storedCol, idx) => {
                  const columnId = storedCol.columnId || `lid_${tableId}_col_${idx}`;
                  const columnName = storedCol.label || storedCol.columnId || `column_${idx}`;

                  // Check if this column is a foreign key
                  const fkInfo = fkMap.get(tableId)?.get(idx);
                  const isPrimaryKey = storedCol.decorations?.pk ?? false;

                  const column: ModelColumn = {
                      id: columnId,
                      name: columnName,
                      nullable: true, // Default to nullable
                      unique: false,
                      roles: {
                          primaryKey: isPrimaryKey,
                          ...(fkInfo
                              ? {
                                    foreignKey: {
                                        refTableId: fkInfo.refTableId,
                                        refColumnId: fkInfo.refColumnId,
                                    },
                                }
                              : {}),
                      },
                  };

                  return column;
              });

        return {
            id: tableId,
            name: tableName,
            columns,
            functionalDependencies: [], // TODO: Extract from diagram if needed
            notes: undefined,
        };
    });

    return {
        model: {
            id: modelId,
            name: modelName,
            version: 1,
        },
        tables,
    };
};

export { buildLogicalModel };

// ═══════════════════════════════════════════════════════════════════════════════
// Reverse builder: LogicalModelPayload → StoredLogicalNode[] + StoredLogicalDiagramEdge[]
// ═══════════════════════════════════════════════════════════════════════════════

const TABLE_LAYOUT = {
    tableSize: { w: 200, h: 120 },
    gridGapX: 300,
    gridGapY: 250,
    gridCols: 4,
    headerHeight: 36,
    rowHeight: 32,
    minHeight: 100,
} as const;

type PositionMap = Map<string, { x: number; y: number }>;
type SizeMap = Map<string, { w: number; h: number }>;

const buildLogicalPositionLookup = (nodes?: StoredLogicalNode[]): PositionMap => {
    const lookup: PositionMap = new Map();
    if (!nodes) return lookup;
    for (const n of nodes) {
        if (!n.position) continue;
        lookup.set(n.id, n.position);
        if (n.tableId && n.tableId !== n.id) lookup.set(n.tableId, n.position);
    }
    return lookup;
};

const buildLogicalSizeLookup = (nodes?: StoredLogicalNode[]): SizeMap => {
    const lookup: SizeMap = new Map();
    if (!nodes) return lookup;
    for (const n of nodes) {
        if (!n.size) continue;
        const key = n.tableId ?? n.id;
        lookup.set(key, n.size);
    }
    return lookup;
};

const computeTableSize = (columnCount: number): { w: number; h: number } => {
    const h = Math.max(
        TABLE_LAYOUT.minHeight,
        TABLE_LAYOUT.headerHeight + columnCount * TABLE_LAYOUT.rowHeight,
    );
    return { w: TABLE_LAYOUT.tableSize.w, h };
};

export type BuildDiagramFromLogicalModelParams = {
    model: LogicalModelPayload;
    existingNodes?: StoredLogicalNode[];
    existingEdges?: StoredLogicalDiagramEdge[];
    preserveUnmodeledNodes?: boolean;
};

export type MutateLogicalModelFn = (
    mutator: (model: LogicalModelPayload) => LogicalModelPayload,
    opts?: { selectedNodeId?: string; positionHint?: { x: number; y: number } },
) => void | Promise<void>;

/**
 * Converts a `LogicalModelPayload` back into stored diagram nodes & edges.
 *
 * When `existingNodes` is provided the function reuses positions of nodes
 * whose IDs match, so incremental AI edits preserve the user's layout.
 *
 * New tables are placed in a simple grid layout.
 */
export const buildDiagramFromLogicalModel = async ({
    model,
    existingNodes,
    existingEdges,
    preserveUnmodeledNodes = false,
}: BuildDiagramFromLogicalModelParams): Promise<{
    nodes: StoredLogicalNode[];
    edges: StoredLogicalDiagramEdge[];
}> => {
    const nodes: StoredLogicalNode[] = [];
    const edges: StoredLogicalDiagramEdge[] = [];
    const posLookup = buildLogicalPositionLookup(existingNodes);
    const sizeLookup = buildLogicalSizeLookup(existingNodes);

    // ── Pre-compute sizes & ELK layout for new tables ────────────────

    const tableSizes = new Map<string, { w: number; h: number }>();
    const newTableIds: string[] = [];
    for (const table of model.tables ?? []) {
        const existingSize = sizeLookup.get(table.id);
        const size = existingSize ?? computeTableSize(table.columns?.length ?? 0);
        tableSizes.set(table.id, size);
        if (!posLookup.has(table.id)) newTableIds.push(table.id);
    }

    let autoPositions = new Map<string, { x: number; y: number }>();
    if (newTableIds.length > 0) {
        const layoutTables: LayoutTable[] = (model.tables ?? [])
            .filter((t) => newTableIds.includes(t.id))
            .map((t) => ({
                id: t.id,
                size: tableSizes.get(t.id) ?? { w: 200, h: 120 },
                refIds: (t.columns ?? [])
                    .filter((c) => c.roles?.foreignKey?.refTableId)
                    .map((c) => c.roles!.foreignKey!.refTableId),
            }));
        autoPositions = await computeELKTableLayout(layoutTables);
    }

    // ── Tables ───────────────────────────────────────────────────────────

    for (const table of model.tables ?? []) {
        const existingPos = posLookup.get(table.id);
        const pos = existingPos ?? autoPositions.get(table.id) ?? { x: 0, y: 0 };

        const columnCount = table.columns?.length ?? 0;
        const computedSize = computeTableSize(columnCount);
        const existingSize = sizeLookup.get(table.id);
        const size = existingSize ?? computedSize;

        const storedColumns: StoredLogicalDiagramNode["columns"] = (table.columns ?? []).map(
            (col, idx) => ({
                columnId: `lid_${table.id}_col_${idx}`,
                label: col.name,
                decorations: {
                    pk: col.roles?.primaryKey ? true : undefined,
                    fk: col.roles?.foreignKey ? true : undefined,
                    underline: col.roles?.primaryKey ? true : undefined,
                },
            }),
        );

        nodes.push({
            id: table.id,
            type: "table",
            position: pos,
            size,
            name: table.name,
            tableId: table.id,
            columns: storedColumns.length > 0 ? storedColumns : undefined,
            data: {
                name: table.name,
                columns: (table.columns ?? []).map((col) => ({
                    name: col.name,
                    isKey: col.roles?.primaryKey ?? false,
                })),
            } as NodeData,
        });
    }

    // ── FK edges ─────────────────────────────────────────────────────────

    for (const table of model.tables ?? []) {
        (table.columns ?? []).forEach((col, colIdx) => {
            if (!col.roles?.foreignKey) return;
            const fk = col.roles.foreignKey;

            // Always use standardized columnId format that matches table node handles
            const sourceColumnId = `lid_${table.id}_col_${colIdx}`;

            // Find the target column INDEX in the referenced table
            const targetTable = (model.tables ?? []).find((t) => t.id === fk.refTableId);
            const targetColIdx = targetTable?.columns?.findIndex((c) => c.id === fk.refColumnId) ?? 0;
            const targetColumnId = `lid_${fk.refTableId}_col_${Math.max(targetColIdx, 0)}`;

            edges.push({
                id: `e_fk_${table.id}_${colIdx}`,
                type: "fk",
                source: sourceColumnId,
                target: targetColumnId,
                sourceSide: "right",
                targetSide: "left",
                fkRef: {
                    tableId: table.id,
                    foreignKeyIndex: colIdx,
                },
            });
        });
    }

    // ── Preserve existing edges & unmodeled nodes ──────────────────────

    if (existingEdges) {
        const modelEdgeIds = new Set(edges.map((e) => e.id));
        // Keep every existing edge that wasn't regenerated from the model.
        // This preserves user-created FK edges that only exist in the diagram.
        const preservedEdges = existingEdges.filter((e) => !modelEdgeIds.has(e.id));
        edges.push(...preservedEdges);
    }

    if (preserveUnmodeledNodes && existingNodes) {
        const modelNodeIds = new Set(nodes.map((n) => n.id));
        const unmodeledNodes = existingNodes.filter((n) => !modelNodeIds.has(n.id));
        nodes.push(...unmodeledNodes);
    }

    return { nodes, edges };
};

