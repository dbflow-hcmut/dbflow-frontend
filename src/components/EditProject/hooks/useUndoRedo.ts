import { useCallback, useRef } from "react";
import type { Node, Edge } from "reactflow";

type HistoryState<TNodeData = unknown, TEdgeData = unknown> = {
    nodes: Node<TNodeData>[];
    edges: Edge<TEdgeData>[];
};

type UseUndoRedoOptions = {
    maxHistorySize?: number;
    schemaId?: string | null; // ID của schema/diagram để phân biệt history
};

type UseUndoRedoReturn<TNodeData = unknown, TEdgeData = unknown> = {
    undo: () => HistoryState<TNodeData, TEdgeData> | null;
    redo: () => HistoryState<TNodeData, TEdgeData> | null;
    canUndo: () => boolean;
    canRedo: () => boolean;
    saveState: (nodes: Node<TNodeData>[], edges: Edge<TEdgeData>[]) => void;
    resetHistory: () => void; // Reset history cho schema hiện tại
};

/**
 * Hook đơn giản để quản lý undo/redo history
 * Chỉ là lớp trung gian quản lý state, không quan tâm đến logic khác
 */
export function useUndoRedo<TNodeData = unknown, TEdgeData = unknown>(
    options: UseUndoRedoOptions = {}
): UseUndoRedoReturn<TNodeData, TEdgeData> {
    const { maxHistorySize = 50, schemaId } = options;

    // Lưu history riêng cho từng schema
    const historyMapRef = useRef<Map<string, HistoryState<TNodeData, TEdgeData>[]>>(new Map());
    const historyIndexMapRef = useRef<Map<string, number>>(new Map());
    const isUndoRedoRef = useRef(false);

    // Lấy history và index cho schema hiện tại
    const getCurrentHistory = useCallback(() => {
        if (!schemaId) return [];
        if (!historyMapRef.current.has(schemaId)) {
            historyMapRef.current.set(schemaId, []);
        }
        return historyMapRef.current.get(schemaId)!;
    }, [schemaId]);

    const getCurrentHistoryIndex = useCallback(() => {
        if (!schemaId) return -1;
        if (!historyIndexMapRef.current.has(schemaId)) {
            historyIndexMapRef.current.set(schemaId, -1);
        }
        return historyIndexMapRef.current.get(schemaId)!;
    }, [schemaId]);

    const setCurrentHistoryIndex = useCallback(
        (index: number) => {
            if (schemaId) {
                historyIndexMapRef.current.set(schemaId, index);
            }
        },
        [schemaId]
    );

    const setCurrentHistory = useCallback(
        (history: HistoryState<TNodeData, TEdgeData>[]) => {
            if (schemaId) {
                historyMapRef.current.set(schemaId, history);
            }
        },
        [schemaId]
    );

    // Lưu state vào history
    const saveState = useCallback(
        (nodes: Node<TNodeData>[], edges: Edge<TEdgeData>[]) => {
            // Bỏ qua nếu đang trong quá trình undo/redo hoặc không có schemaId
            if (isUndoRedoRef.current || !schemaId) {
                return;
            }

            // Bỏ qua nếu state trống (trừ khi đây là state đầu tiên của schema mới)
            // Điều này tránh lưu state trống khi chuyển diagram
            const history = getCurrentHistory();
            const isEmpty = nodes.length === 0 && edges.length === 0;
            const hasHistory = history.length > 0;
            
            // Nếu state trống và đã có history, không lưu (tránh lưu state trống khi chuyển diagram)
            if (isEmpty && hasHistory) {
                return;
            }

            const historyIndex = getCurrentHistoryIndex();

            const newState: HistoryState<TNodeData, TEdgeData> = {
                nodes: JSON.parse(JSON.stringify(nodes)),
                edges: JSON.parse(JSON.stringify(edges)),
            };

            // So sánh với state cuối cùng để tránh lưu trùng
            const lastState = history[historyIndex];
            if (lastState) {
                const isSame =
                    JSON.stringify(lastState.nodes) === JSON.stringify(newState.nodes) &&
                    JSON.stringify(lastState.edges) === JSON.stringify(newState.edges);
                if (isSame) {
                    return;
                }
            }

            // Xóa các state sau index hiện tại (khi user đã undo rồi làm thao tác mới)
            let newHistory = history;
            if (historyIndex < history.length - 1) {
                newHistory = history.slice(0, historyIndex + 1);
            }

            // Thêm state mới vào history
            newHistory.push(newState);
            let newIndex = newHistory.length - 1;

            // Giới hạn kích thước history (chỉ khi maxHistorySize được set và > 0)
            if (maxHistorySize > 0 && newHistory.length > maxHistorySize) {
                newHistory.shift();
                newIndex = newHistory.length - 1;
            }

            setCurrentHistory(newHistory);
            setCurrentHistoryIndex(newIndex);
        },
        [maxHistorySize, schemaId, getCurrentHistory, getCurrentHistoryIndex, setCurrentHistory, setCurrentHistoryIndex]
    );


    // Undo - trả về state trước đó
    const undo = useCallback((): HistoryState<TNodeData, TEdgeData> | null => {
        if (!schemaId) return null;
        
        const history = getCurrentHistory();
        const historyIndex = getCurrentHistoryIndex();
        
        if (historyIndex <= 0) {
            return null;
        }

        const newIndex = historyIndex - 1;
        setCurrentHistoryIndex(newIndex);
        const previousState = history[newIndex];

        if (previousState) {
            isUndoRedoRef.current = true;
            setTimeout(() => {
                isUndoRedoRef.current = false;
            }, 0);
            return {
                nodes: JSON.parse(JSON.stringify(previousState.nodes)),
                edges: JSON.parse(JSON.stringify(previousState.edges)),
            };
        }

        return null;
    }, [schemaId, getCurrentHistory, getCurrentHistoryIndex, setCurrentHistoryIndex]);

    // Redo - trả về state tiếp theo
    const redo = useCallback((): HistoryState<TNodeData, TEdgeData> | null => {
        if (!schemaId) return null;
        
        const history = getCurrentHistory();
        const historyIndex = getCurrentHistoryIndex();
        
        if (historyIndex >= history.length - 1) {
            return null;
        }

        const newIndex = historyIndex + 1;
        setCurrentHistoryIndex(newIndex);
        const nextState = history[newIndex];

        if (nextState) {
            isUndoRedoRef.current = true;
            setTimeout(() => {
                isUndoRedoRef.current = false;
            }, 0);
            return {
                nodes: JSON.parse(JSON.stringify(nextState.nodes)),
                edges: JSON.parse(JSON.stringify(nextState.edges)),
            };
        }

        return null;
    }, [schemaId, getCurrentHistory, getCurrentHistoryIndex, setCurrentHistoryIndex]);

    const canUndo = useCallback(() => {
        if (!schemaId) return false;
        return getCurrentHistoryIndex() > 0;
    }, [schemaId, getCurrentHistoryIndex]);

    const canRedo = useCallback(() => {
        if (!schemaId) return false;
        const history = getCurrentHistory();
        const historyIndex = getCurrentHistoryIndex();
        return historyIndex < history.length - 1;
    }, [schemaId, getCurrentHistory, getCurrentHistoryIndex]);

    // Reset history cho schema hiện tại
    const resetHistory = useCallback(() => {
        if (schemaId) {
            historyMapRef.current.set(schemaId, []);
            historyIndexMapRef.current.set(schemaId, -1);
        }
    }, [schemaId]);

    return {
        undo,
        redo,
        canUndo,
        canRedo,
        saveState,
        resetHistory,
    };
}

