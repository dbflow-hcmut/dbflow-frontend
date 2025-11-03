"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
    addEdge,
    Connection,
    Node,
    Edge,
    OnConnect,
    EdgeTypes,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    ConnectionLineType,
    Background,
    BackgroundVariant,
    SelectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import RelationshipNode from "@/components/erds-notations/relationship";
import AttributeNode from "@/components/erds-notations/attribute";
import EntityNode from "@/components/erds-notations/entity";
import ConstraintNode from "@/components/erds-notations/constraint";
import RelationTableNode, { type RelationTableData } from "@/components/erds-notations/relation-table";
import ErdEdge from "@/components/erd-edge";
import SearchModal from "./components/SearchModal";
import NotationsSidebar from "./components/NotationsSidebar";
import PropertiesPanel from "./components/PropertiesPanel";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { createNodeCreators, createUpdateFunctions } from "./utils/functions";

export type EntityField = {
    id: string;
    name: string;
    type: string;
    isPrimary?: boolean;
    isNullable?: boolean;
};

export type EntityData = {
    name: string;
    fields: EntityField[];
    variant?: 'single' | 'double' | 'dashed';
};

export type RelationshipData = {
    name: string;
    variant?: 'single' | 'double' | 'dashed';
    cardinalities?: Record<string, string>;
};

export type AttributeData = {
    name: string;
    isKey?: boolean;
    variant?: 'single' | 'double' | 'dashed';
};

type ConstraintData = { symbol: 'd' | 'o' | 'u' };

export type NodeData = EntityData | RelationshipData | AttributeData | ConstraintData | RelationTableData;

const initialNodes: Node<NodeData>[] = [];
const initialEdges: Edge[] = [];

