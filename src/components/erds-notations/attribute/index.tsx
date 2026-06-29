import classNames from "classnames";
import { useEffect, useRef, useState, useCallback } from "react";
import { NodeResizer, Position, useNodeId, useStore, useReactFlow } from "reactflow";
import ErdHandle from "../../erd-handle";

type AttributeData = {
    name: string;
    isKey?: boolean;
    underlineStyle?: 'solid' | 'dashed';
    variant?: 'single' | 'double' | 'dashed';
};

const AttributeNode: React.FC<{ data: AttributeData }> = ({ data }) => {
    const nodeId = useNodeId();
    const isSelected = useStore((store) => store.nodeInternals.get(nodeId!)?.selected);
    const isPartialKeyFromWeakEntity = useStore((store) => {
        if (!nodeId || !data.isKey) return false;
        return store.edges.some((edge) => {
            if (edge.source !== nodeId && edge.target !== nodeId) return false;
            const otherNodeId = edge.source === nodeId ? edge.target : edge.source;
            const otherNode = store.nodeInternals.get(otherNodeId);
            return otherNode?.type === 'entity' && (otherNode.data as { variant?: string })?.variant === 'double';
        });
    });
    const [isHovered, setIsHovered] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [localName, setLocalName] = useState(data.name);
    const { setNodes } = useReactFlow();
    const editableRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    // ── Auto-resize: grow the node when text overflows (only during editing) ──
    const autoResize = useCallback(() => {
        const el = editableRef.current;
        if (!el || !containerRef.current || !nodeId) return;
        const text = el.innerText || '';
        const lines = text.replace(/\n$/, '').split('\n');
        let maxLineW = 0;
        for (const line of lines) {
            let w = 0;
            for (const ch of line) {
                if ('ilI1|!.,;:\' '.includes(ch)) w += 4;
                else if ('mwMW@'.includes(ch)) w += 9;
                else w += 7;
            }
            maxLineW = Math.max(maxLineW, w);
        }
        const containerW = containerRef.current.offsetWidth;
        const containerH = containerRef.current.offsetHeight;
        const neededW = Math.ceil(maxLineW / 0.65) + 16;
        const LINE_H = 16;
        const neededH = lines.length > 1 ? Math.ceil(lines.length * LINE_H / 0.70) + 8 : 0;
        const finalW = Math.max(neededW, containerW);
        const finalH = Math.max(neededH, containerH);
        if (finalW > containerW || finalH > containerH) {
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === nodeId
                        ? { ...n, style: { ...n.style, width: finalW, height: finalH } }
                        : n
                )
            );
        }
    }, [nodeId, setNodes]);

    useEffect(() => {
        if (!isEditing) {
            setLocalName(data.name);
        }
    }, [data.name, isEditing]);

    const commitName = (rawText: string) => {
        const trimmed = rawText.trim();
        const nextValue = trimmed.length > 0 ? trimmed : data.name;
        if (!nodeId) return setIsEditing(false);
        setNodes((nodes) =>
            nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, name: nextValue } } : n))
        );
        setLocalName(nextValue);
        setIsEditing(false);
    };

    useEffect(() => {
        if (isEditing && editableRef.current) {
            const el = editableRef.current;
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    }, [isEditing]);

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

    const gapPx = 6;
    const sx = size.w > 0 ? size.w / 100 : 1;
    const sy = size.h > 0 ? size.h / 100 : 1;
    const offX = gapPx / sx;
    const offY = gapPx / sy;
    const keyUnderlineStyle = isPartialKeyFromWeakEntity ? 'dashed' : 'solid';

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
                minWidth={70}
                minHeight={30}
            />
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                <ellipse 
                    cx="50" cy="50" rx="49" ry="48" 
                    fill="#fff" 
                    stroke="var(--color-gray-800)" 
                    strokeWidth={1}
                    strokeDasharray={data.variant === 'dashed' ? '6 5' : undefined}
                    vectorEffect="non-scaling-stroke" 
                />
                {data.variant === 'double' && (
                    <ellipse
                        cx="50" cy="50" rx={Math.max(0, 49 - offX)} ry={Math.max(0, 48 - offY)}
                        fill="none"
                        stroke="var(--color-gray-800)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                    />
                )}
            </svg>
            {isEditing ? (
                <div
                    ref={editableRef}
                    contentEditable
                    suppressContentEditableWarning={true}
                    onBlur={(e) => commitName(e.currentTarget.innerText)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onInput={() => autoResize()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && e.shiftKey) {
                            e.preventDefault();
                            commitName(e.currentTarget.innerText);
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            setIsEditing(false);
                            setLocalName(data.name);
                        }
                    }}
                    className={classNames(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                        "text-xs font-semibold text-black text-center whitespace-pre-wrap cursor-text pointer-events-auto nodrag nopan",
                        "bg-transparent outline-none border border-transparent focus:outline-none",
                        "min-w-[80%] max-w-[90%] px-1",
                        { 'underline underline-offset-3': data.isKey }
                    )}
                    style={{
                        userSelect: "text",
                        WebkitUserSelect: "text",
                        textDecorationStyle: data.isKey ? keyUnderlineStyle : undefined,
                    }}
                    tabIndex={0}
                    draggable={false}
                >
                    {localName}
                </div>
            ) : (
                <div
                    className={classNames(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                        "text-xs font-semibold text-black text-center whitespace-pre-wrap cursor-text",
                        "min-w-[80%] max-w-[90%] px-1",
                        { 'underline underline-offset-3': data.isKey }
                    )}
                    style={{ textDecorationStyle: data.isKey ? keyUnderlineStyle : undefined }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                    }}
                    draggable={false}
                >
                    {localName}
                </div>
            )}
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

export default AttributeNode;
