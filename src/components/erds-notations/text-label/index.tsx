import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, useNodeId, useStore, useReactFlow } from "reactflow";

export type TextLabelData = {
    text: string;
    fontSize: number;
};

const TextLabelNode: React.FC<{ data: TextLabelData; selected?: boolean }> = ({ data }) => {
    const nodeId = useNodeId();
    const isSelected = useStore((store) => store.nodeInternals.get(nodeId!)?.selected);
    const [isEditing, setIsEditing] = useState(false);
    const [localText, setLocalText] = useState(data.text);
    const { setNodes } = useReactFlow();
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { setLocalText(data.text); }, [data.text]);

    const commitText = useCallback(() => {
        setIsEditing(false);
        if (!nodeId) return;
        setNodes((nds) =>
            nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, text: localText } } : n)
        );
    }, [nodeId, localText, setNodes]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.selectionStart = inputRef.current.value.length;
        }
    }, [isEditing]);

    const fontSize = data.fontSize || 14;

    return (
        <div
            className="relative"
            style={{ minWidth: 40, minHeight: 24 }}
        >
            <NodeResizer
                isVisible={!!isSelected}
                minWidth={40}
                minHeight={24}
                lineStyle={{ borderColor: "transparent" }}
                handleStyle={{ width: 6, height: 6, borderRadius: 2, backgroundColor: "var(--color-primary)" }}
            />
            <div
                className="w-full h-full"
                onDoubleClick={() => setIsEditing(true)}
            >
                {isEditing ? (
                    <textarea
                        ref={inputRef}
                        value={localText}
                        onChange={(e) => setLocalText(e.target.value)}
                        onBlur={commitText}
                        onKeyDown={(e) => { if (e.key === "Escape") commitText(); }}
                        className="w-full h-full bg-transparent border-none outline-none resize-none"
                        style={{
                            fontSize,
                            lineHeight: 1.4,
                            fontFamily: "inherit",
                            color: "var(--color-gray-900)",
                        }}
                    />
                ) : (
                    <div
                        className="w-full h-full whitespace-pre-wrap cursor-text select-none"
                        style={{
                            fontSize,
                            lineHeight: 1.4,
                            color: "var(--color-gray-900)",
                        }}
                    >
                        {data.text || "Double-click to edit..."}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TextLabelNode;
