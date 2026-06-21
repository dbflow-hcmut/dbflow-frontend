import { memo, useEffect, useMemo, useRef, useState } from "react";
import { NodeResizer, Position, useNodeId, useStore, useReactFlow, useUpdateNodeInternals } from "reactflow";
import type { OnResize, OnResizeEnd } from "@reactflow/node-resizer";
import classNames from "classnames";
import {
    DatabaseSchemaNode,
    DatabaseSchemaNodeHeader,
    DatabaseSchemaNodeBody,
    DatabaseSchemaTableRow,
    DatabaseSchemaTableCell,
} from "@/components/database-schema-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { KeyRound, Link2, Fingerprint, Zap } from "lucide-react";

export type RelationColumn = {
    name: string;
    type?: string;
    length?: string;
    isPrimary?: boolean;
    isCandidateKey?: boolean;
    isNullable?: boolean;
    isUnique?: boolean;
    isAutoIncrement?: boolean;
    defaultValue?: string;
};

export type TableIndex = {
    id: string;
    name: string;
    type: 'BTREE' | 'HASH' | 'GIN' | 'GIST' | 'BRIN';
    columns: Array<{
        columnName: string;
        order: 'ASC' | 'DESC';
    }>;
    isUnique: boolean;
};

export type PhysicalFD = {
    id: string;
    left: string[];   // column names
    right: string[];  // column names
};

export type RelationTableData = {
    name: string;
    columns: RelationColumn[];
    indexes?: TableIndex[];
    functionalDependencies?: PhysicalFD[];
    showFDs?: boolean;
};

