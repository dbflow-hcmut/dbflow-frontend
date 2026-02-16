import React, { useMemo } from "react";
import { Input, Checkbox, Select, Button } from "antd";
import { X, Plus, Trash2 } from "lucide-react";
import { Node, Edge } from "reactflow";
import type { AttributeData, NodeData, RelationshipData, EntityData } from "../../index";
import type { RelationTableData } from "@/components/erds-notations/relation-table";

export type ErdEdgeData = {
    label?: string;
    fromMult?: string;
    toMult?: string;
    lineStyle?: 'single' | 'double' | 'bracket';
    bracketDirection?: 'from' | 'to';
};

type PropertiesPanelProps = {
    isOpen: boolean;
    selectedNode: Node<NodeData> | undefined;
    selectedEdge: Edge<ErdEdgeData> | undefined;
    propertiesName: string;
    nodes: Node<NodeData>[];
    edges: Edge<ErdEdgeData>[];
    onClose: () => void;
    onUpdateName: (name: string) => void;
    onUpdateAttributeKey: (checked: boolean) => void;
    onUpdateRelationshipCardinality: (entityId: string, cardinality: string) => void;
    onUpdateEdgeFromMult: (value: string) => void;
    onUpdateEdgeToMult: (value: string) => void;
    onUpdateEdgeLineStyle: (style: 'single' | 'double' | 'bracket') => void;
    onUpdateEdgeBracketDirection: (direction: 'from' | 'to') => void;
    onAddRelationTableColumn?: () => void;
    onRemoveRelationTableColumn?: (columnIndex: number) => void;
    onUpdateRelationTableColumn?: (
        columnIndex: number,
        updates: Partial<{ name: string; type: string; isPrimary: boolean; isNullable: boolean }>
    ) => void;
};

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    isOpen,
    selectedNode,
    selectedEdge,
    propertiesName,
    nodes,
    edges,
    onClose,
    onUpdateName,
    onUpdateAttributeKey,
    onUpdateRelationshipCardinality,
    onUpdateEdgeFromMult,
    onUpdateEdgeToMult,
    onUpdateEdgeLineStyle,
    onUpdateEdgeBracketDirection,
    onAddRelationTableColumn,
    onRemoveRelationTableColumn,
    onUpdateRelationTableColumn,
}) => {
    const connectedEntities = useMemo(() => {
        if (!selectedNode || selectedNode.type !== 'relationship') return [];

        const relationshipEdges = edges.filter(
            edge => edge.source === selectedNode.id || edge.target === selectedNode.id
        );

        const entityIds = new Set<string>();
        relationshipEdges.forEach(edge => {
            if (edge.source === selectedNode.id) {
                entityIds.add(edge.target);
            } else {
                entityIds.add(edge.source);
            }
        });

        return nodes
            .filter(node => node.type === 'entity' && entityIds.has(node.id))
            .map(node => ({
                id: node.id,
                name: (node.data as EntityData).name || node.id,
            }));
    }, [selectedNode, nodes, edges]);
    return (
        <div
            className={`absolute h-[calc(100vh-160px)] top-1/2 -translate-y-1/2 right-4 flex flex-col items-center gap-2 bg-white z-10 rounded-lg shadow-md transition-all duration-300 ease-in-out ${isOpen
                    ? 'opacity-100 translate-x-0 pointer-events-auto'
                    : 'opacity-0 translate-x-full pointer-events-none'
                }`}
        >
            <div className="w-64 flex-1 flex flex-col min-h-0">
                <div className="border-b border-gray-200 flex items-center justify-between py-2 px-4 flex-shrink-0">
                    <div className="text-lg font-semibold">Properties</div>
                    <X
                        className="cursor-pointer"
                        size={18}
                        onClick={onClose}
                    />
                </div>

                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    {selectedNode ? (
                        <div className="flex flex-col gap-4">
                            {selectedNode.type === 'attribute' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Name</label>
                                        <Input
                                            value={propertiesName}
                                            onChange={(e) => onUpdateName(e.target.value)}
                                            placeholder="Attribute name"
                                        />
                                    </div>
                                    <div>
                                        <Checkbox
                                            checked={(selectedNode.data as AttributeData).isKey || false}
                                            onChange={(e) => onUpdateAttributeKey(e.target.checked)}
                                        >
                                            Is Key
                                        </Checkbox>
                                    </div>
                                </>
                            )}
                            {selectedNode.type === 'entity' && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Name</label>
                                    <Input
                                        value={propertiesName}
                                        onChange={(e) => onUpdateName(e.target.value)}
                                        placeholder="Entity name"
                                    />
                                </div>
                            )}
                            {selectedNode.type === 'relation' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Table Name</label>
                                        <Input
                                            value={propertiesName}
                                            onChange={(e) => onUpdateName(e.target.value)}
                                            placeholder="Table name"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium">Columns</label>
                                            {onAddRelationTableColumn && (
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    icon={<Plus size={14} />}
                                                    onClick={onAddRelationTableColumn}
                                                    className="h-8!"
                                                >
                                                    Add Column
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {(selectedNode.data as RelationTableData).columns?.map((col, idx) => (
                                                <div key={idx} className="border border-gray-200 rounded p-2 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            value={col.name}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { name: e.target.value })
                                                            }
                                                            placeholder="Column name"
                                                            style={{ flex: 1 }}
                                                        />
                                                        {onRemoveRelationTableColumn && (
                                                            <Button
                                                                type="text"
                                                                danger
                                                                size="small"
                                                                icon={<Trash2 size={14} />}
                                                                onClick={() => onRemoveRelationTableColumn(idx)}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Select
                                                            value={col.type || 'varchar'}
                                                            onChange={(value) =>
                                                                onUpdateRelationTableColumn?.(idx, { type: value })
                                                            }
                                                            placeholder="Type"
                                                            style={{ flex: 1 }}
                                                            options={[
                                                                { label: 'VARCHAR', value: 'varchar' },
                                                                { label: 'INT', value: 'int' },
                                                                { label: 'INTEGER', value: 'integer' },
                                                                { label: 'BIGINT', value: 'bigint' },
                                                                { label: 'SMALLINT', value: 'smallint' },
                                                                { label: 'DECIMAL', value: 'decimal' },
                                                                { label: 'NUMERIC', value: 'numeric' },
                                                                { label: 'FLOAT', value: 'float' },
                                                                { label: 'DOUBLE', value: 'double' },
                                                                { label: 'BOOLEAN', value: 'boolean' },
                                                                { label: 'DATE', value: 'date' },
                                                                { label: 'TIME', value: 'time' },
                                                                { label: 'TIMESTAMP', value: 'timestamp' },
                                                                { label: 'DATETIME', value: 'datetime' },
                                                                { label: 'TEXT', value: 'text' },
                                                                { label: 'CHAR', value: 'char' },
                                                                { label: 'BLOB', value: 'blob' },
                                                                { label: 'UUID', value: 'uuid' },
                                                            ]}
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox
                                                            checked={col.isPrimary || false}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { isPrimary: e.target.checked })
                                                            }
                                                        >
                                                            Primary Key
                                                        </Checkbox>
                                                        <Checkbox
                                                            checked={col.isNullable !== false}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { isNullable: e.target.checked })
                                                            }
                                                        >
                                                            Nullable
                                                        </Checkbox>
                                                    </div>
                                                </div>
                                            ))}
                                            {!(selectedNode.data as RelationTableData).columns?.length && (
                                                <div className="text-sm text-gray-500 py-2 text-center">
                                                    No columns. Click &quot;Add Column&quot; to add one.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                            {selectedNode.type === 'relationship' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Name</label>
                                        <Input
                                            value={propertiesName}
                                            onChange={(e) => onUpdateName(e.target.value)}
                                            placeholder="Relationship name"
                                        />
                                    </div>
                                    {connectedEntities.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Cardinalities</label>
                                            <div className="flex flex-col gap-3">
                                                {connectedEntities.map((entity) => {
                                                    const relationshipData = selectedNode.data as RelationshipData;
                                                    const currentCardinality = relationshipData.cardinalities?.[entity.id] || '';
                                                    return (
                                                        <div key={entity.id} className="flex items-center gap-2">
                                                            <span className="text-sm flex-1 truncate">{entity.name}:</span>
                                                            <Input
                                                                value={currentCardinality || ''}
                                                                onChange={(e) => onUpdateRelationshipCardinality(entity.id, e.target.value)}
                                                                placeholder="Enter"
                                                                style={{ width: 80 }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : selectedEdge ? (
                        selectedEdge.type === 'relation-table-edge' ? (
                            <div className="flex flex-col gap-4">
                                <div className="text-sm text-gray-600">
                                    This is a relation table edge. You can adjust the path by dragging control points when the edge is selected.
                                </div>
                                {selectedEdge.data?.label && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Label</label>
                                        <Input
                                            value={selectedEdge.data.label}
                                            placeholder="Edge label"
                                            disabled
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Edge Type</label>
                                    <Select
                                        value={selectedEdge.data?.lineStyle || 'single'}
                                        onChange={(value) => onUpdateEdgeLineStyle(value)}
                                        className="w-full"
                                        options={[
                                            { label: 'Single line', value: 'single' },
                                            { label: 'Double line', value: 'double' },
                                            { label: 'Identifying', value: 'bracket' },
                                        ]}
                                    />
                                </div>
                                {selectedEdge.data?.lineStyle === 'bracket' && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Identifying Direction</label>
                                        <Select
                                            value={selectedEdge.data?.bracketDirection || 'to'}
                                            onChange={(value) => onUpdateEdgeBracketDirection(value)}
                                            className="w-full"
                                            options={[
                                                { label: 'At source (from)', value: 'from' },
                                                { label: 'At target (to)', value: 'to' },
                                            ]}
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium mb-2">From Multiplicity</label>
                                    <Input
                                        value={selectedEdge.data?.fromMult || ''}
                                        onChange={(e) => onUpdateEdgeFromMult(e.target.value)}
                                        placeholder="e.g., 1, N, 0..1"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">To Multiplicity</label>
                                    <Input
                                        value={selectedEdge.data?.toMult || ''}
                                        onChange={(e) => onUpdateEdgeToMult(e.target.value)}
                                        placeholder="e.g., 1, N, 0..1"
                                    />
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="text-sm text-gray-500 py-4 text-center">
                            Select a node or edge to edit properties
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PropertiesPanel;

