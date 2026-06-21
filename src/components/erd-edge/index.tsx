"use client";

import React from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getStraightPath } from "reactflow";
import type { ErdEdgeData } from "@/components/EditProject/utils/functions";

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

    const nearSourceX = sourceX + (targetX - sourceX) * 0.36;
    const nearSourceY = sourceY + (targetY - sourceY) * 0.36;
    const nearTargetX = sourceX + (targetX - sourceX) * 0.64;
    const nearTargetY = sourceY + (targetY - sourceY) * 0.64;

    const lineStyle = data?.lineStyle || 'single';

    // Calculate angle for bracket
    const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
    const bracketLength = 12;
    const bracketOffset = 8;

    // Calculate offset for fromMult and toMult (both on the same side of the line)
    const labelPerpAngle = angle - Math.PI / 2;
    const labelOffsetDistance = 15;
    const labelOffsetX = Math.cos(labelPerpAngle) * labelOffsetDistance;
    const labelOffsetY = Math.sin(labelPerpAngle) * labelOffsetDistance;

    // Calculate offset points for double line (parallel line)
    const offsetDistance = 3;
    const perpAngle = angle + Math.PI / 2;
    const offsetX = Math.cos(perpAngle) * offsetDistance;
    const offsetY = Math.sin(perpAngle) * offsetDistance;

    // Offset path for double line
    const [offsetPath] = getStraightPath({
        sourceX: sourceX + offsetX,
        sourceY: sourceY + offsetY,
        targetX: targetX + offsetX,
        targetY: targetY + offsetY,
    });

    return (
        <>
            <g style={{ cursor: 'pointer' }}>
                {/* Main edge */}
                <BaseEdge
                    id={id}
                    path={edgePath}
                    style={{
                        ...style,
                        stroke: selected ? '#42a5f5' : 'var(--color-gray-700)',
                        strokeWidth: selected ? (lineStyle === 'double' ? 1.5 : 1) : (lineStyle === 'double' ? 1 : 1),
                        strokeDasharray: style?.strokeDasharray,
                    }}
                    markerEnd={markerEnd}
                />

                {/* Second line for double style */}
                {lineStyle === 'double' && (
                    <path
                        d={offsetPath}
                        style={{
                            stroke: selected ? '#42a5f5' : 'var(--color-gray-700)',
                            strokeWidth: selected ? 1.5 : 1,
                            fill: 'none',
                        }}
                        markerEnd={markerEnd}
                    />
                )}

                {/* Bracket notation */}
                {lineStyle === 'bracket' && (() => {
                    const bracketDirection = data?.bracketDirection || 'to';
                    const bracketX = bracketDirection === 'from' ? nearSourceX : nearTargetX;
                    const bracketY = bracketDirection === 'from' ? nearSourceY : nearTargetY;
                    const bracketAngle = bracketDirection === 'from' ? angle : angle + Math.PI;
                    
                    return (
                        <g
                            transform={`translate(${bracketX}, ${bracketY}) rotate(${(bracketAngle * 180) / Math.PI})`}
                        >
                            <path
                                d={`
                                    M ${-bracketLength / 2 - 4},${-bracketOffset - 1}
                                    L ${-bracketLength / 2},${-bracketOffset - 1}
                                    C ${bracketLength / 2},${-bracketOffset - 1} ${bracketLength / 2},${bracketOffset + 1} ${-bracketLength / 2},${bracketOffset + 1}
                                    L ${-bracketLength / 2 - 4},${bracketOffset + 1}
                                `}
                                fill="none"
                                stroke={selected ? '#42a5f5' : 'var(--color-gray-700)'}
                                strokeWidth="1"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </g>
                    );
                })()}
            </g>

            <EdgeLabelRenderer>
                {data?.label ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                        className="nodrag nopan text-xs pointer-events-auto"
                    >
                        {data.label}
                    </div>
                ) : null}
                {data?.fromMult ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${nearSourceX + labelOffsetX}px, ${nearSourceY + labelOffsetY}px)`,
                        }}
                        className="nodrag nopan text-[10px] pointer-events-none"
                    >
                        {data.fromMult}
                    </div>
                ) : null}
                {data?.toMult ? (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${nearTargetX + labelOffsetX}px, ${nearTargetY + labelOffsetY}px)`,
                        }}
                        className="nodrag nopan text-[10px] pointer-events-none"
                    >
                        {data.toMult}
                    </div>
                ) : null}
            </EdgeLabelRenderer>
        </>
    );
};

export default ErdEdge;
