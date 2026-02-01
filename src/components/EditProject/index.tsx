"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    ReactFlowInstance,
    ConnectionMode,
} from "reactflow";
import "reactflow/dist/style.css";
import RelationshipNode from "@/components/erds-notations/relationship";
import AttributeNode from "@/components/erds-notations/attribute";
import EntityNode from "@/components/erds-notations/entity";
import ConstraintNode from "@/components/erds-notations/constraint";
import RelationTableNode, { type RelationTableData } from "@/components/erds-notations/relation-table";
import ErdEdge from "@/components/erd-edge";
import RelationTableEdge from "@/components/relation-table-edge";
import SearchModal from "./components/SearchModal";
import NotationsSidebar from "./components/NotationsSidebar";
import PropertiesPanel from "./components/PropertiesPanel";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ChatBox from "./components/ChatBox";
import { generateDiagramId, createNodeCreators, createUpdateFunctions } from "./utils/functions";
import { ProjectResponse, ProjectSchemasResponse } from "@/types/projects.type";
import type { UserResponse } from "@/types/user.type";
import useToken from "@/hooks/useToken";
import { AddPage } from "./components/AddPage";
import { useRouter, useSearchParams } from "next/navigation";
import { SchemaType } from "@/utils/constants";
import { useConceptualCollaboration } from "./hooks/useConceptualCollaboration";
import { useLogicalCollaboration } from "./hooks/useLogicalCollaboration";
import { useDiagramViewport } from "./hooks/useDiagramViewport";
import { useCollaborationAwareness } from "./hooks/useCollaborationAwareness";
import type { RemoteCollaborator } from "./hooks/useCollaborationAwareness";
import { useProjectAwareness } from "./hooks/useProjectAwareness";
import { RemoteCursorsOverlay } from "./components/RemoteCursorsOverlay";
import { useUserMe } from "@/api/users/client";
import { useUndoRedo } from "./hooks/useUndoRedo";

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

export interface IPropsEditProject {
    projectData: ProjectResponse | null;
    projectSchemasData: ProjectSchemasResponse[] | null;
    currentUser: UserResponse | null;
}

