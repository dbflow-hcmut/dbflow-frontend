"use client";

import React, { useMemo } from "react";
import {
    EdgeLabelRenderer,
    EdgeProps,
    getSmoothStepPath,
    useReactFlow,
    useStore,
    Position,
} from "reactflow";

type RelationTableEdgeData = {
    label?: string;
    controlPoints?: Array<{ x: number; y: number }>;
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

const SELF_LOOP_MARGIN = 28;
const SELF_LOOP_RADIUS = 8;

const roundedOrthogonalPath = (points: Array<{ x: number; y: number }>, radius: number): string => {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];
        const distPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        const distNext = Math.hypot(next.x - curr.x, next.y - curr.y);
        const r = Math.min(radius, distPrev / 2, distNext / 2);
        const p1x = curr.x - ((curr.x - prev.x) / distPrev) * r;
        const p1y = curr.y - ((curr.y - prev.y) / distPrev) * r;
        const p2x = curr.x + ((next.x - curr.x) / distNext) * r;
        const p2y = curr.y + ((next.y - curr.y) / distNext) * r;
        d += ` L ${p1x} ${p1y} Q ${curr.x} ${curr.y} ${p2x} ${p2y}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    return d;
};

const buildSelfLoopPath = (
    node: { x: number; y: number; width: number; height: number },
    sourceX: number, sourceY: number,
    targetX: number, targetY: number,
): { path: string; labelX: number; labelY: number } => {
    const loopX = Math.max(sourceX, node.x + node.width) + SELF_LOOP_MARGIN;
    const approachX = Math.min(targetX, node.x) - SELF_LOOP_MARGIN;
    const goAbove = (sourceY + targetY) / 2 <= node.y + node.height / 2;
    const loopY = goAbove ? node.y - SELF_LOOP_MARGIN : node.y + node.height + SELF_LOOP_MARGIN;

    const points = [
        { x: sourceX, y: sourceY },
        { x: loopX, y: sourceY },
        { x: loopX, y: loopY },
        { x: approachX, y: loopY },
        { x: approachX, y: targetY },
        { x: targetX, y: targetY },
    ];
    return { path: roundedOrthogonalPath(points, SELF_LOOP_RADIUS), labelX: (loopX + approachX) / 2, labelY: loopY };
};

// ── Crow's foot (many / N) ──────────────────────────────────────────────

const CrowsFoot: React.FC<{
    x: number; y: number; position: Position; stroke: string; sw: number;
}> = ({ x, y, position, stroke, sw }) => {
    const L = 10, S = 7;
    const d = positionToDir(position);
    const p = perpCW(d);
    const bx = x + d.dx * L, by = y + d.dy * L;
    return (
        <g>
            <line x1={bx} y1={by} x2={x} y2={y} stroke={stroke} strokeWidth={sw} />
            <line x1={bx} y1={by} x2={x + p.dx * S} y2={y + p.dy * S} stroke={stroke} strokeWidth={sw} />
            <line x1={bx} y1={by} x2={x - p.dx * S} y2={y - p.dy * S} stroke={stroke} strokeWidth={sw} />
            <line x1={x + p.dx * S} y1={y + p.dy * S} x2={x - p.dx * S} y2={y - p.dy * S} stroke={stroke} strokeWidth={sw} />
        </g>
    );
};

// ── One bar (1) ──────────────────────────────────────────────────────────

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

const RelationTableEdge: React.FC<EdgeProps<RelationTableEdgeData>> = (props) => {
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
        data,
        selected,
    } = props;

    const { setEdges, setNodes } = useReactFlow();

    const [smoothPath, smoothLabelX, smoothLabelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 6,
    });

    const sourceNodeGeometry = useStore(
        (s) => {
            const node = s.nodeInternals.get(source);
            if (!node) return null;
            const pos = node.positionAbsolute ?? node.position;
            return { x: pos.x, y: pos.y, width: node.width ?? 0, height: node.height ?? 0 };
        },
        (a, b) => a?.x === b?.x && a?.y === b?.y && a?.width === b?.width && a?.height === b?.height,
    );

    const selfLoop = useMemo(() => {
        if (source !== target || sourcePosition !== Position.Right || targetPosition !== Position.Left) {
            return null;
        }
        if (!sourceNodeGeometry?.width || !sourceNodeGeometry?.height) return null;
        return buildSelfLoopPath(sourceNodeGeometry, sourceX, sourceY, targetX, targetY);
    }, [source, target, sourcePosition, targetPosition, sourceX, sourceY, targetX, targetY, sourceNodeGeometry]);

    const edgePath = selfLoop?.path ?? smoothPath;
    const labelX = selfLoop?.labelX ?? smoothLabelX;
    const labelY = selfLoop?.labelY ?? smoothLabelY;

    const handleEdgeClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
        setEdges((es) => es.map((e) => ({ ...e, selected: e.id === id })));
    };

    const color = selected ? "#42A5F5" : (style?.stroke as string) || "#64748b";
    const sw = selected ? 2.5 : 1.5;

    // Physical FK edges: default source (FK side) = N, target (PK side) = 1
    // But allow override via data
    const srcCard = data?.sourceCardinality || "N";
    const tgtCard = data?.targetCardinality || "1";

    return (
        <>
            <g onClick={handleEdgeClick} style={{ cursor: "pointer" }}>
                {/* Invisible wide hit-area */}
                <path d={edgePath} fill="none" stroke="transparent" strokeWidth={22} />

                {/* The actual line */}
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

                {/* Source marker — FK side (many by default) */}
                {srcCard === 'N' ? (
                    <CrowsFoot x={sourceX} y={sourceY} position={sourcePosition} stroke={color} sw={sw} />
                ) : (
                    <OneBar x={sourceX} y={sourceY} position={sourcePosition} stroke={color} sw={sw} />
                )}

                {/* Target marker — PK side (one by default) */}
                {tgtCard === 'N' ? (
                    <CrowsFoot x={targetX} y={targetY} position={targetPosition} stroke={color} sw={sw} />
                ) : (
                    <OneBar x={targetX} y={targetY} position={targetPosition} stroke={color} sw={sw} />
                )}
            </g>

            <EdgeLabelRenderer>
                {data?.label && (
                    <div
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            fontSize: 12,
                            pointerEvents: "all",
                            background: "white",
                            padding: "2px 6px",
                            borderRadius: 4,
                            border: "1px solid #ddd",
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

export default RelationTableEdge;
