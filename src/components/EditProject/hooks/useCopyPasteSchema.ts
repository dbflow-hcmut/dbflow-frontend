"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Node, Edge } from "reactflow";
import { generateDiagramId } from "../utils/functions";
import { notificationProvider } from "@/providers/notification";
import type { NodeData, RelationshipData } from "../index";

const CLIPBOARD_KIND = "dbflow-schema-clipboard";

export type SchemaClipboardPayload = {
    kind: typeof CLIPBOARD_KIND;
    schemaType: string;
    nodes: Node<NodeData>[];
    edges: Edge[];
};

// In-memory fallback only — used when a browser lets us write to the OS
// clipboard but not read it back (or vice versa). The real clipboard (via
// the native `copy`/`paste` events below) is what makes this work across
// Chrome tabs AND across domains, unlike localStorage which is per-origin.
let clipboardMemory: SchemaClipboardPayload | null = null;

const PASTE_OFFSET = 48;

type UseCopyPasteSchemaOptions = {
    nodes: Node<NodeData>[];
    edges: Edge[];
    setNodes: (updater: Node<NodeData>[] | ((prev: Node<NodeData>[]) => Node<NodeData>[])) => void;
    setEdges: (updater: Edge[] | ((prev: Edge[]) => Edge[])) => void;
    schemaType?: string | null;
    canEdit: boolean;
};

// Rewrites every embedded reference to `oldId` inside a JSON-serializable
// value with `newId`. Logical table columns derive their handle id as
// `lid_<tableId>_col_<n>` from the owning node's own id, and functional
// dependencies reference those same ids — a blanket string swap keeps both
// in sync with the node's freshly generated id without needing per-shape code.
const remapEmbeddedId = <T,>(value: T, oldId: string, newId: string): T =>
    JSON.parse(JSON.stringify(value).split(oldId).join(newId));

const isEditableTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    return el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || !!el?.isContentEditable;
};

export function useCopyPasteSchema(options: UseCopyPasteSchemaOptions) {
    const { nodes, edges, setNodes, setEdges, schemaType, canEdit } = options;

    // Mirrored in refs so the copy/paste listeners don't need to re-attach on
    // every node/edge change — only when schemaType/canEdit/setters change.
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    nodesRef.current = nodes;
    edgesRef.current = edges;

    // Writes the current selection onto the real OS clipboard via the native
    // `copy` event — this is what makes paste work in a different Chrome tab
    // or even a different domain, since it's the same clipboard every other
    // desktop app reads/writes, not something scoped to this origin.
    const copySelection = useCallback((event: ClipboardEvent): boolean => {
        const selectedNodes = nodesRef.current.filter((n) => n.selected);
        if (!selectedNodes.length) return false;

        // Only bring along edges fully contained in the selection — a copied
        // table shouldn't drag in a dangling FK to a table left behind.
        const selectedIds = new Set(selectedNodes.map((n) => n.id));
        const relatedEdges = edgesRef.current.filter(
            (e) => e.selected || (selectedIds.has(e.source) && selectedIds.has(e.target))
        );

        const payload: SchemaClipboardPayload = {
            kind: CLIPBOARD_KIND,
            schemaType: schemaType ?? "",
            nodes: JSON.parse(JSON.stringify(selectedNodes)),
            edges: JSON.parse(JSON.stringify(relatedEdges)),
        };

        clipboardMemory = payload;
        event.clipboardData?.setData("text/plain", JSON.stringify(payload));
        return true;
    }, [schemaType]);

    const pasteClipboard = useCallback((event: ClipboardEvent): boolean => {
        if (!canEdit) return false;

        let payload: SchemaClipboardPayload | null = null;
        const raw = event.clipboardData?.getData("text/plain");
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed?.kind === CLIPBOARD_KIND) payload = parsed as SchemaClipboardPayload;
            } catch {
                // Pasted text isn't our JSON payload (e.g. plain text copied from
                // elsewhere) — fall through to the in-memory clipboard, if any.
            }
        }
        payload = payload ?? clipboardMemory;
        if (!payload || !payload.nodes.length) return false;

        if (payload.schemaType !== (schemaType ?? "")) {
            notificationProvider.open({
                type: "error",
                message: "You can only paste into a schema of the same type (Conceptual / Logical / Physical).",
            });
            return true;
        }

        const nodeIdMap = new Map<string, string>();
        payload.nodes.forEach((n) => nodeIdMap.set(n.id, generateDiagramId()));

        const edgeIdMap = new Map<string, string>();
        payload.edges.forEach((e) => edgeIdMap.set(e.id, generateDiagramId()));

        const pastedNodes: Node<NodeData>[] = payload.nodes.map((n) => {
            const newId = nodeIdMap.get(n.id)!;
            return {
                ...n,
                id: newId,
                data: remapEmbeddedId(n.data, n.id, newId),
                position: { x: n.position.x + PASTE_OFFSET, y: n.position.y + PASTE_OFFSET },
                selected: true,
            };
        });

        // Conceptual relationship nodes key their cardinality labels by edge
        // id — remap those keys, dropping any tied to an edge we didn't copy.
        const finalNodes = pastedNodes.map((n) => {
            if (n.type !== "relationship") return n;
            const data = n.data as RelationshipData;
            if (!data.cardinalities) return n;
            const remapped: Record<string, string> = {};
            for (const [oldEdgeId, value] of Object.entries(data.cardinalities)) {
                const newEdgeId = edgeIdMap.get(oldEdgeId);
                if (newEdgeId) remapped[newEdgeId] = value;
            }
            return { ...n, data: { ...data, cardinalities: remapped } };
        });

        const pastedEdges: Edge[] = payload.edges.map((e) => {
            const newSource = nodeIdMap.get(e.source) ?? e.source;
            const newTarget = nodeIdMap.get(e.target) ?? e.target;
            return {
                ...e,
                id: edgeIdMap.get(e.id)!,
                source: newSource,
                target: newTarget,
                sourceHandle: e.sourceHandle ? e.sourceHandle.split(e.source).join(newSource) : e.sourceHandle,
                targetHandle: e.targetHandle ? e.targetHandle.split(e.target).join(newTarget) : e.targetHandle,
                selected: true,
            };
        });

        setNodes((prev) => [...prev.map((n) => ({ ...n, selected: false })), ...finalNodes]);
        setEdges((prev) => [...prev.map((e) => ({ ...e, selected: false })), ...pastedEdges]);
        return true;
    }, [canEdit, schemaType, setNodes, setEdges]);

    useEffect(() => {
        const handleCopy = (event: ClipboardEvent) => {
            if (isEditableTarget(event.target)) return; // let native text copy proceed
            if (copySelection(event)) event.preventDefault();
        };

        const handlePaste = (event: ClipboardEvent) => {
            if (!canEdit || isEditableTarget(event.target)) return;
            if (pasteClipboard(event)) event.preventDefault();
        };

        document.addEventListener("copy", handleCopy);
        document.addEventListener("paste", handlePaste);
        return () => {
            document.removeEventListener("copy", handleCopy);
            document.removeEventListener("paste", handlePaste);
        };
    }, [copySelection, pasteClipboard, canEdit]);
}
