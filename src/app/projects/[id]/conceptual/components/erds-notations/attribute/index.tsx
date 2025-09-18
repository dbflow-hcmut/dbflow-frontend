import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { NodeResizer, Position, useNodeId, useStore, useReactFlow } from "reactflow";
import ErdHandle from "../../erd-handle";

type AttributeData = {
    name: string;
    isKey?: boolean;
};

const AttributeNode: React.FC<{ data: AttributeData }> = ({ data }) => {
    const nodeId = useNodeId();
    const isSelected = useStore((store) => store.nodeInternals.get(nodeId!)?.selected);
    const [isHovered, setIsHovered] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [localName, setLocalName] = useState(data.name);
    const { setNodes } = useReactFlow();
    const editableRef = useRef<HTMLDivElement | null>(null);

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

    return (
        <div 
            className="w-full h-full relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <NodeResizer
                color='var(--color-primary)'
                isVisible={isSelected}
                minWidth={100}
                minHeight={50}
            />
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                <ellipse 
                    cx="50" cy="50" rx="49" ry="48" 
                    fill="#fff" 
                    stroke="var(--color-gray-800)" 
                    strokeWidth={2} 
                    vectorEffect="non-scaling-stroke" 
                />
            </svg>
            {isEditing ? (
                <div
                    ref={editableRef}
                    contentEditable
                    suppressContentEditableWarning={true}
                    onBlur={(e) => commitName(e.currentTarget.innerText)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
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
                        "min-w-[80%] max-w-[90%] px-1"
                    )}
                    style={{ userSelect: "text", WebkitUserSelect: "text" }}
                    tabIndex={0}
                    draggable={false}
                >
                    {localName}
                </div>
            ) : (
                <div
                    className={classNames(
                        "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
                        "text-xs font-semibold text-black text-center whitespace-nowrap cursor-text",
                        { 'underline underline-offset-6': data.isKey },
                    )}
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
        </div>
    );
};

export default AttributeNode;
