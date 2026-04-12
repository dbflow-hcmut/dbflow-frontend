/**
 * ELK-based auto-layout engine for Conceptual ER diagrams.
 *
 * Uses the Eclipse Layout Kernel (elkjs) with the **stress** algorithm
 * (stress majorisation / Kamada–Kawai style) to compute node positions that:
 *  - Keep connected nodes at a consistent, compact distance
 *  - Avoid node overlaps
 *  - Produce tight, uniform layouts ideal for ER diagrams
 *
 * The main export `computeELKLayout` takes a list of skeleton items
 * (entities, relationships, ISA circles, union circles) and their
 * connections, returning a map of `id → { x, y }` positions.
 * Attributes are NOT included — they are placed by a separate
 * fan-arc layout around their parent after ELK runs.
 */

import ELK from "elkjs/lib/elk.bundled";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";

// ── Singleton ELK instance (reused across calls) ────────────────────────────

let elkInstance: InstanceType<typeof ELK> | null = null;
const getELK = () => {
    if (!elkInstance) elkInstance = new ELK();
    return elkInstance;
};

// ── Public types ─────────────────────────────────────────────────────────────

export type LayoutItem = {
    id: string;
    width: number;
    height: number;
    /** If already placed by the user, supply the fixed position.
     *  ELK will respect it and not move this node. */
    fixed?: { x: number; y: number };
    /** Optional parent node id — used for compound grouping
     *  (e.g. attribute → entity). */
    parentId?: string;
    /** Priority hint: higher = placed earlier in the layout (entities > rels > attrs). */
    priority?: number;
};

export type LayoutEdge = {
    id: string;
    sourceId: string;
    targetId: string;
};

export type LayoutResult = Map<string, { x: number; y: number }>;

// ── ELK layout options ──────────────────────────────────────────────────────

/**
 * We use the **stress** algorithm (stress majorisation / Kamada–Kawai style).
 *
 * Why stress instead of force-directed (Fruchterman–Reingold)?
 * - Force-directed layouts push ALL pairs of nodes apart via repulsion,
 *   which inevitably spreads the graph too wide for ER diagrams.
 * - The stress algorithm directly minimises the difference between
 *   actual edge lengths and a desired target length.  Connected nodes
 *   are pulled to a consistent distance, giving compact and uniform
 *   layouts where entity→relationship→entity chains stay tight.
 *
 * Key tuning:
 * - `desiredEdgeLength` controls target distance between connected nodes.
 * - `spacing.nodeNode` is the HARD minimum gap preventing overlaps.
 * - `epsilon` controls convergence — lower = more precise.
 */
const ELK_GLOBAL_OPTIONS: Record<string, string> = {
    "elk.algorithm": "stress",

    // ── Desired edge length ──────────────────────────────────────────
    // Target distance between connected nodes.  Entity width is 120px,
    // relationship width is 110px, so ~200px keeps them close but not
    // cramped, leaving some room for labels and the attribute halo.
    "elk.stress.desiredEdgeLength": "200",

    // ── Convergence ──────────────────────────────────────────────────
    "elk.stress.epsilon": "0.001",

    // ── Spacing — hard minimum between node bounding boxes ───────────
    // Floor preventing any actual overlap.  The stress algorithm
    // already places nodes at ~desiredEdgeLength, so this just acts
    // as a safety net.
    "elk.spacing.nodeNode": "80",
    "elk.spacing.edgeNode": "20",
    "elk.spacing.edgeEdge": "15",

    // ── Edge routing ─────────────────────────────────────────────────
    // POLYLINE avoids curved routes that overlap nodes.
    "elk.edgeRouting": "POLYLINE",

    // ── Padding around the whole graph ───────────────────────────────
    "elk.padding": "[top=30,left=30,bottom=30,right=30]",

    // ── Aspect ratio — keep roughly landscape for wide screens ──────
    "elk.aspectRatio": "1.4",

    // ── Interactive mode: respect pre-existing positions (fixed) ─────
    "elk.interactive": "true",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the ELK graph from flat layout items and edges.
 *
 * We model the diagram as a FLAT graph (not hierarchical / compound)
 * because ER diagrams connect freely across "groups".  The force
 * algorithm handles this naturally.
 */
const buildElkGraph = (
    items: LayoutItem[],
    edges: LayoutEdge[],
): ElkNode => {
    // Build ELK children
    const children: ElkNode[] = items.map((item) => {
        const node: ElkNode = {
            id: item.id,
            width: item.width,
            height: item.height,
            layoutOptions: {},
        };

        // Pin fixed nodes at their current position
        if (item.fixed) {
            node.x = item.fixed.x;
            node.y = item.fixed.y;
        }

        return node;
    });

    // Build ELK edges (only include edges whose both endpoints exist)
    const nodeIds = new Set(items.map((i) => i.id));
    const elkEdges: ElkExtendedEdge[] = edges
        .filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId))
        .map((e) => ({
            id: e.id,
            sources: [e.sourceId],
            targets: [e.targetId],
        }));

    return {
        id: "root",
        children,
        edges: elkEdges,
        layoutOptions: { ...ELK_GLOBAL_OPTIONS },
    };
};

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute positions for all layout items using the ELK graph layout engine.
 *
 * Returns a `Map<id, {x, y}>` with the computed position for every item.
 * If ELK fails for any reason, falls back to a simple grid layout.
 */
export const computeELKLayout = async (
    items: LayoutItem[],
    edges: LayoutEdge[],
): Promise<LayoutResult> => {
    const result: LayoutResult = new Map();

    if (items.length === 0) return result;

    try {
        const elk = getELK();
        const graph = buildElkGraph(items, edges);
        const laid = await elk.layout(graph);

        // Extract positions from ELK result
        for (const child of laid.children ?? []) {
            if (child.x !== undefined && child.y !== undefined) {
                result.set(child.id, {
                    x: Math.round(child.x),
                    y: Math.round(child.y),
                });
            }
        }

        // Fill in any items ELK didn't place (shouldn't happen, but safety net)
        for (const item of items) {
            if (!result.has(item.id)) {
                result.set(item.id, item.fixed ?? { x: 0, y: 0 });
            }
        }
    } catch (err) {
        console.warn("[ELK Layout] Failed, falling back to grid layout:", err);
        // Fallback: simple grid
        const cols = Math.max(1, Math.ceil(Math.sqrt(items.length)));
        items.forEach((item, idx) => {
            if (item.fixed) {
                result.set(item.id, item.fixed);
            } else {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                result.set(item.id, { x: 300 + col * 400, y: 250 + row * 350 });
            }
        });
    }

    return result;
};
