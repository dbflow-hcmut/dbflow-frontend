"use client";

import React from "react";
import {
    EdgeLabelRenderer,
    EdgeProps,
    getSmoothStepPath,
    useReactFlow,
    Position,
} from "reactflow";

type LogicalTableEdgeData = {
    label?: string;
    sourceCardinality?: '1' | 'N';
    targetCardinality?: '1' | 'N';
};

// ── Direction helpers ────────────────────────────────────────────────────

const positionToDir = (pos: Position): { dx: number; dy: number } => {
    switch (pos) {
        case Position.Left:   return { dx: -1, dy: 0 };
        case Position.Right:  return { dx: 1, dy: 0 };
        case Position.Top:    return { dx: 0, dy: -1 };
        case Position.Bottom: return { dx: 0, dy: 1 };
        default:              return { dx: -1, dy: 0 };
    }
};

const perpCW = (d: { dx: number; dy: number }) => ({ dx: -d.dy, dy: d.dx });

// ── Crow's foot (many) ──────────────────────────────────────────────────

const CrowsFoot: React.FC<{
    x: number; y: number; position: Position; stroke: string; sw: number;
}> = ({ x, y, position, stroke, sw }) => {
    const L = 10, S = 7;
    const d = positionToDir(position);
    const p = perpCW(d);
    // base = point of convergence, offset INTO the edge direction
    const bx = x + d.dx * L, by = y + d.dy * L;
    return (
        <g>
            <line x1={bx} y1={by} x2={x} y2={y} stroke={stroke} strokeWidth={sw} />
            <line x1={bx} y1={by} x2={x + p.dx * S} y2={y + p.dy * S} stroke={stroke} strokeWidth={sw} />
            <line x1={bx} y1={by} x2={x - p.dx * S} y2={y - p.dy * S} stroke={stroke} strokeWidth={sw} />
            {/* bar at tip */}
            <line x1={x + p.dx * S} y1={y + p.dy * S} x2={x - p.dx * S} y2={y - p.dy * S} stroke={stroke} strokeWidth={sw} />
        </g>
    );
};

// ── One bar (||) ─────────────────────────────────────────────────────────

const OneBar: React.FC<{
    x: number; y: number; position: Position; stroke: string; sw: number;
}> = ({ x, y, position, stroke, sw }) => {
    const H = 7, O1 = 5, O2 = 9;
    const d = positionToDir(position);
    const p = perpCW(d);
    const cx1 = x + d.dx * O1, cy1 = y + d.dy * O1;
    const cx2 = x + d.dx * O2, cy2 = y + d.dy * O2;
    return (
        <g>
            <line x1={cx1 + p.dx * H} y1={cy1 + p.dy * H} x2={cx1 - p.dx * H} y2={cy1 - p.dy * H} stroke={stroke} strokeWidth={sw} />
            <line x1={cx2 + p.dx * H} y1={cy2 + p.dy * H} x2={cx2 - p.dx * H} y2={cy2 - p.dy * H} stroke={stroke} strokeWidth={sw} />
        </g>
    );
};

// ═════════════════════════════════════════════════════════════════════════

const LogicalTableEdge: React.FC<EdgeProps<LogicalTableEdgeData>> = (props) => {
    const {
        id, source, target,
        sourceX, sourceY, targetX, targetY,
        sourcePosition, targetPosition,
        style, data, selected,
    } = props;

    const { setEdges, setNodes } = useReactFlow();

    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX, sourceY, sourcePosition,
        targetX, targetY, targetPosition,
        borderRadius: 6,
    });

    const handleEdgeClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
        setEdges((es) => es.map((e) => ({ ...e, selected: e.id === id })));
    };

    const color = selected ? "#42A5F5" : (style?.stroke as string) || "#64748b";
    const sw = selected ? 2.5 : 1.5;

    const srcCard = data?.sourceCardinality || 'N';
    const tgtCard = data?.targetCardinality || '1';

    return (
        <>
            {/* SVG group — rendered directly inside the ReactFlow <svg> */}
            <g onClick={handleEdgeClick} style={{ cursor: "pointer" }}>
                {/* Invisible wide hit-area */}
                <path d={edgePath} fill="none" stroke="transparent" strokeWidth={22} />

                {/* The actual line (drawn manually so we control rendering order) */}
                <path
                    id={`edge-path-${id}`}
                    d={edgePath}
                    fill="none"
                    stroke={color}
                    strokeWidth={sw}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {/* Animated dots when selected */}
                {selected && (() => {
                    const dx = targetX - sourceX, dy = targetY - sourceY;
                    const approxLen = Math.hypot(dx, dy) * 1.4;
                    const count = Math.max(2, Math.min(8, Math.round(approxLen / 80)));
                    const dur = Math.max(3, approxLen / 60);
                    return Array.from({ length: count }, (_, i) => (
                        <circle key={i} r={2.5} fill="#42A5F5" opacity={0.7}>
                            <animateMotion
                                dur={`${dur}s`}
                                repeatCount="indefinite"
                                begin={`${(i / count) * dur}s`}
                                path={edgePath}
                            />
                        </circle>
                    ));
                })()}

                {/* Source marker */}
                {srcCard === 'N' ? (
                    <CrowsFoot x={sourceX} y={sourceY} position={sourcePosition} stroke={color} sw={sw} />
                ) : (
                    <OneBar x={sourceX} y={sourceY} position={sourcePosition} stroke={color} sw={sw} />
                )}

                {/* Target marker */}
                {tgtCard === 'N' ? (
                    <CrowsFoot x={targetX} y={targetY} position={targetPosition} stroke={color} sw={sw} />
                ) : (
                    <OneBar x={targetX} y={targetY} position={targetPosition} stroke={color} sw={sw} />
                )}
            </g>

            <EdgeLabelRenderer>
                {/* Source cardinality label */}
                <div
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -100%) translate(${sourceX + positionToDir(sourcePosition).dx * 18}px, ${sourceY + positionToDir(sourcePosition).dy * 18 - 6}px)`,
                        fontSize: 10, fontWeight: 700, color,
                        pointerEvents: "none", userSelect: "none",
                    }}
                    className="nodrag nopan"
                >
                    {srcCard}
                </div>
                {/* Target cardinality label */}
                <div
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -100%) translate(${targetX + positionToDir(targetPosition).dx * 18}px, ${targetY + positionToDir(targetPosition).dy * 18 - 6}px)`,
                        fontSize: 10, fontWeight: 700, color,
                        pointerEvents: "none", userSelect: "none",
                    }}
                    className="nodrag nopan"
                >
                    {tgtCard}
                </div>

                {data?.label && (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12, pointerEvents: "all",
                            background: "white", padding: "2px 6px",
                            borderRadius: 4, border: "1px solid #ddd",
                        }}
                        className="nodrag nopan"
                    >
                        {data.label}
                    </div>
                )}
            </EdgeLabelRenderer>
        </>
    );
};

export default LogicalTableEdge;
