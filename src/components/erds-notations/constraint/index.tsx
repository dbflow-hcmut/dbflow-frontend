import { useEffect, useRef, useState } from "react";
import { Position, useNodeId, useStore, NodeResizer } from "reactflow";
import ErdHandle from "../../erd-handle";

type ConstraintData = {
    symbol: 'd' | 'o' | 'u';
};

const ConstraintNode: React.FC<{ data: ConstraintData }> = ({ data }) => {
    const nodeId = useNodeId();
    const isSelected = useStore((store) => store.nodeInternals.get(nodeId!)?.selected);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const el = containerRef.current;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setSize({ w: rect.width, h: rect.height });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <NodeResizer
                color='var(--color-primary)'
                isVisible={isSelected}
                minWidth={size.w || 24}
                minHeight={size.h || 24}
                maxWidth={size.w || 24}
                maxHeight={size.h || 24}
                keepAspectRatio
                handleStyle={{ pointerEvents: 'none', cursor: 'default' }}
                lineStyle={{ pointerEvents: 'none', cursor: 'default' }}
            />
            <svg
                width="100%"
                height="100%"
                viewBox="0 0 100 100"
                preserveAspectRatio="xMidYMid meet"
                style={{ overflow: "visible" }}
            >
                <circle
                    cx={50}
                    cy={50}
                    r={47}
                    fill="#fff"
                    stroke="var(--color-gray-800)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                />
                <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={40}
                    fontWeight={700}
                    fill="var(--color-gray-800)"
                >
                    {data.symbol}
                </text>
            </svg>
            <ErdHandle 
                id="top"
                position={Position.Top}
                isConnectable={!isSelected}
                isHovered={isHovered}
                isSelected={isSelected}
            />
            <ErdHandle 
                id="bottom"
                position={Position.Bottom}
                isConnectable={!isSelected}
                isHovered={isHovered}
                isSelected={isSelected}
            />
            <ErdHandle 
                id="left"
                position={Position.Left}
                isConnectable={!isSelected}
                isHovered={isHovered}
                isSelected={isSelected}
            />
            <ErdHandle 
                id="right"
                position={Position.Right}
                isConnectable={!isSelected}
                isHovered={isHovered}
                isSelected={isSelected}
            />
        </div>
    );
};

export default ConstraintNode;