import { memo, useEffect, useRef, useState } from "react";
import { NodeResizer, Position, useNodeId, useStore, useReactFlow } from "reactflow";
import classNames from "classnames";
import {
    DatabaseSchemaNode,
    DatabaseSchemaNodeHeader,
    DatabaseSchemaNodeBody,
    DatabaseSchemaTableRow,
    DatabaseSchemaTableCell,
} from "@/components/database-schema-node";
import { LabeledHandle } from "@/components/labeled-handle";
import { KeyRound } from "lucide-react";

type LogicalColumn = {
    name: string;
    isKey?: boolean;
};

export type LogicalTableData = {
    name: string;
    columns: LogicalColumn[];
};

const LogicalTableNode: React.FC<{ data: LogicalTableData }> = ({ data }) => {
    const nodeId = useNodeId();
    const node = useStore((store) => store.nodeInternals.get(nodeId!));
    const isSelected = node?.selected;
    const [isHovered, setIsHovered] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [localName, setLocalName] = useState(data.name);
    const { setNodes } = useReactFlow();
    const nameRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    
    // Calculate height based on number of columns
    const headerHeight = 36; // Approximate header height with padding
    const rowHeight = 32; // Approximate row height with padding
    const minHeight = 100;
    const calculatedHeight = headerHeight + (data.columns?.length || 0) * rowHeight;
    const nodeHeight = Math.max(minHeight, calculatedHeight);
    
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
            
            // Always update width to fit content
            setNodeWidth(calculatedMinWidth);
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
                            height: nodeHeight,
                            width: nodeWidth,
                        } 
                    }
                    : n
            )
        );
    }, [nodeHeight, nodeWidth, nodeId, setNodes]);

    return (
        <div
            className="w-full h-full relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ height: nodeHeight }}
        >
            <NodeResizer
                color='var(--color-primary)'
                isVisible={isSelected}
                minWidth={minWidth}
                minHeight={minHeight}
            />

            <DatabaseSchemaNode className="w-full h-full">
                <div ref={contentRef} className="w-full h-full">
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
                            // Generate columnId following the same format as in builder
                            const columnId = `lid_${nodeId}_col_${idx}`;
                            return (
                                <DatabaseSchemaTableRow key={idx} style={{ whiteSpace: 'nowrap' }}>
                                    <DatabaseSchemaTableCell className="font-light flex-1 flex justify-start" style={{ paddingLeft: 0, paddingRight: '12px' }}>
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
                                            <KeyRound size={14} className="text-gray-500" />
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
                </div>
            </DatabaseSchemaNode>
        </div>
    );
};

export default memo(LogicalTableNode);
