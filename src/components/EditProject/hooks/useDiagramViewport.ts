import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Node, Viewport, ReactFlowInstance } from "reactflow";
import type { NodeData } from "../index";
import { loadViewportFromStorage as loadConceptualViewport, saveViewportToStorage as saveConceptualViewport } from "../utils/conceptual-diagram.builder";
import { loadViewportFromStorage as loadLogicalViewport, saveViewportToStorage as saveLogicalViewport } from "../utils/logical-diagram.builder";
import { loadViewportFromStorage as loadPhysicalViewport, saveViewportToStorage as savePhysicalViewport } from "../utils/physical-diagram.builder";
import { SchemaType } from "@/utils/constants";
import type { ProjectSchemasResponse } from "@/types/projects.type";

type UseDiagramViewportParams = {
    selectedSchemaId?: string | null;
    selectedSchema?: ProjectSchemasResponse | null;
    nodes: Node<NodeData>[];
    isReactFlowReady: boolean;
    reactFlowInstanceRef: RefObject<ReactFlowInstance | null>;
};

export const useDiagramViewport = ({
    selectedSchemaId,
    selectedSchema,
    nodes,
    isReactFlowReady,
    reactFlowInstanceRef,
}: UseDiagramViewportParams) => {
    const [viewport, setViewport] = useState<Viewport | null>(null);
    const hasAppliedInitialViewportRef = useRef(false);

    const getViewportLoaders = useCallback(() => {
        const schemaType = selectedSchema?.type;
        if (schemaType === SchemaType.LOGICAL) {
            return { load: loadLogicalViewport, save: saveLogicalViewport };
        }
        if (schemaType === SchemaType.PHYSICAL) {
            return { load: loadPhysicalViewport, save: savePhysicalViewport };
        }
        // Default to conceptual
        return { load: loadConceptualViewport, save: saveConceptualViewport };
    }, [selectedSchema?.type]);

    useEffect(() => {
        hasAppliedInitialViewportRef.current = false;
    }, [selectedSchemaId]);

    useEffect(() => {
        if (!selectedSchemaId) {
            setViewport(null);
            return;
        }

        const { load } = getViewportLoaders();
        const storedViewport = load(selectedSchemaId);
        setViewport(storedViewport ?? null);
    }, [selectedSchemaId, getViewportLoaders]);

    const isInternalUpdate = useRef(false);

    useEffect(() => {
        if (!reactFlowInstanceRef.current || !isReactFlowReady || !viewport) return;

        if (isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }

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

            isInternalUpdate.current = true;
            setViewport(nextViewport);
            const { save } = getViewportLoaders();
            save(nextViewport, selectedSchemaId);
        },
        [viewport, selectedSchemaId, getViewportLoaders]
    );

    return {
        viewport,
        handleViewportChange,
    };
};

