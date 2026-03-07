"use client";

import React from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, useStore, getSmoothStepPath, useReactFlow } from "reactflow";
import { getSmartEdge } from "@tisoap/react-flow-smart-edge";

type LogicalTableEdgeData = {
    label?: string;
};

const LogicalTableEdge: React.FC<EdgeProps<LogicalTableEdgeData>> = (props) => {
    const {
        id,
        source,
        target,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        style,
        markerEnd,
        data,
        selected,
    } = props;

    const { setEdges } = useReactFlow();
    
    // Get all nodes for smart edge collision detection
    const nodes = useStore((state) => Array.from(state.nodeInternals.values()));

    // Use smart edge to automatically avoid nodes
    const smartEdgeResult = getSmartEdge({
        sourcePosition,
        targetPosition,
        sourceX,
        sourceY,
        targetX,
        targetY,
        nodes: nodes.filter((node) => node.id !== source && node.id !== target).map((node) => {
            const nodeWithMeasured = node as unknown as { width?: number; height?: number; measured?: { width?: number; height?: number } };
            const measuredWidth = nodeWithMeasured.measured?.width;
            const measuredHeight = nodeWithMeasured.measured?.height;
            return {
                ...node,
                width: node.width ?? measuredWidth ?? 200,
                height: node.height ?? measuredHeight ?? 100,
            };
        }), // Exclude source and target nodes and ensure width/height are defined
    });

    // If smart edge fails, fall back to smooth step path
    let edgePath: string;
    let labelX: number;
    let labelY: number;

    if (smartEdgeResult === null || smartEdgeResult instanceof Error) {
        const [path, lx, ly] = getSmoothStepPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
            borderRadius: 8,
        });
        edgePath = path;
        labelX = lx;
        labelY = ly;
    } else {
        edgePath = smartEdgeResult.svgPathString;
        labelX = (sourceX + targetX) / 2;
        labelY = (sourceY + targetY) / 2;
    }

    const handleEdgeClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        // Select this edge
        setEdges((edges) =>
            edges.map((edge) => ({
                ...edge,
                selected: edge.id === id,
            }))
        );
    };

    return (
        <>
            <g onClick={handleEdgeClick}>
                {/* Invisible wider path for easier clicking */}
                <path
                    d={edgePath}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                    style={{ cursor: 'pointer' }}
                />
                
                {/* Visible edge */}
                <BaseEdge
                    id={id}
                    path={edgePath}
                    style={{
                        ...style,
                        stroke: selected ? '#42A5F5' : style?.stroke || '#42A5F5',
                        strokeWidth: selected ? 2 : 1.5,
                        pointerEvents: 'none',
                    }}
                    markerEnd={markerEnd}
                />
            </g>

            {data?.label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: 'all',
                            background: 'white',
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid #ddd',
                        }}
                        className="nodrag nopan"
                    >
                        {data.label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
};

export default LogicalTableEdge;
