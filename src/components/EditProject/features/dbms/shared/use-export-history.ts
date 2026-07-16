"use client";

import { useCallback } from "react";
import useSWR, { mutate } from "swr";
import {
    getExportRecords,
    createExportRecord,
    deleteExportRecord,
    rollbackExportRecord,
} from "./api";
import type { ExportRecord, CreateExportRecordPayload, RollbackResult } from "./types";

const swrKey = (projectId: string) => `export-records-${projectId}`;

export function useExportHistory(projectId: string | null) {
    const { data: records, error, isLoading } = useSWR<ExportRecord[]>(
        projectId ? swrKey(projectId) : null,
        () => getExportRecords(projectId!),
        { revalidateOnFocus: false },
    );

    const addRecord = useCallback(
        async (payload: CreateExportRecordPayload): Promise<ExportRecord> => {
            const created = await createExportRecord(projectId!, payload);
            await mutate(swrKey(projectId!));
            return created;
        },
        [projectId],
    );

    const removeRecord = useCallback(
        async (recordId: string): Promise<void> => {
            await deleteExportRecord(projectId!, recordId);
            await mutate(swrKey(projectId!));
        },
        [projectId],
    );

    const rollback = useCallback(
        async (recordId: string): Promise<RollbackResult> => {
            return rollbackExportRecord(projectId!, recordId);
        },
        [projectId],
    );

    return {
        records: records ?? [],
        isLoading,
        error: error as Error | null,
        addRecord,
        removeRecord,
        rollback,
    };
}
