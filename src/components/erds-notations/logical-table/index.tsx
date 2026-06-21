import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, Position, useNodeId, useStore, useReactFlow, useUpdateNodeInternals } from "reactflow";
import type { OnResize } from "@reactflow/node-resizer";
import classNames from "classnames";
import {
    DatabaseSchemaNode,
    DatabaseSchemaNodeHeader,
    DatabaseSchemaNodeBody,
    DatabaseSchemaTableRow,
    DatabaseSchemaTableCell,
} from "@/components/database-schema-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { KeyRound, Link2 } from "lucide-react";

type LogicalColumn = {
    id?: string;
    name: string;
    isKey?: boolean;
    isCandidateKey?: boolean;
};

export type LogicalFD = {
    id: string;
    left: string[];   // column ids
    right: string[];  // column ids
};

export type LogicalTableData = {
    name: string;
    columns: LogicalColumn[];
    functionalDependencies?: LogicalFD[];
    showFDs?: boolean;
};

const LogicalTableNode: React.FC<{ data: LogicalTableData }> = ({ data }) => {
    const nodeId = useNodeId();
    const node = useStore((store) => store.nodeInternals.get(nodeId!));
    const edges = useStore((store) => store.edges);
    const isSelected = node?.selected;
    const [isHovered, setIsHovered] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [localName, setLocalName] = useState(data.name);

    // Derive FK columns from edges: a column is FK if it's the source of an FK edge
    const fkColumnIds = useMemo(() => {
        const ids = new Set<string>();
        for (const e of edges) {
            if (e.type === 'logical-table-edge' && e.source === nodeId && e.sourceHandle) {
                const match = e.sourceHandle.match(/^(lid_.+_col_\d+)/);
                if (match) ids.add(match[1]);
            }
        }
        return ids;
    }, [edges, nodeId]);
    const { setNodes } = useReactFlow();
    const updateNodeInternals = useUpdateNodeInternals();
    const nameRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const columnLabelByRef = useMemo(() => {
        const labels = new Map<string, string>();
        data.columns?.forEach((col) => {
            labels.set(col.name, col.name);
            if (col.id) labels.set(col.id, col.name);
        });
        return labels;
    }, [data.columns]);
    const formatColumnRefs = (refs: string[]) =>
        refs.length > 0 ? refs.map((ref) => columnLabelByRef.get(ref) ?? ref).join(', ') : '?';
    
    const minHeight = 68;
    
    // Get initial width from node style or calculate based on content
    const getInitialWidth = () => {
        // Try to get width from node style first
        if (node?.style?.width && typeof node.style.width === 'number') {
            return node.style.width;
        }
        // Otherwise estimate based on columns
        if (data.columns?.length) {
            const estimatedWidth = data.columns.length * 160;
            return Math.max(200, estimatedWidth);
        }
        return 200; // Default width for empty table
    };
    
    const [nodeWidth, setNodeWidth] = useState(() => getInitialWidth());
    const [minWidth, setMinWidth] = useState(180);
    const [measuredHeight, setMeasuredHeight] = useState(minHeight);

    useEffect(() => {
        if (typeof node?.style?.width !== 'number') return;
        setNodeWidth(node.style.width);
    }, [node?.style?.width]);

    const handleResize: OnResize = (_, params) => {
        setNodeWidth(params.width);
    };
    
    useEffect(() => {
        if (!contentRef.current) return;
        
        const calculateWidth = () => {
            const content = contentRef.current;
            if (!content) return;
            
            // Helper to measure text width accurately
            const measureText = (text: string, fontSize: string, fontWeight: string = 'normal') => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) return text.length * 7; // Fallback
                context.font = `${fontWeight} ${fontSize} -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                return context.measureText(text).width;
            };
            
            let maxWidth = 180; // Minimum width
            
            // Measure header (table name)
            const headerText = localName || data.name || '';
            const headerTextWidth = measureText(headerText, '14px', '600');
            // Header padding: px-3 = 12px each side = 24px total
            maxWidth = Math.max(maxWidth, headerTextWidth + 24);
            
            // Measure each row (2 cells: left and right)
            data.columns?.forEach((col) => {
                let rowWidth = 0;
                
                // Left cell: column name + handle + key icon
                const colNameWidth = measureText(col.name || '', '12px');
                rowWidth += colNameWidth;
                // Label padding: pl-3 = 12px
                rowWidth += 12;
                // Handle: w-3 = 12px + margin ~4px
                rowWidth += 16;
                // Cell padding right: 12px
                rowWidth += 12;
                
                // Key icon (if present): size 14px + margin ~4px
                if (col.isKey) {
                    rowWidth += 18;
                }
                
                // Right cell: handle only
                // Cell padding left: 12px
                rowWidth += 12;
                // Handle: w-3 = 12px + margin ~4px
                rowWidth += 16;
                
                maxWidth = Math.max(maxWidth, rowWidth);
            });
            
            // Add padding for safety
            const calculatedMinWidth = Math.max(180, maxWidth + 20);
            setMinWidth(calculatedMinWidth);
            setNodeWidth((currentWidth) => Math.max(currentWidth, calculatedMinWidth));
        };
        
        // Wait for DOM to be ready
        const timeoutId = setTimeout(() => {
            calculateWidth();
        }, 10);
        
        return () => clearTimeout(timeoutId);
    }, [data.columns, localName, data.name]);

    // Use ResizeObserver to auto-measure actual rendered height and sync to node
    useEffect(() => {
        const el = contentRef.current;
        if (!el || !nodeId) return;

        const ro = new ResizeObserver(() => {
            const h = el.scrollHeight;
            if (h > 0) {
                setMeasuredHeight(h);
            }
        });

        ro.observe(el);
        return () => ro.disconnect();
    }, [nodeId]);

    useEffect(() => {
        if (!isEditingName) {
            setLocalName(data.name);
        }
    }, [data.name, isEditingName]);

    useEffect(() => {
        if (!nodeId) return;
        const rafId = requestAnimationFrame(() => updateNodeInternals(nodeId));
        return () => cancelAnimationFrame(rafId);
    }, [data.columns, nodeId, updateNodeInternals]);

    const commitName = (rawText: string) => {
        const trimmed = rawText.trim();
        const nextValue = trimmed.length > 0 ? trimmed : data.name;
        if (!nodeId) return setIsEditingName(false);
        setNodes((nodes) =>
            nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data), name: nextValue } } : n))
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

    // Update node height and width when columns change
    useEffect(() => {
        if (!nodeId) return;
        setNodes((nodes) =>
            nodes.map((n) =>
                n.id === nodeId
                    ? { 
                        ...n, 
                        style: { 
                            ...n.style, 
                            height: measuredHeight,
                            width: nodeWidth,
                        } 
                    }
                    : n
            )
        );
        const rafId = requestAnimationFrame(() => updateNodeInternals(nodeId));
        return () => cancelAnimationFrame(rafId);
    }, [measuredHeight, nodeWidth, nodeId, setNodes, updateNodeInternals]);

    return (
        <div
            className="w-full relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <NodeResizer
                color='var(--color-primary)'
                isVisible={isSelected}
                minWidth={minWidth}
                minHeight={minHeight}
                onResize={handleResize}
                onResizeEnd={handleResize}
            />

            <DatabaseSchemaNode className="w-full">
                <div ref={contentRef} className="w-full">
                <DatabaseSchemaNodeHeader style={{ whiteSpace: 'nowrap' }}>
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
                                "text-center",
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
                            className="text-center cursor-text"
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setIsEditingName(true);
                            }}
                            draggable={false}
                        >
                            {localName}
                        </div>
                    )}
                </DatabaseSchemaNodeHeader>

                <DatabaseSchemaNodeBody>
                    {data.columns?.length ? (
                        data.columns.map((col, idx) => {
                            const columnId = col.id ?? `lid_${nodeId}_col_${idx}`;
                            const isFK = fkColumnIds.has(columnId);
                            return (
                                <DatabaseSchemaTableRow key={columnId} style={{ whiteSpace: 'nowrap' }}>
                                    <DatabaseSchemaTableCell className="font-light flex-1 flex items-center gap-1 justify-start" style={{ paddingLeft: 0, paddingRight: '12px' }}>
                                        <LabeledHandle
                                            id={`${columnId}-left`}
                                            title={col.name}
                                            type="source"
                                            position={Position.Left}
                                            isConnectable={!isSelected}
                                            labelClassName="p-0 w-full pl-3 text-left"
                                            showOnHover={true}
                                            isHovered={isHovered}
                                        />
                                        {col.isKey && (
                                            <span title="Primary Key"><KeyRound size={14} className="text-amber-500" /></span>
                                        )}
                                        {col.isCandidateKey && !col.isKey && (
                                            <span title="Candidate Key"><KeyRound size={14} className="text-purple-500" /></span>
                                        )}
                                        {isFK && (
                                            <Link2 size={14} className="text-blue-500" />
                                        )}
                                    </DatabaseSchemaTableCell>
                                    <DatabaseSchemaTableCell className="font-thin flex-1 flex justify-end" style={{ paddingRight: 0, paddingLeft: '12px' }}>
                                        <LabeledHandle
                                            id={`${columnId}-right`}
                                            title=""
                                            type="source"
                                            position={Position.Right}
                                            isConnectable={!isSelected}
                                            className="p-0"
                                            handleClassName="p-0"
                                            labelClassName="p-0 w-full pr-3 text-right"
                                            showOnHover={true}
                                            isHovered={isHovered}
                                        />
                                    </DatabaseSchemaTableCell>
                                </DatabaseSchemaTableRow>
                            );
                        })
                    ) : (
                        <DatabaseSchemaTableRow>
                            <DatabaseSchemaTableCell className="text-gray-500">
                                No columns
                            </DatabaseSchemaTableCell>
                        </DatabaseSchemaTableRow>
                    )}
                </DatabaseSchemaNodeBody>

                {/* Functional Dependencies (toggleable) */}
                {data.showFDs && data.functionalDependencies && data.functionalDependencies.length > 0 && (
                    <div
                        className="border-t border-gray-200 px-2 py-1"
                        style={{ fontSize: 10, lineHeight: '16px', color: '#666' }}
                    >
                        {data.functionalDependencies.map((fd) => (
                            <div key={fd.id} className="flex items-center gap-0.5 truncate">
                                <span className="font-medium" style={{ color: '#1677ff' }}>
                                    {formatColumnRefs(fd.left)}
                                </span>
                                <span style={{ color: '#999' }}>{' → '}</span>
                                <span className="font-medium" style={{ color: '#52c41a' }}>
                                    {formatColumnRefs(fd.right)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                </div>
            </DatabaseSchemaNode>
        </div>
    );
};

export default memo(LogicalTableNode);
