"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
    ACTIVE_WORKSPACE_STORAGE_KEY,
    getActiveWorkspaceId,
    setActiveWorkspaceId as persistActiveWorkspaceId,
} from "@/utils/active-workspace";

interface WorkspaceContextValue {
    /** The workspace the user is currently acting in. Undefined until resolved on mount. */
    workspaceId: string | undefined;
    /** Persists the workspace (localStorage) and notifies every consumer, in this tab and others. */
    setWorkspaceId: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

/**
 * Single reactive source of truth for "the workspace the user is currently acting in".
 *
 * Backed by the same localStorage key + `dbflow:workspace-changed` event that
 * Sidebar/CreateProject/SettingsModal already use to persist workspace selection —
 * this just makes that value consumable via a hook instead of ad-hoc localStorage
 * reads scattered across components (which is how the db-connections/projects/
 * ai-gateway quota bugs happened: a call site had no workspaceId in scope and
 * silently fell back to the personal workspace).
 */
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    const [workspaceId, setWorkspaceIdState] = useState<string | undefined>(undefined);

    useEffect(() => {
        setWorkspaceIdState(getActiveWorkspaceId());

        const handleChange = (event: Event) => {
            const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
            setWorkspaceIdState(detail?.workspaceId ?? getActiveWorkspaceId());
        };
        const handleStorage = (event: StorageEvent) => {
            if (event.key === ACTIVE_WORKSPACE_STORAGE_KEY) {
                setWorkspaceIdState(event.newValue ?? undefined);
            }
        };

        window.addEventListener("dbflow:workspace-changed", handleChange);
        window.addEventListener("storage", handleStorage);
        return () => {
            window.removeEventListener("dbflow:workspace-changed", handleChange);
            window.removeEventListener("storage", handleStorage);
        };
    }, []);

    const setWorkspaceId = useCallback((id: string) => {
        persistActiveWorkspaceId(id);
        setWorkspaceIdState(id);
    }, []);

    return (
        <WorkspaceContext.Provider value={{ workspaceId, setWorkspaceId }}>
            {children}
        </WorkspaceContext.Provider>
    );
}

/** The current workspace, reactive to changes made anywhere in the app (or in another tab). */
export function useWorkspace(): WorkspaceContextValue {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
    return ctx;
}