const EditProject = (props: IPropsEditProject) => {
    const { projectData, projectSchemasData, currentUser } = props;
    const router = useRouter();
    const searchParams = useSearchParams();
    const [nodes, setNodesState, onNodesChange] = useNodesState<NodeData>(initialNodes);
    const [edges, setEdgesState, onEdgesChange] = useEdgesState(initialEdges);

    // Wrapper setNodes và setEdges - chỉ cập nhật state, không lưu history ngay
    // History sẽ được lưu bởi useEffect khi state thay đổi
    const setNodes = useCallback(
        (nodesOrUpdater: Node<NodeData>[] | ((prev: Node<NodeData>[]) => Node<NodeData>[])) => {
            setNodesState(nodesOrUpdater);
        },
        [setNodesState]
    );

    const setEdges = useCallback(
        (edgesOrUpdater: Edge[] | ((prev: Edge[]) => Edge[])) => {
            setEdgesState(edgesOrUpdater);
        },
        [setEdgesState]
    );

    const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);
    const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null);
    const [diagramWrapperEl, setDiagramWrapperEl] = useState<HTMLDivElement | null>(null);
    const [isReactFlowReady, setIsReactFlowReady] = useState(false);
    const [diagramName, setDiagramName] = useState(projectData?.name || "Blank diagram");
    const [isEditingDiagramName, setIsEditingDiagramName] = useState(false);
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [isSidebarModalOpen, setIsSidebarModalOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    const [isChatBoxOpen, setIsChatBoxOpen] = useState(false);
    const [propertiesName, setPropertiesName] = useState("");
    const [selectedSchema, setSelectedSchema] = useState<ProjectSchemasResponse | null>(null);
    const [isLoadingDiagram, setIsLoadingDiagram] = useState(false);
    
    // Undo/Redo hook - lớp trung gian quản lý state
    // maxHistorySize: 0 = không giới hạn
    // schemaId: phân biệt history cho từng diagram
    const { undo, redo, canUndo, canRedo, saveState, resetHistory } = useUndoRedo<NodeData, unknown>({
        maxHistorySize: 0, // 0 = không giới hạn số lượng state
        schemaId: selectedSchema?.id || null,
    });
    
    const isUndoRedoActiveRef = useRef(false);

    // Handle undo/redo
    const handleUndo = useCallback(() => {
        const state = undo();
        if (state) {
            isUndoRedoActiveRef.current = true;
            setNodesState(state.nodes);
            setEdgesState(state.edges);
            setTimeout(() => {
                isUndoRedoActiveRef.current = false;
            }, 0);
        }
    }, [undo, setNodesState, setEdgesState]);

    const handleRedo = useCallback(() => {
        const state = redo();
        if (state) {
            isUndoRedoActiveRef.current = true;
            setNodesState(state.nodes);
            setEdgesState(state.edges);
            setTimeout(() => {
                isUndoRedoActiveRef.current = false;
            }, 0);
        }
    }, [redo, setNodesState, setEdgesState]);

    // Lưu vào history khi nodes/edges thay đổi từ ReactFlow (debounce)
    // Bỏ qua khi đang undo/redo
    const saveStateTimerRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (isUndoRedoActiveRef.current) {
            return;
        }
        if (saveStateTimerRef.current) {
            clearTimeout(saveStateTimerRef.current);
        }
        saveStateTimerRef.current = setTimeout(() => {
            if (!isUndoRedoActiveRef.current) {
                saveState(nodes, edges);
            }
        }, 300);
        return () => {
            if (saveStateTimerRef.current) {
                clearTimeout(saveStateTimerRef.current);
            }
        };
    }, [nodes, edges, saveState]);
    
    const { token } = useToken();
    const { data: currentUserClient } = useUserMe();
    const effectiveUser = currentUserClient ?? currentUser;
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isAddPageOpen, setIsAddPageOpen] = useState(false);

    const isUserSelectingSchemaRef = useRef(false);

    const updateUrlWithSchemaId = useCallback((schemaId: string) => {
        if (!projectData?.id) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("schemaId", schemaId);
        router.replace(`/projects/${projectData.id}?${params.toString()}`, { scroll: false });
    }, [projectData?.id, router, searchParams]);

    const schemaList = useMemo(() => {
        if (Array.isArray(projectSchemasData)) {
            return projectSchemasData;
        }
        if (projectSchemasData && Array.isArray((projectSchemasData as unknown as { items?: ProjectSchemasResponse[] }).items)) {
            return (projectSchemasData as unknown as { items: ProjectSchemasResponse[] }).items;
        }
        if (projectSchemasData && Array.isArray((projectSchemasData as unknown as { data?: ProjectSchemasResponse[] }).data)) {
            return (projectSchemasData as unknown as { data: ProjectSchemasResponse[] }).data;
        }
        return [];
    }, [projectSchemasData]);

    useEffect(() => {
        if (!schemaList.length) return;
        
        if (isUserSelectingSchemaRef.current) {
            isUserSelectingSchemaRef.current = false;
            return;
        }
        
        const schemaIdFromUrl = searchParams.get("schemaId");
        const targetSchema = schemaIdFromUrl 
            ? schemaList.find(s => s.id === schemaIdFromUrl)
            : schemaList[0];
        
        if (targetSchema && targetSchema.id !== selectedSchema?.id) {
            setSelectedSchema(targetSchema);
            if (!schemaIdFromUrl) {
                updateUrlWithSchemaId(targetSchema.id);
            }
        }
    }, [schemaList, searchParams, selectedSchema?.id, updateUrlWithSchemaId]);

    const handleSetSelectedSchema = useCallback((schema: ProjectSchemasResponse) => {
        isUserSelectingSchemaRef.current = true;
        setSelectedSchema(schema);
        updateUrlWithSchemaId(schema.id);
    }, [updateUrlWithSchemaId]);

    // Reset nodes/edges khi schema thay đổi
    // Collaboration hook sẽ load data từ Yjs và override nodes/edges nếu có data
    useEffect(() => {
        if (!selectedSchema?.id) return;
        
        // Reset ngay để tránh hiển thị data từ schema cũ
        setNodesState(initialNodes);
        setEdgesState(initialEdges);
        setIsLoadingDiagram(true);
        
        // Reset history khi schema thay đổi
        resetHistory();
    }, [selectedSchema?.id, setNodesState, setEdgesState, resetHistory]);

    // Tắt loading khi có data hoặc sau một khoảng thời gian
    useEffect(() => {
        if (!isLoadingDiagram) return;
        
        // Nếu có nodes hoặc edges, tắt loading
        if (nodes.length > 0 || edges.length > 0) {
            // Delay một chút để đảm bảo data đã được render
            const timer = setTimeout(() => {
                setIsLoadingDiagram(false);
            }, 100);
            return () => clearTimeout(timer);
        }
        
        // Nếu không có data sau 500ms, tắt loading (có thể diagram trống)
        const timeout = setTimeout(() => {
            setIsLoadingDiagram(false);
        }, 500);
        
        return () => clearTimeout(timeout);
    }, [nodes, edges, isLoadingDiagram]);

    useEffect(() => {
        if (token) {
            const sessionId = crypto.randomUUID();
            setSessionId(sessionId);
        }
    }, [token]);


    const selectedNode = useMemo(() => {
        return nodes.find(node => node.selected);
    }, [nodes]);

    const selectedEdge = useMemo(() => {
        return edges.find(edge => edge.selected);
    }, [edges]);

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

    const getViewportCenter = useCallback(() => {
        const instance = reactFlowInstanceRef.current;
        const wrapper = reactFlowWrapperRef.current;
        if (!instance || !wrapper) return null;
        const rect = wrapper.getBoundingClientRect();
        const centerPoint = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        return instance.project(centerPoint);
    }, []);

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
    } = useMemo(
        () => createNodeCreators(setNodes, { getViewportCenter }),
        [setNodes, getViewportCenter]
    );

    const { 
        updateNodeName, 
        updateAttributeKey,
        addRelationTableColumn,
        removeRelationTableColumn,
        updateRelationTableColumn,
    } = useMemo(
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
            "relation-table-edge": RelationTableEdge,
        }),
        []
    );

    const onConnect = useCallback<OnConnect>((connection: Connection) => {
        // Check if connection involves relation table nodes
        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);
        const isRelationTableEdge = sourceNode?.type === 'relation' || targetNode?.type === 'relation';
        
        const edgeWithId = {
            ...connection,
            id: generateDiagramId(),
            type: isRelationTableEdge ? "relation-table-edge" : "erd-edge",
            animated: false,
        };
        setEdges((eds) => addEdge(edgeWithId, eds));
    }, [setEdges, nodes]);

    const handlePaneClick = useCallback(() => {
        setNodes((existingNodes) => existingNodes.map((node) => ({ ...node, selected: false })));
        setEdges((existingEdges) => existingEdges.map((edge) => ({ ...edge, selected: false })));
    }, [setNodes, setEdges]);

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

    // Keyboard shortcuts cho undo/redo
    useEffect(() => {
        const handleUndoRedoShortcut = (event: KeyboardEvent) => {
            // Bỏ qua nếu đang focus vào input, textarea, hoặc contenteditable
            const target = event.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                return;
            }

            const isCtrlOrCmd = event.ctrlKey || event.metaKey;
            const isShift = event.shiftKey;

            // Ctrl+Z hoặc Cmd+Z: Undo
            if (isCtrlOrCmd && event.key === 'z' && !isShift) {
                event.preventDefault();
                if (canUndo()) {
                    handleUndo();
                }
                return;
            }

            // Ctrl+Y hoặc Cmd+Y: Redo
            if (isCtrlOrCmd && event.key === 'y' && !isShift) {
                event.preventDefault();
                if (canRedo()) {
                    handleRedo();
                }
                return;
            }

            // Ctrl+Shift+Z hoặc Cmd+Shift+Z: Redo
            if (isCtrlOrCmd && event.key === 'z' && isShift) {
                event.preventDefault();
                if (canRedo()) {
                    handleRedo();
                }
                return;
            }
        };

        window.addEventListener('keydown', handleUndoRedoShortcut);
        return () => window.removeEventListener('keydown', handleUndoRedoShortcut);
    }, [handleUndo, handleRedo, canUndo, canRedo]);

    const isConceptualSchema = selectedSchema?.type === SchemaType.CONCEPTUAL;
    const isLogicalSchema = selectedSchema?.type === SchemaType.LOGICAL;
    const resolvedUserName = effectiveUser?.fullName ?? effectiveUser?.email ?? projectData?.owner?.name ?? "You";
    const resolvedUserAvatar = effectiveUser?.avatar ?? undefined;

    const { viewport, handleViewportChange } = useDiagramViewport({
        selectedSchemaId: selectedSchema?.id,
        nodes,
        isReactFlowReady,
        reactFlowInstanceRef,
    });

    const { awareness: conceptualAwareness } = useConceptualCollaboration({
        enabled: Boolean(isConceptualSchema),
        projectId: projectData?.id,
        schema: selectedSchema,
        sessionId,
        token,
        nodes,
        edges,
        setNodes,
        setEdges,
        diagramName,
    });

    const { awareness: logicalAwareness } = useLogicalCollaboration({
        enabled: Boolean(isLogicalSchema),
        projectId: projectData?.id,
        schema: selectedSchema,
        sessionId,
        token,
        nodes,
        edges,
        setNodes,
        setEdges,
        diagramName,
    });

    const awareness = isConceptualSchema ? conceptualAwareness : isLogicalSchema ? logicalAwareness : null;

    const projectAwareness = useProjectAwareness({
        enabled: Boolean(projectData?.id && sessionId),
        projectId: projectData?.id,
        sessionId,
        token,
    });

    const {
        remoteCursors,
        broadcastCursorPosition,
    } = useCollaborationAwareness({
        enabled: Boolean(isConceptualSchema || isLogicalSchema),
        awareness,
        sessionId,
        currentUserName: resolvedUserName,
        currentUserAvatar: resolvedUserAvatar,
        schemaId: selectedSchema?.id,
    });

    const {
        remoteUsers,
        broadcastViewport,
    } = useCollaborationAwareness({
        enabled: Boolean(projectAwareness),
        awareness: projectAwareness,
        sessionId,
        currentUserName: resolvedUserName,
        currentUserAvatar: resolvedUserAvatar,
        schemaId: selectedSchema?.id,
    });

    const handleFollowUserViewport = useCallback((user: RemoteCollaborator) => {
        if (!user.viewport) return;
        const instance = reactFlowInstanceRef.current;
        if (!instance) return;
        if (user.schemaId && user.schemaId !== selectedSchema?.id) {
            const targetSchema = schemaList.find((schema) => schema.id === user.schemaId);
            if (targetSchema) {
                handleSetSelectedSchema(targetSchema);
            }
        }
        instance.setViewport({
            x: user.viewport.x,
            y: user.viewport.y,
            zoom: user.viewport.zoom,
        });
        handleViewportChange(user.viewport);
    }, [handleViewportChange, schemaList, selectedSchema?.id, handleSetSelectedSchema]);

    useEffect(() => {
        if (!projectAwareness) return;
        if (!viewport) {
            broadcastViewport(null);
            return;
        }
        broadcastViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    }, [projectAwareness, viewport, broadcastViewport]);

    useEffect(() => {
        if (!isConceptualSchema && !isLogicalSchema) {
            broadcastCursorPosition(null);
            return;
        }

        const element = diagramWrapperEl;
        if (!element) return;
        const instance = reactFlowInstanceRef.current;
        if (!instance) return;

        let rafId: number | null = null;

        const emitPosition = (event: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            const localX = event.clientX - rect.left;
            const localY = event.clientY - rect.top;
            const flowPosition = instance.project({ x: localX, y: localY });
            const cursorPayload = { flowX: flowPosition.x, flowY: flowPosition.y };

            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                broadcastCursorPosition(cursorPayload);
            });
        };

        const handlePointerMove = (event: PointerEvent) => {
            emitPosition(event);
        };

        const handlePointerDown = (event: PointerEvent) => {
            emitPosition(event);
        };

        const handlePointerLeave = () => {
            broadcastCursorPosition(null);
        };

        element.addEventListener("pointermove", handlePointerMove);
        element.addEventListener("pointerdown", handlePointerDown);
        element.addEventListener("pointerleave", handlePointerLeave);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            element.removeEventListener("pointermove", handlePointerMove);
            element.removeEventListener("pointerdown", handlePointerDown);
            element.removeEventListener("pointerleave", handlePointerLeave);
            broadcastCursorPosition(null);
        };
    }, [broadcastCursorPosition, isConceptualSchema, isLogicalSchema, diagramWrapperEl]);

    return (
        <ReactFlowProvider>
            <div className="h-screen w-full">
                <AddPage 
                    open={isAddPageOpen} 
                    onClose={() => setIsAddPageOpen(false)}
                    projectId={projectData?.id || null}
                />
        <Header
                    diagramName={diagramName}
                    isEditingDiagramName={isEditingDiagramName}
                    onSetDiagramName={setDiagramName}
                    onSetIsEditingDiagramName={setIsEditingDiagramName}
                    onOpenSearchModal={() => setIsSearchModalOpen(true)}
                    collaborators={remoteUsers}
                    onFollowUser={handleFollowUserViewport}
                />
                <div className="flex h-full">
                    <NotationsSidebar
                        isOpen={isSidebarModalOpen}
                        onAddPage={() => setIsAddPageOpen(true)}
                        onAddEntity={addEntity}
                        onAddDoubleEntity={addDoubleEntity}
                        onAddAttribute={addAttribute}
                        onAddMultivaluedAttribute={addMultivaluedAttribute}
                        onAddDashedAttribute={addDashedAttribute}
                        onAddRelationship={addRelationship}
                        onAddDoubleRelationship={addDoubleRelationship}
                        onAddConstraint={addConstraint}
                        onAddRelationTable={addRelationTable}
                        projectSchemasData={schemaList}
                        selectedSchema={selectedSchema}
                        setSelectedSchema={handleSetSelectedSchema}
                        projectId={projectData?.id ?? null}
                    />

                    <PropertiesPanel
                        isOpen={isRightPanelOpen}
                        selectedNode={selectedNode}
                        selectedEdge={selectedEdge}
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
                        onUpdateEdgeFromMult={(value) => {
                            if (!selectedEdge) return;
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? { ...edge, data: { ...edge.data, fromMult: value || undefined } }
                                        : edge
                                )
                            );
                        }}
                        onUpdateEdgeToMult={(value) => {
                            if (!selectedEdge) return;
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? { ...edge, data: { ...edge.data, toMult: value || undefined } }
                                        : edge
                                )
                            );
                        }}
                        onUpdateEdgeLineStyle={(style) => {
                            if (!selectedEdge) return;
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? { ...edge, data: { ...edge.data, lineStyle: style } }
                                        : edge
                                )
                            );
                        }}
                        onUpdateEdgeBracketDirection={(direction) => {
                            if (!selectedEdge) return;
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? { ...edge, data: { ...edge.data, bracketDirection: direction } }
                                        : edge
                                )
                            );
                        }}
                        onAddRelationTableColumn={addRelationTableColumn}
                        onRemoveRelationTableColumn={removeRelationTableColumn}
                        onUpdateRelationTableColumn={updateRelationTableColumn}
                    />
                    <div
                        className="flex-1 h-full relative"
                        ref={(el) => {
                            reactFlowWrapperRef.current = el;
                            setDiagramWrapperEl(el);
                        }}
                    >
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
                            connectionMode={ConnectionMode.Loose}
                            isValidConnection={(connection) => {
                                // Allow multiple connections to the same handle
                                return true;
                            }}
                            onInit={(instance) => {
                                reactFlowInstanceRef.current = instance;
                                setIsReactFlowReady(true);
                                if (viewport) {
                                    instance.setViewport({
                                        x: viewport.x,
                                        y: viewport.y,
                                        zoom: viewport.zoom,
                                    });
                                }
                            }}
                            onMove={(_, viewportState) => handleViewportChange(viewportState)}
                            selectionOnDrag
                            selectionMode={SelectionMode.Partial}
                            multiSelectionKeyCode={["Shift", "Meta"]}
                            autoPanOnNodeDrag
                            fitView={false}
                            defaultViewport={viewport ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom } : undefined}
                            proOptions={{ hideAttribution: true }}
                        >
                            {isLoadingDiagram && (
                                <div className="absolute inset-0 z-50 bg-white/30 backdrop-blur-sm flex items-center justify-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="relative w-10 h-10">
                                            <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
                                            <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <Background
                                variant={BackgroundVariant.Dots}
                                gap={16}
                                size={1}
                            />
                        </ReactFlow>
                        <RemoteCursorsOverlay
                            cursors={remoteCursors}
                            containerRef={diagramWrapperEl}
                            viewport={viewport}
                        />
                    </div>
                </div>

                <Footer
                    isSidebarModalOpen={isSidebarModalOpen}
                    isRightPanelOpen={isRightPanelOpen}
                    onToggleSidebar={() => setIsSidebarModalOpen(!isSidebarModalOpen)}
                    onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
                    onToggleChatBox={() => setIsChatBoxOpen(!isChatBoxOpen)}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={canUndo()}
                    canRedo={canRedo()}
                />

                <SearchModal open={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />
                <ChatBox isOpen={isChatBoxOpen} onClose={() => setIsChatBoxOpen(false)} />
            </div>
        </ReactFlowProvider>
    );
};

export default EditProject;
