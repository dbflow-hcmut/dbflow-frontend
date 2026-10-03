import React from "react";
import { Node } from "reactflow";
import type { EntityData, RelationshipData, AttributeData, NodeData } from "../index";
import type { RelationTableData, RelationColumn, TableIndex, PhysicalFD } from "@/components/erds-notations/relation-table";
import type { LogicalTableData, LogicalFD } from "@/components/erds-notations/logical-table";
import { removeColumnFromFDs, renameColumnInFDs } from "./fd-cleanup";

export type ConstraintData = { symbol: 'd' | 'o' | 'u' };
export type ErdEdgeData = {
    label?: string;
    fromMult?: string;
    toMult?: string;
    lineStyle?: 'single' | 'double' | 'bracket';
    bracketDirection?: 'from' | 'to';
    storedType?: string;
};
export const RELATION_NOTE_PREFIX = '__RELATION__::';

export const generateDiagramId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `cid_${crypto.randomUUID()}`;
    }
    const randomSuffix = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `cid_${randomSuffix}`;
};

const deselectAllNodes = <T extends NodeData>(nodes: Node<T>[]): Node<T>[] => {
    return nodes.map((n) => ({ ...n, selected: false }));
};

type NodeCreatorOptions = {
    getViewportCenter?: () => { x: number; y: number } | null;
};

const getSpawnPosition = (
    existingNodes: Node<NodeData>[],
    getViewportCenter?: () => { x: number; y: number } | null
) => {
    const center = getViewportCenter?.();
    if (!center) {
        const fallback = existingNodes.at(-1)?.position ?? { x: 0, y: 0 };
        return {
            x: fallback.x + 60,
            y: fallback.y + 60,
        };
    }

    const index = existingNodes.length;
    const angleStep = (2 * Math.PI) / 6;
    const angle = (index % 6) * angleStep;
    const radius = 40 + Math.floor(index / 6) * 30;

    return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
    };
};

