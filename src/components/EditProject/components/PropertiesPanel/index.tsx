import React, { useMemo, useState } from "react";
import { Input, Checkbox, Select, Button, Switch } from "antd";
import { X, Plus, Trash2, GripVertical } from "lucide-react";
import { Node, Edge } from "reactflow";
import type { AttributeData, NodeData, RelationshipData, EntityData } from "../../index";
import type { RelationTableData, RelationColumn, TableIndex, PhysicalFD } from "@/components/erds-notations/relation-table";
import type { LogicalTableData, LogicalFD } from "@/components/erds-notations/logical-table";
import type { ErdEdgeData } from "../../utils/functions";
import { GENERIC_DATA_TYPES, type FKAction, type DataTypeOption } from "../../utils/dbms-config";

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
        updates: Partial<RelationColumn>
    ) => void;
    onReorderRelationTableColumns?: (fromIndex: number, toIndex: number) => void;
    onAddTableIndex?: () => void;
    onRemoveTableIndex?: (indexId: string) => void;
    onUpdateTableIndex?: (indexId: string, updates: Partial<TableIndex>) => void;
    onUpdateFKAction?: (edgeId: string, field: 'onDelete' | 'onUpdate', value: FKAction) => void;
    dataTypeOptions?: DataTypeOption[];
    onAddLogicalTableAttribute?: () => void;
    onRemoveLogicalTableAttribute?: (attributeIndex: number) => void;
    onUpdateLogicalTableAttribute?: (
        attributeIndex: number,
        updates: Partial<{ name: string; isKey: boolean; isCandidateKey: boolean }>
    ) => void;
    onReorderLogicalTableAttributes?: (fromIndex: number, toIndex: number) => void;
    // Functional dependency callbacks (logical)
    onAddLogicalFD?: () => void;
    onRemoveLogicalFD?: (fdId: string) => void;
    onUpdateLogicalFD?: (fdId: string, updates: Partial<LogicalFD>) => void;
    onToggleLogicalFDDisplay?: () => void;
    // Functional dependency callbacks (physical)
    onAddPhysicalFD?: () => void;
    onRemovePhysicalFD?: (fdId: string) => void;
    onUpdatePhysicalFD?: (fdId: string, updates: Partial<PhysicalFD>) => void;
    onTogglePhysicalFDDisplay?: () => void;
    indexTypeOptions?: string[];
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
    onReorderRelationTableColumns,
    onAddTableIndex,
    onRemoveTableIndex,
    onUpdateTableIndex,
    onUpdateFKAction,
    dataTypeOptions,
    onAddLogicalTableAttribute,
    onRemoveLogicalTableAttribute,
    onUpdateLogicalTableAttribute,
    onReorderLogicalTableAttributes,
    onAddLogicalFD,
    onRemoveLogicalFD,
    onUpdateLogicalFD,
    onToggleLogicalFDDisplay,
    onAddPhysicalFD,
    onRemovePhysicalFD,
    onUpdatePhysicalFD,
    onTogglePhysicalFDDisplay,
    indexTypeOptions,
}) => {
    const getNodeType = (nodeId?: string) => nodes.find((node) => node.id === nodeId)?.type;
    const selectedEdgeSourceType = getNodeType(selectedEdge?.source);
    const selectedEdgeTargetType = getNodeType(selectedEdge?.target);
    const selectedEdgeHasConstraint =
        selectedEdgeSourceType === "constraint" || selectedEdgeTargetType === "constraint";
    const selectedEdgeIsRelationshipEntity =
        (selectedEdgeSourceType === "relationship" && selectedEdgeTargetType === "entity") ||
        (selectedEdgeSourceType === "entity" && selectedEdgeTargetType === "relationship");
    const selectedEdgeIsEntityEntity =
        selectedEdgeSourceType === "entity" && selectedEdgeTargetType === "entity";
    const selectedEdgeCanUseBracket =
        selectedEdgeHasConstraint || selectedEdgeIsRelationshipEntity || selectedEdgeIsEntityEntity;
    const selectedEdgeCanChooseBracketDirection =
        selectedEdge?.data?.lineStyle === "bracket" && (selectedEdgeIsRelationshipEntity || selectedEdgeIsEntityEntity);
    // The bracket line style marks a subclass link on generalization (ISA) / category edges and a
    // direct entity–entity link, and the identifying link on a relationship–entity edge.
    const bracketEdgeLabel =
        selectedEdgeHasConstraint || selectedEdgeIsEntityEntity ? "Subclass (child link)" : "Identifying";

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
            id="tour-properties-panel"
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

                <div className="flex-1 overflow-y-auto p-4 min-h-0" style={{ opacity: canEdit ? 1 : 0.6 }}>
                    <div style={{ pointerEvents: canEdit ? 'auto' : 'none' }}>
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
                                                    <div className="flex items-center gap-3 pl-6">
                                                        <Checkbox
                                                            checked={col.isKey || false}
                                                            onChange={(e) =>
                                                                onUpdateLogicalTableAttribute?.(idx, { isKey: e.target.checked })
                                                            }
                                                        >
                                                            <span className="text-xs">PK</span>
                                                        </Checkbox>
                                                        <Checkbox
                                                            checked={col.isCandidateKey || false}
                                                            onChange={(e) =>
                                                                onUpdateLogicalTableAttribute?.(idx, { isCandidateKey: e.target.checked })
                                                            }
                                                            disabled={col.isKey || false}
                                                        >
                                                            <span className="text-xs">CK</span>
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

                                    {/* Functional Dependencies Section (Logical) */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium">
                                                Functional Dependencies
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <Switch
                                                    size="small"
                                                    checked={(selectedNode.data as LogicalTableData).showFDs ?? false}
                                                    onChange={() => onToggleLogicalFDDisplay?.()}
                                                    title="Show on node"
                                                />
                                                {onAddLogicalFD && (
                                                    <Button
                                                        type="default"
                                                        size="small"
                                                        icon={<Plus size={14} />}
                                                        onClick={onAddLogicalFD}
                                                        className="h-7!"
                                                    >
                                                        Add
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {((selectedNode.data as LogicalTableData).functionalDependencies ?? []).map((fd) => {
                                                const colOptions = ((selectedNode.data as LogicalTableData).columns ?? []).map(c => ({
                                                    label: c.name,
                                                    value: c.id ?? c.name,
                                                }));
                                                const colLabelByRef = new Map(
                                                    ((selectedNode.data as LogicalTableData).columns ?? []).flatMap(c => {
                                                        const refs: Array<[string, string]> = [[c.name, c.name]];
                                                        if (c.id) refs.push([c.id, c.name]);
                                                        return refs;
                                                    }),
                                                );
                                                const formatRefs = (refs: string[]) =>
                                                    refs.length > 0
                                                        ? refs.map(ref => colLabelByRef.get(ref) ?? ref).join(', ')
                                                        : '?';
                                                return (
                                                    <div key={fd.id} className="border border-gray-200 rounded p-2">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className="text-xs font-medium text-gray-500">
                                                                {formatRefs(fd.left)}{' → '}{formatRefs(fd.right)}
                                                            </span>
                                                            {onRemoveLogicalFD && (
                                                                <Button
                                                                    type="text"
                                                                    danger
                                                                    size="small"
                                                                    icon={<Trash2 size={12} />}
                                                                    onClick={() => onRemoveLogicalFD(fd.id)}
                                                                    className="flex-shrink-0 !h-5 !w-5 !p-0"
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div>
                                                                <div className="text-xs text-gray-400 mb-0.5">Determinant (left)</div>
                                                                <Select
                                                                    mode="multiple"
                                                                    size="small"
                                                                    value={fd.left}
                                                                    onChange={(vals) => onUpdateLogicalFD?.(fd.id, { left: vals })}
                                                                    placeholder="Select columns..."
                                                                    style={{ width: '100%' }}
                                                                    options={colOptions}
                                                                    maxTagCount="responsive"
                                                                />
                                                            </div>
                                                            <div className="text-center text-gray-300 text-xs">↓ determines</div>
                                                            <div>
                                                                <div className="text-xs text-gray-400 mb-0.5">Dependent (right)</div>
                                                                <Select
                                                                    mode="multiple"
                                                                    size="small"
                                                                    value={fd.right}
                                                                    onChange={(vals) => onUpdateLogicalFD?.(fd.id, { right: vals })}
                                                                    placeholder="Select columns..."
                                                                    style={{ width: '100%' }}
                                                                    options={colOptions}
                                                                    maxTagCount="responsive"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {!((selectedNode.data as LogicalTableData).functionalDependencies ?? []).length && (
                                                <div className="text-xs text-gray-400 py-1 text-center">
                                                    No FDs defined
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
                                            {(selectedNode.data as RelationTableData).columns?.map((col, idx) => {
                                                const typeOptions = dataTypeOptions ?? GENERIC_DATA_TYPES;
                                                const selectedTypeConfig = typeOptions.find(t => t.value === col.type);
                                                return (
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
                                                            onReorderRelationTableColumns?.(draggedIndex, idx);
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
                                                                onUpdateRelationTableColumn?.(idx, { type: value, length: undefined })
                                                            }
                                                            placeholder="Type"
                                                            style={{ flex: 1 }}
                                                            showSearch
                                                            options={typeOptions.map(t => ({ label: t.label, value: t.value }))}
                                                        />
                                                        {(selectedTypeConfig?.hasLength || selectedTypeConfig?.hasPrecision) && (
                                                            <Input
                                                                value={col.length || ''}
                                                                onChange={(e) =>
                                                                    onUpdateRelationTableColumn?.(idx, { length: e.target.value || undefined })
                                                                }
                                                                placeholder={selectedTypeConfig.hasPrecision ? '10,2' : '255'}
                                                                style={{ width: 70 }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Checkbox
                                                            checked={col.isPrimary || false}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { isPrimary: e.target.checked })
                                                            }
                                                        >
                                                            PK
                                                        </Checkbox>
                                                        <Checkbox
                                                            checked={col.isCandidateKey || false}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { isCandidateKey: e.target.checked })
                                                            }
                                                            disabled={col.isPrimary || false}
                                                        >
                                                            CK
                                                        </Checkbox>
                                                        <Checkbox
                                                            checked={col.isNullable !== false}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { isNullable: e.target.checked })
                                                            }
                                                        >
                                                            Nullable
                                                        </Checkbox>
                                                        <Checkbox
                                                            checked={col.isUnique || false}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { isUnique: e.target.checked })
                                                            }
                                                        >
                                                            Unique
                                                        </Checkbox>
                                                        <Checkbox
                                                            checked={col.isAutoIncrement || false}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { isAutoIncrement: e.target.checked })
                                                            }
                                                        >
                                                            Auto++
                                                        </Checkbox>
                                                    </div>
                                                    <div>
                                                        <Input
                                                            value={col.defaultValue || ''}
                                                            onChange={(e) =>
                                                                onUpdateRelationTableColumn?.(idx, { defaultValue: e.target.value || undefined })
                                                            }
                                                            placeholder="Default value"
                                                            size="small"
                                                        />
                                                    </div>
                                                </div>
                                                );
                                            })}
                                            {!(selectedNode.data as RelationTableData).columns?.length && (
                                                <div className="text-sm text-gray-500 py-2 text-center">
                                                    No columns. Click &quot;Add Column&quot; to add one.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Indexes Section */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium">Indexes</label>
                                            {onAddTableIndex && (
                                                <Button
                                                    type="default"
                                                    size="small"
                                                    icon={<Plus size={14} />}
                                                    onClick={onAddTableIndex}
                                                    className="h-8!"
                                                >
                                                    Add Index
                                                </Button>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {(selectedNode.data as RelationTableData).indexes?.map((index) => {
                                                const tableColumns = (selectedNode.data as RelationTableData).columns ?? [];
                                                return (
                                                    <div key={index.id} className="border border-gray-200 rounded p-2 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                value={index.name}
                                                                onChange={(e) =>
                                                                    onUpdateTableIndex?.(index.id, { name: e.target.value })
                                                                }
                                                                placeholder="Index name"
                                                                size="small"
                                                                style={{ flex: 1 }}
                                                            />
                                                            {onRemoveTableIndex && (
                                                                <Button
                                                                    type="text"
                                                                    danger
                                                                    size="small"
                                                                    icon={<Trash2 size={14} />}
                                                                    onClick={() => onRemoveTableIndex(index.id)}
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Select
                                                                value={index.type}
                                                                onChange={(value) =>
                                                                    onUpdateTableIndex?.(index.id, { type: value })
                                                                }
                                                                size="small"
                                                                style={{ width: 90 }}
                                                                options={(indexTypeOptions ?? ['BTREE', 'HASH', 'GIN', 'GIST', 'BRIN']).map(
                                                                    (t) => ({ label: t, value: t })
                                                                )}
                                                            />
                                                            <Checkbox
                                                                checked={index.isUnique}
                                                                onChange={(e) =>
                                                                    onUpdateTableIndex?.(index.id, { isUnique: e.target.checked })
                                                                }
                                                            >
                                                                Unique
                                                            </Checkbox>
                                                        </div>
                                                        <div>
                                                            <Select
                                                                mode="multiple"
                                                                value={index.columns.map(c => c.columnName)}
                                                                onChange={(selectedCols: string[]) => {
                                                                    const newCols = selectedCols.map(name => {
                                                                        const existing = index.columns.find(c => c.columnName === name);
                                                                        return existing ?? { columnName: name, order: 'ASC' as const };
                                                                    });
                                                                    onUpdateTableIndex?.(index.id, { columns: newCols });
                                                                }}
                                                                placeholder="Select columns"
                                                                size="small"
                                                                style={{ width: '100%' }}
                                                                options={tableColumns.map(col => ({
                                                                    label: col.name,
                                                                    value: col.name,
                                                                }))}
                                                            />
                                                        </div>
                                                        {index.columns.length > 0 && (
                                                            <div className="flex flex-col gap-1">
                                                                {index.columns.map((idxCol, ci) => (
                                                                    <div key={ci} className="flex items-center gap-1 text-xs">
                                                                        <span className="flex-1 truncate">{idxCol.columnName}</span>
                                                                        <Select
                                                                            value={idxCol.order}
                                                                            onChange={(val) => {
                                                                                const newCols = [...index.columns];
                                                                                newCols[ci] = { ...newCols[ci], order: val };
                                                                                onUpdateTableIndex?.(index.id, { columns: newCols });
                                                                            }}
                                                                            size="small"
                                                                            style={{ width: 70 }}
                                                                            options={[
                                                                                { label: 'ASC', value: 'ASC' },
                                                                                { label: 'DESC', value: 'DESC' },
                                                                            ]}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {!(selectedNode.data as RelationTableData).indexes?.length && (
                                                <div className="text-sm text-gray-500 py-1 text-center">
                                                    No indexes
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Functional Dependencies Section (Physical) */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-sm font-medium">
                                                Functional Dependencies
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <Switch
                                                    size="small"
                                                    checked={(selectedNode.data as RelationTableData).showFDs ?? false}
                                                    onChange={() => onTogglePhysicalFDDisplay?.()}
                                                    title="Show on node"
                                                />
                                                {onAddPhysicalFD && (
                                                    <Button
                                                        type="default"
                                                        size="small"
                                                        icon={<Plus size={14} />}
                                                        onClick={onAddPhysicalFD}
                                                        className="h-7!"
                                                    >
                                                        Add
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {((selectedNode.data as RelationTableData).functionalDependencies ?? []).map((fd) => {
                                                const colOptions = ((selectedNode.data as RelationTableData).columns ?? []).map(c => ({
                                                    label: c.name,
                                                    value: c.name,
                                                }));
                                                return (
                                                    <div key={fd.id} className="border border-gray-200 rounded p-2">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <span className="text-xs font-medium text-gray-500">
                                                                {fd.left.length > 0 ? fd.left.join(', ') : '?'}{' → '}{fd.right.length > 0 ? fd.right.join(', ') : '?'}
                                                            </span>
                                                            {onRemovePhysicalFD && (
                                                                <Button
                                                                    type="text"
                                                                    danger
                                                                    size="small"
                                                                    icon={<Trash2 size={12} />}
                                                                    onClick={() => onRemovePhysicalFD(fd.id)}
                                                                    className="flex-shrink-0 !h-5 !w-5 !p-0"
                                                                />
                                                            )}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div>
                                                                <div className="text-xs text-gray-400 mb-0.5">Determinant (left)</div>
                                                                <Select
                                                                    mode="multiple"
                                                                    size="small"
                                                                    value={fd.left}
                                                                    onChange={(vals) => onUpdatePhysicalFD?.(fd.id, { left: vals })}
                                                                    placeholder="Select columns..."
                                                                    style={{ width: '100%' }}
                                                                    options={colOptions}
                                                                    maxTagCount="responsive"
                                                                />
                                                            </div>
                                                            <div className="text-center text-gray-300 text-xs">↓ determines</div>
                                                            <div>
                                                                <div className="text-xs text-gray-400 mb-0.5">Dependent (right)</div>
                                                                <Select
                                                                    mode="multiple"
                                                                    size="small"
                                                                    value={fd.right}
                                                                    onChange={(vals) => onUpdatePhysicalFD?.(fd.id, { right: vals })}
                                                                    placeholder="Select columns..."
                                                                    style={{ width: '100%' }}
                                                                    options={colOptions}
                                                                    maxTagCount="responsive"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {!((selectedNode.data as RelationTableData).functionalDependencies ?? []).length && (
                                                <div className="text-xs text-gray-400 py-1 text-center">
                                                    No FDs defined
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

                                return (
                                    <div className="flex flex-col gap-4">
                                        {/* Source side */}
                                        <div className="border border-gray-200 rounded-lg p-3">
                                            <div className="text-xs font-semibold mb-2 text-gray-500">
                                                FK Column
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
                                                Referenced Column
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

                                const edgeOnDelete: FKAction = (selectedEdge.data as Record<string, unknown>)?.onDelete as FKAction || 'NO ACTION';
                                const edgeOnUpdate: FKAction = (selectedEdge.data as Record<string, unknown>)?.onUpdate as FKAction || 'NO ACTION';

                                const fkActionOptions = [
                                    { label: 'NO ACTION', value: 'NO ACTION' },
                                    { label: 'CASCADE', value: 'CASCADE' },
                                    { label: 'SET NULL', value: 'SET NULL' },
                                    { label: 'SET DEFAULT', value: 'SET DEFAULT' },
                                    { label: 'RESTRICT', value: 'RESTRICT' },
                                ];

                                return (
                                    <div className="flex flex-col gap-4">
                                        {/* Source side */}
                                        {/* <div className="border border-gray-200 rounded-lg p-3">
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
                                        </div> */}

                                        {/* Arrow */}
                                        {/* <div className="flex justify-center text-gray-400 text-lg">→</div> */}

                                        {/* Target side */}
                                        {/* <div className="border border-gray-200 rounded-lg p-3">
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
                                        </div> */}

                                        {/* FK Actions */}
                                        <div>
                                            <label className="block text-sm font-medium mb-2">ON DELETE</label>
                                            <Select
                                                value={edgeOnDelete}
                                                onChange={(val: FKAction) => onUpdateFKAction?.(selectedEdge.id, 'onDelete', val)}
                                                className="w-full"
                                                options={fkActionOptions}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-2">ON UPDATE</label>
                                            <Select
                                                value={edgeOnUpdate}
                                                onChange={(val: FKAction) => onUpdateFKAction?.(selectedEdge.id, 'onUpdate', val)}
                                                className="w-full"
                                                options={fkActionOptions}
                                            />
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">Edge Type</label>
                                    <Select
                                        value={selectedEdgeIsEntityEntity ? 'bracket' : selectedEdge.data?.lineStyle || 'single'}
                                        onChange={(value) => onUpdateEdgeLineStyle(value)}
                                        className="w-full"
                                        options={
                                            selectedEdgeIsEntityEntity
                                                ? [{ label: bracketEdgeLabel, value: 'bracket' as const }]
                                                : [
                                                    { label: 'Single line', value: 'single' },
                                                    { label: 'Double line', value: 'double' },
                                                    ...(selectedEdgeCanUseBracket
                                                        ? [{ label: bracketEdgeLabel, value: 'bracket' as const }]
                                                        : []),
                                                ]
                                        }
                                    />
                                </div>
                                {selectedEdgeCanChooseBracketDirection && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">{selectedEdgeIsEntityEntity ? "Subclass Direction" : "Identifying Direction"}</label>
                                        <Select
                                            value={selectedEdge.data?.bracketDirection || (selectedEdgeIsEntityEntity ? 'from' : 'to')}
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
        </div>
    );
};

export default PropertiesPanel;
