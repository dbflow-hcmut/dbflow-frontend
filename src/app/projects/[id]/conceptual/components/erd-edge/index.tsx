"use client";

import React from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getStraightPath } from "reactflow";

type ErdEdgeData = {
    label?: string;
    fromMult?: string;
    toMult?: string;
};

const ErdEdge: React.FC<EdgeProps<ErdEdgeData>> = (props) => {
    const {
        id,
        sourceX,
        sourceY,
        targetX,
        targetY,
        style,
        markerEnd,
        data,
        selected,
    } = props;

    const [edgePath, labelX, labelY] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
    });

    const nearSourceX = sourceX + (targetX - sourceX) * 0.2;
    const nearSourceY = sourceY + (targetY - sourceY) * 0.2;
    const nearTargetX = sourceX + (targetX - sourceX) * 0.8;
    const nearTargetY = sourceY + (targetY - sourceY) * 0.8;

    return (
        <>
            <BaseEdge 
                id={id} 
                path={edgePath} 
                style={{
                    ...style,
                    stroke: selected ? 'var(--color-primary)' : 'var(--color-gray-700)',
                    strokeWidth: 2
                }} 
                markerEnd={markerEnd} 
            />
            <EdgeLabelRenderer>
                {data?.label ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                        className="nodrag nopan text-xs bg-white/80 border border-gray-200 rounded-md px-1.5 py-0.5 pointer-events-auto"
                    >
                        {data.label}
                    </div>
                ) : null}
                {data?.fromMult ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${nearSourceX}px, ${nearSourceY}px)`,
                        }}
                        className="nodrag nopan text-xs bg-white rounded border border-gray-200 pointer-events-none"
                    >
                        {data.fromMult}
                    </div>
                ) : null}
                {data?.toMult ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${nearTargetX}px, ${nearTargetY}px)`,
                        }}
                        className="nodrag nopan text-xs bg-white rounded border border-gray-200 pointer-events-none"
                    >
                        {data.toMult}
                    </div>
                ) : null}
            </EdgeLabelRenderer>
        </>
    );
};

export default ErdEdge;


