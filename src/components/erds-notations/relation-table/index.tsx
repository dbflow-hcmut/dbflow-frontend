import classNames from "classnames";
import { useEffect, useRef, useState } from "react";
import { NodeResizer, Position, useNodeId, useStore, useReactFlow } from "reactflow";
import ErdHandle from "../../erd-handle";

type RelationColumn = {
    name: string;
    type?: string;
    isPrimary?: boolean;
    isNullable?: boolean;
};

export type RelationTableData = {
    name: string;
    columns: RelationColumn[];
};

const RelationTableNode: React.FC<{ data: RelationTableData }> = ({ data }) => {
    const nodeId = useNodeId();
    const isSelected = useStore((store) => store.nodeInternals.get(nodeId!)?.selected);
    const [isHovered, setIsHovered] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [localName, setLocalName] = useState(data.name);
    const { setNodes } = useReactFlow();
    const nameRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isEditingName) {
            setLocalName(data.name);
        }
    }, [data.name, isEditingName]);

    const commitName = (rawText: string) => {
        const trimmed = rawText.trim();
        const nextValue = trimmed.length > 0 ? trimmed : data.name;
        if (!nodeId) return setIsEditingName(false);
        setNodes((nodes) =>
            nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as any), name: nextValue } } : n))
        );
        setLocalName(nextValue);
        setIsEditingName(false);
    };

    useEffect(() => {
        if (isEditingName && nameRef.current) {
            const el = nameRef.current;
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    }, [isEditingName]);

    return (
        <div
            className="w-full h-full relative bg-transparent"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <NodeResizer
                color='var(--color-primary)'
                isVisible={isSelected}
                minWidth={140}
                minHeight={100}
            />

            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                <rect 
                    x="1" y="1" width="98" height="98"
                    fill="#fff" 
                    stroke="var(--color-gray-800)" 
                    strokeWidth={2} 
                    vectorEffect="non-scaling-stroke" 
                    rx={4}
                    ry={4}
                />
                <line x1="1" y1="24" x2="99" y2="24" stroke="var(--color-gray-800)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Header */}
            {isEditingName ? (
                <div
                    ref={nameRef}
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
                            setIsEditingName(false);
                            setLocalName(data.name);
                        }
                    }}
                    className={classNames(
                        "absolute left-0 top-0 w-full h-6",
                        "text-xs font-bold text-black text-center flex items-center justify-center",
                        "cursor-text pointer-events-auto nodrag nopan",
                        "bg-transparent outline-none border border-transparent focus:outline-none"
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
                        "absolute left-0 top-0 w-full h-6",
                        "text-xs font-bold text-black text-center flex items-center justify-center",
                        "cursor-text"
                    )}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        setIsEditingName(true);
                    }}
                    draggable={false}
                >
                    {localName}
                </div>
            )}

            {/* Columns */}
            <div className="absolute left-0 top-6 w-full bottom-0 overflow-hidden">
                <div className="px-2 py-1">
                    {data.columns?.length ? (
                        <ul className="space-y-1">
                            {data.columns.map((col, idx) => (
                                <li key={idx} className="text-[10px] leading-tight text-black flex items-center gap-1">
                                    {col.isPrimary && <span className="inline-block w-1.5 h-1.5 rounded-full bg-black" />}
                                    <span className="font-semibold">{col.name}</span>
                                    {col.type && <span className="text-gray-700">: {col.type}</span>}
                                    {col.isNullable === false && <span className="text-red-600"> NOT NULL</span>}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-[10px] text-gray-700">No columns</div>
                    )}
                </div>
            </div>

            <ErdHandle 
                id="top"
                position={Position.Top}
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

export default RelationTableNode;


