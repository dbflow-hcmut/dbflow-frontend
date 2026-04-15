/**
 * ELK-based auto-layout for relational (logical / physical) ER diagrams.
 *
 * Uses the **layered** algorithm (Sugiyama style) which is ideal for
 * DAG structures like FK relationships:
 *   - Parent tables (referenced by FKs) are placed in earlier layers
 *   - Child tables flow to the right
 *   - Edges route cleanly left-to-right avoiding node overlaps
 *
 * Reuses the same ELK singleton from conceptual-elk-layout.
 */

import ELK from "elkjs/lib/elk.bundled";
import type { ElkNode, ElkExtendedEdge } from "elkjs/lib/elk-api";

// ── Singleton ELK instance ──────────────────────────────────────────────

let elkInstance: InstanceType<typeof ELK> | null = null;
const getELK = () => {
    if (!elkInstance) elkInstance = new ELK();
    return elkInstance;
};

// ── Types ───────────────────────────────────────────────────────────────

export type LayoutTable = {
    id: string;
    size: { w: number; h: number };
    /** IDs of tables this table references (FK → PK) */
    refIds: string[];
};

export type LayoutResult = Map<string, { x: number; y: number }>;

// ── ELK options tuned for relational table diagrams ─────────────────────

const ELK_OPTIONS: Record<string, string> = {
    "elk.algorithm": "layered",

    // Direction: left-to-right (parents left, children right)
    "elk.direction": "RIGHT",

    // Layer spacing (horizontal gap between parent and child layers)
    "elk.layered.spacing.nodeNodeBetweenLayers": "180",

    // In-layer spacing (vertical gap between tables in same layer)
    "elk.spacing.nodeNode": "80",

    // Edge spacing
    "elk.spacing.edgeNode": "40",
    "elk.spacing.edgeEdge": "20",

    // Edge routing: orthogonal gives clean right-angle routing
    "elk.edgeRouting": "ORTHOGONAL",

    // Node placement strategy: network-simplex for balanced layouts
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",

    // Cycle breaking: use depth-first to handle circular FKs gracefully
    "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",

    // Padding around the graph
    "elk.padding": "[top=50,left=50,bottom=50,right=50]",

    // Consider node size for proper routing
    "elk.nodeSize.constraints": "MINIMUM_SIZE",
};

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Compute positions for tables using ELK layered layout.
 * FK edges determine the layer hierarchy (parent → child = left → right).
 *
 * Returns `Map<tableId, { x, y }>`.
 * Falls back to a simple grid if ELK fails.
 */
export async function computeELKTableLayout(
    tables: LayoutTable[],
): Promise<LayoutResult> {
    const result: LayoutResult = new Map();
    if (tables.length === 0) return result;

    if (tables.length === 1) {
        result.set(tables[0].id, { x: 50, y: 50 });
        return result;
    }

    try {
        const elk = getELK();
        const tableIds = new Set(tables.map((t) => t.id));

        // Build ELK children nodes
        const children: ElkNode[] = tables.map((t) => ({
            id: t.id,
            width: t.size.w,
            height: t.size.h,
        }));

        // Build ELK edges from FK references
        // Edge direction: child (FK holder) → parent (PK holder)
        // But for layered layout we want parent on the left, so:
        // source = parent (refTableId), target = child (table with FK)
        const edges: ElkExtendedEdge[] = [];
        let edgeIdx = 0;
        for (const table of tables) {
            for (const refId of table.refIds) {
                if (!tableIds.has(refId) || refId === table.id) continue;
                edges.push({
                    id: `e_layout_${edgeIdx++}`,
                    sources: [refId],
                    targets: [table.id],
                });
            }
        }

        const graph: ElkNode = {
            id: "root",
            children,
            edges,
            layoutOptions: { ...ELK_OPTIONS },
        };

        const laid = await elk.layout(graph);

        for (const child of laid.children ?? []) {
            if (child.x !== undefined && child.y !== undefined) {
                result.set(child.id, {
                    x: Math.round(child.x),
                    y: Math.round(child.y),
                });
            }
        }

        // Safety net: fill missing tables
        for (const t of tables) {
            if (!result.has(t.id)) {
                result.set(t.id, { x: 50, y: 50 });
            }
        }
    } catch (err) {
        console.warn("[ELK Table Layout] Failed, falling back to grid:", err);
        const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));
        tables.forEach((t, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            result.set(t.id, { x: 50 + col * 400, y: 50 + row * 350 });
        });
    }

    return result;
}