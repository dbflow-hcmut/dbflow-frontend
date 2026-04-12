import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Node, Edge } from "reactflow";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { API_BASE } from "@/api";
import type { ProjectSchemasResponse } from "@/types/projects.type";
import type { NodeData } from "../index";
import type { CollaborationAwareness } from "@/types/projects.type";
import {
    mapStoredNodesToReactNodes,
    mapStoredEdgesToReactEdges,
    type StoredPhysicalNode,
    type StoredPhysicalDiagramEdge,
    mapReactNodesToStoredNodes,
    mapReactEdgesToStoredEdges,
} from "../utils/physical-diagram.builder";
import { buildPhysicalModel } from "../utils/physical-model.builder";
import type { PhysicalModelPayload } from "../utils/physical-model.builder";

type UsePhysicalCollaborationParams = {
    enabled: boolean;
    projectId: string | null | undefined;
    schema: ProjectSchemasResponse | null;
    sessionId: string | null;
    token: string | null;
    nodes: Node<NodeData>[];
    edges: Edge[];
    setNodes: Dispatch<SetStateAction<Node<NodeData>[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    diagramName: string;
};

export const usePhysicalCollaboration = ({
    enabled,
    projectId,
    schema,
    sessionId,
    token,
    nodes,
    edges,
    setNodes,
    setEdges,
    diagramName,
}: UsePhysicalCollaborationParams) => {
    const providerRef = useRef<HocuspocusProvider | null>(null);
    const ydocRef = useRef<Y.Doc | null>(null);
    const isSyncingFromYjsRef = useRef(false);
    const hasLoadedInitialDataRef = useRef(false);
    const lastSyncedDiagramStringRef = useRef<string | null>(null);
    const lastAppliedDiagramStringRef = useRef<string | null>(null);
    const lastSyncedModelStringRef = useRef<string | null>(null);
    const lastAppliedModelStringRef = useRef<string | null>(null);
    const pendingDiagramUpdateRef = useRef<(() => void) | null>(null);
    const pendingModelUpdateRef = useRef<(() => void) | null>(null);
    const modelDataRef = useRef<PhysicalModelPayload | null>(null);
    const [awareness, setAwareness] = useState<CollaborationAwareness | null>(null);
    const currentSchemaIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled) {
            lastSyncedDiagramStringRef.current = null;
            lastAppliedDiagramStringRef.current = null;
            lastSyncedModelStringRef.current = null;
            lastAppliedModelStringRef.current = null;
            hasLoadedInitialDataRef.current = false;
            currentSchemaIdRef.current = null;
            return;
        }

        lastSyncedDiagramStringRef.current = null;
        lastAppliedDiagramStringRef.current = null;
        lastSyncedModelStringRef.current = null;
        lastAppliedModelStringRef.current = null;
        hasLoadedInitialDataRef.current = false;
        currentSchemaIdRef.current = schema?.id ?? null;
    }, [enabled, schema?.id]);

    useEffect(() => {
        if (!enabled) return;
        if (!sessionId || !schema?.id) return;

        const ydoc = new Y.Doc();
        const diagramMap = ydoc.getMap("diagram");
        const modelMap = ydoc.getMap("model");

        const hocuspocusUrl = `${API_BASE}/project-collaboration?projectId=${projectId}&sessionId=${sessionId}`;
        const provider = new HocuspocusProvider({
            url: hocuspocusUrl,
            name: schema.id,
            document: ydoc,
            token: token ?? undefined,
        });

        providerRef.current = provider;
        ydocRef.current = ydoc;
        setAwareness(provider.awareness);

        if (pendingDiagramUpdateRef.current) {
            pendingDiagramUpdateRef.current();
            pendingDiagramUpdateRef.current = null;
        }
        if (pendingModelUpdateRef.current) {
            pendingModelUpdateRef.current();
            pendingModelUpdateRef.current = null;
        }

        const applyDiagramFromYjs = (
            diagramPayload: {
                nodes?: StoredPhysicalNode[] | Node<NodeData>[];
                edges?: StoredPhysicalDiagramEdge[] | Edge[];
            },
            rawDiagramString?: string
        ) => {
            // Only apply if this hook is handling the current schema
            if (currentSchemaIdRef.current !== schema?.id) {
                return;
            }

            const { nodes: yjsNodes = [], edges: yjsEdges = [] } = diagramPayload;

            console.log("[Physical Collaboration] applyDiagramFromYjs - received nodes:", yjsNodes.length, "edges:", yjsEdges.length);

            // Detect if nodes are stored format or react format
            // Stored nodes have: size: {w, h} (not style.width/height), or tableId
            // React nodes have: data object, style: {width, height} (not size: {w, h})
            const isStoredFormat = yjsNodes.length > 0 && (
                (yjsNodes[0] && 'size' in yjsNodes[0] && typeof (yjsNodes[0] as { size: unknown }).size === 'object' && 'w' in ((yjsNodes[0] as { size: Record<string, unknown> }).size)) ||
                (yjsNodes[0] && 'tableId' in yjsNodes[0])
            );

            console.log("[Physical Collaboration] isStoredFormat:", isStoredFormat, "sample node:", yjsNodes[0]);

            let reactNodes: Node<NodeData>[];
            try {
                if (isStoredFormat) {
                    reactNodes = mapStoredNodesToReactNodes(yjsNodes as StoredPhysicalNode[]);
                } else {
                    // Already in React format, just ensure selected is false
                    reactNodes = (yjsNodes as Node<NodeData>[]).map(node => ({
                        ...node,
                        selected: false
                    }));
                }
                console.log("[Physical Collaboration] mapped reactNodes:", reactNodes.length);
            } catch (error) {
                console.error("[Physical Collaboration] Error mapping nodes:", error);
                return;
            }

            let reactEdges: Edge[];
            try {
                if (isStoredFormat) {
                    reactEdges = mapStoredEdgesToReactEdges(
                        yjsEdges as (StoredPhysicalDiagramEdge | Edge)[],
                        reactNodes
                    );
                } else {
                    // Already in React format
                    reactEdges = (yjsEdges as Edge[]).map(edge => ({
                        ...edge,
                        selected: false
                    }));
                }
                console.log("[Physical Collaboration] mapped reactEdges:", reactEdges.length);
            } catch (error) {
                console.error("[Physical Collaboration] Error mapping edges:", error);
                return;
            }

            isSyncingFromYjsRef.current = true;
            hasLoadedInitialDataRef.current = true;
            console.log("[Physical Collaboration] Setting nodes and edges to state");
            setNodes(reactNodes);
            setEdges(reactEdges);

            setTimeout(() => {
                isSyncingFromYjsRef.current = false;
            }, 0);

            if (rawDiagramString) {
                lastSyncedDiagramStringRef.current = rawDiagramString;
            }
        };

        const loadDiagramFromYjs = () => {
            const diagramDataString = diagramMap.get("data");
            if (!diagramDataString || typeof diagramDataString !== "string") {
                return;
            }

            try {
                const parsedData = JSON.parse(diagramDataString) as {
                    diagram?: {
                        nodes?: Node<NodeData>[];
                        edges?: Edge[];
                        viewport?: { x: number; y: number; zoom: number };
                    };
                };

                if (parsedData.diagram) {
                    applyDiagramFromYjs(parsedData.diagram, diagramDataString);
                }
            } catch (error) {
                console.error("Error parsing diagram data from Yjs:", error);
            }
        };

        const loadModelFromYjs = () => {
            const modelDataString = modelMap.get("data");
            if (!modelDataString || typeof modelDataString !== "string") {
                return;
            }

            try {
                const parsedModel = JSON.parse(modelDataString);
                modelDataRef.current = parsedModel;
                lastSyncedModelStringRef.current = modelDataString;
            } catch (error) {
                console.error("Error parsing model data from Yjs:", error);
            }
        };

        const handleDiagramChange = () => {
            const diagramDataString = diagramMap.get("data");
            if (diagramDataString === lastAppliedDiagramStringRef.current) {
                return;
            }

            if (!diagramDataString || typeof diagramDataString !== "string") {
                return;
            }

            try {
                const parsedData = JSON.parse(diagramDataString) as {
                    diagram?: {
                        nodes?: Node<NodeData>[];
                        edges?: Edge[];
                        viewport?: { x: number; y: number; zoom: number };
                    };
                };

                if (parsedData.diagram) {
                    applyDiagramFromYjs(parsedData.diagram, diagramDataString);
                }
            } catch (error) {
                console.error("Error parsing diagram data from Yjs:", error);
            }
        };

        const handleModelChange = () => {
            const modelDataString = modelMap.get("data");
            if (modelDataString === lastAppliedModelStringRef.current) {
                return;
            }
            if (!modelDataString || typeof modelDataString !== "string") {
                return;
            }

            try {
                const parsedModel = JSON.parse(modelDataString);
                modelDataRef.current = parsedModel;
                lastSyncedModelStringRef.current = modelDataString;
            } catch (error) {
                console.error("Error parsing model data from Yjs:", error);
            }
        };

        provider.on("synced", ({ state: isSynced }: { state: boolean }) => {
            if (isSynced) {
                loadDiagramFromYjs();
                loadModelFromYjs();
            }
        });

        diagramMap.observe(handleDiagramChange);
        modelMap.observe(handleModelChange);

        const initialDiagramData = diagramMap.get("data");
        if (initialDiagramData && typeof initialDiagramData === "string") {
            loadDiagramFromYjs();
        }
        const initialModelData = modelMap.get("data");
        if (initialModelData && typeof initialModelData === "string") {
            loadModelFromYjs();
        }

        return () => {
            diagramMap.unobserve(handleDiagramChange);
            modelMap.unobserve(handleModelChange);
            provider.destroy();
            ydoc.destroy();
            providerRef.current = null;
            ydocRef.current = null;
            setAwareness(null);
        };
    }, [enabled, sessionId, schema?.id, projectId, token, setNodes, setEdges]);

    useEffect(() => {
        if (!enabled) return;
        if (!ydocRef.current || !schema?.id) return;
        // Only sync if this hook is handling the current schema
        if (currentSchemaIdRef.current !== schema?.id) {
            return;
        }
        if (isSyncingFromYjsRef.current) {
            console.log("[Physical Collaboration] Skipping sync - currently syncing from Yjs");
            return;
        }

        // Prevent syncing empty data if initial data hasn't been loaded yet
        // This prevents data loss when switching schemas
        if (!hasLoadedInitialDataRef.current && nodes.length === 0 && edges.length === 0) {
            console.log("[Physical Collaboration] Skipping sync - no initial data loaded yet and diagram is empty");
            return;
        }

        const storedNodes = mapReactNodesToStoredNodes(nodes);
        const storedEdges = mapReactEdgesToStoredEdges(edges, nodes);

        const diagramPayload = {
            diagram: {
                nodes: storedNodes,
                edges: storedEdges,
            },
        };

        let nextDiagramString: string | null = null;
        let nextModelString: string | null = null;

        try {
            nextDiagramString = JSON.stringify(diagramPayload);
        } catch (error) {
            console.error("Failed to serialize diagram payload:", error);
            return;
        }

        try {
            const modelPayload = buildPhysicalModel({
                storedNodes,
                storedEdges,
                schemaId: schema?.id,
                schemaName: schema?.name,
                diagramName,
            });
            nextModelString = JSON.stringify(modelPayload);
        } catch (error) {
            console.error("Failed to serialize model payload:", error);
        }

        const commitDiagramUpdate = () => {
            if (!ydocRef.current || !nextDiagramString) return;
            const doc = ydocRef.current;
            const map = doc.getMap("diagram");
            lastAppliedDiagramStringRef.current = nextDiagramString;
            doc.transact(() => {
                map.set("data", nextDiagramString!);
            });
            lastSyncedDiagramStringRef.current = nextDiagramString;
        };

        const commitModelUpdate = () => {
            if (!ydocRef.current || !nextModelString) return;
            const doc = ydocRef.current;
            const map = doc.getMap("model");
            lastAppliedModelStringRef.current = nextModelString;
            doc.transact(() => {
                map.set("data", nextModelString!);
            });
            lastSyncedModelStringRef.current = nextModelString;
        };

        if (nextDiagramString && lastSyncedDiagramStringRef.current !== nextDiagramString) {
            if (!ydocRef.current) {
                pendingDiagramUpdateRef.current = commitDiagramUpdate;
            } else {
                commitDiagramUpdate();
            }
        }

        if (nextModelString && lastSyncedModelStringRef.current !== nextModelString) {
            if (!ydocRef.current) {
                pendingModelUpdateRef.current = commitModelUpdate;
            } else {
                commitModelUpdate();
            }
        }
    }, [enabled, nodes, edges, schema?.id, schema?.name, diagramName]);

    return { awareness };
};