const RelationTableNode: React.FC<{ data: RelationTableData }> = ({ data }) => {
    const nodeId = useNodeId();
    const node = useStore((store) => store.nodeInternals.get(nodeId!));
    const edges = useStore((store) => store.edges);
    const isSelected = node?.selected;
    const [isHovered, setIsHovered] = useState(false);

    // Derive FK columns from edges: a column is FK if it's the source of an FK edge
    const fkColumnNames = useMemo(() => {
        const names = new Set<string>();
        for (const e of edges) {
            if (e.type === 'relation-table-edge' && e.source === nodeId && e.sourceHandle) {
                names.add(e.sourceHandle);
            }
        }
        return names;
    }, [edges, nodeId]);

    const [isEditingName, setIsEditingName] = useState(false);
    const [localName, setLocalName] = useState(data.name);
    const { setNodes } = useReactFlow();
    const updateNodeInternals = useUpdateNodeInternals();
    const nameRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    
    const minHeight = 68;
    const [measuredHeight, setMeasuredHeight] = useState(minHeight);

    // Get initial width from node style or calculate based on content
    const getInitialWidth = () => {
        // Try to get width from node style first
        if (node?.style?.width && typeof node.style.width === 'number') {
            return node.style.width;
        }
        // Otherwise estimate based on columns with new spacing
        // nameWidth (40) + typeWidth (40) + spacing (20) = ~100px base per column
        if (data.columns?.length) {
            const estimatedColWidth = data.columns.length * 180; // Rough estimate per column with new spacing
            return Math.max(220, estimatedColWidth);
        }
        return 220; // Default width for empty table
    };
    
    const [nodeWidth, setNodeWidth] = useState(() => getInitialWidth());
    const [minWidth, setMinWidth] = useState(200);

    useEffect(() => {
        if (typeof node?.style?.width !== 'number') return;
        setNodeWidth(node.style.width);
    }, [node?.style?.width]);

    const handleResize: OnResize = (_, params) => {
        setNodeWidth(params.width);
    };
    const handleResizeEnd: OnResizeEnd = (_, params) => {
        setNodeWidth(params.width);
    };

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
            
            let maxWidth = 200; // Minimum width
            
            // Measure header (table name)
            const headerText = localName || data.name || '';
            const headerTextWidth = measureText(headerText, '14px', '600');
            // Header padding: px-3 = 12px each side = 24px total
            maxWidth = Math.max(maxWidth, headerTextWidth + 24);
            
            // Measure each row
            data.columns?.forEach((col) => {
                let rowWidth = 0;
                
                // Left side: column name + handle
                const colNameWidth = measureText(col.name || '', '12px');
                rowWidth += colNameWidth;
                // Label padding: pl-3 = 12px
                rowWidth += 12;
                // Handle: w-3 = 12px + margin ~4px
                rowWidth += 16;
                // Cell padding: paddingRight 24px
                rowWidth += 24;
                
                // Primary key icon (if present): size 14px + margin ~4px
                if (col.isPrimary) {
                    rowWidth += 18;
                }
                
                // Right side: type + NOT NULL + handle
                // Cell padding: paddingLeft 12px
                rowWidth += 12;
                
                // NOT NULL text (if present)
                if (col.isNullable === false) {
                    const notNullWidth = measureText('NOT NULL', '12px');
                    rowWidth += notNullWidth + 8; // text + spacing
                }
                
                // Type text
                const typeText = col.type || 'varchar';
                const typeWidth = measureText(typeText, '12px');
                rowWidth += typeWidth;
                // Label padding: pr-3 = 12px
                rowWidth += 12;
                // Handle: w-3 = 12px + margin ~4px
                rowWidth += 16;
                
                maxWidth = Math.max(maxWidth, rowWidth);
            });
            
            // Add padding for safety
            const calculatedMinWidth = Math.max(200, maxWidth + 20);
            setMinWidth(calculatedMinWidth);
            setNodeWidth((currentWidth) => Math.max(currentWidth, calculatedMinWidth));
        };
        
        // Wait for DOM to be ready
        const timeoutId = setTimeout(() => {
            calculateWidth();
        }, 10);
        
        return () => clearTimeout(timeoutId);
    }, [data.columns, localName, data.name]);

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
                onResizeEnd={handleResizeEnd}
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
                            const typeDisplay = col.length ? `${col.type || 'varchar'}(${col.length})` : (col.type || 'varchar');
                            return (
                            <DatabaseSchemaTableRow key={idx} style={{ whiteSpace: 'nowrap' }}>
                                <DatabaseSchemaTableCell className="font-light flex-1 flex items-center gap-1 justify-start" style={{ paddingLeft: 0, paddingRight: '24px' }}>

                                    <LabeledHandle
                                        id={col.name}
                                        title={col.name}
                                        type="target"
                                        position={Position.Left}
                                        isConnectable={!isSelected}
                                        labelClassName="p-0 w-full pl-3 text-left"
                                        showOnHover={true}
                                        isHovered={isHovered}
                                    />
                                    {col.isPrimary && (
                                        <span title="Primary Key"><KeyRound size={14} className="text-amber-500" /></span>
                                    )}
                                    {col.isCandidateKey && !col.isPrimary && (
                                        <span title="Candidate Key"><KeyRound size={14} className="text-purple-500" /></span>
                                    )}
                                    {fkColumnNames.has(col.name) && (
                                        <Link2 size={14} className="text-blue-500" />
                                    )}
                                    {col.isUnique && !col.isPrimary && !col.isCandidateKey && (
                                        <Fingerprint size={14} className="text-purple-500" />
                                    )}
                                    {col.isAutoIncrement && (
                                        <Zap size={12} className="text-green-500" />
                                    )}
                                </DatabaseSchemaTableCell>
                                <DatabaseSchemaTableCell className="font-thin flex-1 flex justify-end" style={{ paddingRight: 0, paddingLeft: '12px' }}>
                                    {col.isNullable === false && (
                                        <span className="text-red-600 text-xs">NOT NULL</span>
                                    )}
                                    <LabeledHandle
                                        id={col.name}
                                        title={typeDisplay}
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
                                    {fd.left.length > 0 ? fd.left.join(', ') : '?'}
                                </span>
                                <span style={{ color: '#999' }}>{' → '}</span>
                                <span className="font-medium" style={{ color: '#52c41a' }}>
                                    {fd.right.length > 0 ? fd.right.join(', ') : '?'}
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

export default memo(RelationTableNode);