export const createNodeCreators = (
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    options?: NodeCreatorOptions
) => {
    const resolvePosition = (existingNodes: Node<NodeData>[]) =>
        getSpawnPosition(existingNodes, options?.getViewportCenter);

    const addRelationship = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'single' },
                style: { width: 70, height: 40 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDoubleRelationship = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `rel_${existingNodes.length + 1}`;
            const newNode: Node<RelationshipData> = {
                id,
                type: "relationship",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'double' },
                style: { width: 70, height: 40 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addEntity = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: resolvePosition(existingNodes),
                data: { name: name, fields: [], variant: 'single' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDoubleEntity = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `ent_${existingNodes.length + 1}`;
            const newNode: Node<EntityData> = {
                id,
                type: "entity",
                position: resolvePosition(existingNodes),
                data: { name: name, fields: [], variant: 'double' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addAttribute = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'single' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addMultivaluedAttribute = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'double' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addDashedAttribute = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const name = `attr_${existingNodes.length + 1}`;
            const newNode: Node<AttributeData> = {
                id,
                type: "attribute",
                position: resolvePosition(existingNodes),
                data: { name: name, variant: 'dashed' },
                style: { width: 70, height: 30 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addConstraint = (symbol: 'd' | 'o' | 'u') => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const newNode: Node<ConstraintData> = {
                id,
                type: "constraint",
                position: resolvePosition(existingNodes),
                data: { symbol },
                style: { width: 22, height: 22 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addRelationTable = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const tableCount = existingNodes.filter(n => n.type === 'relation').length;
            const tableName = `table_${tableCount + 1}`;
            
            // Calculate initial width based on table name and default column
            // With new spacing: nameWidth (40) + typeWidth (40) + spacing (20) = ~220px
            // Estimate: column_1 (~56px) + varchar (~56px) + padding (100px) = ~212px
            // Table name: ~tableName.length * 8 + 40
            const defaultColNameWidth = 'column_1'.length * 7 + 40; // ~89px
            const defaultColTypeWidth = 'varchar'.length * 7 + 40; // ~89px
            const rowSpacing = 20;
            const tableNameWidth = tableName.length * 8 + 40;
            const estimatedRowWidth = defaultColNameWidth + defaultColTypeWidth + rowSpacing;
            const estimatedWidth = Math.max(220, Math.max(tableNameWidth, estimatedRowWidth));
            
            const newNode: Node<RelationTableData> = {
                id,
                type: "relation",
                position: resolvePosition(existingNodes),
                data: { 
                    name: tableName, 
                    columns: [
                        { name: 'column_1', type: 'varchar', isPrimary: false, isNullable: true }
                    ]
                },
                style: { width: estimatedWidth, height: 120 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    const addLogicalTable = () => {
        setNodes((existingNodes) => {
            const id = generateDiagramId();
            const tableCount = existingNodes.filter(n => n.type === 'logical-table').length;
            const tableName = `table_${tableCount + 1}`;
            
            const tableNameWidth = tableName.length * 8 + 40;
            const defaultColNameWidth = 'column_1'.length * 7 + 40;
            const estimatedWidth = Math.max(200, Math.max(tableNameWidth, defaultColNameWidth));
            
            const newNode: Node<LogicalTableData> = {
                id,
                type: "logical-table",
                position: resolvePosition(existingNodes),
                data: { 
                    name: tableName, 
                    columns: [
                        { name: 'column_1', isKey: false }
                    ]
                },
                style: { width: estimatedWidth, height: 120 },
                selected: true,
            };
            return [...deselectAllNodes(existingNodes), newNode];
        });
    };

    return {
        addRelationship,
        addDoubleRelationship,
        addEntity,
        addDoubleEntity,
        addAttribute,
        addMultivaluedAttribute,
        addDashedAttribute,
        addConstraint,
        addRelationTable,
        addLogicalTable,
    };
};

export const createUpdateFunctions = (
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    selectedNode: Node<NodeData> | undefined
) => {
    const updateNodeName = (newName: string) => {
        if (!selectedNode) return;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? { ...n, data: { ...n.data, name: newName } }
                    : n
            )
        );
    };

    const updateAttributeKey = (checked: boolean) => {
        if (!selectedNode || selectedNode.type !== 'attribute') return;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? { ...n, data: { ...(n.data as AttributeData), isKey: checked } }
                    : n
            )
        );
    };

    const addRelationTableColumn = () => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        const newColumn = {
            name: `column_${(tableData.columns?.length || 0) + 1}`,
            type: 'varchar',
            isPrimary: false,
            isNullable: true,
        };
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: [...(tableData.columns || []), newColumn],
                        },
                    }
                    : n
            )
        );
    };

    const removeRelationTableColumn = (columnIndex: number) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        const removedName = tableData.columns?.[columnIndex]?.name;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: tableData.columns?.filter((_, idx) => idx !== columnIndex) || [],
                            // a deleted column must not stay behind in the functional dependencies
                            ...(removedName !== undefined && tableData.functionalDependencies
                                ? { functionalDependencies: removeColumnFromFDs(tableData.functionalDependencies, removedName, true) }
                                : {}),
                        },
                    }
                    : n
            )
        );
    };

    const updateRelationTableColumn = (
        columnIndex: number,
        updates: Partial<RelationColumn>
    ) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        const oldName = tableData.columns?.[columnIndex]?.name;
        const renamedTo = updates.name !== undefined && oldName !== undefined && updates.name !== oldName ? updates.name : undefined;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: tableData.columns?.map((col, idx) =>
                                idx === columnIndex ? { ...col, ...updates } : col
                            ) || [],
                            // physical FDs reference columns by name, so a rename must follow
                            ...(renamedTo !== undefined && oldName !== undefined && tableData.functionalDependencies
                                ? { functionalDependencies: renameColumnInFDs(tableData.functionalDependencies, oldName, renamedTo) }
                                : {}),
                        },
                    }
                    : n
            )
        );
    };

    const reorderRelationTableColumns = (fromIndex: number, toIndex: number) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        const columns = [...(tableData.columns || [])];
        const [movedColumn] = columns.splice(fromIndex, 1);
        if (!movedColumn) return;
        columns.splice(toIndex, 0, movedColumn);

        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns,
                        },
                    }
                    : n
            )
        );
    };

    const addTableIndex = () => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        const newIndex: TableIndex = {
            id: `idx_${Date.now().toString(16)}`,
            name: `idx_${(tableData.indexes?.length ?? 0) + 1}`,
            type: 'BTREE',
            columns: [],
            isUnique: false,
        };
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            indexes: [...(tableData.indexes ?? []), newIndex],
                        },
                    }
                    : n
            )
        );
    };

    const removeTableIndex = (indexId: string) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            indexes: (tableData.indexes ?? []).filter(idx => idx.id !== indexId),
                        },
                    }
                    : n
            )
        );
    };

    const updateTableIndex = (indexId: string, updates: Partial<TableIndex>) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            indexes: (tableData.indexes ?? []).map(idx =>
                                idx.id === indexId ? { ...idx, ...updates } : idx
                            ),
                        },
                    }
                    : n
            )
        );
    };

    const addLogicalTableAttribute = () => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        const nextColumnIndex = Math.max(
            -1,
            ...(tableData.columns ?? []).map((column, index) => {
                const match = column.id?.match(/_col_(\d+)$/);
                return match ? Number(match[1]) : index;
            }),
        ) + 1;
        const newColumn = {
            id: `lid_${selectedNode.id}_col_${nextColumnIndex}`,
            name: `column_${(tableData.columns?.length || 0) + 1}`,
            isKey: false,
        };
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: [...(tableData.columns || []), newColumn],
                        },
                    }
                    : n
            )
        );
    };

    const removeLogicalTableAttribute = (columnIndex: number) => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        const removedColumn = tableData.columns?.[columnIndex];
        const removedRef = removedColumn ? (removedColumn.id ?? removedColumn.name) : undefined;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: tableData.columns?.filter((_, idx) => idx !== columnIndex) || [],
                            // a deleted column must not stay behind in the functional dependencies
                            ...(removedRef !== undefined && tableData.functionalDependencies
                                ? { functionalDependencies: removeColumnFromFDs(tableData.functionalDependencies, removedRef) }
                                : {}),
                        },
                    }
                    : n
            )
        );
    };

    const updateLogicalTableAttribute = (
        columnIndex: number,
        updates: Partial<{ name: string; isKey: boolean; isCandidateKey: boolean }>
    ) => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: tableData.columns?.map((col, idx) =>
                                idx === columnIndex ? { ...col, ...updates } : col
                            ) || [],
                        },
                    }
                    : n
            )
        );
    };

    const reorderLogicalTableAttributes = (fromIndex: number, toIndex: number) => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        const columns = (tableData.columns || []).map((column, index) => ({
            ...column,
            id: column.id ?? `lid_${selectedNode.id}_col_${index}`,
        }));
        const [movedColumn] = columns.splice(fromIndex, 1);
        columns.splice(toIndex, 0, movedColumn);
        
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns,
                        },
                    }
                    : n
            )
        );
    };

    // ── Functional Dependency CRUD (Logical) ───────────────────────────

    const addLogicalFD = () => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        const newFD: LogicalFD = {
            id: `fd_${Date.now().toString(36)}`,
            left: [],
            right: [],
        };
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            functionalDependencies: [...(tableData.functionalDependencies || []), newFD],
                        },
                    }
                    : n
            )
        );
    };

    const removeLogicalFD = (fdId: string) => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            functionalDependencies: (tableData.functionalDependencies || []).filter(fd => fd.id !== fdId),
                        },
                    }
                    : n
            )
        );
    };

    const updateLogicalFD = (fdId: string, updates: Partial<LogicalFD>) => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            functionalDependencies: (tableData.functionalDependencies || []).map(fd =>
                                fd.id === fdId ? { ...fd, ...updates } : fd
                            ),
                        },
                    }
                    : n
            )
        );
    };

    const toggleLogicalFDDisplay = () => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            showFDs: !tableData.showFDs,
                        },
                    }
                    : n
            )
        );
    };

    // ── Functional Dependency CRUD (Physical / Relation) ─────────────

    const addPhysicalFD = () => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        const newFD: PhysicalFD = {
            id: `fd_${Date.now().toString(36)}`,
            left: [],
            right: [],
        };
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            functionalDependencies: [...(tableData.functionalDependencies || []), newFD],
                        },
                    }
                    : n
            )
        );
    };

    const removePhysicalFD = (fdId: string) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            functionalDependencies: (tableData.functionalDependencies || []).filter(fd => fd.id !== fdId),
                        },
                    }
                    : n
            )
        );
    };

    const updatePhysicalFD = (fdId: string, updates: Partial<PhysicalFD>) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            functionalDependencies: (tableData.functionalDependencies || []).map(fd =>
                                fd.id === fdId ? { ...fd, ...updates } : fd
                            ),
                        },
                    }
                    : n
            )
        );
    };

    const togglePhysicalFDDisplay = () => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            showFDs: !tableData.showFDs,
                        },
                    }
                    : n
            )
        );
    };

    return {
        updateNodeName,
        updateAttributeKey,
        addRelationTableColumn,
        removeRelationTableColumn,
        updateRelationTableColumn,
        reorderRelationTableColumns,
        addTableIndex,
        removeTableIndex,
        updateTableIndex,
        addLogicalTableAttribute,
        removeLogicalTableAttribute,
        updateLogicalTableAttribute,
        reorderLogicalTableAttributes,
        addLogicalFD,
        removeLogicalFD,
        updateLogicalFD,
        toggleLogicalFDDisplay,
        addPhysicalFD,
        removePhysicalFD,
        updatePhysicalFD,
        togglePhysicalFDDisplay,
    };
};
