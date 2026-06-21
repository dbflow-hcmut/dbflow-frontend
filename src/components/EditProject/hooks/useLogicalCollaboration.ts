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
    type StoredLogicalNode,
    type StoredLogicalDiagramEdge,
    mapReactNodesToStoredNodes,
    mapReactEdgesToStoredEdges,
} from "../utils/logical-diagram.builder";
import { buildDiagramFromLogicalModel, buildLogicalModel, createEmptyLogicalModel } from "../utils/logical-model.builder";
import type { LogicalModelPayload, MutateLogicalModelFn } from "../utils/logical-model.builder";
import {
    hasModelChanged,
    mergeLogicalModelFromDiagramProjection,
} from "../utils/diagram-model-sync";

export type { MutateLogicalModelFn };

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
    onDiagramReady?: () => void;
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
    onDiagramReady,
}: UseLogicalCollaborationParams) => {
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
    const modelDataRef = useRef<LogicalModelPayload | null>(null);
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
                nodes?: StoredLogicalNode[] | Node<NodeData>[];
                edges?: StoredLogicalDiagramEdge[] | Edge[];
            },
            rawDiagramString?: string,
        ) => {
            if (currentSchemaIdRef.current !== schema?.id) return;

            const { nodes: yjsNodes = [], edges: yjsEdges = [] } = diagramPayload;

            // Detect stored vs react format from nodes
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
                    reactNodes = mapStoredNodesToReactNodes(yjsNodes as StoredLogicalNode[]);
                } else {
                    reactNodes = (yjsNodes as Node<NodeData>[]).map((node) => ({
                        ...node,
                        selected: false,
                    }));
                }
            } catch (error) {
                console.error("[Logical] Error mapping nodes:", error);
                return;
            }

            let reactEdges: Edge[];
            try {
                // Always use mapStoredEdgesToReactEdges — handles both formats
                reactEdges = mapStoredEdgesToReactEdges(
                    yjsEdges as (StoredLogicalDiagramEdge | Edge)[],
                    reactNodes,
                );
            } catch (error) {
                console.error("[Logical] Error mapping edges:", error);
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
                console.error("[Logical] Error parsing diagram from Yjs:", error);
            }
            return { loaded: false, nodeCount: 0, edgeCount: 0 };
        };

        // ── Generate diagram from model (model-as-truth) ────────────
        const applyModelToDiagramInternal = async (
            modelPayload: LogicalModelPayload,
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

            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromLogicalModel({
                model: modelPayload,
                existingNodes: existingStoredNodes,
                existingEdges: existingStoredEdges,
                preserveUnmodeledNodes: true,
            });

            // Prevent handleModelChange from re-triggering
            const modelStr = rawModelString ?? JSON.stringify(modelPayload);
            lastAppliedModelStringRef.current = modelStr;
            lastSyncedModelStringRef.current = modelStr;
            modelDataRef.current = modelPayload;

            // Write diagram to Yjs so it persists
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

            // Read back via same code-path as loading saved diagram
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
                const parsedModel = JSON.parse(modelDataString) as LogicalModelPayload;
                modelDataRef.current = parsedModel;
                lastSyncedModelStringRef.current = modelDataString;
                // Mark initial model as "applied" so the Y.Map observer
                // does not mistake it for an external change and regenerate
                // the diagram (which would overwrite saved positions).
                lastAppliedModelStringRef.current = modelDataString;
            } catch (error) {
                console.error("[Logical] Error parsing model from Yjs:", error);
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
                console.error("[Logical] Error in handleDiagramChange:", error);
            }
        };

        // ── Observe model changes (from AI / external) ───────────────
        const handleModelChange = () => {
            const modelDataString = modelMap.get("data");
            // Skip our own writes
            if (modelDataString === lastAppliedModelStringRef.current) return;
            if (!modelDataString || typeof modelDataString !== "string") return;

            try {
                const newModel = JSON.parse(modelDataString) as LogicalModelPayload;
                modelDataRef.current = newModel;
                lastSyncedModelStringRef.current = modelDataString;

                // Only regenerate for external changes AFTER initial sync
                if (initialSyncDoneRef.current) {
                    if (isSyncingFromYjsRef.current) {
                        lastAppliedModelStringRef.current = modelDataString;
                    } else {
                        console.log("[Logical] External model change → regenerating diagram");
                        applyModelToDiagramInternal(newModel, modelDataString);
                    }
                }
            } catch (error) {
                console.error("[Logical] Error in handleModelChange:", error);
            }
        };

        // ── Initial sync: prefer diagram, fall back to model ─────────
        provider.on("synced", ({ state: isSynced }: { state: boolean }) => {
            if (!isSynced) return;

            // 1. Always load model first
            loadModelFromYjs();

            // 2. Try loading diagram (has positions)
            const { loaded: diagramLoaded, nodeCount } = loadDiagramFromYjs();

            // 3. No diagram but model → auto-generate
            const hasModel =
                modelDataRef.current && (modelDataRef.current.tables?.length > 0);
            // Use parsed nodeCount instead of nodesRef (React state hasn't rendered yet)
            const diagramHasContent = diagramLoaded && nodeCount > 0;

            if (diagramHasContent) {
                // Diagram loaded successfully — mark model as "already applied"
                // so handleModelChange won't regenerate and overwrite the diagram
                lastAppliedModelStringRef.current = lastSyncedModelStringRef.current;
            } else if (hasModel) {
                console.log("[Logical] No diagram — generating from model");
                applyModelToDiagramInternal(
                    modelDataRef.current!,
                    lastSyncedModelStringRef.current,
                );
            } else {
                // No diagram and no model — empty canvas, turn off loading
                onDiagramReadyRef.current?.();
            }

            // Mark initial sync done after one render cycle
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

        // Prevent syncing empty data before initial load
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
            console.error("[Logical] Failed to serialize diagram:", error);
            return;
        }

        const commitDiagramUpdate = () => {
            if (!ydocRef.current || !nextDiagramString) return;
            const doc = ydocRef.current;
            const diagramMap = doc.getMap("diagram");
            const modelMap = doc.getMap("model");

            const modelProjection = buildLogicalModel({
                storedNodes,
                storedEdges,
                schemaId: schema?.id ?? undefined,
                schemaName: schema?.name ?? undefined,
            });
            const nextModel = mergeLogicalModelFromDiagramProjection(
                modelDataRef.current,
                modelProjection,
            );
            const shouldSyncModel = hasModelChanged(modelDataRef.current, nextModel);
            const nextModelString = shouldSyncModel ? JSON.stringify(nextModel) : null;

            lastAppliedDiagramStringRef.current = nextDiagramString;
            if (nextModelString) {
                lastAppliedModelStringRef.current = nextModelString;
                lastSyncedModelStringRef.current = nextModelString;
                modelDataRef.current = nextModel;
            }

            doc.transact(() => {
                diagramMap.set("data", nextDiagramString!);
                if (nextModelString) {
                    modelMap.set("data", nextModelString);
                }
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
        async (modelPayload: LogicalModelPayload) => {
            const existingStoredNodes = mapReactNodesToStoredNodes(nodesRef.current);
            const existingStoredEdges = mapReactEdgesToStoredEdges(
                edgesRef.current,
                nodesRef.current,
            );
            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromLogicalModel({
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
    const mutateModel: MutateLogicalModelFn = useCallback(
        async (mutator, opts) => {
            // Rebuild model from current diagram state so diagram-only edits
            // (column add/delete, table delete, etc.) are captured before
            // applying the mutation.
            const existingStoredNodesForModel = mapReactNodesToStoredNodes(nodesRef.current);
            const existingStoredEdgesForModel = mapReactEdgesToStoredEdges(
                edgesRef.current,
                nodesRef.current,
            );
            const current =
                existingStoredNodesForModel.length > 0
                    ? buildLogicalModel({
                          storedNodes: existingStoredNodesForModel,
                          storedEdges: existingStoredEdgesForModel,
                          schemaId: schema?.id ?? undefined,
                          schemaName: schema?.name ?? undefined,
                      })
                    : (modelDataRef.current ??
                      createEmptyLogicalModel(schema?.id ?? undefined, schema?.name ?? undefined));
            const next = mutator(current);

            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromLogicalModel({
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
        modelData: modelDataRef.current,
    };
};
