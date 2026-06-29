"use client";

import { useState, useCallback } from "react";
import { fetchPermissionMatrix } from "./api";
import type { PermissionMatrix } from "./types";

// Cache per session — key: connId, value: matrix
const sessionCache = new Map<string, PermissionMatrix>();

interface UsePermissionDetectorResult {
    matrix: PermissionMatrix | null;
    loading: boolean;
    error: string | null;
    /** Kiểm tra quyền cho connId đang active. Kết quả được cache trong session. */
    check: (connId: string) => Promise<PermissionMatrix | null>;
    /** Xoá cache và kiểm tra lại. */
    recheck: (connId: string) => Promise<PermissionMatrix | null>;
}

export function usePermissionDetector(): UsePermissionDetectorResult {
    const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAndCache = useCallback(async (connId: string, force: boolean): Promise<PermissionMatrix | null> => {
        if (!force && sessionCache.has(connId)) {
            const cached = sessionCache.get(connId)!;
            setMatrix(cached);
            return cached;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await fetchPermissionMatrix(connId);
            sessionCache.set(connId, result);
            setMatrix(result);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Không thể kiểm tra quyền.";
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const check = useCallback((connId: string) => fetchAndCache(connId, false), [fetchAndCache]);
    const recheck = useCallback((connId: string) => {
        sessionCache.delete(connId);
        return fetchAndCache(connId, true);
    }, [fetchAndCache]);

    return { matrix, loading, error, check, recheck };
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Quyền tối thiểu cần có để chạy Schema Export. */
export const EXPORT_REQUIRED_PERMISSIONS: (keyof PermissionMatrix)[] = [
    "can_create_table",
    "can_alter_table",
    "can_create_index",
];

/** Quyền cần thêm nếu conflict strategy = drop_and_recreate. */
export const DROP_REQUIRED_PERMISSIONS: (keyof PermissionMatrix)[] = [
    "can_drop_table",
    "can_drop_index",
];

export function getMissingForExport(
    matrix: PermissionMatrix,
    allowDrop: boolean,
): string[] {
    const required = allowDrop
        ? [...EXPORT_REQUIRED_PERMISSIONS, ...DROP_REQUIRED_PERMISSIONS]
        : EXPORT_REQUIRED_PERMISSIONS;

    return required
        .filter((key) => !matrix[key])
        .map((key) => key.replace("can_", "").replace(/_/g, " ").toUpperCase());
}
