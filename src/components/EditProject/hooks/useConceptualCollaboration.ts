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
    type StoredDiagramNode,
    type StoredDiagramEdge,
    mapReactNodesToStoredNodes,
    mapReactEdgesToStoredEdges,
} from "../utils/conceptual-diagram.builder";
import { buildDiagramFromModel, buildConceptualModel, createEmptyConceptualModel, normalizeConceptualModel } from "../utils/conceptual-model.builder";
import type { ConceptualModelPayload } from "../utils/conceptual-model.builder";
import {
    hasModelChanged,
    mergeConceptualModelFromDiagramProjection,
} from "../utils/diagram-model-sync";

export type MutateModelFn = (
    mutator: (model: ConceptualModelPayload) => ConceptualModelPayload,
    opts?: { selectedNodeId?: string; positionHint?: { x: number; y: number } },
) => void | Promise<void>;

type UseConceptualCollaborationParams = {
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

export const useConceptualCollaboration = ({
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
}: UseConceptualCollaborationParams) => {
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
    const modelDataRef = useRef<ConceptualModelPayload | null>(null);
    const [modelDataState, setModelDataState] = useState<ConceptualModelPayload | null>(null);
    const [awareness, setAwareness] = useState<CollaborationAwareness | null>(null);
    const currentSchemaIdRef = useRef<string | null>(null);
    /** Becomes `true` only after the initial Yjs sync handler has finished
     *  AND at least one React render cycle has completed with the loaded
     *  diagram.  Only then should external model changes regenerate the
     *  diagram – otherwise we'd clobber saved positions with auto-layout. */
    const initialSyncDoneRef = useRef(false);
    /** True while an async model→diagram generation is running.
     *  Prevents the sync useEffect from patching the model with the
     *  "stale" diagram that will be immediately replaced.  */
    const isGeneratingDiagramRef = useRef(false);

    // Keep live refs to nodes/edges so closures inside useEffects always
    // read the latest list (needed for position-preserving model→diagram).
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;
    const edgesRef = useRef(edges);
    edgesRef.current = edges;

    const onDiagramReadyRef = useRef(onDiagramReady);
    onDiagramReadyRef.current = onDiagramReady;

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
            setModelDataState(null);
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
        setModelDataState(null);
        currentSchemaIdRef.current = schema?.id ?? null;
    }, [enabled, schema?.id]);

    useEffect(() => {
        if (!enabled) return;
        if (!sessionId || !schema?.id) return;

        const ydoc = new Y.Doc();
        const diagramMap = ydoc.getMap('diagram');
        const modelMap = ydoc.getMap('model');

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
                nodes?: StoredDiagramNode[] | Node<NodeData>[];
                edges?: StoredDiagramEdge[] | Edge[];
            },
            rawDiagramString?: string
        ) => {
            // Only apply if this hook is handling the current schema
            if (currentSchemaIdRef.current !== schema?.id) {
                return;
            }

            const { nodes: yjsNodes = [], edges: yjsEdges = [] } = diagramPayload;

            console.log("[Conceptual Collaboration] applyDiagramFromYjs - received nodes:", yjsNodes.length, "edges:", yjsEdges.length);

            // Detect if nodes are stored format or react format
            // Stored nodes have: size: {w, h} (not style.width/height), or entityId/attributeId/relationshipId
            // React nodes have: data object, style: {width, height} (not size: {w, h})
            const isStoredFormat = yjsNodes.length > 0 && (
                (yjsNodes[0] && 'size' in yjsNodes[0] && typeof (yjsNodes[0] as { size: unknown }).size === 'object' && 'w' in ((yjsNodes[0] as { size: Record<string, unknown> }).size)) ||
                (yjsNodes[0] && ('entityId' in yjsNodes[0] || 'attributeId' in yjsNodes[0] || 'relationshipId' in yjsNodes[0]))
            );

            console.log("[Conceptual Collaboration] isStoredFormat:", isStoredFormat, "sample node:", yjsNodes[0]);

            let reactNodes: Node<NodeData>[];
            try {
                if (isStoredFormat) {
                    reactNodes = mapStoredNodesToReactNodes(yjsNodes as StoredDiagramNode[]);
                } else {
                    // Already in React format, just ensure selected is false
                    reactNodes = (yjsNodes as Node<NodeData>[]).map(node => ({
                        ...node,
                        selected: false
                    }));
                }
                console.log("[Conceptual Collaboration] mapped reactNodes:", reactNodes.length);
            } catch (error) {
                console.error("[Conceptual Collaboration] Error mapping nodes:", error);
                return;
            }

            let reactEdges: Edge[];
            try {
                if (isStoredFormat) {
                    reactEdges = mapStoredEdgesToReactEdges(
                        yjsEdges as (StoredDiagramEdge | Edge)[],
                        reactNodes
                    );
                } else {
                    // Already in React format
                    reactEdges = (yjsEdges as Edge[]).map(edge => ({
                        ...edge,
                        selected: false
                    }));
                }
                console.log("[Conceptual Collaboration] mapped reactEdges:", reactEdges.length);
            } catch (error) {
                console.error("[Conceptual Collaboration] Error mapping edges:", error);
                return;
            }

            isSyncingFromYjsRef.current = true;
            hasLoadedInitialDataRef.current = true;
            console.log("[Conceptual Collaboration] Setting nodes and edges to state");
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

        /** Try to load diagram from Yjs. Returns `true` if data existed and was applied. */
        const loadDiagramFromYjs = (): { loaded: boolean; nodeCount: number } => {
            const diagramDataString = diagramMap.get('data');
            if (!diagramDataString || typeof diagramDataString !== 'string') {
                return { loaded: false, nodeCount: 0 };
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
                    const nodeCount = (parsedData.diagram.nodes ?? []).length;
                    applyDiagramFromYjs(parsedData.diagram, diagramDataString);
                    return { loaded: true, nodeCount };
                }
            } catch (error) {
                console.error('Error parsing diagram data from Yjs:', error);
            }
            return { loaded: false, nodeCount: 0 };
        };

        // ── Generate diagram from model (model-as-truth) ──────────────────
        // Builds stored nodes/edges from the model, writes the diagram to
        // the Yjs diagram map, then reads it back via `loadDiagramFromYjs`
        // — the exact same code-path used when a saved diagram already
        // exists.  This guarantees the data goes through the same
        // JSON.stringify → Yjs → JSON.parse → applyDiagramFromYjs pipeline
        // that is proven to render correctly.
        const applyModelToDiagramInternal = async (
            modelPayload: ConceptualModelPayload,
            rawModelString?: string | null,
        ) => {
            if (currentSchemaIdRef.current !== schema?.id) return;

            isGeneratingDiagramRef.current = true;

            const currentNodes = nodesRef.current;
            const currentEdges = edgesRef.current;
            const existingStoredNodes =
                currentNodes.length > 0
                    ? mapReactNodesToStoredNodes(currentNodes, currentEdges)
                    : undefined;
            const existingStoredEdges =
                currentEdges.length > 0
                    ? mapReactEdgesToStoredEdges(currentEdges, currentNodes)
                    : undefined;

            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromModel({
                model: modelPayload,
                existingNodes: existingStoredNodes,
                existingEdges: existingStoredEdges,
                preserveUnmodeledNodes: true,
            });

            console.log(
                '[Conceptual Collaboration] Generated diagram from model —',
                storedNodes.length, 'nodes,', storedEdges.length, 'edges',
            );

            // Prevent handleModelChange from re-triggering for the same model
            const modelStr = rawModelString ?? JSON.stringify(modelPayload);
            lastAppliedModelStringRef.current = modelStr;
            lastSyncedModelStringRef.current = modelStr;
            modelDataRef.current = modelPayload;
            setModelDataState(modelPayload);

            // Write diagram to Yjs so it persists to the backend AND so
            // that `loadDiagramFromYjs` can read it back immediately.
            const diagStr = JSON.stringify({
                diagram: { nodes: storedNodes, edges: storedEdges },
            });
            lastAppliedDiagramStringRef.current = diagStr;
            lastSyncedDiagramStringRef.current = diagStr;

            if (ydocRef.current) {
                ydocRef.current.transact(() => {
                    ydocRef.current!.getMap('diagram').set('data', diagStr);
                });
            }

            // Read back from Yjs — identical code-path as "second load".
            // The data goes through JSON.parse inside loadDiagramFromYjs,
            // which is what makes it render correctly.
            loadDiagramFromYjs();

            // Allow the sync useEffect to patch model again AFTER React has
            // committed the nodes/edges from this generation cycle.
            setTimeout(() => {
                isGeneratingDiagramRef.current = false;
            }, 0);
        };

        const loadModelFromYjs = () => {
            const modelDataString = modelMap.get('data');
            if (!modelDataString || typeof modelDataString !== 'string') {
                return;
            }

            try {
                const parsedModel = normalizeConceptualModel(JSON.parse(modelDataString) as Record<string, unknown>);
                modelDataRef.current = parsedModel;
                setModelDataState(parsedModel);
                lastSyncedModelStringRef.current = modelDataString;
                // Mark initial model as "applied" so the Y.Map observer
                // does not mistake it for an external change and regenerate
                // the diagram (which would overwrite saved positions).
                lastAppliedModelStringRef.current = modelDataString;
            } catch (error) {
                console.error('Error parsing model data from Yjs:', error);
            }
        };

        const handleDiagramChange = () => {
            const diagramDataString = diagramMap.get('data');
            if (diagramDataString === lastAppliedDiagramStringRef.current) {
                return;
            }

            if (!diagramDataString || typeof diagramDataString !== 'string') {
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
                console.error('Error parsing diagram data from Yjs:', error);
            }
        };

        const handleModelChange = () => {
            const modelDataString = modelMap.get('data');
            // Skip our own writes
            if (modelDataString === lastAppliedModelStringRef.current) {
                return;
            }
            if (!modelDataString || typeof modelDataString !== 'string') {
                return;
            }

            try {
                const newModel = JSON.parse(modelDataString) as ConceptualModelPayload;
                modelDataRef.current = newModel;
                setModelDataState(newModel);
                lastSyncedModelStringRef.current = modelDataString;

                // Only regenerate diagram for EXTERNAL model changes that
                // arrive AFTER the initial sync is fully complete (including
                // at least one React render cycle).  During initial sync the
                // saved diagram (with user's positions) takes priority.
                if (initialSyncDoneRef.current) {
                    if (isSyncingFromYjsRef.current) {
                        lastAppliedModelStringRef.current = modelDataString;
                    } else {
                        console.log('[Conceptual Collaboration] External model change — regenerating diagram from model (preserving positions)');
                        void applyModelToDiagramInternal(newModel, modelDataString);
                    }
                } else {
                    console.log('[Conceptual Collaboration] Model change during initial sync — storing model ref only');
                }
            } catch (error) {
                console.error('Error parsing model data from Yjs:', error);
            }
        };

        // ── Initial sync: prefer diagram, fall back to model ─────────────
        provider.on('synced', ({ state: isSynced }: { state: boolean }) => {
            if (isSynced) {
                // 1. Always load model first (source of truth for semantics)
                loadModelFromYjs();

                // 2. Try loading diagram (has layout / positions)
                const { loaded: diagramLoaded, nodeCount } = loadDiagramFromYjs();

                // 3. If no diagram exists, or diagram is empty but model has
                //    entities (e.g. AI-generated model saved before first
                //    visit) → generate diagram from model.
                const hasModel = modelDataRef.current &&
                    (modelDataRef.current.entities?.length > 0 ||
                     ('tables' in modelDataRef.current && Array.isArray((modelDataRef.current as Record<string, unknown>).tables) && ((modelDataRef.current as Record<string, unknown>).tables as unknown[]).length > 0));
                // Use parsed nodeCount instead of nodesRef (React state hasn't rendered yet)
                const diagramHasContent = diagramLoaded && nodeCount > 0;

                if (!diagramHasContent && hasModel) {
                    console.log('[Conceptual Collaboration] No diagram (or empty) with model data — generating from model');
                    void applyModelToDiagramInternal(modelDataRef.current!, lastSyncedModelStringRef.current)
                        .finally(() => {
                            setTimeout(() => {
                                initialSyncDoneRef.current = true;
                                console.log('[Conceptual Collaboration] Initial sync complete — model changes will now regenerate diagram');
                            }, 50);
                        });
                } else {
                    if (diagramHasContent) {
                        lastAppliedModelStringRef.current = lastSyncedModelStringRef.current;
                    } else {
                        // No diagram and no model — empty canvas, turn off loading
                        onDiagramReadyRef.current?.();
                    }
                    setTimeout(() => {
                        initialSyncDoneRef.current = true;
                        console.log('[Conceptual Collaboration] Initial sync complete — model changes will now regenerate diagram');
                    }, 50);
                }
            }
        });

        diagramMap.observe(handleDiagramChange);
        modelMap.observe(handleModelChange);

        // ── Eagerly apply data already in the doc ────────────────────────
        const initialModelData = modelMap.get('data');
        if (initialModelData && typeof initialModelData === 'string') {
            loadModelFromYjs();
        }

        const initialDiagramData = diagramMap.get('data');
        if (initialDiagramData && typeof initialDiagramData === 'string') {
            const { loaded, nodeCount } = loadDiagramFromYjs();
            if (loaded && nodeCount > 0) {
                lastAppliedModelStringRef.current = lastSyncedModelStringRef.current;
            }
        } else if (modelDataRef.current) {
            // Model exists but no diagram yet — generate diagram from model
            void applyModelToDiagramInternal(modelDataRef.current, lastSyncedModelStringRef.current);
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
            console.log("[Conceptual Collaboration] Skipping sync - currently syncing from Yjs");
            return;
        }
        if (isGeneratingDiagramRef.current) {
            return;
        }

        // Prevent syncing empty data if initial data hasn't been loaded yet
        // This prevents data loss when switching schemas
        if (!hasLoadedInitialDataRef.current && nodes.length === 0 && edges.length === 0) {
            console.log("[Conceptual Collaboration] Skipping sync - no initial data loaded yet and diagram is empty");
            return;
        }

        const storedNodes = mapReactNodesToStoredNodes(nodes, edges);
        const storedEdges = mapReactEdgesToStoredEdges(edges, nodes);

        const diagramPayload = {
            diagram: {
                nodes: storedNodes,
                edges: storedEdges,
            },
        };

        let nextDiagramString: string | null = null;

        try {
            nextDiagramString = JSON.stringify(diagramPayload);
        } catch (error) {
            console.error("Failed to serialize diagram payload:", error);
            return;
        }

        const commitDiagramUpdate = () => {
            if (!ydocRef.current || !nextDiagramString) return;
            const doc = ydocRef.current;
            const diagramMap = doc.getMap('diagram');
            const modelMap = doc.getMap('model');

            const modelProjection = buildConceptualModel({
                storedNodes,
                storedEdges,
                schemaId: schema?.id ?? undefined,
                schemaName: schema?.name ?? undefined,
            });
            const nextModel = mergeConceptualModelFromDiagramProjection(
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
                setModelDataState(nextModel);
            }

            doc.transact(() => {
                diagramMap.set('data', nextDiagramString!);
                if (nextModelString) {
                    modelMap.set('data', nextModelString);
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

        // NOTE: Model is NOT written to Yjs from the sync useEffect.
        // The diagram-only sync to Yjs is sufficient. The model in Yjs
        // (loaded from S3 via Hocuspocus) stays untouched.
        // Model is only updated via applyModelPayload() or mutateModel().
    }, [enabled, nodes, edges, schema?.id, schema?.name, diagramName]);

    // ── Apply model payload (full replace: Model → Diagram) ─────────────
    /**
     * Replace the current model entirely and regenerate the diagram.
     * Preserves positions of nodes whose IDs match existing nodes.
     * Use this to apply AI-generated model changes onto the canvas.
     */
    const applyModelPayload = useCallback(
        async (modelPayload: ConceptualModelPayload) => {
            const normalized = normalizeConceptualModel(modelPayload as unknown as Record<string, unknown>);
            const existingStoredNodes = mapReactNodesToStoredNodes(nodesRef.current, edgesRef.current);
            const existingStoredEdges = mapReactEdgesToStoredEdges(edgesRef.current, nodesRef.current);
            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromModel({
                model: normalized,
                existingNodes: existingStoredNodes,
                existingEdges: existingStoredEdges,
                preserveUnmodeledNodes: true,
            });

            const reactNodes = mapStoredNodesToReactNodes(storedNodes);
            const reactEdges = mapStoredEdgesToReactEdges(storedEdges, reactNodes);

            hasLoadedInitialDataRef.current = true;
            setNodes(reactNodes);
            setEdges(reactEdges);
            modelDataRef.current = normalized;
            setModelDataState(normalized);

            // Persist model to Yjs so it survives page refresh / reconnect
            const modelStr = JSON.stringify(normalized);
            lastAppliedModelStringRef.current = modelStr;
            lastSyncedModelStringRef.current = modelStr;
            if (ydocRef.current) {
                ydocRef.current.transact(() => {
                    ydocRef.current!.getMap('model').set('data', modelStr);
                });
            }
        },
        [setNodes, setEdges],
    );

    // ── Incremental model mutation (model-as-truth for structural edits) ──
    /**
     * Apply an incremental mutation to the current model, then regenerate
     * the diagram.  Floating (unmodeled) nodes are preserved.
     *
     * `opts.selectedNodeId` — auto-select a specific node after update.
     * `opts.positionHint`   — place that node at a custom position (e.g.
     *                         viewport center when adding from the sidebar).
     */
    const mutateModel: MutateModelFn = useCallback(
        async (mutator, opts) => {
            // Rebuild model from current diagram state so diagram-only edits
            // (node add/delete, attribute changes, etc.) are captured before
            // applying the mutation.
            const existingStoredNodesForModel = mapReactNodesToStoredNodes(nodesRef.current, edgesRef.current);
            const existingStoredEdgesForModel = mapReactEdgesToStoredEdges(edgesRef.current, nodesRef.current);
            const current =
                existingStoredNodesForModel.length > 0
                    ? buildConceptualModel({
                          storedNodes: existingStoredNodesForModel,
                          storedEdges: existingStoredEdgesForModel,
                          schemaId: schema?.id ?? undefined,
                          schemaName: schema?.name ?? undefined,
                      })
                    : (modelDataRef.current ??
                      createEmptyConceptualModel(schema?.id ?? undefined, schema?.name ?? undefined));
            const next = mutator(current);

            const { nodes: storedNodes, edges: storedEdges } = await buildDiagramFromModel({
                model: next,
                existingNodes: existingStoredNodesForModel,
                existingEdges: existingStoredEdgesForModel,
                preserveUnmodeledNodes: true,
            });

            const reactNodes = mapStoredNodesToReactNodes(storedNodes);
            const reactEdges = mapStoredEdgesToReactEdges(storedEdges, reactNodes);

            // Place new node at the requested position
            if (opts?.selectedNodeId && opts?.positionHint) {
                const target = reactNodes.find((n) => n.id === opts.selectedNodeId);
                if (target) target.position = opts.positionHint;
            }

            // Select the target node
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

            // Persist model to Yjs so it survives page refresh / reconnect
            const modelStr = JSON.stringify(next);
            lastAppliedModelStringRef.current = modelStr;
            lastSyncedModelStringRef.current = modelStr;
            if (ydocRef.current) {
                ydocRef.current.transact(() => {
                    ydocRef.current!.getMap('model').set('data', modelStr);
                });
            }
        },
        [setNodes, setEdges, schema?.id, schema?.name],
    );

    return {
        awareness,
        /** Replace entire model → regenerates diagram (AI / import). */
        applyModelPayload,
        /** Incremental model mutation → regenerates diagram (sidebar add). */
        mutateModel,
        /** Current model (derived from diagram or last applied). */
        modelData: modelDataState,
    };
};
