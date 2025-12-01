import { useEffect, useState } from "react";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { API_BASE } from "@/api";
import type { CollaborationAwareness } from "@/types/projects.type";

type UseProjectAwarenessParams = {
    enabled: boolean;
    projectId?: string | null;
    sessionId: string | null;
    token: string | null;
};

export const useProjectAwareness = ({
    enabled,
    projectId,
    sessionId,
    token,
}: UseProjectAwarenessParams): CollaborationAwareness | null => {
    const [awareness, setAwareness] = useState<CollaborationAwareness | null>(null);

    useEffect(() => {
        if (!enabled || !projectId || !sessionId) {
            setAwareness(null);
            return;
        }

        const ydoc = new Y.Doc();
        const provider = new HocuspocusProvider({
            url: `${API_BASE}/project-collaboration?projectId=${projectId}&sessionId=${sessionId}`,
            name: `project-presence-${projectId}`,
            document: ydoc,
            token: token ?? undefined,
        });

        setAwareness(provider.awareness);

        return () => {
            provider.destroy();
            ydoc.destroy();
            setAwareness(null);
        };
    }, [enabled, projectId, sessionId, token]);

    return awareness;
};

