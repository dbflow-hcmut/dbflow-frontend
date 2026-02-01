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
    type StoredLogicalNode,
    type StoredLogicalDiagramEdge,
    mapReactNodesToStoredNodes,
    mapReactEdgesToStoredEdges,
} from "../utils/logical-diagram.builder";
import { buildLogicalModel } from "../utils/logical-model.builder";
import type { LogicalModelPayload } from "../utils/logical-model.builder";

type UseLogicalCollaborationParams = {
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

export const useLogicalCollaboration = ({
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
}: UseLogicalCollaborationParams) => {
    const providerRef = useRef<HocuspocusProvider | null>(null);
    const ydocRef = useRef<Y.Doc | null>(null);
    const isSyncingFromYjsRef = useRef(false);
    const lastSyncedDiagramStringRef = useRef<string | null>(null);
    const lastAppliedDiagramStringRef = useRef<string | null>(null);
    const lastSyncedModelStringRef = useRef<string | null>(null);
    const lastAppliedModelStringRef = useRef<string | null>(null);
    const pendingDiagramUpdateRef = useRef<(() => void) | null>(null);
    const pendingModelUpdateRef = useRef<(() => void) | null>(null);
    const modelDataRef = useRef<LogicalModelPayload | null>(null);
    const [awareness, setAwareness] = useState<CollaborationAwareness | null>(null);

    useEffect(() => {
        if (!enabled) {
            lastSyncedDiagramStringRef.current = null;
            lastAppliedDiagramStringRef.current = null;
            lastSyncedModelStringRef.current = null;
            lastAppliedModelStringRef.current = null;
            return;
        }

        lastSyncedDiagramStringRef.current = null;
        lastAppliedDiagramStringRef.current = null;
        lastSyncedModelStringRef.current = null;
        lastAppliedModelStringRef.current = null;
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
                nodes?: StoredLogicalNode[] | Node<NodeData>[];
                edges?: StoredLogicalDiagramEdge[] | Edge[];
            },
            rawDiagramString?: string
        ) => {
            const { nodes: yjsNodes = [], edges: yjsEdges = [] } = diagramPayload;
            const reactNodes = mapStoredNodesToReactNodes(yjsNodes as StoredLogicalNode[]);
            const reactEdges = mapStoredEdgesToReactEdges(
                yjsEdges as (StoredLogicalDiagramEdge | Edge)[],
                reactNodes
            );

            isSyncingFromYjsRef.current = true;
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

        provider.on("sync", (isSynced: boolean) => {
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
        if (isSyncingFromYjsRef.current) return;

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
            const modelPayload = buildLogicalModel({
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

