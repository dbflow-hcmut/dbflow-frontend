import React from "react";
import { Node } from "reactflow";
import type { EntityData, RelationshipData, AttributeData, NodeData } from "../index";
import type { RelationTableData } from "@/components/erds-notations/relation-table";
import type { LogicalTableData } from "@/components/erds-notations/logical-table";

export type ConstraintData = { symbol: 'd' | 'o' | 'u' };
export type ErdEdgeData = {
    label?: string;
    fromMult?: string;
    toMult?: string;
    lineStyle?: 'single' | 'double' | 'bracket';
    bracketDirection?: 'from' | 'to';
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
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: tableData.columns?.filter((_, idx) => idx !== columnIndex) || [],
                        },
                    }
                    : n
            )
        );
    };

    const updateRelationTableColumn = (
        columnIndex: number,
        updates: Partial<{ name: string; type: string; isPrimary: boolean; isNullable: boolean }>
    ) => {
        if (!selectedNode || selectedNode.type !== 'relation') return;
        const tableData = selectedNode.data as RelationTableData;
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

    const addLogicalTableAttribute = () => {
        if (!selectedNode || selectedNode.type !== 'logical-table') return;
        const tableData = selectedNode.data as LogicalTableData;
        const newColumn = {
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
        setNodes((existingNodes) =>
            existingNodes.map((n) =>
                n.id === selectedNode.id
                    ? {
                        ...n,
                        data: {
                            ...tableData,
                            columns: tableData.columns?.filter((_, idx) => idx !== columnIndex) || [],
                        },
                    }
                    : n
            )
        );
    };

    const updateLogicalTableAttribute = (
        columnIndex: number,
        updates: Partial<{ name: string; isKey: boolean }>
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
        const columns = [...(tableData.columns || [])];
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

    return {
        updateNodeName,
        updateAttributeKey,
        addRelationTableColumn,
        removeRelationTableColumn,
        updateRelationTableColumn,
        addLogicalTableAttribute,
        removeLogicalTableAttribute,
        updateLogicalTableAttribute,
        reorderLogicalTableAttributes,
    };
};