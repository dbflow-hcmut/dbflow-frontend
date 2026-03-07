"use client";

import React, { useState, useCallback, useRef } from "react";
import { BaseEdge, EdgeLabelRenderer, EdgeProps, useReactFlow } from "reactflow";

type RelationTableEdgeData = {
    label?: string;
    controlPoints?: Array<{ x: number; y: number }>;
};

const RelationTableEdge: React.FC<EdgeProps<RelationTableEdgeData>> = (props) => {
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

    const { setEdges, getViewport } = useReactFlow();
    const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Initialize control points if not exists
    const controlPoints = React.useMemo(() => data?.controlPoints || [], [data?.controlPoints]);
    const hasControlPoints = controlPoints.length > 0;
    const controlPointsRef = useRef(controlPoints);
    
    // Keep ref in sync with control points
    React.useEffect(() => {
        controlPointsRef.current = controlPoints;
    }, [controlPoints]);

    // Calculate all corner points (bends) in the step path
    const calculateAllCornerPoints = useCallback(() => {
        const allPoints = [
            { x: sourceX, y: sourceY },
            ...controlPoints,
            { x: targetX, y: targetY }
        ];
        
        const corners: Array<{ x: number; y: number }> = [];
        
        // For each segment, calculate the corner point
        for (let i = 0; i < allPoints.length - 1; i++) {
            const current = allPoints[i];
            const next = allPoints[i + 1];
            const dx = next.x - current.x;
            const dy = next.y - current.y;
            
            // Calculate corner point based on step path logic
            if (Math.abs(dx) > Math.abs(dy)) {
                // Go horizontal first, then vertical - corner at (next.x, current.y)
                corners.push({ x: next.x, y: current.y });
            } else {
                // Go vertical first, then horizontal - corner at (current.x, next.y)
                corners.push({ x: current.x, y: next.y });
            }
        }
        
        return corners;
    }, [sourceX, sourceY, targetX, targetY, controlPoints]);

    // Auto-initialize control points at all corners if edge is selected and has no control points
    React.useEffect(() => {
        if (selected && !hasControlPoints && draggingPoint === null) {
            const allCorners = calculateAllCornerPoints();
            setEdges((edges) => {
                const edge = edges.find(e => e.id === id);
                // Only create if edge exists and has no control points
                if (edge && !edge.data?.controlPoints && allCorners.length > 0) {
                    return edges.map((e) =>
                        e.id === id
                            ? {
                                  ...e,
                                  data: {
                                      ...e.data,
                                      controlPoints: allCorners,
                                  },
                              }
                            : e
                    );
                }
                return edges;
            });
        }
    }, [selected, hasControlPoints, id, setEdges, calculateAllCornerPoints, draggingPoint]);

    // Calculate step path - straight lines only, no curves
    const calculatePath = useCallback(() => {
        if (hasControlPoints) {
            // Build path with control points - ensure step path (horizontal then vertical or vice versa)
            let path = `M ${sourceX},${sourceY}`;
            
            // Sort control points to create proper step path
            const allPoints = [
                { x: sourceX, y: sourceY },
                ...controlPoints,
                { x: targetX, y: targetY }
            ];
            
            // Create step path: go horizontal first if distance is greater horizontally
            for (let i = 0; i < allPoints.length - 1; i++) {
                const current = allPoints[i];
                const next = allPoints[i + 1];
                const dx = next.x - current.x;
                const dy = next.y - current.y;
                
                // If horizontal distance is greater, go horizontal first
                if (Math.abs(dx) > Math.abs(dy)) {
                    // Go horizontal first, then vertical
                    path += ` L ${next.x},${current.y}`;
                    if (next.y !== current.y) {
                        path += ` L ${next.x},${next.y}`;
                    }
                } else {
                    // Go vertical first, then horizontal
                    path += ` L ${current.x},${next.y}`;
                    if (next.x !== current.x) {
                        path += ` L ${next.x},${next.y}`;
                    }
                }
            }
            
            return path;
        } else {
            // Create straight step path manually - no curves
            const dx = targetX - sourceX;
            const dy = targetY - sourceY;
            
            // Determine if we go horizontal first or vertical first
            // If horizontal distance is greater, go horizontal first
            const goHorizontalFirst = Math.abs(dx) > Math.abs(dy);
            
            if (goHorizontalFirst) {
                // Go horizontal first, then vertical
                const midX = targetX;
                const midY = sourceY;
                return `M ${sourceX},${sourceY} L ${midX},${midY} L ${targetX},${targetY}`;
            } else {
                // Go vertical first, then horizontal
                const midX = sourceX;
                const midY = targetY;
                return `M ${sourceX},${sourceY} L ${midX},${midY} L ${targetX},${targetY}`;
            }
        }
    }, [sourceX, sourceY, targetX, targetY, controlPoints, hasControlPoints]);

    const edgePath = calculatePath();
    const allCornerPoints = calculateAllCornerPoints();
    
    // Filter out control points at the source and target positions (endpoints)
    // Only show control points at intermediate bends
    // Also create a mapping from display index to actual corner index
    const displayControlPointsWithIndex: Array<{ point: { x: number; y: number }; actualIndex: number }> = [];
    allCornerPoints.forEach((point, index) => {
        const isAtSource = Math.abs(point.x - sourceX) < 1 && Math.abs(point.y - sourceY) < 1;
        const isAtTarget = Math.abs(point.x - targetX) < 1 && Math.abs(point.y - targetY) < 1;
        if (!isAtSource && !isAtTarget) {
            displayControlPointsWithIndex.push({ point, actualIndex: index });
        }
    });
    
    
    // Calculate label position (middle of path)
    const labelX = hasControlPoints && controlPoints.length > 0
        ? controlPoints[Math.floor(controlPoints.length / 2)].x
        : (sourceX + targetX) / 2;
    const labelY = hasControlPoints && controlPoints.length > 0
        ? controlPoints[Math.floor(controlPoints.length / 2)].y
        : (sourceY + targetY) / 2;

    const handleControlPointMouseDown = useCallback((e: React.MouseEvent, cornerIndex: number) => {
        e.stopPropagation();
        e.preventDefault();
        const viewport = getViewport();
        
        // Get the corner point being dragged
        const allCorners = calculateAllCornerPoints();
        const point = allCorners[cornerIndex];
        
        if (!point) return;
        
        // Ensure controlPoints array has enough elements
        // If not, initialize it with all corners
        const currentControlPoints = controlPointsRef.current;
        if (currentControlPoints.length !== allCorners.length) {
            // Sync controlPoints with allCorners
            setEdges((edges) =>
                edges.map((edge) =>
                    edge.id === id
                        ? {
                              ...edge,
                              data: {
                                  ...edge.data,
                                  controlPoints: allCorners,
                              },
                          }
                        : edge
                )
            );
        }
        
        // Calculate offset from mouse position to point position in screen coordinates
        const screenX = point.x * viewport.zoom + viewport.x;
        const screenY = point.y * viewport.zoom + viewport.y;
        
        setDraggingPoint(cornerIndex);
        setDragOffset({
            x: e.clientX - screenX,
            y: e.clientY - screenY,
        });
    }, [getViewport, calculateAllCornerPoints, id, setEdges]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (draggingPoint === null) return;
        e.preventDefault();

        const viewport = getViewport();
        // Calculate new position: convert screen coordinates to flow coordinates
        const newX = (e.clientX - dragOffset.x - viewport.x) / viewport.zoom;
        const newY = (e.clientY - dragOffset.y - viewport.y) / viewport.zoom;

        // Use ref to get latest control points to avoid stale closure
        const currentControlPoints = controlPointsRef.current;
        
        // Ensure we have enough control points
        const allCorners = calculateAllCornerPoints();
        let pointsToUpdate = currentControlPoints;
        
        // If control points don't match corners, sync them first
        if (currentControlPoints.length !== allCorners.length) {
            pointsToUpdate = allCorners;
        }
        
        setEdges((edges) =>
            edges.map((edge) =>
                edge.id === id
                    ? {
                          ...edge,
                          data: {
                              ...edge.data,
                              controlPoints: pointsToUpdate.map((point, idx) =>
                                  idx === draggingPoint ? { x: newX, y: newY } : point
                              ),
                          },
                      }
                    : edge
            )
        );
    }, [draggingPoint, dragOffset, id, setEdges, getViewport, calculateAllCornerPoints]);

    const handleMouseUp = useCallback(() => {
        setDraggingPoint(null);
    }, []);

    React.useEffect(() => {
        if (draggingPoint !== null) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
            return () => {
                window.removeEventListener("mousemove", handleMouseMove);
                window.removeEventListener("mouseup", handleMouseUp);
            };
        }
    }, [draggingPoint, handleMouseMove, handleMouseUp]);

    const handleEdgeClick = useCallback((e: React.MouseEvent) => {
        // Ignore double clicks - do nothing, but don't stop propagation
        if (e.detail === 2) {
            return;
        }
        
        // Control points are now auto-created when edge is selected
        // No need to manually add them on click
        // Don't stop propagation to allow React Flow to handle selection
    }, []);

    return (
        <>
            <g onClick={handleEdgeClick} style={{ cursor: selected ? 'pointer' : 'default' }}>
                <BaseEdge
                    id={id}
                    path={edgePath}
                    style={{
                        ...style,
                        stroke: selected ? '#42a5f5' : '#6366f1',
                        strokeWidth: selected ? 2.5 : 1.5,
                        zIndex: selected ? 1000 : 1,
                    }}
                    markerEnd={markerEnd}
                />
            </g>
            
            {/* Control points - show at all corners except endpoints */}
            {selected && displayControlPointsWithIndex.length > 0 && (
                <EdgeLabelRenderer>
                    {displayControlPointsWithIndex.map(({ point, actualIndex }) => {
                        const isDragging = draggingPoint === actualIndex;
                        
                        return (
                            <div
                                key={actualIndex}
                                onMouseDown={(e) => handleControlPointMouseDown(e, actualIndex)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    position: "absolute",
                                    left: point.x,
                                    top: point.y,
                                    transform: "translate(-50%, -50%)",
                                    width: "16px",
                                    height: "16px",
                                    borderRadius: "50%",
                                    backgroundColor: isDragging ? "#1e88e5" : "#42a5f5",
                                    border: "2px solid white",
                                    cursor: isDragging ? "grabbing" : "grab",
                                    zIndex: 1002,
                                    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                                    pointerEvents: "auto",
                                    outline: "none", // Remove any default outline that might cause black border
                                }}
                                className="nodrag nopan"
                            >
                            </div>
                        );
                    })}
                </EdgeLabelRenderer>
            )}


            <EdgeLabelRenderer>
                {data?.label && (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                        className="nodrag nopan text-xs pointer-events-auto bg-white px-1 rounded"
                    >
                        {data.label}
                    </div>
                )}
            </EdgeLabelRenderer>
        </>
    );
};

export default RelationTableEdge;

