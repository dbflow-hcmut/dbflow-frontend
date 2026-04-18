import React, { useMemo } from "react";
import { NodeResizer, useNodeId, useStore } from "reactflow";

export type DrawingPathData = {
    points: { x: number; y: number }[];
    color: string;
    strokeWidth: number;
};

const DrawingPathNode: React.FC<{ data: DrawingPathData; selected?: boolean }> = ({ data }) => {
    const nodeId = useNodeId();
    const isSelected = useStore((store) => store.nodeInternals.get(nodeId!)?.selected);

    const pathD = useMemo(() => {
        const pts = data.points;
        if (!pts || pts.length < 2) return "";
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            d += ` L ${pts[i].x} ${pts[i].y}`;
        }
        return d;
    }, [data.points]);

    const bounds = useMemo(() => {
        const pts = data.points || [];
        if (pts.length === 0) return { width: 0, height: 0 };
        let maxX = 0, maxY = 0;
        for (const p of pts) {
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        // Add padding for stroke width
        const pad = (data.strokeWidth || 2) + 2;
        return { width: maxX + pad, height: maxY + pad };
    }, [data.points, data.strokeWidth]);

    return (
        <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
            <NodeResizer
                isVisible={!!isSelected}
                minWidth={10}
                minHeight={10}
                lineStyle={{ borderColor: isSelected ? "var(--color-primary)" : "transparent" }}
                handleStyle={{ width: 6, height: 6, borderRadius: 2, backgroundColor: "var(--color-primary)" }}
            />
            <svg
                width={bounds.width}
                height={bounds.height}
                style={{ overflow: "visible", pointerEvents: "none" }}
            >
                <path
                    d={pathD}
                    stroke={data.color || "#ef4444"}
                    strokeWidth={data.strokeWidth || 2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
};

export default DrawingPathNode;
