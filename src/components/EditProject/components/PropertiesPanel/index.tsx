import React, { useMemo } from "react";
import { Input, Checkbox } from "antd";
import { X } from "lucide-react";
import { Node, Edge } from "reactflow";
import type { AttributeData, NodeData, RelationshipData, EntityData } from "../../index";

type PropertiesPanelProps = {
    isOpen: boolean;
    selectedNode: Node<NodeData> | undefined;
    propertiesName: string;
    nodes: Node<NodeData>[];
    edges: Edge[];
    onClose: () => void;
    onUpdateName: (name: string) => void;
    onUpdateAttributeKey: (checked: boolean) => void;
    onUpdateRelationshipCardinality: (entityId: string, cardinality: string) => void;
};

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
    isOpen,
    selectedNode,
    propertiesName,
    nodes,
    edges,
    onClose,
    onUpdateName,
    onUpdateAttributeKey,
    onUpdateRelationshipCardinality,
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
                    ) : (
                        <div className="text-sm text-gray-500 py-4 text-center">
                            Select a node to edit properties
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PropertiesPanel;

