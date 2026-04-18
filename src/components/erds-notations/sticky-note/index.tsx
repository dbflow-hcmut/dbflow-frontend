import { useCallback, useEffect, useRef, useState } from "react";
import { NodeResizer, useNodeId, useStore, useReactFlow } from "reactflow";

export type StickyNoteData = {
    text: string;
    color: string;
};

const COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff", "#fed7aa"];

const StickyNoteNode: React.FC<{ data: StickyNoteData; selected?: boolean }> = ({ data, selected }) => {
    const nodeId = useNodeId();
    const isSelected = useStore((store) => store.nodeInternals.get(nodeId!)?.selected);
    const [isEditing, setIsEditing] = useState(false);
    const [localText, setLocalText] = useState(data.text);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const { setNodes } = useReactFlow();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { setLocalText(data.text); }, [data.text]);

    const commitText = useCallback(() => {
        setIsEditing(false);
        if (!nodeId) return;
        setNodes((nds) =>
            nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, text: localText } } : n)
        );
    }, [nodeId, localText, setNodes]);

    const changeColor = useCallback((color: string) => {
        if (!nodeId) return;
        setShowColorPicker(false);
        setNodes((nds) =>
            nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, color } } : n)
        );
    }, [nodeId, setNodes]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.selectionStart = textareaRef.current.value.length;
        }
    }, [isEditing]);

    return (
        <div
            className="relative"
            style={{
                width: "100%",
                height: "100%",
                minWidth: 120,
                minHeight: 80,
            }}
        >
            <NodeResizer
                isVisible={!!isSelected}
                minWidth={120}
                minHeight={80}
                lineStyle={{ borderColor: "transparent" }}
                handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "var(--color-primary)" }}
            />
            <div
                className="w-full h-full rounded-md shadow-md flex flex-col"
                style={{ backgroundColor: data.color || "#fef08a" }}
                onDoubleClick={() => setIsEditing(true)}
            >
                {/* Color picker trigger */}
                {isSelected && (
                    <div className="absolute -top-8 left-0 flex gap-1">
                        {COLORS.map((c) => (
                            <button
                                key={c}
                                className="w-5 h-5 rounded-full border border-white shadow-sm cursor-pointer hover:scale-110 transition-transform"
                                style={{ backgroundColor: c }}
                                onClick={() => changeColor(c)}
                            />
                        ))}
                    </div>
                )}
                {isEditing ? (
                    <textarea
                        ref={textareaRef}
                        value={localText}
                        onChange={(e) => setLocalText(e.target.value)}
                        onBlur={commitText}
                        onKeyDown={(e) => { if (e.key === "Escape") commitText(); }}
                        className="w-full h-full p-3 bg-transparent border-none outline-none resize-none text-sm leading-relaxed"
                        style={{ fontFamily: "inherit" }}
                    />
                ) : (
                    <div className="w-full h-full p-3 text-sm leading-relaxed whitespace-pre-wrap overflow-hidden cursor-text select-none">
                        {data.text || "Double-click to edit..."}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StickyNoteNode;