const EditProject: React.FC = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [diagramName, setDiagramName] = useState("Blank diagram");
    const [isEditingDiagramName, setIsEditingDiagramName] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isSidebarModalOpen, setIsSidebarModalOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    const [propertiesName, setPropertiesName] = useState("");

    const selectedNode = useMemo(() => {
        return nodes.find(node => node.selected);
    }, [nodes]);

    useEffect(() => {
        if (selectedNode) {
            if (selectedNode.type === 'attribute') {
                const data = selectedNode.data as AttributeData;
                setPropertiesName(data.name || "");
            } else if (selectedNode.type === 'entity') {
                const data = selectedNode.data as EntityData;
                setPropertiesName(data.name || "");
            } else if (selectedNode.type === 'relation') {
                const data = selectedNode.data as RelationTableData;
                setPropertiesName(data.name || "");
            } else if (selectedNode.type === 'relationship') {
                const data = selectedNode.data as RelationshipData;
                setPropertiesName(data.name || "");
            }
        } else {
            setPropertiesName("");
        }
    }, [selectedNode]);

    const {
        addRelationship,
        addDoubleRelationship,
        addEntity,
        addDoubleEntity,
        addAttribute,
        addMultivaluedAttribute,
        addDashedAttribute,
        addConstraint,
        addRelationTable,
    } = useMemo(() => createNodeCreators(setNodes), [setNodes]);

    const { updateNodeName, updateAttributeKey } = useMemo(
        () => createUpdateFunctions(setNodes, selectedNode),
        [setNodes, selectedNode]
    );

    const nodeTypes = useMemo(
        () => ({
            relationship: RelationshipNode,
            attribute: AttributeNode,
            entity: EntityNode,
            constraint: ConstraintNode,
            relation: RelationTableNode,
        }),
        []
    );

    const edgeTypes = useMemo<EdgeTypes>(
        () => ({
            "erd-edge": ErdEdge,
        }),
        []
    );

    const onConnect = useCallback<OnConnect>((connection: Connection) => {
        setEdges((eds) => addEdge({ ...connection, type: "erd-edge", animated: false }, eds));
    }, [setEdges]);

    const handlePaneClick = useCallback(() => {
        setNodes((existingNodes) => existingNodes.map((node) => ({ ...node, selected: false })));
    }, [setNodes]);

    useEffect(() => {
        const handleGlobalFindShortcut = (event: KeyboardEvent) => {
            const isFindShortcut = (event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F');
            if (!isFindShortcut) return;
            event.preventDefault();
            setIsSearchModalOpen(true);
        };

        window.addEventListener('keydown', handleGlobalFindShortcut);
        return () => window.removeEventListener('keydown', handleGlobalFindShortcut);
    }, []);

    return (
        <ReactFlowProvider>
            <div className="h-screen w-full">
                <Header
                    diagramName={diagramName}
                    isEditingDiagramName={isEditingDiagramName}
                    onSetDiagramName={setDiagramName}
                    onSetIsEditingDiagramName={setIsEditingDiagramName}
                    onOpenSearchModal={() => setIsSearchModalOpen(true)}
                />
                <div className="flex h-full">
                    <NotationsSidebar
                        isOpen={isSidebarModalOpen}
                        onAddEntity={addEntity}
                        onAddDoubleEntity={addDoubleEntity}
                        onAddAttribute={addAttribute}
                        onAddMultivaluedAttribute={addMultivaluedAttribute}
                        onAddDashedAttribute={addDashedAttribute}
                        onAddRelationship={addRelationship}
                        onAddDoubleRelationship={addDoubleRelationship}
                        onAddConstraint={addConstraint}
                        onAddRelationTable={addRelationTable}
                    />

                    <PropertiesPanel
                        isOpen={isRightPanelOpen}
                        selectedNode={selectedNode}
                        propertiesName={propertiesName}
                        nodes={nodes}
                        edges={edges}
                        onClose={() => setIsRightPanelOpen(false)}
                        onUpdateName={(name) => {
                            setPropertiesName(name);
                            updateNodeName(name);
                        }}
                        onUpdateAttributeKey={updateAttributeKey}
                        onUpdateRelationshipCardinality={(entityId, cardinality) => {
                            if (!selectedNode || selectedNode.type !== 'relationship') return;
                            const relationshipId = selectedNode.id;
                            
                            setNodes((existingNodes) =>
                                existingNodes.map((n) =>
                                    n.id === relationshipId
                                        ? {
                                            ...n,
                                            data: {
                                                ...(n.data as RelationshipData),
                                                cardinalities: {
                                                    ...(n.data as RelationshipData).cardinalities,
                                                    [entityId]: cardinality,
                                                },
                                            },
                                        }
                                        : n
                                )
                            );

                            setEdges((existingEdges) =>
                                existingEdges.map((edge) => {
                                    if (
                                        (edge.source === relationshipId && edge.target === entityId) ||
                                        (edge.source === entityId && edge.target === relationshipId)
                                    ) {
                                        const isRelationshipSource = edge.source === relationshipId;
                                        return {
                                            ...edge,
                                            data: {
                                                ...edge.data,
                                                ...(isRelationshipSource
                                                    ? { fromMult: cardinality || undefined }
                                                    : { toMult: cardinality || undefined }),
                                            },
                                        };
                                    }
                                    return edge;
                                })
                            );
                        }}
                    />
                    <div className="flex-1 h-full">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            connectionLineType={ConnectionLineType.Straight}
                            connectionLineStyle={{ stroke: 'var(--color-gray-700)', strokeWidth: 1 }}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onPaneClick={handlePaneClick}
                            selectionOnDrag
                            selectionMode={SelectionMode.Partial}
                            multiSelectionKeyCode={["Shift", "Meta"]}
                            autoPanOnNodeDrag
                            fitView
                            proOptions={{ hideAttribution: true }}
                        >
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={16}
                                size={1}
                            />
                        </ReactFlow>
                    </div>
                </div>

                <Footer
                    isSidebarModalOpen={isSidebarModalOpen}
                    isRightPanelOpen={isRightPanelOpen}
                    onToggleSidebar={() => setIsSidebarModalOpen(!isSidebarModalOpen)}
                    onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
                />

                <SearchModal open={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />
            </div>
        </ReactFlowProvider>
    );
};

export default EditProject;
