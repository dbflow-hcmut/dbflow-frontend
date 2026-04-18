import React, { useCallback, useRef, useState } from "react";
import { useReactFlow } from "reactflow";

interface DrawingOverlayProps {
    active: boolean;
    onStrokeComplete: (points: { x: number; y: number }[], color: string, strokeWidth: number) => void;
    color?: string;
    strokeWidth?: number;
}

const DrawingOverlay: React.FC<DrawingOverlayProps> = ({
    active,
    onStrokeComplete,
    color = "#ef4444",
    strokeWidth = 2,
}) => {
    const { getViewport } = useReactFlow();
    const svgRef = useRef<SVGSVGElement>(null);
    const [drawing, setDrawing] = useState(false);
    const currentPathRef = useRef<{ x: number; y: number }[]>([]);
    const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);

    const screenToFlow = useCallback(
        (clientX: number, clientY: number) => {
            const svg = svgRef.current;
            if (!svg) return { x: 0, y: 0 };
            const rect = svg.getBoundingClientRect();
            const vp = getViewport();
            return {
                x: (clientX - rect.left - vp.x) / vp.zoom,
                y: (clientY - rect.top - vp.y) / vp.zoom,
            };
        },
        [getViewport]
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (!active) return;
            e.preventDefault();
            e.stopPropagation();
            setDrawing(true);
            const pt = screenToFlow(e.clientX, e.clientY);
            currentPathRef.current = [pt];
            setCurrentPoints([pt]);
            (e.target as Element).setPointerCapture(e.pointerId);
        },
        [active, screenToFlow]
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!drawing) return;
            e.preventDefault();
            const pt = screenToFlow(e.clientX, e.clientY);
            currentPathRef.current.push(pt);
            setCurrentPoints([...currentPathRef.current]);
        },
        [drawing, screenToFlow]
    );

    const handlePointerUp = useCallback(() => {
        if (!drawing) return;
        setDrawing(false);
        const pts = currentPathRef.current;
        if (pts.length > 1) {
            onStrokeComplete(pts, color, strokeWidth);
        }
        currentPathRef.current = [];
        setCurrentPoints([]);
    }, [drawing, color, strokeWidth, onStrokeComplete]);

    const pointsToPath = (points: { x: number; y: number }[]) => {
        if (points.length < 2) return "";
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }
        return d;
    };

    const vp = getViewport();

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full"
            style={{
                pointerEvents: active ? "all" : "none",
                zIndex: active ? 50 : 5,
                cursor: active ? "crosshair" : "default",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {currentPoints.length > 1 && (
                <g transform={`translate(${vp.x}, ${vp.y}) scale(${vp.zoom})`}>
                    <path
                        d={pointsToPath(currentPoints)}
                        stroke={color}
                        strokeWidth={strokeWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </g>
            )}
        </svg>
    );
};

export default DrawingOverlay;
