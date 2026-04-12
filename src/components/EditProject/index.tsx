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
    getNodesBounds,
    getViewportForBounds,
} from "reactflow";
import { toPng, toSvg } from 'html-to-image';
import { message } from 'antd';
import "reactflow/dist/style.css";
import RelationshipNode from "@/components/erds-notations/relationship";
import AttributeNode from "@/components/erds-notations/attribute";
import EntityNode from "@/components/erds-notations/entity";
import ConstraintNode from "@/components/erds-notations/constraint";
import RelationTableNode, { type RelationTableData } from "@/components/erds-notations/relation-table";
import LogicalTableNode from "@/components/erds-notations/logical-table";
import ErdEdge from "@/components/erd-edge";
import RelationTableEdge from "@/components/relation-table-edge";
import LogicalTableEdge from "@/components/logical-table-edge";
import SearchModal from "./components/SearchModal";
import NotationsSidebar from "./components/NotationsSidebar";
import PropertiesPanel from "./components/PropertiesPanel";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ChatBox from "./components/ChatBox";
import ExportModal, { ExportSettings, ExportFormat, ExportScope } from "./components/ExportModal";
import { generateDiagramId, createNodeCreators, createUpdateFunctions } from "./utils/functions";
import { ProjectResponse, ProjectSchemasResponse } from "@/types/projects.type";
import type { UserResponse } from "@/types/user.type";
import useToken from "@/hooks/useToken";
import { AddPage } from "./components/AddPage";
import { useRouter, useSearchParams } from "next/navigation";
import { SchemaType } from "@/utils/constants";
import { useConceptualCollaboration } from "./hooks/useConceptualCollaboration";
import { useLogicalCollaboration } from "./hooks/useLogicalCollaboration";
import { usePhysicalCollaboration } from "./hooks/usePhysicalCollaboration";
import { useDiagramViewport } from "./hooks/useDiagramViewport";
import { useCollaborationAwareness } from "./hooks/useCollaborationAwareness";
import type { RemoteCollaborator } from "./hooks/useCollaborationAwareness";
import { useProjectAwareness } from "./hooks/useProjectAwareness";
import { RemoteCursorsOverlay } from "./components/RemoteCursorsOverlay";
import { useAuth } from "@/providers/AuthProvider";
import { checkSchemaExistence, getProjectPermissions } from "@/api/projects/client";
import { useUndoRedo } from "./hooks/useUndoRedo";
import ShareProject from "@/components/ShareProject";

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
    const isDiagramReadyRef = useRef(false);
    const [interactionMode, setInteractionMode] = useState<'default' | 'panning'>('default');

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

    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [userPermission, setUserPermission] = useState<string | null>(null);
    const [isValidSchema, setIsValidSchema] = useState<boolean | null>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        if (!projectData?.id) {
            setHasPermission(false);
            return;
        }

        const checkPerms = async () => {
            const perm = await getProjectPermissions(projectData.id);
            
            if (perm) {
                // Check if user has pending invitation
                if (perm.permission === 'invited' && perm.invitationId) {
                    // Redirect to accept invite page
                    setIsRedirecting(true);
                    router.push(`/accept-invite?token=${perm.invitationId}`);
                    return;
                }
                setHasPermission(true);
                setUserPermission(perm.permission);
            } else {
                setHasPermission(false);
                setUserPermission(null);
            }
        };

        checkPerms();
    }, [projectData?.id, router]);

    // Check if user can edit (owner or editor)
    const canEdit = userPermission === 'owner' || userPermission === 'editor';

    // Prevent delete/backspace when user is viewer
    useEffect(() => {
        if (canEdit) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Block Delete, Backspace and other editing keys for viewers
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const target = e.target as HTMLElement;
                // Only prevent if not in an input/textarea
                if (!target.matches('input, textarea, [contenteditable="true"]')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [canEdit]);

    useEffect(() => {
        if (!projectData?.id || !selectedSchema?.id) {
            return;
        }

        let isMounted = true;
        const checkSchema = async () => {
            setIsValidSchema(null);
            const exists = await checkSchemaExistence(projectData.id, selectedSchema.id);
            if (isMounted) setIsValidSchema(exists);
        };

        checkSchema();
        return () => { isMounted = false; };
    }, [projectData?.id, selectedSchema?.id]);

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
    const { user: currentUserClient } = useAuth();
    const effectiveUser = currentUserClient ?? currentUser;
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isAddPageOpen, setIsAddPageOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isShareProjectOpen, setIsShareProjectOpen] = useState(false);
    const [exportInitialConfig, setExportInitialConfig] = useState<{ format: ExportFormat; scope: ExportScope }>({ format: 'png', scope: 'all' });

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
            // Clear data immediately to prevent stale data from being synced to the new schema
            setNodesState(initialNodes);
            setEdgesState(initialEdges);
            setSelectedSchema(targetSchema);
            if (!schemaIdFromUrl) {
                updateUrlWithSchemaId(targetSchema.id);
            }
            isDiagramReadyRef.current = true;
        } else if (schemaIdFromUrl && !targetSchema) {
            setIsValidSchema(false);
            isDiagramReadyRef.current = true;
        }
    }, [schemaList, searchParams, selectedSchema?.id, updateUrlWithSchemaId, setNodesState, setEdgesState]);

    const handleSetSelectedSchema = useCallback((schema: ProjectSchemasResponse) => {
        if (schema.id === selectedSchema?.id) return;

        isUserSelectingSchemaRef.current = true;
        // Clear data immediately to prevent stale data from being synced to the new schema
        setNodesState(initialNodes);
        setEdgesState(initialEdges);
        setSelectedSchema(schema);
        updateUrlWithSchemaId(schema.id);
    }, [selectedSchema?.id, updateUrlWithSchemaId, setNodesState, setEdgesState]);

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
        addLogicalTable,
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
        addLogicalTableAttribute,
        removeLogicalTableAttribute,
        updateLogicalTableAttribute,
        reorderLogicalTableAttributes,
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
            "logical-table": LogicalTableNode,
        }),
        []
    );

    const edgeTypes = useMemo<EdgeTypes>(
        () => ({
            "erd-edge": ErdEdge,
            "relation-table-edge": RelationTableEdge,
            "logical-table-edge": LogicalTableEdge,
        }),
        []
    );

    const onConnect = useCallback<OnConnect>((connection: Connection) => {
        // Check if connection involves relation table nodes or logical table nodes
        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);
        const isRelationTableEdge = sourceNode?.type === 'relation' || targetNode?.type === 'relation';
        const isLogicalTableEdge = sourceNode?.type === 'logical-table' || targetNode?.type === 'logical-table';

        let edgeType = "erd-edge";
        if (isLogicalTableEdge) {
            edgeType = "logical-table-edge";
        } else if (isRelationTableEdge) {
            edgeType = "relation-table-edge";
        }

        const edgeWithId = {
            ...connection,
            id: generateDiagramId(),
            type: edgeType,
            animated: false,
            // Add arrow marker for logical table edges
            ...(isLogicalTableEdge ? { markerEnd: { type: 'arrowclosed' } } : {}),
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
    const isPhysicalSchema = selectedSchema?.type === SchemaType.PHYSICAL;
    const resolvedUserName = effectiveUser?.fullName ?? effectiveUser?.email ?? projectData?.owner?.name ?? "You";
    const resolvedUserAvatar = effectiveUser?.avatar ?? undefined;

    const { viewport, handleViewportChange } = useDiagramViewport({
        selectedSchemaId: selectedSchema?.id,
        selectedSchema,
        nodes,
        isReactFlowReady,
        reactFlowInstanceRef,
    });

    const {
        awareness: conceptualAwareness,
        applyModelPayload,
        mutateModel: conceptualMutateModel,
        modelData: conceptualModelData,
    } = useConceptualCollaboration({
        enabled: Boolean(isConceptualSchema && hasPermission && isValidSchema === true && !!token),
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
        enabled: Boolean(isLogicalSchema && hasPermission && isValidSchema === true && !!token),
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

    const { awareness: physicalAwareness } = usePhysicalCollaboration({
        enabled: Boolean(isPhysicalSchema && hasPermission && isValidSchema === true && !!token),
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

    const awareness = isConceptualSchema ? conceptualAwareness : isLogicalSchema ? logicalAwareness : isPhysicalSchema ? physicalAwareness : null;

    // Override entity/relationship creators with model-first versions when
    // operating on a conceptual schema (model-as-truth architecture).
    const modelAwareCreators = useMemo(
        () =>
            isConceptualSchema && conceptualMutateModel
                ? createNodeCreators(setNodes, { getViewportCenter, mutateModel: conceptualMutateModel })
                : null,
        [isConceptualSchema, conceptualMutateModel, setNodes, getViewportCenter],
    );
    const effectiveAddEntity = modelAwareCreators?.addEntity ?? addEntity;
    const effectiveAddDoubleEntity = modelAwareCreators?.addDoubleEntity ?? addDoubleEntity;
    const effectiveAddRelationship = modelAwareCreators?.addRelationship ?? addRelationship;
    const effectiveAddDoubleRelationship = modelAwareCreators?.addDoubleRelationship ?? addDoubleRelationship;

    const projectAwareness = useProjectAwareness({
        enabled: Boolean(projectData?.id && sessionId && hasPermission && isValidSchema === true && !!token),
        projectId: projectData?.id,
        sessionId,
        token,
    });

    const {
        remoteCursors,
        broadcastCursorPosition,
    } = useCollaborationAwareness({
        enabled: Boolean((isConceptualSchema || isLogicalSchema || isPhysicalSchema) && hasPermission),
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
        enabled: Boolean(projectAwareness && hasPermission),
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
        if (!isConceptualSchema && !isLogicalSchema && !isPhysicalSchema) {
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
    }, [broadcastCursorPosition, isConceptualSchema, isLogicalSchema, isPhysicalSchema, diagramWrapperEl]);

    const handleDownload = useCallback(() => {
        // Defaults for opening the modal
        const nodesToExport = nodes.filter(n => n.selected);
        const hasSelection = nodesToExport.length > 0;
        
        setExportInitialConfig({ 
            format: 'png', 
            scope: hasSelection ? 'selected' : 'all' 
        });
        setIsExportModalOpen(true);
    }, [nodes]);

    const executeExport = useCallback((settings: ExportSettings) => {
        const { format, scope, transparent, backgroundColor, quality } = settings;
        const instance = reactFlowInstanceRef.current;
        if (!instance) return;

        const nodesToExport = scope === 'selected' ? nodes.filter(n => n.selected) : nodes;
        const nodesBounds = getNodesBounds(nodesToExport);
        
        // Add padding
        const padding = 20;
        const imageWidth = nodesBounds.width + (padding * 2);
        const imageHeight = nodesBounds.height + (padding * 2);
        
        const transform = getViewportForBounds(
            nodesBounds, 
            imageWidth, 
            imageHeight, 
            0.5, 
            2
        );

        const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
        if (!viewport) return;

        const options = {
            backgroundColor: transparent ? undefined : backgroundColor,
            width: imageWidth,
            height: imageHeight,
            style: {
                width: String(imageWidth),
                height: String(imageHeight),
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
            },
            pixelRatio: format === 'png' ? quality : 1,
            filter: (node: HTMLElement) => {
                // Ensure node is an HTMLElement to avoid getAttribute error
                if (!(node instanceof HTMLElement)) return true;

                if (scope === 'all') return true;
                
                // Simple filter: if node has data-id, check if it's in nodesToExport
                const id = node.getAttribute('data-id');
                if (id) {
                    return nodesToExport.some(n => n.id === id);
                }
                
                // Check for edges
                if (node.classList?.contains('react-flow__edge')) {
                     const edgeId = node.getAttribute('data-id');
                     if (!edgeId) return true;
                     
                     // Find edge in edges state
                     const edge = edges.find(e => e.id === edgeId);
                     if (edge) {
                        return nodesToExport.some(n => n.id === edge.source) && nodesToExport.some(n => n.id === edge.target);
                     }
                }
                return true;
            }
        };

        const downloadImage = (dataUrl: string) => {
            const a = document.createElement('a');
            a.setAttribute('download', `${diagramName}.${format}`);
            a.setAttribute('href', dataUrl);
            a.click();
        };

        if (format === 'png') {
            toPng(viewport, options)
                .then(downloadImage)
                .catch((err) => {
                    console.error('Export failed:', err);
                    message.error('Failed to export diagram.');
                });
        } else {
            toSvg(viewport, options)
                .then(downloadImage)
                .catch((err) => {
                    console.error('Export failed:', err);
                    message.error('Failed to export diagram.');
                });
        }
    }, [nodes, edges, diagramName]);

    const handleExportJson = useCallback(() => {
        const data = {
            nodes,
            edges,
            viewport: reactFlowInstanceRef.current?.getViewport(),
        };
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${diagramName}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [nodes, edges, diagramName]);

    // Show loading state when redirecting to accept invite page
    if (isRedirecting) {
        return (
            <div className="h-screen w-full flex items-center justify-center">
                <div className="text-gray-500">Redirecting to accept invitation...</div>
            </div>
        );
    }

    if (hasPermission === false || isValidSchema === false || (!selectedSchema && isDiagramReadyRef.current && isValidSchema !== null)) return (
        <div className="h-screen w-full flex flex-col items-center justify-center text-center px-4">
            <div className="text-base font-semibold text-gray-800">
                Page not found
            </div>

            <div className="mt-1 text-sm text-gray-500">
                The page you are looking for doesn’t exist or has been moved. <span className="font-semibold text-blue-500 cursor-pointer" onClick={() => router.replace('/')}>Click here</span> to go back to home.
            </div>
        </div>
    );


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
                    canEdit={canEdit}
                    onSetDiagramName={setDiagramName}
                    onSetIsEditingDiagramName={setIsEditingDiagramName}
                    onOpenSearchModal={() => setIsSearchModalOpen(true)}
                    collaborators={remoteUsers}
                    onFollowUser={handleFollowUserViewport}
                    onDownload={handleDownload}
                    onExportJson={handleExportJson}
                    onShareClick={() => setIsShareProjectOpen(true)}
                />
                <ShareProject
                    projectId={projectData?.id}
                    projectName={projectData?.name}
                    openShareProject={isShareProjectOpen}
                    setOpenShareProject={setIsShareProjectOpen}
                />
                <ExportModal
                    isOpen={isExportModalOpen}
                    onClose={() => setIsExportModalOpen(false)}
                    onExport={executeExport}
                    initialValues={exportInitialConfig}
                    hasSelection={nodes.some(n => n.selected)}
                />
                <div className="flex h-full">
                    <NotationsSidebar
                        isOpen={isSidebarModalOpen}
                        canEdit={canEdit}
                        onAddPage={() => setIsAddPageOpen(true)}
                        onAddEntity={effectiveAddEntity}
                        onAddDoubleEntity={effectiveAddDoubleEntity}
                        onAddAttribute={addAttribute}
                        onAddMultivaluedAttribute={addMultivaluedAttribute}
                        onAddDashedAttribute={addDashedAttribute}
                        onAddRelationship={effectiveAddRelationship}
                        onAddDoubleRelationship={effectiveAddDoubleRelationship}
                        onAddConstraint={addConstraint}
                        onAddRelationTable={selectedSchema?.type === SchemaType.LOGICAL ? addLogicalTable : addRelationTable}
                        projectSchemasData={schemaList}
                        selectedSchema={selectedSchema}
                        setSelectedSchema={handleSetSelectedSchema}
                        projectId={projectData?.id ?? null}
                        nodes={nodes}
                        onNodeClick={(nodeId) => {
                            const node = nodes.find(n => n.id === nodeId);
                            if (node) {
                                setNodes((nds) => nds.map((n) => ({
                                    ...n,
                                    selected: n.id === nodeId
                                })));
                                reactFlowInstanceRef.current?.fitView({
                                    nodes: [{ id: nodeId }],
                                    duration: 500,
                                    padding: 0.5,
                                });
                            }
                        }}
                    />

                    <PropertiesPanel
                        isOpen={isRightPanelOpen}
                        canEdit={canEdit}
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
                        onAddLogicalTableAttribute={addLogicalTableAttribute}
                        onRemoveLogicalTableAttribute={removeLogicalTableAttribute}
                        onUpdateLogicalTableAttribute={updateLogicalTableAttribute}
                        onReorderLogicalTableAttributes={reorderLogicalTableAttributes}
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
                            onNodesChange={canEdit ? onNodesChange : undefined}
                            onEdgesChange={canEdit ? onEdgesChange : undefined}
                            onConnect={canEdit ? onConnect : undefined}
                            onPaneClick={handlePaneClick}
                            connectionMode={ConnectionMode.Loose}
                            isValidConnection={() => {
                                // Allow multiple connections to the same handle
                                return canEdit;
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
                            selectionOnDrag={interactionMode === 'default'}
                            panOnDrag={interactionMode === 'panning' ? true : [1, 2]}
                            panOnScroll={true}
                            selectionMode={SelectionMode.Partial}
                            multiSelectionKeyCode={["Shift", "Meta"]}
                            autoPanOnNodeDrag
                            
                            elementsSelectable={interactionMode === 'default'}
                            nodesDraggable={canEdit && interactionMode === 'default'}
                            nodesConnectable={canEdit && interactionMode === 'default'}
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
                    canEdit={canEdit}
                    onToggleSidebar={() => setIsSidebarModalOpen(!isSidebarModalOpen)}
                    onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
                    onToggleChatBox={() => setIsChatBoxOpen(!isChatBoxOpen)}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={canUndo()}
                    canRedo={canRedo()}
                    interactionMode={interactionMode}
                    setInteractionMode={setInteractionMode}
                />

                <SearchModal open={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />
                <ChatBox isOpen={isChatBoxOpen} onClose={() => setIsChatBoxOpen(false)} />
            </div>
        </ReactFlowProvider>
    );
};

export default EditProject;
