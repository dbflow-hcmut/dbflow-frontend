import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Node, Viewport, ReactFlowInstance } from "reactflow";
import type { NodeData } from "../index";
import { loadViewportFromStorage, saveViewportToStorage } from "../utils/conceptual-diagram.builder";

type UseDiagramViewportParams = {
    selectedSchemaId?: string | null;
    nodes: Node<NodeData>[];
    isReactFlowReady: boolean;
    reactFlowInstanceRef: RefObject<ReactFlowInstance | null>;
};

export const useDiagramViewport = ({
    selectedSchemaId,
    nodes,
    isReactFlowReady,
    reactFlowInstanceRef,
}: UseDiagramViewportParams) => {
    const [viewport, setViewport] = useState<Viewport | null>(null);
    const hasAppliedInitialViewportRef = useRef(false);

    useEffect(() => {
        hasAppliedInitialViewportRef.current = false;
    }, [selectedSchemaId]);

    useEffect(() => {
        if (!selectedSchemaId) {
            setViewport(null);
            return;
        }

        const storedViewport = loadViewportFromStorage(selectedSchemaId);
        setViewport(storedViewport ?? null);
    }, [selectedSchemaId]);

    useEffect(() => {
        if (!reactFlowInstanceRef.current || !isReactFlowReady || !viewport) return;

        reactFlowInstanceRef.current.setViewport({
            x: viewport.x,
            y: viewport.y,
            zoom: viewport.zoom,
        });
        hasAppliedInitialViewportRef.current = true;
    }, [viewport, isReactFlowReady, reactFlowInstanceRef]);

    useEffect(() => {
        if (!reactFlowInstanceRef.current || !isReactFlowReady) return;
        if (viewport) return;
        if (hasAppliedInitialViewportRef.current) return;
        if (nodes.length === 0) return;

        reactFlowInstanceRef.current.fitView({ padding: 0.2 });
        hasAppliedInitialViewportRef.current = true;
    }, [nodes, viewport, isReactFlowReady, reactFlowInstanceRef]);

    const handleViewportChange = useCallback(
        (nextViewport: Viewport) => {
            const hasChanged =
                !viewport ||
                Math.abs(viewport.x - nextViewport.x) > 0.1 ||
                Math.abs(viewport.y - nextViewport.y) > 0.1 ||
                Math.abs(viewport.zoom - nextViewport.zoom) > 0.01;

            if (!hasChanged) return;

            setViewport(nextViewport);
            saveViewportToStorage(nextViewport, selectedSchemaId);
        },
        [viewport, selectedSchemaId]
    );

    return {
        viewport,
        handleViewportChange,
    };
};

