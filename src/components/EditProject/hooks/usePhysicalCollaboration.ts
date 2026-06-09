import { useCallback, useEffect, useRef, useState } from "react";
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
import { buildDiagramFromPhysicalModel, buildPhysicalModel, createEmptyPhysicalModel } from "../utils/physical-model.builder";
import type { PhysicalModelPayload, MutatePhysicalModelFn } from "../utils/physical-model.builder";

export type { MutatePhysicalModelFn };

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
    onDiagramReady?: () => void;
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
    onDiagramReady,
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
    const [modelDataState, setModelDataState] = useState<PhysicalModelPayload | null>(null);
    const [awareness, setAwareness] = useState<CollaborationAwareness | null>(null);
    const currentSchemaIdRef = useRef<string | null>(null);
    const initialSyncDoneRef = useRef(false);
    const isGeneratingDiagramRef = useRef(false);

    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;
    const edgesRef = useRef(edges);
    edgesRef.current = edges;
    const onDiagramReadyRef = useRef(onDiagramReady);
    onDiagramReadyRef.current = onDiagramReady;

    // ── Reset refs when schema or enabled changes ────────────────────────
    useEffect(() => {
        if (!enabled) {
            lastSyncedDiagramStringRef.current = null;
            lastAppliedDiagramStringRef.current = null;
            lastSyncedModelStringRef.current = null;
            lastAppliedModelStringRef.current = null;
            hasLoadedInitialDataRef.current = false;
            initialSyncDoneRef.current = false;
            isGeneratingDiagramRef.current = false;
            modelDataRef.current = null;
            currentSchemaIdRef.current = null;
            return;
        }

        lastSyncedDiagramStringRef.current = null;
        lastAppliedDiagramStringRef.current = null;
        lastSyncedModelStringRef.current = null;
        lastAppliedModelStringRef.current = null;
        hasLoadedInitialDataRef.current = false;
        initialSyncDoneRef.current = false;
        isGeneratingDiagramRef.current = false;
        modelDataRef.current = null;
        currentSchemaIdRef.current = schema?.id ?? null;
    }, [enabled, schema?.id]);

    // ── Main Yjs connection + sync effect ────────────────────────────────
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

        // ── Apply diagram from Yjs into React state ──────────────────
        const applyDiagramFromYjs = (
            diagramPayload: {
                nodes?: StoredPhysicalNode[] | Node<NodeData>[];
                edges?: StoredPhysicalDiagramEdge[] | Edge[];
            },
            rawDiagramString?: string,
        ) => {
            if (currentSchemaIdRef.current !== schema?.id) return;

            const { nodes: yjsNodes = [], edges: yjsEdges = [] } = diagramPayload;

            const isStoredFormat =
                yjsNodes.length > 0 &&
                ((yjsNodes[0] &&
                    "size" in yjsNodes[0] &&
                    typeof (yjsNodes[0] as { size: unknown }).size === "object" &&
                    "w" in (yjsNodes[0] as { size: Record<string, unknown> }).size) ||
                    (yjsNodes[0] && "tableId" in yjsNodes[0]));

            let reactNodes: Node<NodeData>[];
            try {
                if (isStoredFormat) {
                    reactNodes = mapStoredNodesToReactNodes(yjsNodes as StoredPhysicalNode[]);
                } else {
                    reactNodes = (yjsNodes as Node<NodeData>[]).map((node) => ({
                        ...node,
                        selected: false,
                    }));
                }
            } catch (error) {
                console.error("[Physical] Error mapping nodes:", error);
                return;
            }

            let reactEdges: Edge[];
            try {
                reactEdges = mapStoredEdgesToReactEdges(
                    yjsEdges as (StoredPhysicalDiagramEdge | Edge)[],
                    reactNodes,
                );
            } catch (error) {
                console.error("[Physical] Error mapping edges:", error);
                return;
            }

            isSyncingFromYjsRef.current = true;
            hasLoadedInitialDataRef.current = true;
            setNodes(reactNodes);
            setEdges(reactEdges);
            onDiagramReadyRef.current?.();

            setTimeout(() => {
                isSyncingFromYjsRef.current = false;
            }, 0);

            if (rawDiagramString) {
                lastSyncedDiagramStringRef.current = rawDiagramString;
            }
        };

        // ── Load diagram from Yjs ────────────────────────────────────
        const loadDiagramFromYjs = (): { loaded: boolean; nodeCount: number; edgeCount: number } => {
            const diagramDataString = diagramMap.get("data");
            if (!diagramDataString || typeof diagramDataString !== "string") {
                return { loaded: false, nodeCount: 0, edgeCount: 0 };
            }
            try {
                const parsed = JSON.parse(diagramDataString) as {
                    diagram?: {
                        nodes?: Node<NodeData>[];
                        edges?: Edge[];
                    };
                };
                if (parsed.diagram) {
                    const nodeCount = (parsed.diagram.nodes ?? []).length;
                    const edgeCount = (parsed.diagram.edges ?? []).length;
                    applyDiagramFromYjs(parsed.diagram, diagramDataString);
                    return { loaded: true, nodeCount, edgeCount };
                }
            } catch (error) {
                console.error("[Physical] Error parsing diagram from Yjs:", error);
            }
            return { loaded: false, nodeCount: 0, edgeCount: 0 };
        };

        // ── Generate diagram from model (model-as-truth) ────────────
        const applyModelToDiagramInternal = async (
            modelPayload: PhysicalModelPayload,
            rawModelString?: string | null,
        ) => {
            if (currentSchemaIdRef.current !== schema?.id) return;

            isGeneratingDiagramRef.current = true;

            const currentNodes = nodesRef.current;
            const currentEdges = edgesRef.current;
            const existingStoredNodes =
                currentNodes.length > 0 ? mapReactNodesToStoredNodes(currentNodes) : undefined;
            const existingStoredEdges =
                currentEdges.length > 0
                    ? mapReactEdgesToStoredEdges(currentEdges, currentNodes)
                    : undefined;

            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromPhysicalModel({
                model: modelPayload,
                existingNodes: existingStoredNodes,
                existingEdges: existingStoredEdges,
                preserveUnmodeledNodes: true,
            });

            const modelStr = rawModelString ?? JSON.stringify(modelPayload);
            lastAppliedModelStringRef.current = modelStr;
            lastSyncedModelStringRef.current = modelStr;
            modelDataRef.current = modelPayload;
            setModelDataState(modelPayload);

            const diagStr = JSON.stringify({
                diagram: { nodes: storedNodes, edges: storedEdges },
            });
            lastAppliedDiagramStringRef.current = diagStr;
            lastSyncedDiagramStringRef.current = diagStr;

            if (ydocRef.current) {
                ydocRef.current.transact(() => {
                    ydocRef.current!.getMap("diagram").set("data", diagStr);
                });
            }

            loadDiagramFromYjs();

            setTimeout(() => {
                isGeneratingDiagramRef.current = false;
            }, 0);
        };

        // ── Load model ref from Yjs ─────────────────────────────────
        const loadModelFromYjs = () => {
            const modelDataString = modelMap.get("data");
            if (!modelDataString || typeof modelDataString !== "string") return;
            try {
                const parsedModel = JSON.parse(modelDataString);
                modelDataRef.current = parsedModel;
                setModelDataState(parsedModel);
                lastSyncedModelStringRef.current = modelDataString;
                // Mark initial model as "applied" so the Y.Map observer
                // does not mistake it for an external change and regenerate
                // the diagram (which would overwrite saved positions with
                // auto-layout).
                lastAppliedModelStringRef.current = modelDataString;
            } catch (error) {
                console.error("[Physical] Error parsing model from Yjs:", error);
            }
        };

        // ── Observe diagram changes (from collaborators) ─────────────
        const handleDiagramChange = () => {
            const diagramDataString = diagramMap.get("data");
            if (diagramDataString === lastAppliedDiagramStringRef.current) return;
            if (!diagramDataString || typeof diagramDataString !== "string") return;

            try {
                const parsed = JSON.parse(diagramDataString) as {
                    diagram?: { nodes?: Node<NodeData>[]; edges?: Edge[] };
                };
                if (parsed.diagram) {
                    applyDiagramFromYjs(parsed.diagram, diagramDataString);
                }
            } catch (error) {
                console.error("[Physical] Error in handleDiagramChange:", error);
            }
        };

        // ── Observe model changes (from AI / external) ───────────────
        const handleModelChange = () => {
            const modelDataString = modelMap.get("data");
            if (modelDataString === lastAppliedModelStringRef.current) return;
            if (!modelDataString || typeof modelDataString !== "string") return;

            try {
                const newModel = JSON.parse(modelDataString) as PhysicalModelPayload;
                modelDataRef.current = newModel;
                setModelDataState(newModel);
                lastSyncedModelStringRef.current = modelDataString;

                if (initialSyncDoneRef.current) {
                    // If a diagram is currently being applied from Yjs
                    // (same sync batch), this model is initial data — not
                    // an external change.  Mark it and skip regeneration.
                    if (isSyncingFromYjsRef.current) {
                        lastAppliedModelStringRef.current = modelDataString;
                    } else {
                        console.log("[Physical] External model change → regenerating diagram");
                        applyModelToDiagramInternal(newModel, modelDataString);
                    }
                }
            } catch (error) {
                console.error("[Physical] Error in handleModelChange:", error);
            }
        };

        // ── Initial sync: prefer diagram, fall back to model ─────────
        provider.on("synced", ({ state: isSynced }: { state: boolean }) => {
            if (!isSynced) return;

            loadModelFromYjs();

            const { loaded: diagramLoaded, nodeCount } = loadDiagramFromYjs();

            const hasModel =
                modelDataRef.current && (modelDataRef.current.tables?.length > 0);
            const diagramHasContent = diagramLoaded && nodeCount > 0;

            if (diagramHasContent) {
                lastAppliedModelStringRef.current = lastSyncedModelStringRef.current;
            } else if (hasModel) {
                console.log("[Physical] No diagram — generating from model");
                applyModelToDiagramInternal(
                    modelDataRef.current!,
                    lastSyncedModelStringRef.current,
                );
            } else {
                // No diagram and no model — empty canvas, turn off loading
                onDiagramReadyRef.current?.();
            }

            setTimeout(() => {
                initialSyncDoneRef.current = true;
            }, 50);
        });

        diagramMap.observe(handleDiagramChange);
        modelMap.observe(handleModelChange);

        // ── Eagerly apply data already in the doc ────────────────────
        const initialModelData = modelMap.get("data");
        if (initialModelData && typeof initialModelData === "string") {
            loadModelFromYjs();
        }

        const initialDiagramData = diagramMap.get("data");
        if (initialDiagramData && typeof initialDiagramData === "string") {
            const { loaded, nodeCount } = loadDiagramFromYjs();
            if (loaded && nodeCount > 0) {
                lastAppliedModelStringRef.current = lastSyncedModelStringRef.current;
            }
        } else if (modelDataRef.current) {
            applyModelToDiagramInternal(
                modelDataRef.current,
                lastSyncedModelStringRef.current,
            );
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

    // ── Save diagram to Yjs (diagram only — NOT model) ───────────────
    useEffect(() => {
        if (!enabled) return;
        if (!ydocRef.current || !schema?.id) return;
        if (currentSchemaIdRef.current !== schema?.id) return;
        if (isSyncingFromYjsRef.current) return;
        if (isGeneratingDiagramRef.current) return;

        if (!hasLoadedInitialDataRef.current && nodes.length === 0 && edges.length === 0) {
            return;
        }

        const storedNodes = mapReactNodesToStoredNodes(nodes);
        const storedEdges = mapReactEdgesToStoredEdges(edges, nodes);

        const diagramPayload = {
            diagram: { nodes: storedNodes, edges: storedEdges },
        };

        let nextDiagramString: string | null = null;
        try {
            nextDiagramString = JSON.stringify(diagramPayload);
        } catch (error) {
            console.error("[Physical] Failed to serialize diagram:", error);
            return;
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

        if (nextDiagramString && lastSyncedDiagramStringRef.current !== nextDiagramString) {
            if (!ydocRef.current) {
                pendingDiagramUpdateRef.current = commitDiagramUpdate;
            } else {
                commitDiagramUpdate();
            }
        }

        // NOTE: Model is NOT written here.
        // Model is only updated via applyModelPayload() or mutateModel().
    }, [enabled, nodes, edges, schema?.id, schema?.name, diagramName]);

    // ── Apply model payload (full replace: Model → Diagram) ──────────
    const applyModelPayload = useCallback(
        async (modelPayload: PhysicalModelPayload) => {
            const existingStoredNodes = mapReactNodesToStoredNodes(nodesRef.current);
            const existingStoredEdges = mapReactEdgesToStoredEdges(
                edgesRef.current,
                nodesRef.current,
            );
            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromPhysicalModel({
                model: modelPayload,
                existingNodes: existingStoredNodes,
                existingEdges: existingStoredEdges,
                preserveUnmodeledNodes: true,
            });

            const reactNodes = mapStoredNodesToReactNodes(storedNodes);
            const reactEdges = mapStoredEdgesToReactEdges(storedEdges, reactNodes);

            hasLoadedInitialDataRef.current = true;
            setNodes(reactNodes);
            setEdges(reactEdges);
            modelDataRef.current = modelPayload;
            setModelDataState(modelPayload);

            const modelStr = JSON.stringify(modelPayload);
            lastAppliedModelStringRef.current = modelStr;
            lastSyncedModelStringRef.current = modelStr;
            if (ydocRef.current) {
                ydocRef.current.transact(() => {
                    ydocRef.current!.getMap("model").set("data", modelStr);
                });
            }
        },
        [setNodes, setEdges],
    );

    // ── Incremental model mutation ───────────────────────────────────
    const mutateModel: MutatePhysicalModelFn = useCallback(
        async (mutator, opts) => {
            // Rebuild model from current diagram state so diagram-only edits
            // (column add/delete, table delete, index changes, etc.) are captured
            // before applying the mutation.  Without this the stale
            // modelDataRef would overwrite those changes when the diagram is
            // regenerated from the model.
            const existingStoredNodesForModel = mapReactNodesToStoredNodes(nodesRef.current);
            const existingStoredEdgesForModel = mapReactEdgesToStoredEdges(
                edgesRef.current,
                nodesRef.current,
            );
            const builtFromDiagram =
                existingStoredNodesForModel.length > 0
                    ? buildPhysicalModel({
                          storedNodes: existingStoredNodesForModel,
                          storedEdges: existingStoredEdgesForModel,
                          schemaId: schema?.id ?? undefined,
                          schemaName: schema?.name ?? undefined,
                      })
                    : (modelDataRef.current ??
                      createEmptyPhysicalModel(schema?.id ?? undefined, schema?.name ?? undefined));

            // Preserve model-level metadata (dbms, description, notes) that
            // buildPhysicalModel cannot reconstruct from diagram nodes.
            const savedMeta = modelDataRef.current?.model;
            const current: PhysicalModelPayload = savedMeta
                ? {
                      ...builtFromDiagram,
                      model: {
                          ...builtFromDiagram.model,
                          dbms: savedMeta.dbms ?? builtFromDiagram.model.dbms,
                          description: savedMeta.description ?? builtFromDiagram.model.description,
                          notes: savedMeta.notes ?? builtFromDiagram.model.notes,
                      },
                  }
                : builtFromDiagram;

            const next = mutator(current);

            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromPhysicalModel({
                model: next,
                existingNodes: existingStoredNodesForModel,
                existingEdges: existingStoredEdgesForModel,
                preserveUnmodeledNodes: true,
            });

            const reactNodes = mapStoredNodesToReactNodes(storedNodes);
            const reactEdges = mapStoredEdgesToReactEdges(storedEdges, reactNodes);

            if (opts?.selectedNodeId && opts?.positionHint) {
                const target = reactNodes.find((n) => n.id === opts.selectedNodeId);
                if (target) target.position = opts.positionHint;
            }

            if (opts?.selectedNodeId) {
                reactNodes.forEach((n) => {
                    n.selected = n.id === opts.selectedNodeId;
                });
            }

            hasLoadedInitialDataRef.current = true;
            setNodes(reactNodes);
            setEdges(reactEdges);
            modelDataRef.current = next;
            setModelDataState(next);

            const modelStr = JSON.stringify(next);
            lastAppliedModelStringRef.current = modelStr;
            lastSyncedModelStringRef.current = modelStr;
            if (ydocRef.current) {
                ydocRef.current.transact(() => {
                    ydocRef.current!.getMap("model").set("data", modelStr);
                });
            }
        },
        [setNodes, setEdges, schema?.id, schema?.name],
    );

    return {
        awareness,
        applyModelPayload,
        mutateModel,
        modelData: modelDataState,
    };
};
