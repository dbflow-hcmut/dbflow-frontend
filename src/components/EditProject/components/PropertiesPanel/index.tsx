import React, { useMemo } from "react";
import { Input, Checkbox, Select } from "antd";
import { X } from "lucide-react";
import { Node, Edge } from "reactflow";
import type { AttributeData, NodeData, RelationshipData, EntityData } from "../../index";

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
            className={`absolute h-[calc(100vh-160px)] top-1/2 -translate-y-1/2 right-4 flex flex-col items-center gap-2 bg-white z-10 rounded-lg shadow-md transition-all duration-300 ease-in-out ${
                isOpen 
                    ? 'opacity-100 translate-x-0 pointer-events-auto' 
                    : 'opacity-0 translate-x-full pointer-events-none'
            }`}
        >
            <div className="w-64">
                <div className="border-b border-gray-200 my-auto flex items-center justify-between py-2 px-4">
                    <div className="text-lg font-semibold">Properties</div>
                    <X 
                        className="cursor-pointer" 
                        size={18} 
                        onClick={onClose}
                    />
                </div>

                <div className="p-4">
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
                            {(selectedNode.type === 'entity' || selectedNode.type === 'relation') && (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Name</label>
                                    <Input
                                        value={propertiesName}
                                        onChange={(e) => onUpdateName(e.target.value)}
                                        placeholder={selectedNode.type === 'entity' ? 'Entity name' : 'Table name'}
                                    />
                                </div>
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

