import type { StoredPhysicalDiagramEdge, StoredPhysicalNode } from "./physical-diagram.builder";

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

export { buildPhysicalModel };
