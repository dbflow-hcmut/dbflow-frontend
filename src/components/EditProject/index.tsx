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
import { notificationProvider } from "@/providers/notification";
import { apiGet } from "@/lib/clientFetch";
import { PROXY_PROJECT_DETAIL } from "@/api";
import "reactflow/dist/style.css";
import RelationshipNode from "@/components/erds-notations/relationship";
import AttributeNode from "@/components/erds-notations/attribute";
import EntityNode from "@/components/erds-notations/entity";
import ConstraintNode from "@/components/erds-notations/constraint";
import RelationTableNode, { type RelationTableData } from "@/components/erds-notations/relation-table";
import LogicalTableNode, { type LogicalTableData } from "@/components/erds-notations/logical-table";
import StickyNoteNode, { type StickyNoteData } from "@/components/erds-notations/sticky-note";
import TextLabelNode, { type TextLabelData } from "@/components/erds-notations/text-label";
import DrawingPathNode, { type DrawingPathData } from "@/components/erds-notations/drawing-path";
import ErdEdge from "@/components/erd-edge";
import RelationTableEdge from "@/components/relation-table-edge";
import LogicalTableEdge from "@/components/logical-table-edge";
import SearchModal from "./components/SearchModal";
import NotationsSidebar from "./components/NotationsSidebar";
import PropertiesPanel from "./components/PropertiesPanel";
import Header from "./components/Header";
import Footer, { type ToolMode } from "./components/Footer";
import ChatBox from "./components/ChatBox";
import DrawingOverlay from "./components/DrawingOverlay";
import ExportModal, { ExportSettings, ExportFormat, ExportScope } from "./components/ExportModal";
import DDLExportModal from "./components/DDLExportModal";
import DDLImportModal from "./components/DDLImportModal";
import ConvertToPhysicalModal from "./components/ConvertToPhysicalModal";
import type { DBMSType } from "./utils/dbms-config";
import HTMLDocsExportModal from "./components/HTMLDocsExportModal";
import VersionHistoryDrawer from "./components/VersionHistoryDrawer";
import CommentPin, { type CommentData, type MentionableUser } from "./components/CommentPin";
import CommentPanel from "./components/CommentPanel";
import { fetchComments, createComment, updateComment, deleteComment } from "./api/comments";
import { generateDiagramId, createNodeCreators, createUpdateFunctions } from "./utils/functions";
import { ProjectResponse, ProjectSchemasResponse, ISharedPermissionResponse } from "@/types/projects.type";
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
import TourGuide from "./components/TourGuide";
import { useAuth } from "@/providers/AuthProvider";
import { checkSchemaExistence, getProjectPermissions } from "@/api/projects/client";
import { createSchema, saveSchemaModel } from "./api/client";
import { convertLogicalToPhysical, convertPhysicalToLogical, convertLogicalToConceptual, convertConceptualToLogical, convertPhysicalToConceptual, convertConceptualToPhysical } from "./utils/schema-conversion";
import { useUndoRedo } from "./hooks/useUndoRedo";
import ShareProject from "@/components/ShareProject";
import type { ConceptualModelPayload } from "./utils/conceptual-model.builder";
import { buildConceptualModel } from "./utils/conceptual-model.builder";
import type { LogicalModelPayload } from "./utils/logical-model.builder";
import { buildLogicalModel } from "./utils/logical-model.builder";
import type { PhysicalModelPayload } from "./utils/physical-model.builder";
import { buildPhysicalModel } from "./utils/physical-model.builder";
import { mapStoredNodesToReactNodes, mapStoredEdgesToReactEdges, mapReactNodesToStoredNodes as mapPhysicalReactToStored, mapReactEdgesToStoredEdges as mapPhysicalReactEdgesToStored } from "./utils/physical-diagram.builder";
import type { StoredPhysicalNode, StoredPhysicalDiagramEdge } from "./utils/physical-diagram.builder";
import {
    mapStoredNodesToReactNodes as mapLogicalStoredToReact,
    mapStoredEdgesToReactEdges as mapLogicalEdgesStoredToReact,
    mapReactNodesToStoredNodes as mapLogicalReactToStored,
    mapReactEdgesToStoredEdges as mapLogicalReactEdgesToStored,
} from "./utils/logical-diagram.builder";
import {
    mapStoredNodesToReactNodes as mapConceptualStoredToReact,
    mapStoredEdgesToReactEdges as mapConceptualEdgesStoredToReact,
    mapReactNodesToStoredNodes as mapConceptualReactToStored,
    mapReactEdgesToStoredEdges as mapConceptualReactEdgesToStored,
} from "./utils/conceptual-diagram.builder";
import type { StoredDiagramNode as StoredConceptualNode, StoredDiagramEdge as StoredConceptualEdge } from "./utils/conceptual-diagram.builder";
import { runConceptualLinter, runLogicalLinter, runPhysicalLinter } from "./utils/schema-linter";
import type { LintResult } from "./utils/schema-linter";
import LinterPanel from "./components/LinterPanel";
import NormalizationPanel from "./components/NormalizationPanel";
import type { DecomposedTable } from "./utils/normalization";

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

