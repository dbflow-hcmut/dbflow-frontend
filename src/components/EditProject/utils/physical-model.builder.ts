import type { StoredPhysicalDiagramEdge, StoredPhysicalDiagramNode, StoredPhysicalNode } from "./physical-diagram.builder";
import type { NodeData } from "../index";
import { computeELKTableLayout, type LayoutTable } from "./auto-layout";

import type { FKAction, IndexType, ColumnSortOrder, DBMSType } from "./dbms-config";

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
    length?: string;
    nullable: boolean;
    unique: boolean;
    autoIncrement?: boolean;
    defaultValue?: string;
    roles?: {
        primaryKey?: boolean;
        foreignKey?: {
            refTableId: string;
            refColumnId: string;
            onDelete?: FKAction;
            onUpdate?: FKAction;
        };
        candidateKey?: boolean;
    };
    comment?: string;
    notes?: string;
};

export type ModelIndex = {
    id: string;
    name: string;
    type: IndexType;
    columns: Array<{
        columnName: string;
        order: ColumnSortOrder;
    }>;
    isUnique: boolean;
};

type ModelTable = {
    id: string;
    name: string;
    columns: ModelColumn[];
    indexes?: ModelIndex[];
    functionalDependencies?: ModelFunctionalDependency[];
    comment?: string;
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
        dbms?: DBMSType;
        description?: string;
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

    // Build a map of FK relationships: tableId -> columnIndex -> { refTableId, refColumnId, onDelete, onUpdate }
    const fkMap = new Map<string, Map<number, { refTableId: string; refColumnId: string; onDelete?: FKAction; onUpdate?: FKAction }>>();

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
                onDelete: edge.fkRef.onDelete,
                onUpdate: edge.fkRef.onUpdate,
            });
        });

    // Build tables with columns
    // Get column data from stored node data (RelationTableData)
    type ActualColumnData = { name: string; type?: string; length?: string; isPrimary?: boolean; isCandidateKey?: boolean; isNullable?: boolean; isUnique?: boolean; isAutoIncrement?: boolean; defaultValue?: string };
    type NodeFD = { id: string; left: string[]; right: string[] };
    type ActualTableData = {
        name: string;
        columns: ActualColumnData[];
        indexes?: Array<{ id: string; name: string; type: string; columns: Array<{ columnName: string; order: string }>; isUnique: boolean }>;
        functionalDependencies?: NodeFD[];
    };
    const tableDataMap = new Map<string, ActualTableData>();

    tableNodes.forEach((tableNode) => {
        if (tableNode.tableId) {
            // Get column data from node data (RelationTableData)
            const nodeData = tableNode.data as ActualTableData | undefined;
            if (nodeData && nodeData.columns) {
                tableDataMap.set(tableNode.tableId, {
                    name: nodeData.name || tableNode.name || tableNode.tableId,
                    columns: nodeData.columns,
                    indexes: nodeData.indexes,
                    functionalDependencies: nodeData.functionalDependencies,
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

                  const isCandidateKey = actualCol.isCandidateKey ?? false;

                  const column: ModelColumn = {
                      id: columnId,
                      name: columnName,
                      dataType: actualCol.type,
                      length: actualCol.length,
                      nullable: actualCol.isNullable ?? true,
                      unique: actualCol.isUnique ?? false,
                      autoIncrement: actualCol.isAutoIncrement,
                      defaultValue: actualCol.defaultValue,
                      roles: {
                          primaryKey: isPrimaryKey,
                          ...(isCandidateKey ? { candidateKey: true } : {}),
                          ...(fkInfo
                              ? {
                                    foreignKey: {
                                        refTableId: fkInfo.refTableId,
                                        refColumnId: fkInfo.refColumnId,
                                        onDelete: fkInfo.onDelete,
                                        onUpdate: fkInfo.onUpdate,
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
                      nullable: !isPrimaryKey, // PK columns must NOT be nullable
                      unique: false,
                      roles: {
                          primaryKey: isPrimaryKey,
                          ...(fkInfo
                              ? {
                                    foreignKey: {
                                        refTableId: fkInfo.refTableId,
                                        refColumnId: fkInfo.refColumnId,
                                        onDelete: fkInfo.onDelete,
                                        onUpdate: fkInfo.onUpdate,
                                    },
                                }
                              : {}),
                      },
                  };

                  return column;
              });

        // Build indexes from tableData
        const indexes: ModelIndex[] = (tableData?.indexes ?? []).map((idx) => ({
            id: idx.id,
            name: idx.name,
            type: idx.type as ModelIndex['type'],
            columns: idx.columns.map(c => ({ columnName: c.columnName, order: c.order as 'ASC' | 'DESC' })),
            isUnique: idx.isUnique,
        }));

        // Extract FDs from node data
        const nodeFDs = tableData?.functionalDependencies ?? [];
        const modelFDs: ModelFunctionalDependency[] = nodeFDs.map((fd) => ({
            id: fd.id,
            left: fd.left,
            right: fd.right,
        }));

        return {
            id: tableId,
            name: tableName,
            columns,
            indexes: indexes.length > 0 ? indexes : undefined,
            functionalDependencies: modelFDs.length > 0 ? modelFDs : undefined,
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

const computeTableSize = (columns: Array<{ name: string; dataType?: string; length?: string; nullable?: boolean; unique?: boolean; autoIncrement?: boolean; roles?: { primaryKey?: boolean; foreignKey?: unknown } }>) => {
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

    const autoPositions = new Map<string, { x: number; y: number }>();
    if (newTableIds.length > 0) {
        // Compute bounding box of existing tables so new tables are placed below
        let existingMaxY = 0;
        let existingMinX = Infinity;
        for (const table of model.tables ?? []) {
            const pos = posLookup.get(table.id);
            if (!pos) continue;
            const size = tableSizes.get(table.id) ?? { w: 220, h: 120 };
            existingMaxY = Math.max(existingMaxY, pos.y + size.h);
            existingMinX = Math.min(existingMinX, pos.x);
        }
        if (!isFinite(existingMinX)) existingMinX = 50;

        // ELK layout for new tables among themselves
        const layoutTables: LayoutTable[] = (model.tables ?? [])
            .filter((t) => newTableIds.includes(t.id))
            .map((t) => ({
                id: t.id,
                size: tableSizes.get(t.id) ?? { w: 220, h: 120 },
                refIds: (t.columns ?? [])
                    .filter((c) => c.roles?.foreignKey?.refTableId)
                    .map((c) => c.roles!.foreignKey!.refTableId),
            }));
        const rawPositions = await computeELKTableLayout(layoutTables);

        // Offset new tables below existing tables
        const offsetY = existingMaxY > 0 ? existingMaxY + 80 : 0;
        for (const [id, pos] of rawPositions) {
            autoPositions.set(id, {
                x: pos.x + existingMinX,
                y: pos.y + offsetY,
            });
        }
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

        // Convert model FDs (column names) → node FDs
        const nodeFDs = (table.functionalDependencies ?? []).map((fd) => ({
            id: fd.id,
            left: fd.left,
            right: fd.right,
        }));

        // Preserve showFDs from existing node data if available
        const existingNodeData = existingNodes?.find(
            (n) => n.tableId === table.id || n.id === table.id,
        )?.data as { showFDs?: boolean } | undefined;

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
                    length: col.length,
                    isPrimary: col.roles?.primaryKey ?? false,
                    ...(col.roles?.candidateKey ? { isCandidateKey: true } : {}),
                    isNullable: col.nullable ?? true,
                    isUnique: col.unique ?? false,
                    isAutoIncrement: col.autoIncrement ?? false,
                    defaultValue: col.defaultValue,
                })),
                indexes: (table.indexes ?? []).map((idx) => ({
                    id: idx.id,
                    name: idx.name,
                    type: idx.type,
                    columns: idx.columns,
                    isUnique: idx.isUnique,
                })),
                ...(nodeFDs.length > 0 ? { functionalDependencies: nodeFDs } : {}),
                ...(existingNodeData?.showFDs != null ? { showFDs: existingNodeData.showFDs } : {}),
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
                    onDelete: fk.onDelete,
                    onUpdate: fk.onUpdate,
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
        const ANNOTATION_TYPES = new Set(["sticky-note", "text-label", "drawing-path", "note"]);
        // Only preserve annotation/drawing nodes — table nodes not in the model should be removed
        const unmodeledNodes = existingNodes.filter(
            (n) => !modelNodeIds.has(n.id) && ANNOTATION_TYPES.has(n.type ?? ""),
        );
        nodes.push(...unmodeledNodes);
    }

    return { nodes, edges };
};

export { buildPhysicalModel };
export type { ModelColumn, ModelTable };
