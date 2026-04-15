import type { StoredPhysicalDiagramEdge, StoredPhysicalDiagramNode, StoredPhysicalNode } from "./physical-diagram.builder";
import type { NodeData } from "../index";
import { computeELKTableLayout, type LayoutTable } from "./auto-layout";

const generatePid = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `pid_${crypto.randomUUID()}`;
    }
    const randomSuffix = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `pid_${randomSuffix}`;
};

type ModelColumn = {
    id: string;
    name: string;
    dataType?: string;
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

export type PhysicalModelPayload = {
    model: {
        id: string;
        name: string;
        version: number;
        notes?: string;
    };
    tables: ModelTable[];
};

type BuildPhysicalModelParams = {
    storedNodes: StoredPhysicalNode[];
    storedEdges: StoredPhysicalDiagramEdge[];
    schemaId?: string;
    schemaName?: string;
    diagramName?: string;
};

const FALLBACK_MODEL_NAME = "Untitled physical model";

export const createEmptyPhysicalModel = (modelId?: string, modelName?: string): PhysicalModelPayload => ({
    model: {
        id: modelId ?? generatePid(),
        name: modelName ?? FALLBACK_MODEL_NAME,
        version: 1,
    },
    tables: [],
});

const buildPhysicalModel = ({
    storedNodes,
    storedEdges,
    schemaId,
    schemaName,
    diagramName,
}: BuildPhysicalModelParams): PhysicalModelPayload => {
    const modelId = schemaId ?? generatePid();
    const modelName = schemaName ?? diagramName ?? FALLBACK_MODEL_NAME;

    if (!storedNodes.length) {
        return createEmptyPhysicalModel(modelId, modelName);
    }

    // Filter only table nodes
    const tableNodes = storedNodes.filter((node) => node.type === "table" && node.tableId);

    // Build a map of table nodes by ID
    const tableNodeMap = new Map(tableNodes.map((node) => [node.tableId!, node]));

    // Build a map of FK relationships: tableId -> columnIndex -> { refTableId, refColumnId }
    const fkMap = new Map<string, Map<number, { refTableId: string; refColumnId: string }>>();

    storedEdges
        .filter((edge) => edge.type === "fk" && edge.fkRef)
        .forEach((edge) => {
            if (!edge.fkRef) return;

            const sourceTableId = edge.fkRef.tableId;
            const columnIndex = edge.fkRef.foreignKeyIndex;

            // Find target table from edge target
            const targetTableNode = tableNodeMap.get(edge.target);
            if (!targetTableNode) return;

            // Find primary key column in target table
            const targetColumns = targetTableNode.columns || [];
            const pkColumn = targetColumns.find((col) => col.decorations?.pk);
            if (!pkColumn) return;

            if (!fkMap.has(sourceTableId)) {
                fkMap.set(sourceTableId, new Map());
            }
            fkMap.get(sourceTableId)!.set(columnIndex, {
                refTableId: targetTableNode.tableId!,
                refColumnId: pkColumn.columnId,
            });
        });

    // Build tables with columns
    // Get column data from stored node data (RelationTableData)
    const tableDataMap = new Map<string, { name: string; columns: Array<{ name: string; type?: string; isPrimary?: boolean; isNullable?: boolean }> }>();
    
    tableNodes.forEach((tableNode) => {
        if (tableNode.tableId) {
            // Get column data from node data (RelationTableData)
            const nodeData = tableNode.data as { name?: string; columns?: Array<{ name: string; type?: string; isPrimary?: boolean; isNullable?: boolean }> } | undefined;
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
                  const columnId = `pid_${tableId}_col_${idx}`;
                  const columnName = actualCol.name || `column_${idx}`;

                  // Check if this column is a foreign key
                  const fkInfo = fkMap.get(tableId)?.get(idx);
                  const isPrimaryKey = actualCol.isPrimary ?? false;

                  const column: ModelColumn = {
                      id: columnId,
                      name: columnName,
                      nullable: actualCol.isNullable ?? true,
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
                  const columnId = storedCol.columnId || `pid_${tableId}_col_${idx}`;
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

// ── Reverse builder helpers (model → diagram) ──────────────────────────

const TABLE_LAYOUT = { gridCols: 3, gridGapX: 420, gridGapY: 300 };

const buildPhysicalPositionLookup = (existingNodes?: StoredPhysicalNode[]) => {
    const map = new Map<string, { x: number; y: number }>();
    if (!existingNodes) return map;
    for (const n of existingNodes) {
        const key = n.tableId ?? n.id;
        if (n.position) map.set(key, n.position);
    }
    return map;
};

const buildPhysicalSizeLookup = (existingNodes?: StoredPhysicalNode[]) => {
    const map = new Map<string, { w: number; h: number }>();
    if (!existingNodes) return map;
    for (const n of existingNodes) {
        const key = n.tableId ?? n.id;
        if (n.size) map.set(key, n.size);
    }
    return map;
};

const computeTableSize = (columns: Array<{ name: string; dataType?: string; nullable?: boolean; roles?: { primaryKey?: boolean; foreignKey?: unknown } }>) => {
    const columnCount = columns.length;
    // Estimate width based on longest row content
    let maxRowWidth = 200; // minimum
    for (const col of columns) {
        const nameLen = (col.name || '').length;
        const typeLen = (col.dataType || 'varchar').length;
        const notNullLen = col.nullable === false ? 9 : 0; // "NOT NULL" + space
        const iconWidth = (col.roles?.primaryKey ? 18 : 0) + (col.roles?.foreignKey ? 18 : 0);
        // ~7px per char at 12px font, plus padding/handles (~80px)
        const rowWidth = (nameLen + typeLen + notNullLen) * 7 + iconWidth + 100;
        maxRowWidth = Math.max(maxRowWidth, rowWidth);
    }
    return {
        w: Math.max(220, maxRowWidth),
        h: Math.max(100, 36 + columnCount * 32),
    };
};

// ── buildDiagramFromPhysicalModel ───────────────────────────────────

export type BuildDiagramFromPhysicalModelParams = {
    model: PhysicalModelPayload;
    existingNodes?: StoredPhysicalNode[];
    existingEdges?: StoredPhysicalDiagramEdge[];
    preserveUnmodeledNodes?: boolean;
};

export type MutatePhysicalModelFn = (
    mutator: (model: PhysicalModelPayload) => PhysicalModelPayload,
    opts?: { selectedNodeId?: string; positionHint?: { x: number; y: number } },
) => void | Promise<void>;

export const buildDiagramFromPhysicalModel = async ({
    model,
    existingNodes,
    existingEdges,
    preserveUnmodeledNodes = false,
}: BuildDiagramFromPhysicalModelParams): Promise<{
    nodes: StoredPhysicalNode[];
    edges: StoredPhysicalDiagramEdge[];
}> => {
    const nodes: StoredPhysicalNode[] = [];
    const edges: StoredPhysicalDiagramEdge[] = [];
    const posLookup = buildPhysicalPositionLookup(existingNodes);
    const sizeLookup = buildPhysicalSizeLookup(existingNodes);

    // ── Pre-compute sizes & ELK layout for new tables ────────────────

    const tableSizes = new Map<string, { w: number; h: number }>();
    const newTableIds: string[] = [];
    for (const table of model.tables ?? []) {
        const existingSize = sizeLookup.get(table.id);
        const size = existingSize ?? computeTableSize(table.columns ?? []);
        tableSizes.set(table.id, size);
        if (!posLookup.has(table.id)) newTableIds.push(table.id);
    }

    let autoPositions = new Map<string, { x: number; y: number }>();
    if (newTableIds.length > 0) {
        const layoutTables: LayoutTable[] = (model.tables ?? [])
            .filter((t) => newTableIds.includes(t.id))
            .map((t) => ({
                id: t.id,
                size: tableSizes.get(t.id) ?? { w: 220, h: 120 },
                refIds: (t.columns ?? [])
                    .filter((c) => c.roles?.foreignKey?.refTableId)
                    .map((c) => c.roles!.foreignKey!.refTableId),
            }));
        autoPositions = await computeELKTableLayout(layoutTables);
    }

    // ── Tables ───────────────────────────────────────────────────────

    for (const table of model.tables ?? []) {
        const existingPos = posLookup.get(table.id);
        const pos = existingPos ?? autoPositions.get(table.id) ?? { x: 0, y: 0 };

        const columnCount = table.columns?.length ?? 0;
        const computedSize = computeTableSize(table.columns ?? []);
        const existingSize = sizeLookup.get(table.id);
        const size = existingSize ?? computedSize;

        const storedColumns: StoredPhysicalDiagramNode["columns"] = (table.columns ?? []).map(
            (col, idx) => ({
                columnId: `pid_${table.id}_col_${idx}`,
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
                    type: col.dataType ?? "varchar",
                    isPrimary: col.roles?.primaryKey ?? false,
                    isNullable: col.nullable ?? true,
                })),
            } as NodeData,
        });
    }

    // ── FK edges ─────────────────────────────────────────────────────

    for (const table of model.tables ?? []) {
        (table.columns ?? []).forEach((col, colIdx) => {
            if (!col.roles?.foreignKey) return;
            const fk = col.roles.foreignKey;

            // Find target table and its PK column name
            const targetTable = (model.tables ?? []).find((t) => t.id === fk.refTableId);
            const targetCol = targetTable?.columns?.find((c) => c.id === fk.refColumnId);
            const targetColName = targetCol?.name ?? fk.refColumnId;

            edges.push({
                id: `e_fk_${table.id}_${colIdx}`,
                type: "fk",
                source: table.id,
                target: fk.refTableId,
                fkRef: {
                    tableId: table.id,
                    foreignKeyIndex: colIdx,
                    sourceColumnName: col.name,
                    targetColumnName: targetColName,
                },
            });
        });
    }

    // ── Preserve existing edges & unmodeled nodes ──────────────────

    if (existingEdges) {
        const modelEdgeIds = new Set(edges.map((e) => e.id));
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

export { buildPhysicalModel };
