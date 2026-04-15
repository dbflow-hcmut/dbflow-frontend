import React, { useMemo, useState } from "react";
import { Input, Checkbox, Select, Button } from "antd";
import { X, Plus, Trash2, GripVertical } from "lucide-react";
import { Node, Edge } from "reactflow";
import type { AttributeData, NodeData, RelationshipData, EntityData } from "../../index";
import type { RelationTableData } from "@/components/erds-notations/relation-table";
import type { LogicalTableData } from "@/components/erds-notations/logical-table";
import type { ErdEdgeData } from "../../utils/functions";

type PropertiesPanelProps = {
    isOpen: boolean;
    canEdit?: boolean;
    selectedNode: Node<NodeData> | undefined;
    selectedEdge: Edge<ErdEdgeData> | undefined;
    propertiesName: string;
    nodes: Node<NodeData>[];
    edges: Edge<ErdEdgeData>[];
    onClose: () => void;
    onUpdateName: (name: string) => void;
    onUpdateAttributeKey: (checked: boolean) => void;
    onUpdateRelationshipCardinality: (edgeId: string, cardinality: string) => void;
    onUpdateEdgeLabel: (value: string) => void;
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
    onAddLogicalTableAttribute?: () => void;
    onRemoveLogicalTableAttribute?: (attributeIndex: number) => void;
    onUpdateLogicalTableAttribute?: (
        attributeIndex: number,
        updates: Partial<{ name: string; isKey: boolean }>
    ) => void;
    onReorderLogicalTableAttributes?: (fromIndex: number, toIndex: number) => void;
    onUpdateLogicalEdgeCardinality?: (side: 'source' | 'target', value: '1' | 'N') => void;
    onUpdatePhysicalEdgeCardinality?: (side: 'source' | 'target', value: '1' | 'N') => void;
};

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    isOpen,
    canEdit = true,
    selectedNode,
    selectedEdge,
    propertiesName,
    nodes,
    edges,
    onClose,
    onUpdateName,
    onUpdateAttributeKey,
    onUpdateRelationshipCardinality,
    onUpdateEdgeLabel,
    onUpdateEdgeFromMult: _onUpdateEdgeFromMult,
    onUpdateEdgeToMult: _onUpdateEdgeToMult,
    onUpdateEdgeLineStyle,
    onUpdateEdgeBracketDirection,
    onAddRelationTableColumn,
    onRemoveRelationTableColumn,
    onUpdateRelationTableColumn,
    onAddLogicalTableAttribute,
    onRemoveLogicalTableAttribute,
    onUpdateLogicalTableAttribute,
    onReorderLogicalTableAttributes,
    onUpdateLogicalEdgeCardinality,
    onUpdatePhysicalEdgeCardinality,
}) => {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const connectedEnds = useMemo(() => {
        if (!selectedNode || selectedNode.type !== 'relationship') return [];

        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        // Get participation/identifying edges for this relationship
        const participationEdges = edges.filter(
            edge =>
                (edge.data?.storedType === 'participation' || edge.data?.storedType === 'identifying') &&
                (edge.source === selectedNode.id || edge.target === selectedNode.id)
        );

        // Track entity appearance count for role labels
        const entityCount = new Map<string, number>();
        participationEdges.forEach(edge => {
            const entityId = edge.source === selectedNode.id ? edge.target : edge.source;
            entityCount.set(entityId, (entityCount.get(entityId) ?? 0) + 1);
        });

        const entitySeenIdx = new Map<string, number>();
        return participationEdges.map(edge => {
            const entityId = edge.source === selectedNode.id ? edge.target : edge.source;
            const entityNode = nodeMap.get(entityId);
            const entityName = entityNode ? ((entityNode.data as EntityData).name || entityId) : entityId;
            const isRecursive = (entityCount.get(entityId) ?? 0) > 1;
            const idx = entitySeenIdx.get(entityId) ?? 0;
            entitySeenIdx.set(entityId, idx + 1);

            return {
                edgeId: edge.id,
                entityId,
                entityName,
                roleLabel: isRecursive ? `Role ${idx + 1}` : undefined,
            };
        });
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

                <div className="flex-1 overflow-y-auto p-4 min-h-0" style={{ pointerEvents: canEdit ? 'auto' : 'none', opacity: canEdit ? 1 : 0.6 }}>
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
                                            disabled={(selectedNode.data as AttributeData).variant === 'dashed'}
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
                            {selectedNode.type === 'logical-table' && (
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
                                            {onAddLogicalTableAttribute && (
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    icon={<Plus size={14} />}
                                                    onClick={onAddLogicalTableAttribute}
                                                    className="h-8!"
                                                >
                                                    Add Column
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {(selectedNode.data as LogicalTableData).columns?.map((col, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className="border border-gray-200 rounded p-2 space-y-2 cursor-move hover:border-blue-300 transition-colors"
                                                    draggable
                                                    onDragStart={(e) => {
                                                        setDraggedIndex(idx);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        e.dataTransfer.dropEffect = 'move';
                                                    }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        if (draggedIndex !== null && draggedIndex !== idx) {
                                                            onReorderLogicalTableAttributes?.(draggedIndex, idx);
                                                        }
                                                        setDraggedIndex(null);
                                                    }}
                                                    onDragEnd={() => setDraggedIndex(null)}
                                                    style={{
                                                        opacity: draggedIndex === idx ? 0.5 : 1,
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <GripVertical size={16} className="text-gray-400 flex-shrink-0" />
                                                        <Input
                                                            value={col.name}
                                                            onChange={(e) =>
                                                                onUpdateLogicalTableAttribute?.(idx, { name: e.target.value })
                                                            }
                                                            placeholder="Column name"
                                                            style={{ flex: 1 }}
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                        />
                                                        {onRemoveLogicalTableAttribute && (
                                                            <Button
                                                                type="text"
                                                                danger
                                                                size="small"
                                                                icon={<Trash2 size={14} />}
                                                                onClick={() => onRemoveLogicalTableAttribute(idx)}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 pl-6">
                                                        <Checkbox
                                                            checked={col.isKey || false}
                                                            onChange={(e) =>
                                                                onUpdateLogicalTableAttribute?.(idx, { isKey: e.target.checked })
                                                            }
                                                        >
                                                            Is Key
                                                        </Checkbox>
                                                    </div>
                                                </div>
                                            ))}
                                            {!(selectedNode.data as LogicalTableData).columns?.length && (
                                                <div className="text-sm text-gray-500 py-2 text-center">
                                                    No columns. Click &quot;Add Column&quot; to add one.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
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
                                    {connectedEnds.length > 0 && (
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Cardinalities</label>
                                            <div className="flex flex-col gap-3">
                                                {connectedEnds.map((end) => {
                                                    const relationshipData = selectedNode.data as RelationshipData;
                                                    const currentCardinality = relationshipData.cardinalities?.[end.edgeId] || '';
                                                    const displayName = end.roleLabel
                                                        ? `${end.entityName} (${end.roleLabel})`
                                                        : end.entityName;
                                                    return (
                                                        <div key={end.edgeId} className="flex items-center gap-2">
                                                            <span className="text-sm flex-1 truncate">{displayName}:</span>
                                                            <Input
                                                                value={currentCardinality || ''}
                                                                onChange={(e) => onUpdateRelationshipCardinality(end.edgeId, e.target.value)}
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
                        selectedEdge.type === 'logical-table-edge' ? (
                            (() => {
                                // Parse handle ids to extract table / column info
                                const srcNode = nodes.find(n => n.id === selectedEdge.source);
                                const tgtNode = nodes.find(n => n.id === selectedEdge.target);
                                const srcData = srcNode?.data as LogicalTableData | undefined;
                                const tgtData = tgtNode?.data as LogicalTableData | undefined;

                                // Handle format: lid_{nodeId}_col_{index}-{side}
                                const parseColIndex = (handle?: string | null): number => {
                                    if (!handle) return -1;
                                    const m = handle.match(/_col_(\d+)/);
                                    return m ? parseInt(m[1], 10) : -1;
                                };

                                const srcColIdx = parseColIndex(selectedEdge.sourceHandle);
                                const tgtColIdx = parseColIndex(selectedEdge.targetHandle);
                                const srcCol = srcData?.columns?.[srcColIdx];
                                const tgtCol = tgtData?.columns?.[tgtColIdx];

                                const srcCard: string = (selectedEdge.data as Record<string, unknown>)?.sourceCardinality as string || 'N';
                                const tgtCard: string = (selectedEdge.data as Record<string, unknown>)?.targetCardinality as string || '1';

                                return (
                                    <div className="flex flex-col gap-4">
                                        {/* Cardinality selector */}
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Cardinality</label>
                                            <Select
                                                value={`${srcCard}:${tgtCard}`}
                                                onChange={(val: string) => {
                                                    const [s, t] = val.split(':') as ['1' | 'N', '1' | 'N'];
                                                    onUpdateLogicalEdgeCardinality?.('source', s);
                                                    setTimeout(() => onUpdateLogicalEdgeCardinality?.('target', t), 0);
                                                }}
                                                className="w-full"
                                                options={[
                                                    { label: 'N : 1 (Many-to-One)', value: 'N:1' },
                                                    { label: '1 : 1 (One-to-One)', value: '1:1' },
                                                    { label: '1 : N (One-to-Many)', value: '1:N' },
                                                    { label: 'N : N (Many-to-Many)', value: 'N:N' },
                                                ]}
                                            />
                                        </div>

                                        {/* Source side */}
                                        <div className="border border-gray-200 rounded-lg p-3">
                                            <div className="text-xs font-semibold mb-2 text-gray-500">
                                                {srcCard} — Source
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Table</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {srcData?.name || selectedEdge.source}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Column</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {srcCol?.name || `col_${srcColIdx}`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Arrow */}
                                        <div className="flex justify-center text-gray-400 text-lg">→</div>

                                        {/* Target side */}
                                        <div className="border border-gray-200 rounded-lg p-3">
                                            <div className="text-xs font-semibold mb-2 text-gray-500">
                                                {tgtCard} — Target
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Table</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {tgtData?.name || selectedEdge.target}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Column</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {tgtCol?.name || `col_${tgtColIdx}`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()
                        ) : selectedEdge.type === 'relation-table-edge' ? (
                            (() => {
                                const srcNode = nodes.find(n => n.id === selectedEdge.source);
                                const tgtNode = nodes.find(n => n.id === selectedEdge.target);
                                const srcData = srcNode?.data as RelationTableData | undefined;
                                const tgtData = tgtNode?.data as RelationTableData | undefined;

                                // Find column names from handles
                                const srcColName = selectedEdge.sourceHandle || '';
                                const tgtColName = selectedEdge.targetHandle || '';

                                const srcCard: string = (selectedEdge.data as Record<string, unknown>)?.sourceCardinality as string || 'N';
                                const tgtCard: string = (selectedEdge.data as Record<string, unknown>)?.targetCardinality as string || '1';

                                return (
                                    <div className="flex flex-col gap-4">
                                        {/* Cardinality selector */}
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Cardinality</label>
                                            <Select
                                                value={`${srcCard}:${tgtCard}`}
                                                onChange={(val: string) => {
                                                    const [s, t] = val.split(':') as ['1' | 'N', '1' | 'N'];
                                                    onUpdatePhysicalEdgeCardinality?.('source', s);
                                                    setTimeout(() => onUpdatePhysicalEdgeCardinality?.('target', t), 0);
                                                }}
                                                className="w-full"
                                                options={[
                                                    { label: 'N : 1 (Many-to-One)', value: 'N:1' },
                                                    { label: '1 : 1 (One-to-One)', value: '1:1' },
                                                    { label: '1 : N (One-to-Many)', value: '1:N' },
                                                    { label: 'N : N (Many-to-Many)', value: 'N:N' },
                                                ]}
                                            />
                                        </div>

                                        {/* Source side */}
                                        <div className="border border-gray-200 rounded-lg p-3">
                                            <div className="text-xs font-semibold mb-2 text-gray-500">
                                                {srcCard} — Source
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Table</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {srcData?.name || selectedEdge.source}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Column</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {srcColName || '?'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Arrow */}
                                        <div className="flex justify-center text-gray-400 text-lg">→</div>

                                        {/* Target side */}
                                        <div className="border border-gray-200 rounded-lg p-3">
                                            <div className="text-xs font-semibold mb-2 text-gray-500">
                                                {tgtCard} — Target
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Table</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {tgtData?.name || selectedEdge.target}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500">Column</span>
                                                    <span className="text-sm font-medium truncate ml-2">
                                                        {tgtColName || '?'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()
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
                                {(selectedEdge.data?.storedType === 'participation' || selectedEdge.data?.storedType === 'identifying') && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Label</label>
                                        <Input
                                            value={selectedEdge.data?.label || ''}
                                            onChange={(e) => onUpdateEdgeLabel(e.target.value)}
                                            placeholder="e.g., manages, supervises"
                                        />
                                    </div>
                                )}
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