export type NodeData = EntityData | RelationshipData | AttributeData | ConstraintData | RelationTableData | StickyNoteData | TextLabelData | DrawingPathData;

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
    const [chatThreadId, setChatThreadId] = useState<string | undefined>(undefined);
    const [propertiesName, setPropertiesName] = useState("");
    const [selectedSchema, setSelectedSchema] = useState<ProjectSchemasResponse | null>(null);
    const [isLoadingDiagram, setIsLoadingDiagram] = useState(false);

    // Comment state
    const [commentMode, setCommentMode] = useState(false);
    const [comments, setComments] = useState<CommentData[]>([]);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [draftComment, setDraftComment] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
    const [mentionUsers, setMentionUsers] = useState<MentionableUser[]>([]);

    // Tool mode state (sticky-note, text-label, pen)
    const [activeToolMode, setActiveToolMode] = useState<ToolMode>('none');
    const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);

    // Track mouse for placement ghost preview
    useEffect(() => {
        if (activeToolMode !== 'sticky-note' && activeToolMode !== 'text-label') {
            setGhostPos(null);
            return;
        }
        const handler = (e: MouseEvent) => setGhostPos({ x: e.clientX, y: e.clientY });
        window.addEventListener('mousemove', handler);
        return () => window.removeEventListener('mousemove', handler);
    }, [activeToolMode]);

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

    // Version preview state
    const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null);
    const savedNodesBeforePreviewRef = useRef<Node<NodeData>[] | null>(null);
    const savedEdgesBeforePreviewRef = useRef<Edge[] | null>(null);

    // Check if user can edit (owner or editor) — disabled during version preview
    const canEdit = (userPermission === 'owner' || userPermission === 'editor') && !previewingVersionId;

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
    const [isDDLExportOpen, setIsDDLExportOpen] = useState(false);
    const [isDDLImportOpen, setIsDDLImportOpen] = useState(false);
    const [isHTMLDocsExportOpen, setIsHTMLDocsExportOpen] = useState(false);
    const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingPhysicalConvert, setPendingPhysicalConvert] = useState<{
        sourceLevel: "logical" | "conceptual";
        freshModel: LogicalModelPayload | ConceptualModelPayload;
    } | null>(null);
    const [isShareProjectOpen, setIsShareProjectOpen] = useState(false);
    const [exportInitialConfig, setExportInitialConfig] = useState<{ format: ExportFormat; scope: ExportScope }>({ format: 'png', scope: 'all' });
    const [isLinterOpen, setIsLinterOpen] = useState(false);
    const [isNormalizationOpen, setIsNormalizationOpen] = useState(false);

    const isUserSelectingSchemaRef = useRef(false);

    // Auto-open chatbox when navigated from AI chat page (with URL params)
    useEffect(() => {
        const openChat = searchParams.get("openChat");
        const chatThread = searchParams.get("chatThread");
        if (openChat === "true") {
            setIsChatBoxOpen(true);
            if (chatThread) {
                setChatThreadId(chatThread);
            }
            // Clean URL params (remove openChat and chatThread)
            const params = new URLSearchParams(searchParams.toString());
            params.delete("openChat");
            params.delete("chatThread");
            if (projectData?.id) {
                router.replace(`/projects/${projectData.id}?${params.toString()}`, { scroll: false });
            }
        }
    }, [searchParams, projectData?.id, router]);

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

    // Tắt loading khi collaboration hook đã build xong nodes,
    // hoặc sau timeout nếu diagram trống
    const diagramReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleDiagramReady = useCallback(() => {
        if (diagramReadyTimeoutRef.current) {
            clearTimeout(diagramReadyTimeoutRef.current);
            diagramReadyTimeoutRef.current = null;
        }
        setIsLoadingDiagram(false);
    }, []);

    useEffect(() => {
        if (!isLoadingDiagram) return;

        // Fallback: nếu không có data sau 5s, tắt loading (diagram trống hoặc lỗi)
        diagramReadyTimeoutRef.current = setTimeout(() => {
            setIsLoadingDiagram(false);
        }, 5000);

        return () => {
            if (diagramReadyTimeoutRef.current) {
                clearTimeout(diagramReadyTimeoutRef.current);
                diagramReadyTimeoutRef.current = null;
            }
        };
    }, [isLoadingDiagram]);

    // Load comments when schema changes
    const loadComments = useCallback(async () => {
        if (!projectData?.id || !selectedSchema?.id) return;
        try {
            const data = await fetchComments(projectData.id, selectedSchema.id);
            setComments(Array.isArray(data) ? data : []);
        } catch {
            // silently fail
        }
    }, [projectData?.id, selectedSchema?.id]);

    useEffect(() => {
        loadComments();
    }, [loadComments]);

    // Load project members for @mention
    useEffect(() => {
        if (!projectData?.id) return;
        (async () => {
            try {
                const url = `${PROXY_PROJECT_DETAIL(projectData.id)}/permissions`;
                const res = await apiGet<ISharedPermissionResponse>(url);
                if (res?.list_users) {
                    setMentionUsers(
                        res.list_users.map((u) => ({
                            userId: u.userId,
                            fullName: u.fullName,
                            email: u.email,
                            avatar: u.avatar,
                        })),
                    );
                }
            } catch {
                // silently fail
            }
        })();
    }, [projectData?.id]);

    // Comment handlers — draft-based flow (no browser prompt)
    const handlePlaceComment = useCallback(
        (x: number, y: number) => {
            if (!projectData?.id || !selectedSchema?.id) return;
            // Detect if click is inside a node
            let attachedNodeId: string | null = null;
            let storeX = x;
            let storeY = y;
            for (const node of nodes) {
                const nx = node.position.x;
                const ny = node.position.y;
                const nw = (node as unknown as { measured?: { width?: number } }).measured?.width ?? (node.width || 0);
                const nh = (node as unknown as { measured?: { height?: number } }).measured?.height ?? (node.height || 0);
                if (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh) {
                    attachedNodeId = node.id;
                    // Store as offset from node origin so it follows the node
                    storeX = x - nx;
                    storeY = y - ny;
                    break;
                }
            }
            setDraftComment({ x: storeX, y: storeY, nodeId: attachedNodeId });
            setActiveCommentId(null);
        },
        [projectData?.id, selectedSchema?.id, nodes],
    );

    const handleSubmitDraft = useCallback(
        async (content: string) => {
            if (!projectData?.id || !selectedSchema?.id || !draftComment) return;
            try {
                await createComment(projectData.id, selectedSchema.id, {
                    x: draftComment.x,
                    y: draftComment.y,
                    content,
                    nodeId: draftComment.nodeId ?? undefined,
                });
                await loadComments();
            } catch {
                notificationProvider.open({ type: "error", message: "Failed to create comment" });
            }
            setDraftComment(null);
            setCommentMode(false);
        },
        [projectData?.id, selectedSchema?.id, draftComment, loadComments],
    );

    const handleCancelDraft = useCallback(() => {
        setDraftComment(null);
        setCommentMode(false);
    }, []);

    const handleReplyComment = useCallback(async (parentId: string, content: string) => {
        if (!projectData?.id || !selectedSchema?.id) return;
        const parent = comments.find(c => c.id === parentId);
        if (!parent) return;
        try {
            await createComment(projectData.id, selectedSchema.id, {
                x: parent.x, y: parent.y, content, parentId,
            });
            await loadComments();
        } catch {
            notificationProvider.open({ type: "error", message: "Failed to add reply" });
        }
    }, [projectData?.id, selectedSchema?.id, comments, loadComments]);

    const handleResolveComment = useCallback(async (commentId: string) => {
        if (!projectData?.id || !selectedSchema?.id) return;
        try {
            await updateComment(projectData.id, selectedSchema.id, commentId, { resolved: true });
            await loadComments();
            setActiveCommentId(null);
        } catch {
            notificationProvider.open({ type: "error", message: "Failed to resolve comment" });
        }
    }, [projectData?.id, selectedSchema?.id, loadComments]);

    const handleDeleteComment = useCallback(async (commentId: string) => {
        if (!projectData?.id || !selectedSchema?.id) return;
        try {
            await deleteComment(projectData.id, selectedSchema.id, commentId);
            await loadComments();
            setActiveCommentId(null);
        } catch {
            notificationProvider.open({ type: "error", message: "Failed to delete comment" });
        }
    }, [projectData?.id, selectedSchema?.id, loadComments]);

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
            "sticky-note": StickyNoteNode,
            "text-label": TextLabelNode,
            "drawing-path": DrawingPathNode,
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

        // Determine storedType for conceptual ER edges
        let storedType: string | undefined;
        let edgeData: Record<string, unknown> = {};
        if (edgeType === "erd-edge") {
            const srcType = sourceNode?.type;
            const tgtType = targetNode?.type;
            const hasRelationship = srcType === 'relationship' || tgtType === 'relationship';
            const hasEntity = srcType === 'entity' || tgtType === 'entity';
            const hasAttribute = srcType === 'attribute' || tgtType === 'attribute';
            const hasConstraint = srcType === 'constraint' || tgtType === 'constraint';

            if (hasRelationship && hasEntity) {
                storedType = 'participation';
            } else if (hasAttribute) {
                storedType = 'componentOf';
            } else if (hasConstraint) {
                const constraintNode = srcType === 'constraint' ? sourceNode : targetNode;
                const symbol = (constraintNode?.data as { symbol?: string })?.symbol?.toLowerCase();
                if (symbol === 'u') {
                    // Category/Union: entity→constraint = categoryLink, constraint→entity = categoryMember
                    storedType = srcType === 'constraint' ? 'categoryMember' : 'categoryLink';
                    if (storedType === 'categoryLink') {
                        edgeData = { lineStyle: 'bracket', bracketDirection: 'to' };
                    }
                } else if (hasEntity) {
                    // ISA: entity→constraint = isaParent, constraint→entity = isaChild
                    storedType = srcType === 'constraint' ? 'isaChild' : 'isaParent';
                }
            }
        }

        const edgeWithId = {
            ...connection,
            id: generateDiagramId(),
            type: edgeType,
            animated: false,
            ...(edgeType === 'logical-table-edge'
                ? (() => {
                    // Auto-detect cardinality from column isKey
                    const srcData = sourceNode?.data as LogicalTableData | undefined;
                    const tgtData = targetNode?.data as LogicalTableData | undefined;
                    const parseColIdx = (handle?: string | null) => {
                        const m = handle?.match(/_col_(\d+)/);
                        return m ? parseInt(m[1], 10) : -1;
                    };
                    const srcCol = srcData?.columns?.[parseColIdx(connection.sourceHandle)];
                    const tgtCol = tgtData?.columns?.[parseColIdx(connection.targetHandle)];
                    const srcIsKey = srcCol?.isKey || false;
                    const tgtIsKey = tgtCol?.isKey || false;
                    // Both PK → 1:1, otherwise default N:1
                    const sourceCardinality = (srcIsKey && tgtIsKey) ? '1' : 'N';
                    const targetCardinality = '1';
                    return { data: { sourceCardinality, targetCardinality } };
                })()
                : (storedType || Object.keys(edgeData).length
                    ? { data: { ...edgeData, ...(storedType ? { storedType } : {}) } }
                    : {})),

        };
        setEdges((eds) => addEdge(edgeWithId, eds));
    }, [setEdges, nodes]);

    const edgeReconnectSuccessful = useRef(true);
    const reconnectingEdgeRef = useRef<Edge | null>(null);

    const onReconnectStart = useCallback((_: React.MouseEvent, edge: Edge) => {
        edgeReconnectSuccessful.current = false;
        reconnectingEdgeRef.current = edge;
    }, []);

    const onEdgeReconnect = useCallback(
        (oldEdge: Edge, newConnection: Connection) => {
            edgeReconnectSuccessful.current = true;
            reconnectingEdgeRef.current = null;
            setEdges((eds) =>
                eds.map((e) => {
                    if (e.id !== oldEdge.id) return e;
                    return {
                        ...e,
                        source: newConnection.source!,
                        target: newConnection.target!,
                        sourceHandle: newConnection.sourceHandle ?? e.sourceHandle,
                        targetHandle: newConnection.targetHandle ?? e.targetHandle,
                    };
                })
            );
        },
        [setEdges]
    );

    const onReconnectEnd = useCallback((_evt: MouseEvent | TouchEvent, _edge: Edge) => {
        if (!edgeReconnectSuccessful.current && reconnectingEdgeRef.current) {
            // Reconnection failed — restore the original edge
            const saved = reconnectingEdgeRef.current;
            setEdges((eds) => {
                const exists = eds.some((e) => e.id === saved.id);
                if (exists) {
                    // Edge still exists but may have been modified — restore it
                    return eds.map((e) => (e.id === saved.id ? saved : e));
                }
                // Edge was removed — re-add it
                return [...eds, saved];
            });
        }
        edgeReconnectSuccessful.current = true;
        reconnectingEdgeRef.current = null;
    }, [setEdges]);

    // Only allow reconnect on the selected edge (one handle can have many edges)
    const displayEdges = useMemo(
        () => edges.map((e) => ({ ...e, reconnectable: !!e.selected })),
        [edges]
    );

    const handlePaneClick = useCallback((event: React.MouseEvent) => {
        if (commentMode && reactFlowInstanceRef.current) {
            const canvasPos = reactFlowInstanceRef.current.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            handlePlaceComment(canvasPos.x, canvasPos.y);
            return;
        }
        // Place sticky note or text label on click
        if ((activeToolMode === 'sticky-note' || activeToolMode === 'text-label') && reactFlowInstanceRef.current) {
            const canvasPos = reactFlowInstanceRef.current.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            const id = generateDiagramId();
            if (activeToolMode === 'sticky-note') {
                setNodes((nds) => [
                    ...nds.map((n) => ({ ...n, selected: false })),
                    {
                        id,
                        type: 'sticky-note',
                        position: canvasPos,
                        data: { text: '', color: '#fef08a' } as StickyNoteData,
                        style: { width: 200, height: 150 },
                        selected: true,
                    },
                ]);
            } else {
                setNodes((nds) => [
                    ...nds.map((n) => ({ ...n, selected: false })),
                    {
                        id,
                        type: 'text-label',
                        position: canvasPos,
                        data: { text: '', fontSize: 14 } as TextLabelData,
                        style: { width: 150, height: 30 },
                        selected: true,
                    },
                ]);
            }
            setActiveToolMode('none');
            return;
        }
        // Close draft if clicking on empty canvas
        if (draftComment) {
            setDraftComment(null);
        }
        setNodes((existingNodes) => existingNodes.map((node) => ({ ...node, selected: false })));
        setEdges((existingEdges) => existingEdges.map((edge) => ({ ...edge, selected: false })));
        setActiveCommentId(null);
    }, [setNodes, setEdges, commentMode, handlePlaceComment, draftComment, activeToolMode]);

    // Convert completed pen stroke to a drawing-path node
    const handleStrokeComplete = useCallback(
        (rawPoints: { x: number; y: number }[], color: string, strokeWidth: number) => {
            if (rawPoints.length < 2) return;
            // Compute bounding box
            let minX = Infinity, minY = Infinity;
            for (const p of rawPoints) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
            }
            // Normalize points relative to bounding box origin
            const normalizedPoints = rawPoints.map((p) => ({
                x: p.x - minX,
                y: p.y - minY,
            }));
            const id = generateDiagramId();
            setNodes((nds) => [
                ...nds.map((n) => ({ ...n, selected: false })),
                {
                    id,
                    type: "drawing-path",
                    position: { x: minX, y: minY },
                    data: { points: normalizedPoints, color, strokeWidth } as DrawingPathData,
                    selected: true,
                },
            ]);
        },
        [setNodes]
    );

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

    // Schemas in the same project that can be sync'd to from the current schema
    const syncableSchemas = useMemo(() => {
        if (!selectedSchema) return [];
        return schemaList.filter(s => s.id !== selectedSchema.id && s.type !== selectedSchema.type);
    }, [schemaList, selectedSchema]);
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
        modelData: _conceptualModelData,
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
        onDiagramReady: handleDiagramReady,
    });

    const {
        awareness: logicalAwareness,
        applyModelPayload: applyLogicalModelPayload,
        mutateModel: logicalMutateModel,
        modelData: _logicalModelData,
    } = useLogicalCollaboration({
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
        onDiagramReady: handleDiagramReady,
    });

    const {
        awareness: physicalAwareness,
        applyModelPayload: applyPhysicalModelPayload,
        mutateModel: physicalMutateModel,
        modelData: _physicalModelData,
    } = usePhysicalCollaboration({
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
        onDiagramReady: handleDiagramReady,
    });

    const awareness = isConceptualSchema ? conceptualAwareness : isLogicalSchema ? logicalAwareness : isPhysicalSchema ? physicalAwareness : null;

    // ── Linter — computed synchronously in the same render as nodes/edges ────
    const lintResult = useMemo((): LintResult => {
        const empty: LintResult = { issues: [], counts: { error: 0, warning: 0, info: 0 } };
        if (isConceptualSchema) {
            const storedNodes = mapConceptualReactToStored(nodes);
            const storedEdges = mapConceptualReactEdgesToStored(edges, nodes);
            const model = storedNodes.length > 0
                ? buildConceptualModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name })
                : _conceptualModelData;
            return model ? runConceptualLinter(model) : empty;
        }
        if (isLogicalSchema) {
            const storedNodes = mapLogicalReactToStored(nodes);
            const storedEdges = mapLogicalReactEdgesToStored(edges, nodes);
            const model = storedNodes.length > 0
                ? buildLogicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name })
                : _logicalModelData;
            return model ? runLogicalLinter(model) : empty;
        }
        if (isPhysicalSchema) {
            const storedNodes = mapPhysicalReactToStored(nodes);
            const storedEdges = mapPhysicalReactEdgesToStored(edges, nodes);
            const model = storedNodes.length > 0
                ? buildPhysicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name })
                : _physicalModelData;
            return model ? runPhysicalLinter(model) : empty;
        }
        return empty;
    }, [
        isConceptualSchema, isLogicalSchema, isPhysicalSchema,
        nodes, edges,
        _conceptualModelData, _logicalModelData, _physicalModelData,
        selectedSchema?.id, selectedSchema?.name,
    ]);

    // Build fresh model from current canvas for normalization panel (reactive)
    const normalizationModelData = useMemo(() => {
        if (isLogicalSchema) {
            const storedNodes = mapLogicalReactToStored(nodes);
            const storedEdges = mapLogicalReactEdgesToStored(edges, nodes);
            return storedNodes.length > 0
                ? buildLogicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name })
                : _logicalModelData;
        }
        if (isPhysicalSchema) {
            const storedNodes = mapPhysicalReactToStored(nodes);
            const storedEdges = mapPhysicalReactEdgesToStored(edges, nodes);
            return storedNodes.length > 0
                ? buildPhysicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name })
                : _physicalModelData;
        }
        return null;
    }, [
        isLogicalSchema, isPhysicalSchema,
        nodes, edges,
        _logicalModelData, _physicalModelData,
        selectedSchema?.id, selectedSchema?.name,
    ]);

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

    // Override logical table creators with model-first versions when
    // operating on a logical schema (model-as-truth architecture).
    const logicalModelAwareCreators = useMemo(
        () =>
            isLogicalSchema && logicalMutateModel
                ? createNodeCreators(setNodes, { getViewportCenter, mutateLogicalModel: logicalMutateModel })
                : null,
        [isLogicalSchema, logicalMutateModel, setNodes, getViewportCenter],
    );
    const effectiveAddLogicalTable = logicalModelAwareCreators?.addLogicalTable ?? addLogicalTable;

    // Override physical table creators with model-first versions when
    // operating on a physical schema (model-as-truth architecture).
    const physicalModelAwareCreators = useMemo(
        () =>
            isPhysicalSchema && physicalMutateModel
                ? createNodeCreators(setNodes, { getViewportCenter, mutatePhysicalModel: physicalMutateModel })
                : null,
        [isPhysicalSchema, physicalMutateModel, setNodes, getViewportCenter],
    );
    const effectiveAddRelationTable = physicalModelAwareCreators?.addRelationTable ?? addRelationTable;

    // ── Drag-and-drop from sidebar ───────────────────────────────
    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);

    const handleDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const nodeType = event.dataTransfer.getData("application/dbflow-node-type");
            if (!nodeType || !reactFlowInstanceRef.current) return;

            const position = reactFlowInstanceRef.current.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Conceptual: model-first via mutateModel
            if (isConceptualSchema && conceptualMutateModel) {
                const id = generateDiagramId();
                switch (nodeType) {
                    case "entity":
                        conceptualMutateModel(
                            (m) => ({ ...m, entities: [...m.entities, { id, name: `ent_${m.entities.length + 1}`, kind: "strong" as const, attributes: [] }] }),
                            { selectedNodeId: id, positionHint: position },
                        );
                        return;
                    case "double-entity":
                        conceptualMutateModel(
                            (m) => ({ ...m, entities: [...m.entities, { id, name: `ent_${m.entities.length + 1}`, kind: "weak" as const, attributes: [] }] }),
                            { selectedNodeId: id, positionHint: position },
                        );
                        return;
                    case "relationship":
                        conceptualMutateModel(
                            (m) => ({ ...m, relationships: [...m.relationships, { id, name: `rel_${m.relationships.length + 1}`, type: "association" as const, ends: [] }] }),
                            { selectedNodeId: id, positionHint: position },
                        );
                        return;
                    case "double-relationship":
                        conceptualMutateModel(
                            (m) => ({ ...m, relationships: [...m.relationships, { id, name: `rel_${m.relationships.length + 1}`, type: "identifying" as const, ends: [] }] }),
                            { selectedNodeId: id, positionHint: position },
                        );
                        return;
                }
            }

            // Logical: model-first via logicalMutateModel
            if (isLogicalSchema && logicalMutateModel && nodeType === "logical-table") {
                const id = generateDiagramId();
                logicalMutateModel(
                    (m) => ({
                        ...m,
                        tables: [...(m.tables ?? []), { id, name: `table_${(m.tables ?? []).length + 1}`, columns: [{ id: `lid_${id}_col_0`, name: "column_1", nullable: true, unique: false, roles: {} }] }],
                    }),
                    { selectedNodeId: id, positionHint: position },
                );
                return;
            }

            // Physical: model-first via physicalMutateModel
            if (isPhysicalSchema && physicalMutateModel && nodeType === "physical-table") {
                const id = generateDiagramId();
                physicalMutateModel(
                    (m) => ({
                        ...m,
                        tables: [...(m.tables ?? []), { id, name: `table_${(m.tables ?? []).length + 1}`, columns: [{ id: `pid_${id}_col_0`, name: "column_1", dataType: "varchar", nullable: true, unique: false, roles: {} }] }],
                    }),
                    { selectedNodeId: id, positionHint: position },
                );
                return;
            }

            // Fallback: direct node creation (attributes, constraints, or non-model schemas)
            setNodes((existingNodes) => {
                const id = generateDiagramId();
                const deselected = existingNodes.map((n) => ({ ...n, selected: false }));
                let newNode: Node<NodeData> | null = null;

                switch (nodeType) {
                    case "entity":
                        newNode = { id, type: "entity", position, data: { name: `ent_${existingNodes.length + 1}`, fields: [], variant: "single" }, style: { width: 70, height: 30 }, selected: true };
                        break;
                    case "double-entity":
                        newNode = { id, type: "entity", position, data: { name: `ent_${existingNodes.length + 1}`, fields: [], variant: "double" }, style: { width: 70, height: 30 }, selected: true };
                        break;
                    case "attribute":
                        newNode = { id, type: "attribute", position, data: { name: `attr_${existingNodes.length + 1}`, variant: "single" }, style: { width: 70, height: 30 }, selected: true };
                        break;
                    case "multivalued-attribute":
                        newNode = { id, type: "attribute", position, data: { name: `attr_${existingNodes.length + 1}`, variant: "double" }, style: { width: 70, height: 30 }, selected: true };
                        break;
                    case "dashed-attribute":
                        newNode = { id, type: "attribute", position, data: { name: `attr_${existingNodes.length + 1}`, variant: "dashed" }, style: { width: 70, height: 30 }, selected: true };
                        break;
                    case "relationship":
                        newNode = { id, type: "relationship", position, data: { name: `rel_${existingNodes.length + 1}`, variant: "single" }, style: { width: 70, height: 40 }, selected: true };
                        break;
                    case "double-relationship":
                        newNode = { id, type: "relationship", position, data: { name: `rel_${existingNodes.length + 1}`, variant: "double" }, style: { width: 70, height: 40 }, selected: true };
                        break;
                    case "constraint-d":
                        newNode = { id, type: "constraint", position, data: { symbol: "d" }, style: { width: 22, height: 22 }, selected: true };
                        break;
                    case "constraint-o":
                        newNode = { id, type: "constraint", position, data: { symbol: "o" }, style: { width: 22, height: 22 }, selected: true };
                        break;
                    case "constraint-u":
                        newNode = { id, type: "constraint", position, data: { symbol: "u" }, style: { width: 22, height: 22 }, selected: true };
                        break;
                    case "logical-table": {
                        const cnt = existingNodes.filter((n) => n.type === "logical-table").length;
                        const logicalData = { name: `table_${cnt + 1}`, columns: [{ name: "column_1", isKey: false }] };
                        newNode = { id, type: "logical-table", position, data: logicalData as NodeData, style: { width: 200 }, selected: true };
                        break;
                    }
                    case "physical-table": {
                        const cnt = existingNodes.filter((n) => n.type === "relation").length;
                        newNode = { id, type: "relation", position, data: { name: `table_${cnt + 1}`, columns: [{ name: "column_1", type: "varchar", isPrimary: false, isNullable: true }] }, style: { width: 220 }, selected: true };
                        break;
                    }
                }

                if (!newNode) return existingNodes;
                return [...deselected, newNode];
            });
        },
        [setNodes, isConceptualSchema, isLogicalSchema, isPhysicalSchema, conceptualMutateModel, logicalMutateModel, physicalMutateModel],
    );

    // ── Version preview handlers ─────────────────────────────────
    const handlePreviewVersion = useCallback(
        (storedNodes: unknown[], storedEdges: unknown[], version: { id: string }) => {
            // Save current state before first preview
            if (!savedNodesBeforePreviewRef.current) {
                savedNodesBeforePreviewRef.current = nodes;
                savedEdgesBeforePreviewRef.current = edges;
            }
            setPreviewingVersionId(version.id);

            // Use the correct mapper based on current schema type
            let reactNodes: Node<NodeData>[];
            let reactEdges: Edge[];
            if (isConceptualSchema) {
                reactNodes = mapConceptualStoredToReact(storedNodes as StoredConceptualNode[]);
                reactEdges = mapConceptualEdgesStoredToReact(storedEdges as (StoredConceptualEdge | Edge)[], reactNodes);
            } else if (isLogicalSchema) {
                reactNodes = mapLogicalStoredToReact(storedNodes as Parameters<typeof mapLogicalStoredToReact>[0]);
                reactEdges = mapLogicalEdgesStoredToReact(storedEdges as Parameters<typeof mapLogicalEdgesStoredToReact>[0], reactNodes);
            } else {
                reactNodes = mapStoredNodesToReactNodes(storedNodes as StoredPhysicalNode[]);
                reactEdges = mapStoredEdgesToReactEdges(storedEdges as StoredPhysicalDiagramEdge[], reactNodes);
            }
            setNodesState(reactNodes);
            setEdgesState(reactEdges);
        },
        [nodes, edges, setNodesState, setEdgesState, isConceptualSchema, isLogicalSchema],
    );

    const handleExitPreview = useCallback(() => {
        if (savedNodesBeforePreviewRef.current) {
            setNodesState(savedNodesBeforePreviewRef.current);
            setEdgesState(savedEdgesBeforePreviewRef.current ?? []);
        }
        setPreviewingVersionId(null);
        savedNodesBeforePreviewRef.current = null;
        savedEdgesBeforePreviewRef.current = null;
    }, [setNodesState, setEdgesState]);

    const handleRestoreVersion = useCallback(() => {
        // The previewed nodes/edges are already set as the current state.
        // Just clear the preview refs so the current state becomes permanent.
        setPreviewingVersionId(null);
        savedNodesBeforePreviewRef.current = null;
        savedEdgesBeforePreviewRef.current = null;
    }, []);

    const handleVersionHistoryClose = useCallback(() => {
        setIsVersionHistoryOpen(false);
    }, []);

    // Callback for ChatBox: when AI generates a model JSON, apply it to the diagram
    const handleChatModelGenerated = useCallback(async (modelJson: Record<string, unknown>, detectedLevel?: string) => {
        const currentLevel = isConceptualSchema ? "conceptual" : isLogicalSchema ? "logical" : isPhysicalSchema ? "physical" : undefined;

        // If the AI generated a model for a different schema level, create a new schema
        if (detectedLevel && currentLevel && detectedLevel !== currentLevel && projectData?.id) {
            try {
                const levelLabels: Record<string, string> = {
                    conceptual: "Conceptual Schema",
                    logical: "Logical Schema",
                    physical: "Physical Schema",
                };
                const newSchema = await createSchema(projectData.id, {
                    name: levelLabels[detectedLevel] || `${detectedLevel} Schema`,
                    type: detectedLevel,
                });
                await saveSchemaModel(projectData.id, newSchema.id, modelJson);
                notificationProvider.open({ type: "success", message: `Created new ${detectedLevel} schema — switching now` });
                // Navigate to the new schema (page will re-render with updated schema list)
                router.push(`/projects/${projectData.id}?schemaId=${newSchema.id}`);
            } catch (error) {
                console.error("Failed to create cross-schema from chat:", error);
                notificationProvider.open({ type: "error", message: "Failed to create new schema. Please try again." });
            }
            return;
        }

        // Same level — apply to the current diagram
        if (isConceptualSchema && applyModelPayload) {
            try {
                applyModelPayload(modelJson as ConceptualModelPayload);
            } catch (error) {
                console.error("Failed to apply model from chat:", error);
            }
        } else if (isLogicalSchema && applyLogicalModelPayload) {
            try {
                applyLogicalModelPayload(modelJson as LogicalModelPayload);
            } catch (error) {
                console.error("Failed to apply model from chat:", error);
            }
        } else if (isPhysicalSchema && applyPhysicalModelPayload) {
            try {
                applyPhysicalModelPayload(modelJson as PhysicalModelPayload);
            } catch (error) {
                console.error("Failed to apply physical model from chat:", error);
            }
        }
    }, [isConceptualSchema, isLogicalSchema, isPhysicalSchema, applyModelPayload, applyLogicalModelPayload, applyPhysicalModelPayload, projectData?.id, router]);

    // ── Normalization decomposition ──────────────────────────────────────────
    const handleApplyDecomposition = useCallback(
        (tableName: string, decomposition: DecomposedTable[]) => {
            const generateId = (prefix: string) =>
                `${prefix}_${crypto.randomUUID?.() ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`}`;

            /**
             * Generic decomposition logic shared between logical & physical.
             * Returns new tables with FK rewiring:
             *  1. Outgoing FKs (orig → other): moved to sub-table that has the FK column
             *  2. Incoming FKs (other → orig): redirected to sub-table that has the referenced column
             *  3. Inter-decomposition FKs: sub-tables link to the sub-table that "owns" each shared PK column
             */
            type AnyColumn = {
                id: string;
                name: string;
                nullable: boolean;
                unique: boolean;
                roles?: {
                    primaryKey?: boolean;
                    foreignKey?: { refTableId: string; refColumnId: string; [k: string]: unknown };
                    candidateKey?: boolean;
                };
                [k: string]: unknown;
            };
            type AnyTable = {
                id: string;
                name: string;
                columns: AnyColumn[];
                functionalDependencies?: { id: string; left: string[]; right: string[] }[];
                [k: string]: unknown;
            };

            const applyDecomposition = <T extends AnyTable>(
                allTables: T[],
                origTable: T,
                idPrefix: string,
                buildColumn: (colName: string, idx: number, tableId: string) => AnyColumn,
            ): T[] => {
                const origId = origTable.id;

                // ── 1. Build new sub-tables ─────────────────────────────────
                const newTables: (T & { _colNameToId: Map<string, string> })[] = decomposition.map((dt) => {
                    const tableId = generateId(idPrefix);
                    const colNameToId = new Map<string, string>();

                    const columns = dt.attributes.map((colName, idx) => {
                        const col = buildColumn(colName, idx, tableId);
                        // Set PK/nullable from THIS decomposed table's primaryKey
                        const isPK = dt.primaryKey.includes(colName);
                        col.nullable = !isPK;
                        col.roles = {
                            ...col.roles,
                            primaryKey: isPK || undefined,
                        };
                        colNameToId.set(colName.toLowerCase(), col.id);
                        return col;
                    });

                    return {
                        ...({} as T),
                        id: tableId,
                        name: dt.name,
                        columns,
                        functionalDependencies: dt.fds.map((fd) => ({
                            id: generateId("fd"),
                            left: fd.left,
                            right: fd.right,
                        })),
                        _colNameToId: colNameToId,
                    };
                });

                // Helper: find which new sub-table contains a column by name
                const findSubTableByColName = (colName: string) =>
                    newTables.find((t) => t._colNameToId.has(colName.toLowerCase()));

                // Helper: find the "owner" sub-table for a PK column
                // (the sub-table where this column is PK and the table has
                // the fewest columns — i.e., the "dimension" table)
                const findPKOwner = (colName: string) => {
                    const lc = colName.toLowerCase();
                    const candidates = newTables.filter((t) => {
                        const col = t.columns.find((c) => c.name.toLowerCase() === lc);
                        return col?.roles?.primaryKey;
                    });
                    if (candidates.length <= 1) return candidates[0] ?? null;
                    // Prefer the smaller table (dimension table, not the join table)
                    return candidates.reduce((a, b) =>
                        a.columns.length <= b.columns.length ? a : b,
                    );
                };

                // ── 2. Move outgoing FKs (orig → other) to correct sub-table ─
                for (const origCol of origTable.columns) {
                    const fk = origCol.roles?.foreignKey;
                    if (!fk) continue;
                    const sub = findSubTableByColName(origCol.name);
                    if (!sub) continue;
                    const subCol = sub.columns.find(
                        (c) => c.name.toLowerCase() === origCol.name.toLowerCase(),
                    );
                    if (subCol) {
                        subCol.roles = {
                            ...subCol.roles,
                            foreignKey: { ...fk },
                        };
                    }
                }

                // ── 3. Redirect incoming FKs (other → orig) to correct sub-table ─
                const updatedOtherTables = allTables
                    .filter((t) => t.id !== origId)
                    .map((t) => {
                        let changed = false;
                        const cols = t.columns.map((col) => {
                            const fk = col.roles?.foreignKey;
                            if (!fk || fk.refTableId !== origId) return col;

                            // Find the referenced column name in orig table
                            const refOrigCol = origTable.columns.find((c) => c.id === fk.refColumnId);
                            if (!refOrigCol) return col;

                            // Find which sub-table now owns that column
                            const sub = findPKOwner(refOrigCol.name) ?? findSubTableByColName(refOrigCol.name);
                            if (!sub) return col;

                            const newRefColId = sub._colNameToId.get(refOrigCol.name.toLowerCase());
                            if (!newRefColId) return col;

                            changed = true;
                            return {
                                ...col,
                                roles: {
                                    ...col.roles,
                                    foreignKey: {
                                        ...fk,
                                        refTableId: sub.id,
                                        refColumnId: newRefColId,
                                    },
                                },
                            };
                        });
                        return changed ? { ...t, columns: cols } : t;
                    });

                // ── 4. Create inter-decomposition FKs ───────────────────────
                // For each sub-table, if it has a column that is PK of another
                // (smaller) sub-table, add FK: thisTable.column → ownerTable.PK
                for (const sub of newTables) {
                    for (const col of sub.columns) {
                        const owner = findPKOwner(col.name);
                        // Only add FK if owner is a DIFFERENT table and col is NOT PK in this table
                        if (owner && owner.id !== sub.id && !col.roles?.primaryKey) {
                            const refColId = owner._colNameToId.get(col.name.toLowerCase());
                            if (refColId) {
                                col.roles = {
                                    ...col.roles,
                                    foreignKey: { refTableId: owner.id, refColumnId: refColId },
                                };
                            }
                        }
                        // Also handle composite PK in "join" tables: if col is PK here
                        // AND there's a smaller sub-table where col is also PK, add FK
                        if (owner && owner.id !== sub.id && col.roles?.primaryKey) {
                            // This is a join table referencing a dimension table
                            const refColId = owner._colNameToId.get(col.name.toLowerCase());
                            if (refColId) {
                                col.roles = {
                                    ...col.roles,
                                    foreignKey: { refTableId: owner.id, refColumnId: refColId },
                                };
                            }
                        }
                    }
                }

                // ── 5. Assemble final table list ─────────────────────────────
                // Strip the helper _colNameToId before returning
                const cleanNewTables = newTables.map(({ _colNameToId, ...rest }) => rest as unknown as T);
                return [...updatedOtherTables, ...cleanNewTables];
            };

            if (isLogicalSchema && logicalMutateModel) {
                logicalMutateModel((model) => {
                    const origIdx = model.tables.findIndex((t) => t.name === tableName);
                    if (origIdx === -1) return model;
                    const origTable = model.tables[origIdx];

                    const tables = applyDecomposition(
                        model.tables,
                        origTable,
                        "lid",
                        (colName, idx, tableId) => ({
                            id: `lid_${tableId}_col_${idx}`,
                            name: colName,
                            nullable: true, // will be overridden by applyDecomposition
                            unique: false,
                            roles: {},
                        }),
                    );

                    return { ...model, tables };
                });
            } else if (isPhysicalSchema && physicalMutateModel) {
                physicalMutateModel((model) => {
                    const origIdx = model.tables.findIndex((t) => t.name === tableName);
                    if (origIdx === -1) return model;
                    const origTable = model.tables[origIdx];
                    const origColMap = new Map(
                        origTable.columns.map((c) => [c.name.toLowerCase(), c]),
                    );

                    const tables = applyDecomposition(
                        model.tables,
                        origTable,
                        "pid",
                        (colName, idx, tableId) => {
                            const origCol = origColMap.get(colName.toLowerCase());
                            return {
                                id: `pid_${tableId}_col_${idx}`,
                                name: colName,
                                dataType: origCol?.dataType,
                                length: origCol?.length,
                                nullable: true, // will be overridden by applyDecomposition
                                unique: false,
                                autoIncrement: origCol?.autoIncrement,
                                defaultValue: origCol?.defaultValue,
                                roles: {},
                            };
                        },
                    );

                    return { ...model, tables };
                });
            }
        },
        [isLogicalSchema, isPhysicalSchema, logicalMutateModel, physicalMutateModel],
    );

    // ── Schema conversion (logical ↔ physical done directly; others via AI) ──
    const handleConvertSchema = useCallback(async (targetType: string) => {
        // Helper: rebuild fresh model from current canvas nodes/edges,
        // falling back to the collaboration hook's cached model if canvas is empty.
        const buildFreshLogicalModel = () => {
            const storedNodes = mapLogicalReactToStored(nodes);
            const storedEdges = mapLogicalReactEdgesToStored(edges, nodes);
            if (storedNodes.length > 0) {
                return buildLogicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name });
            }
            return _logicalModelData;
        };

        const buildFreshPhysicalModel = () => {
            const storedNodes = mapPhysicalReactToStored(nodes);
            const storedEdges = mapPhysicalReactEdgesToStored(edges, nodes);
            if (storedNodes.length > 0) {
                return buildPhysicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name });
            }
            return _physicalModelData;
        };

        const buildFreshConceptualModel = () => {
            const storedNodes = mapConceptualReactToStored(nodes);
            const storedEdges = mapConceptualReactEdgesToStored(edges, nodes);
            if (storedNodes.length > 0) {
                return buildConceptualModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name });
            }
            return _conceptualModelData;
        };

        // Direct, deterministic conversion: logical → physical (opens DBMS picker first)
        if (isLogicalSchema && targetType === SchemaType.PHYSICAL && projectData?.id) {
            const freshModel = buildFreshLogicalModel();
            if (!freshModel) {
                notificationProvider.open({ type: "error", message: "Logical model is not loaded yet. Please wait and try again." });
                return;
            }
            setPendingPhysicalConvert({ sourceLevel: "logical", freshModel });
            return;
        }

        // Direct, deterministic conversion: physical → logical
        if (isPhysicalSchema && targetType === SchemaType.LOGICAL && projectData?.id) {
            const freshModel = buildFreshPhysicalModel();
            if (!freshModel) {
                notificationProvider.open({ type: "error", message: "Physical model is not loaded yet. Please wait and try again." });
                return;
            }
            setIsConverting(true);
            try {
                const logicalModel = convertPhysicalToLogical(freshModel, {
                    newModelName: `${diagramName} (Logical)`,
                });
                const newSchema = await createSchema(projectData.id, {
                    name: `${selectedSchema?.name ?? diagramName} (Logical)`,
                    type: SchemaType.LOGICAL,
                });
                await saveSchemaModel(projectData.id, newSchema.id, logicalModel as Record<string, unknown>);
                notificationProvider.open({ type: "success", message: "Logical schema created — switching now" });
                setIsConverting(false);
                router.push(`/projects/${projectData.id}?schemaId=${newSchema.id}`);
            } catch (error) {
                console.error("Failed to convert physical to logical:", error);
                notificationProvider.open({ type: "error", message: "Failed to convert schema. Please try again." });
                setIsConverting(false);
            }
            return;
        }

        // Direct, deterministic conversion: logical → conceptual
        if (isLogicalSchema && targetType === SchemaType.CONCEPTUAL && projectData?.id) {
            const freshModel = buildFreshLogicalModel();
            if (!freshModel) {
                notificationProvider.open({ type: "error", message: "Logical model is not loaded yet. Please wait and try again." });
                return;
            }
            setIsConverting(true);
            try {
                const conceptualModel = convertLogicalToConceptual(freshModel, {
                    newModelName: `${diagramName} (Conceptual)`,
                });
                const newSchema = await createSchema(projectData.id, {
                    name: `${selectedSchema?.name ?? diagramName} (Conceptual)`,
                    type: SchemaType.CONCEPTUAL,
                });
                await saveSchemaModel(projectData.id, newSchema.id, conceptualModel as Record<string, unknown>);
                notificationProvider.open({ type: "success", message: "Conceptual schema created — switching now" });
                setIsConverting(false);
                router.push(`/projects/${projectData.id}?schemaId=${newSchema.id}`);
            } catch (error) {
                console.error("Failed to convert logical to conceptual:", error);
                notificationProvider.open({ type: "error", message: "Failed to convert schema. Please try again." });
                setIsConverting(false);
            }
            return;
        }

        // Direct, deterministic conversion: conceptual → logical
        if (isConceptualSchema && targetType === SchemaType.LOGICAL && projectData?.id) {
            const freshModel = buildFreshConceptualModel();
            if (!freshModel) {
                notificationProvider.open({ type: "error", message: "Conceptual model is not loaded yet. Please wait and try again." });
                return;
            }
            setIsConverting(true);
            try {
                const logicalModel = convertConceptualToLogical(freshModel, {
                    newModelName: `${diagramName} (Logical)`,
                });
                const newSchema = await createSchema(projectData.id, {
                    name: `${selectedSchema?.name ?? diagramName} (Logical)`,
                    type: SchemaType.LOGICAL,
                });
                await saveSchemaModel(projectData.id, newSchema.id, logicalModel as Record<string, unknown>);
                notificationProvider.open({ type: "success", message: "Logical schema created — switching now" });
                setIsConverting(false);
                router.push(`/projects/${projectData.id}?schemaId=${newSchema.id}`);
            } catch (error) {
                console.error("Failed to convert conceptual to logical:", error);
                notificationProvider.open({ type: "error", message: "Failed to convert schema. Please try again." });
                setIsConverting(false);
            }
            return;
        }

        // Direct, deterministic conversion: physical → conceptual
        if (isPhysicalSchema && targetType === SchemaType.CONCEPTUAL && projectData?.id) {
            const freshModel = buildFreshPhysicalModel();
            if (!freshModel) {
                notificationProvider.open({ type: "error", message: "Physical model is not loaded yet. Please wait and try again." });
                return;
            }
            setIsConverting(true);
            try {
                const conceptualModel = convertPhysicalToConceptual(freshModel, {
                    newModelName: `${diagramName} (Conceptual)`,
                });
                const newSchema = await createSchema(projectData.id, {
                    name: `${selectedSchema?.name ?? diagramName} (Conceptual)`,
                    type: SchemaType.CONCEPTUAL,
                });
                await saveSchemaModel(projectData.id, newSchema.id, conceptualModel as Record<string, unknown>);
                notificationProvider.open({ type: "success", message: "Conceptual schema created — switching now" });
                setIsConverting(false);
                router.push(`/projects/${projectData.id}?schemaId=${newSchema.id}`);
            } catch (error) {
                console.error("Failed to convert physical to conceptual:", error);
                notificationProvider.open({ type: "error", message: "Failed to convert schema. Please try again." });
                setIsConverting(false);
            }
            return;
        }

        // Direct, deterministic conversion: conceptual → physical (opens DBMS picker first)
        if (isConceptualSchema && targetType === SchemaType.PHYSICAL && projectData?.id) {
            const freshModel = buildFreshConceptualModel();
            if (!freshModel) {
                notificationProvider.open({ type: "error", message: "Conceptual model is not loaded yet. Please wait and try again." });
                return;
            }
            setPendingPhysicalConvert({ sourceLevel: "conceptual", freshModel });
            return;
        }

        // Fallback: open ChatBox with a conversion hint for AI-assisted conversions
        // (still passes fresh model via currentModel prop of ChatBox)
        void buildFreshConceptualModel(); // ensure conceptual model is fresh if needed
        setIsChatBoxOpen(true);
        setChatThreadId(undefined);
        const params = new URLSearchParams(searchParams.toString());
        const labels: Record<string, string> = { conceptual: "conceptual", logical: "logical", physical: "physical" };
        params.set("convertTo", labels[targetType] ?? targetType);
        router.replace(`/projects/${projectData?.id}?${params.toString()}`, { scroll: false });
    }, [
        isConceptualSchema,
        isLogicalSchema,
        isPhysicalSchema,
        nodes,
        edges,
        _logicalModelData,
        _physicalModelData,
        _conceptualModelData,
        selectedSchema?.id,
        selectedSchema?.name,
        projectData?.id,
        diagramName,
        router,
        searchParams,
    ]);

    // ── Schema sync: overwrite an existing schema with converted model ─────────
    const handleSyncToSchema = useCallback(async (targetSchemaId: string, targetSchemaType: string) => {
        if (!projectData?.id) return;

        const buildFreshLogical = () => {
            const storedNodes = mapLogicalReactToStored(nodes);
            const storedEdges = mapLogicalReactEdgesToStored(edges, nodes);
            if (storedNodes.length > 0) return buildLogicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name });
            return _logicalModelData;
        };
        const buildFreshPhysical = () => {
            const storedNodes = mapPhysicalReactToStored(nodes);
            const storedEdges = mapPhysicalReactEdgesToStored(edges, nodes);
            if (storedNodes.length > 0) return buildPhysicalModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name });
            return _physicalModelData;
        };
        const buildFreshConceptual = () => {
            const storedNodes = mapConceptualReactToStored(nodes);
            const storedEdges = mapConceptualReactEdgesToStored(edges, nodes);
            if (storedNodes.length > 0) return buildConceptualModel({ storedNodes, storedEdges, schemaId: selectedSchema?.id, schemaName: selectedSchema?.name });
            return _conceptualModelData;
        };

        let convertedModel: Record<string, unknown> | null = null;
        if (isLogicalSchema && targetSchemaType === SchemaType.PHYSICAL) {
            const fresh = buildFreshLogical();
            if (!fresh) { notificationProvider.open({ type: 'error', message: 'Logical model is not loaded yet.' }); return; }
            convertedModel = convertLogicalToPhysical(fresh) as Record<string, unknown>;
        } else if (isLogicalSchema && targetSchemaType === SchemaType.CONCEPTUAL) {
            const fresh = buildFreshLogical();
            if (!fresh) { notificationProvider.open({ type: 'error', message: 'Logical model is not loaded yet.' }); return; }
            convertedModel = convertLogicalToConceptual(fresh) as Record<string, unknown>;
        } else if (isPhysicalSchema && targetSchemaType === SchemaType.LOGICAL) {
            const fresh = buildFreshPhysical();
            if (!fresh) { notificationProvider.open({ type: 'error', message: 'Physical model is not loaded yet.' }); return; }
            convertedModel = convertPhysicalToLogical(fresh) as Record<string, unknown>;
        } else if (isPhysicalSchema && targetSchemaType === SchemaType.CONCEPTUAL) {
            const fresh = buildFreshPhysical();
            if (!fresh) { notificationProvider.open({ type: 'error', message: 'Physical model is not loaded yet.' }); return; }
            convertedModel = convertPhysicalToConceptual(fresh) as Record<string, unknown>;
        } else if (isConceptualSchema && targetSchemaType === SchemaType.LOGICAL) {
            const fresh = buildFreshConceptual();
            if (!fresh) { notificationProvider.open({ type: 'error', message: 'Conceptual model is not loaded yet.' }); return; }
            convertedModel = convertConceptualToLogical(fresh) as Record<string, unknown>;
        } else if (isConceptualSchema && targetSchemaType === SchemaType.PHYSICAL) {
            const fresh = buildFreshConceptual();
            if (!fresh) { notificationProvider.open({ type: 'error', message: 'Conceptual model is not loaded yet.' }); return; }
            convertedModel = convertConceptualToPhysical(fresh) as Record<string, unknown>;
        }

        if (!convertedModel) {
            notificationProvider.open({ type: 'error', message: 'Cannot sync between these schema types.' });
            return;
        }

        setIsSyncing(true);
        try {
            await saveSchemaModel(projectData.id, targetSchemaId, convertedModel);
            notificationProvider.open({ type: 'success', message: 'Schema synced successfully' });
        } catch (error) {
            console.error('Failed to sync schema:', error);
            notificationProvider.open({ type: 'error', message: 'Failed to sync schema. Please try again.' });
        } finally {
            setIsSyncing(false);
        }
    }, [
        isConceptualSchema, isLogicalSchema, isPhysicalSchema,
        nodes, edges,
        _logicalModelData, _physicalModelData, _conceptualModelData,
        selectedSchema?.id, selectedSchema?.name,
        projectData?.id,
    ]);

    // ── Execute pending convert-to-physical after DBMS selection ──
    const handleConfirmConvertToPhysical = useCallback(async (dbms: DBMSType) => {
        if (!pendingPhysicalConvert || !projectData?.id) return;
        const { sourceLevel, freshModel } = pendingPhysicalConvert;

        setIsConverting(true);
        try {
            const physicalModel = sourceLevel === "logical"
                ? convertLogicalToPhysical(freshModel as LogicalModelPayload, {
                      newModelName: `${diagramName} (Physical)`,
                      dbms,
                  })
                : convertConceptualToPhysical(freshModel as ConceptualModelPayload, {
                      newModelName: `${diagramName} (Physical)`,
                      dbms,
                  });

            const newSchema = await createSchema(projectData.id, {
                name: `${selectedSchema?.name ?? diagramName} (Physical)`,
                type: SchemaType.PHYSICAL,
            });
            await saveSchemaModel(projectData.id, newSchema.id, physicalModel as Record<string, unknown>);
            notificationProvider.open({ type: "success", message: "Physical schema created — switching now" });
            setPendingPhysicalConvert(null);
            setIsConverting(false);
            router.push(`/projects/${projectData.id}?schemaId=${newSchema.id}`);
        } catch (error) {
            console.error("Failed to convert to physical:", error);
            notificationProvider.open({ type: "error", message: "Failed to convert schema. Please try again." });
            setIsConverting(false);
        }
    }, [pendingPhysicalConvert, projectData?.id, selectedSchema?.name, diagramName, router]);

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
                    notificationProvider.open({ type: "error", message: 'Failed to export diagram.' });
                });
        } else {
            toSvg(viewport, options)
                .then(downloadImage)
                .catch((err) => {
                    console.error('Export failed:', err);
                    notificationProvider.open({ type: "error", message: 'Failed to export diagram.' });
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
            <div className="h-screen w-full overflow-hidden">
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
                    onExportDDL={isPhysicalSchema ? () => setIsDDLExportOpen(true) : undefined}
                    onExportHTMLDocs={() => setIsHTMLDocsExportOpen(true)}
                    onVersionHistory={() => setIsVersionHistoryOpen(true)}
                    onShareClick={() => setIsShareProjectOpen(true)}
                    commentMode={commentMode}
                    onToggleCommentMode={() => { setCommentMode(!commentMode); setActiveToolMode('none'); }}
                    schemaType={isConceptualSchema ? 'conceptual' : isLogicalSchema ? 'logical' : isPhysicalSchema ? 'physical' : undefined}
                    onConvertSchema={(targetType) => { handleConvertSchema(targetType); }}
                    isConverting={isConverting}
                    syncableSchemas={syncableSchemas}
                    onSyncToSchema={handleSyncToSchema}
                    isSyncing={isSyncing}
                    linterOpen={isLinterOpen}
                    onToggleLinterPanel={() => setIsLinterOpen((v) => !v)}
                    linterCounts={lintResult.counts}
                    projectId={projectData?.id}
                    normalizationOpen={isNormalizationOpen}
                    onToggleNormalizationPanel={(isLogicalSchema || isPhysicalSchema) ? () => setIsNormalizationOpen((v) => !v) : undefined}
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
                <DDLExportModal
                    isOpen={isDDLExportOpen}
                    onClose={() => setIsDDLExportOpen(false)}
                    model={_physicalModelData}
                    diagramName={diagramName}
                />
                <DDLImportModal
                    isOpen={isDDLImportOpen}
                    onClose={() => setIsDDLImportOpen(false)}
                    onImport={(model) => {
                        if (physicalMutateModel) {
                            physicalMutateModel(() => model);
                        }
                    }}
                    diagramName={diagramName}
                />
                <ConvertToPhysicalModal
                    isOpen={pendingPhysicalConvert !== null}
                    onClose={() => setPendingPhysicalConvert(null)}
                    onConfirm={handleConfirmConvertToPhysical}
                    loading={isConverting}
                    sourceLevel={pendingPhysicalConvert?.sourceLevel}
                />
                <HTMLDocsExportModal
                    isOpen={isHTMLDocsExportOpen}
                    onClose={() => setIsHTMLDocsExportOpen(false)}
                    model={
                        isConceptualSchema ? _conceptualModelData
                        : isLogicalSchema ? _logicalModelData
                        : _physicalModelData
                    }
                    schemaKind={
                        isConceptualSchema ? "conceptual"
                        : isLogicalSchema ? "logical"
                        : "physical"
                    }
                    diagramName={diagramName}
                />
                <VersionHistoryDrawer
                    open={isVersionHistoryOpen}
                    onClose={handleVersionHistoryClose}
                    projectId={projectData?.id ?? null}
                    schemaId={selectedSchema?.id ?? null}
                    schemaName={selectedSchema?.name}
                    diagramName={diagramName}
                    diagramType={selectedSchema?.type}
                    nodes={nodes}
                    edges={edges}
                    liveNodes={savedNodesBeforePreviewRef.current ?? nodes}
                    liveEdges={savedEdgesBeforePreviewRef.current ?? edges}
                    onPreviewVersion={handlePreviewVersion}
                    onExitPreview={handleExitPreview}
                    onRestoreVersion={handleRestoreVersion}
                    previewingVersionId={previewingVersionId}
                />
                <div className="flex h-full overflow-hidden">
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
                        onAddRelationTable={selectedSchema?.type === SchemaType.LOGICAL ? effectiveAddLogicalTable : selectedSchema?.type === SchemaType.PHYSICAL ? effectiveAddRelationTable : addRelationTable}
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
                        onUpdateRelationshipCardinality={(edgeId, cardinality) => {
                            if (!selectedNode || selectedNode.type !== 'relationship') return;
                            const relationshipId = selectedNode.id;

                            // Update relationship node cardinalities (keyed by edgeId)
                            setNodes((existingNodes) =>
                                existingNodes.map((n) =>
                                    n.id === relationshipId
                                        ? {
                                            ...n,
                                            data: {
                                                ...(n.data as RelationshipData),
                                                cardinalities: {
                                                    ...(n.data as RelationshipData).cardinalities,
                                                    [edgeId]: cardinality,
                                                },
                                            },
                                        }
                                        : n
                                )
                            );

                            // Update the specific edge's fromMult
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) => {
                                    if (edge.id === edgeId) {
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
                        onUpdateEdgeLabel={(value) => {
                            if (!selectedEdge) return;
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? { ...edge, data: { ...edge.data, label: value || undefined } }
                                        : edge
                                )
                            );
                        }}
                        onUpdateEdgeFromMult={(value) => {
                            if (!selectedEdge) return;
                            // Update edge data
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? { ...edge, data: { ...edge.data, fromMult: value || undefined } }
                                        : edge
                                )
                            );
                            // Sync back to relationship node's cardinalities (keyed by edgeId)
                            const relationshipId = selectedEdge.source;
                            const altRelationshipId = selectedEdge.target;
                            setNodes((existingNodes) =>
                                existingNodes.map((n) => {
                                    if ((n.id === relationshipId || n.id === altRelationshipId) && n.type === 'relationship') {
                                        return {
                                            ...n,
                                            data: {
                                                ...(n.data as RelationshipData),
                                                cardinalities: {
                                                    ...(n.data as RelationshipData).cardinalities,
                                                    [selectedEdge.id]: value || '',
                                                },
                                            },
                                        };
                                    }
                                    return n;
                                })
                            );
                        }}
                        onUpdateEdgeToMult={(value) => {
                            if (!selectedEdge) return;
                            // Update edge data
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? { ...edge, data: { ...edge.data, toMult: value || undefined } }
                                        : edge
                                )
                            );
                            // Sync back to relationship node's cardinalities (keyed by edgeId)
                            const relationshipId = selectedEdge.target;
                            const altRelationshipId = selectedEdge.source;
                            setNodes((existingNodes) =>
                                existingNodes.map((n) => {
                                    if ((n.id === relationshipId || n.id === altRelationshipId) && n.type === 'relationship') {
                                        return {
                                            ...n,
                                            data: {
                                                ...(n.data as RelationshipData),
                                                cardinalities: {
                                                    ...(n.data as RelationshipData).cardinalities,
                                                    [selectedEdge.id]: value || '',
                                                },
                                            },
                                        };
                                    }
                                    return n;
                                })
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
                        onAddTableIndex={addTableIndex}
                        onRemoveTableIndex={removeTableIndex}
                        onUpdateTableIndex={updateTableIndex}
                        onUpdateFKAction={(edgeId, field, value) => {
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === edgeId
                                        ? { ...edge, data: { ...edge.data, [field]: value } }
                                        : edge
                                )
                            );
                        }}
                        onAddLogicalTableAttribute={addLogicalTableAttribute}
                        onRemoveLogicalTableAttribute={removeLogicalTableAttribute}
                        onUpdateLogicalTableAttribute={updateLogicalTableAttribute}
                        onReorderLogicalTableAttributes={reorderLogicalTableAttributes}
                        onAddLogicalFD={addLogicalFD}
                        onRemoveLogicalFD={removeLogicalFD}
                        onUpdateLogicalFD={updateLogicalFD}
                        onToggleLogicalFDDisplay={toggleLogicalFDDisplay}
                        onAddPhysicalFD={addPhysicalFD}
                        onRemovePhysicalFD={removePhysicalFD}
                        onUpdatePhysicalFD={updatePhysicalFD}
                        onTogglePhysicalFDDisplay={togglePhysicalFDDisplay}
                        onUpdateLogicalEdgeCardinality={(side, value) => {
                            if (!selectedEdge) return;
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? {
                                            ...edge,
                                            data: {
                                                ...edge.data,
                                                [side === 'source' ? 'sourceCardinality' : 'targetCardinality']: value,
                                            },
                                        }
                                        : edge
                                )
                            );
                        }}
                        onUpdatePhysicalEdgeCardinality={(side, value) => {
                            if (!selectedEdge) return;
                            setEdges((existingEdges) =>
                                existingEdges.map((edge) =>
                                    edge.id === selectedEdge.id
                                        ? {
                                            ...edge,
                                            data: {
                                                ...edge.data,
                                                [side === 'source' ? 'sourceCardinality' : 'targetCardinality']: value,
                                            },
                                        }
                                        : edge
                                )
                            );
                        }}
                    />
                    {commentMode && (
                        <CommentPanel
                            comments={comments}
                            currentUserId={currentUser?.id || ''}
                            onClose={() => setCommentMode(false)}
                            onActivateComment={(id) => {
                                setActiveCommentId(id);
                                const comment = comments.find((c) => c.id === id);
                                if (comment && reactFlowInstanceRef.current) {
                                    let cx = comment.x;
                                    let cy = comment.y;
                                    if (comment.nodeId) {
                                        const attachedNode = nodes.find((n) => n.id === comment.nodeId);
                                        if (attachedNode) {
                                            cx = attachedNode.position.x + comment.x;
                                            cy = attachedNode.position.y + comment.y;
                                        }
                                    }
                                    reactFlowInstanceRef.current.setCenter(cx, cy, { zoom: 1, duration: 500 });
                                }
                            }}
                            onResolve={handleResolveComment}
                            onDelete={handleDeleteComment}
                        />
                    )}
                    <div
                        className={`flex-1 h-full relative overflow-hidden${commentMode ? ' comment-cursor-mode' : ''}`}
                        ref={(el) => {
                            reactFlowWrapperRef.current = el;
                            setDiagramWrapperEl(el);
                        }}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                    >
                        {/* Custom cursor style for comment mode — must override ReactFlow's internal pane cursor */}
                        {commentMode && (
                            <style>{`
                                .comment-cursor-mode,
                                .comment-cursor-mode .react-flow__pane,
                                .comment-cursor-mode .react-flow__node,
                                .comment-cursor-mode .react-flow__edge,
                                .comment-cursor-mode .react-flow__renderer {
                                    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2342A5F5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z'/%3E%3Cpath d='M8 12h.01'/%3E%3Cpath d='M12 12h.01'/%3E%3Cpath d='M16 12h.01'/%3E%3C/svg%3E") 12 12, crosshair !important;
                                }
                            `}</style>
                        )}
                        {/* Custom cursor for placement tools */}
                        {(activeToolMode === 'sticky-note' || activeToolMode === 'text-label') && (
                            <style>{`
                                .react-flow__pane,
                                .react-flow__renderer {
                                    cursor: crosshair !important;
                                }
                            `}</style>
                        )}
                        {/* Ghost preview following cursor for placement tools */}
                        {ghostPos && activeToolMode === 'sticky-note' && (
                            <div
                                className="fixed pointer-events-none z-[100]"
                                style={{ left: ghostPos.x + 12, top: ghostPos.y + 12 }}
                            >
                                <div className="w-[140px] h-[100px] rounded-md shadow-lg opacity-60"
                                    style={{ backgroundColor: '#fef08a' }}
                                >
                                    <div className="p-2 text-xs text-gray-500">Sticky Note</div>
                                </div>
                            </div>
                        )}
                        {ghostPos && activeToolMode === 'text-label' && (
                            <div
                                className="fixed pointer-events-none z-[100]"
                                style={{ left: ghostPos.x + 12, top: ghostPos.y + 12 }}
                            >
                                <div className="px-2 py-1 rounded bg-white/80 border border-dashed border-gray-400 opacity-70">
                                    <span className="text-sm text-gray-500">Text</span>
                                </div>
                            </div>
                        )}
                        <ReactFlow
                            nodes={nodes}
                            edges={displayEdges}
                            nodeTypes={nodeTypes}
                            edgeTypes={edgeTypes}
                            connectionLineType={ConnectionLineType.Straight}
                            connectionLineStyle={{ stroke: 'var(--color-gray-700)', strokeWidth: 1 }}
                            onNodesChange={canEdit ? onNodesChange : undefined}
                            onEdgesChange={canEdit ? onEdgesChange : undefined}
                            edgesUpdatable={false}
                            onConnect={canEdit ? onConnect : undefined}
                            onReconnectStart={canEdit ? onReconnectStart : undefined}
                            onReconnect={canEdit ? onEdgeReconnect : undefined}
                            onReconnectEnd={canEdit ? onReconnectEnd : undefined}
                            onPaneClick={handlePaneClick}
                            onNodeClick={(event) => {
                                if (commentMode && reactFlowInstanceRef.current) {
                                    const canvasPos = reactFlowInstanceRef.current.screenToFlowPosition({
                                        x: event.clientX,
                                        y: event.clientY,
                                    });
                                    handlePlaceComment(canvasPos.x, canvasPos.y);
                                }
                            }}
                            onEdgeClick={(_event, edge) => {
                                setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
                                setEdges((es) => es.map((e) => ({ ...e, selected: e.id === edge.id })));
                            }}
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
                            selectionOnDrag={interactionMode === 'default' && activeToolMode === 'none' && !commentMode}
                            panOnDrag={activeToolMode !== 'none' ? [1, 2] : interactionMode === 'panning' ? true : [1, 2]}
                            panOnScroll={true}
                            selectionMode={SelectionMode.Partial}
                            multiSelectionKeyCode={["Shift", "Meta"]}
                            autoPanOnNodeDrag
                            
                            elementsSelectable={interactionMode === 'default' && activeToolMode === 'none'}
                            nodesDraggable={canEdit && interactionMode === 'default' && activeToolMode === 'none'}
                            nodesConnectable={canEdit && interactionMode === 'default' && activeToolMode === 'none'}
                            fitView={false}
                            defaultViewport={viewport ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom } : undefined}
                            minZoom={0.1}
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
                            <DrawingOverlay
                                active={activeToolMode === 'pen'}
                                onStrokeComplete={handleStrokeComplete}
                            />
                        </ReactFlow>
                        {previewingVersionId && (
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-primary-500 text-white px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium pointer-events-auto">
                                <span>Previewing version snapshot</span>
                                <button
                                    onClick={handleExitPreview}
                                    className="ml-1 bg-white/20 hover:bg-white/30 rounded-full px-2 py-0.5 text-xs transition-colors cursor-pointer"
                                >
                                    Exit
                                </button>
                            </div>
                        )}
                        <RemoteCursorsOverlay
                            cursors={remoteCursors}
                            containerRef={diagramWrapperEl}
                            viewport={viewport}
                        />
                        {/* Comment pins layer */}
                        {viewport && ((Array.isArray(comments) && comments.length > 0) || draftComment) && (
                            <div
                                className="absolute inset-0 pointer-events-none overflow-hidden"
                                style={{ zIndex: 5 }}
                            >
                                <div
                                    style={{
                                        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                                        transformOrigin: '0 0',
                                        pointerEvents: 'auto',
                                    }}
                                >
                                    {comments.map((comment, idx) => {
                                        // Node-attached comments: adjust position based on current node
                                        let cx = comment.x;
                                        let cy = comment.y;
                                        if (comment.nodeId) {
                                            const attachedNode = nodes.find((n) => n.id === comment.nodeId);
                                            if (attachedNode) {
                                                // comment.x/y were stored as absolute canvas positions at creation time.
                                                // We find the offset from the original node position by looking at the
                                                // difference. But the simplest approach: store absolute pos and re-anchor.
                                                // Since we stored absolute canvas coords but the node may have moved,
                                                // we need to compute the delta. However we don't store original node pos.
                                                // Simplest: just use the comment's stored x/y as offset from node origin.
                                                // We'll store them as offsets in handlePlaceComment.
                                                cx = attachedNode.position.x + comment.x;
                                                cy = attachedNode.position.y + comment.y;
                                            }
                                        }
                                        return (
                                            <CommentPin
                                                key={comment.id}
                                                comment={{ ...comment, x: cx, y: cy }}
                                                currentUserId={currentUser?.id || ''}
                                                index={idx}
                                                isActive={activeCommentId === comment.id}
                                                onActivate={(id) => { setActiveCommentId(id); setCommentMode(true); }}
                                                onDeactivate={() => setActiveCommentId(null)}
                                                onReply={handleReplyComment}
                                                onResolve={handleResolveComment}
                                                onDelete={handleDeleteComment}
                                                mentionUsers={mentionUsers}
                                            />
                                        );
                                    })}
                                    {/* Draft pin — newly placed, awaiting first message */}
                                    {draftComment && (
                                        <CommentPin
                                            key="__draft__"
                                            comment={{
                                                id: '__draft__',
                                                x: draftComment.nodeId
                                                    ? (() => {
                                                        const n = nodes.find((nd) => nd.id === draftComment.nodeId);
                                                        return n ? n.position.x + draftComment.x : draftComment.x;
                                                    })()
                                                    : draftComment.x,
                                                y: draftComment.nodeId
                                                    ? (() => {
                                                        const n = nodes.find((nd) => nd.id === draftComment.nodeId);
                                                        return n ? n.position.y + draftComment.y : draftComment.y;
                                                    })()
                                                    : draftComment.y,
                                                content: '',
                                                resolved: false,
                                                parentId: null,
                                                nodeId: draftComment.nodeId,
                                                userId: currentUser?.id || '',
                                                createdAt: new Date().toISOString(),
                                                user: currentUser ? { id: currentUser.id, fullName: currentUser.fullName || '', email: currentUser.email || '' } : undefined,
                                            }}
                                            currentUserId={currentUser?.id || ''}
                                            index={comments.length}
                                            isActive
                                            isDraft
                                            onActivate={() => {}}
                                            onDeactivate={handleCancelDraft}
                                            onReply={() => {}}
                                            onResolve={() => {}}
                                            onDelete={() => {}}
                                            onSubmitDraft={handleSubmitDraft}
                                            onCancelDraft={handleCancelDraft}
                                            mentionUsers={mentionUsers}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <Footer
                    isSidebarModalOpen={isSidebarModalOpen}
                    isRightPanelOpen={isRightPanelOpen}
                    canEdit={canEdit}
                    commentMode={commentMode}
                    activeToolMode={activeToolMode}
                    onToggleSidebar={() => setIsSidebarModalOpen(!isSidebarModalOpen)}
                    onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
                    onToggleChatBox={() => setIsChatBoxOpen(!isChatBoxOpen)}
                    onToggleCommentMode={() => { setCommentMode(!commentMode); setActiveToolMode('none'); }}
                    onToolModeChange={(mode) => { setActiveToolMode(mode); if (mode !== 'none') setCommentMode(false); }}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={canUndo()}
                    canRedo={canRedo()}
                    interactionMode={interactionMode}
                    setInteractionMode={setInteractionMode}
                />

                <SearchModal open={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />
                <LinterPanel
                    issues={lintResult.issues}
                    counts={lintResult.counts}
                    isOpen={isLinterOpen}
                    onClose={() => setIsLinterOpen(false)}
                    onIssueClick={(nodeId) => {
                        const node = nodes.find((n) => n.id === nodeId);
                        if (node) {
                            setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
                            reactFlowInstanceRef.current?.fitView({
                                nodes: [{ id: nodeId }],
                                duration: 500,
                                padding: 0.5,
                            });
                        }
                    }}
                />
                <NormalizationPanel
                    isOpen={isNormalizationOpen}
                    onClose={() => setIsNormalizationOpen(false)}
                    schemaLevel={isLogicalSchema ? "logical" : "physical"}
                    modelData={normalizationModelData}
                    onApplyDecomposition={handleApplyDecomposition}
                    onTableClick={(nodeId) => {
                        const node = nodes.find((n) => n.id === nodeId);
                        if (node) {
                            setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })));
                            reactFlowInstanceRef.current?.fitView({
                                nodes: [{ id: nodeId }],
                                duration: 500,
                                padding: 0.5,
                            });
                        }
                    }}
                />
                <ChatBox
                    isOpen={isChatBoxOpen}
                    onClose={() => setIsChatBoxOpen(false)}
                    projectId={projectData?.id}
                    schemaId={selectedSchema?.id}
                    schemaLevel={
                        isConceptualSchema ? "conceptual" :
                        isLogicalSchema ? "logical" :
                        isPhysicalSchema ? "physical" :
                        undefined
                    }
                    currentModel={
                        isConceptualSchema ? (_conceptualModelData as Record<string, unknown> | null ?? null)
                        : isLogicalSchema ? (_logicalModelData as Record<string, unknown> | null ?? null)
                        : isPhysicalSchema ? (_physicalModelData as Record<string, unknown> | null ?? null)
                        : null
                    }
                    initialThreadId={chatThreadId}
                    onModelGenerated={handleChatModelGenerated}
                />
                <TourGuide />
            </div>
        </ReactFlowProvider>
    );
};

export default EditProject;
