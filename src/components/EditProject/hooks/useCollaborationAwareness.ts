import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollaborationAwareness } from "@/types/projects.type";

type CursorState = {
    flowX: number;
    flowY: number;
};

export type RemoteCursor = {
    clientId: number;
    sessionId?: string;
    name?: string;
    color: string;
    cursor: CursorState;
};

export type RemoteCollaborator = {
    clientId: number;
    sessionId?: string;
    name?: string;
    avatar?: string;
    color: string;
    viewport?: { x: number; y: number; zoom: number };
    schemaId?: string;
    isOnline: boolean;
};

type UseCollaborationAwarenessParams = {
    enabled: boolean;
    awareness: CollaborationAwareness | null;
    sessionId: string | null;
    currentUserName?: string | null;
    currentUserAvatar?: string | null;
    schemaId?: string | null;
};

const generateColorFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
};

export const useCollaborationAwareness = ({
    enabled,
    awareness,
    sessionId,
    currentUserName,
    currentUserAvatar,
    schemaId,
}: UseCollaborationAwarenessParams) => {
    const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
    const [remoteUsers, setRemoteUsers] = useState<RemoteCollaborator[]>([]);

    const localColor = useMemo(() => {
        const baseId = sessionId ?? String(Math.random());
        return generateColorFromId(baseId);
    }, [sessionId]);

    useEffect(() => {
        if (!awareness) return;

        if (!enabled) {
            awareness.setLocalState(null);
            return;
        }

        awareness.setLocalStateField("user", {
            sessionId,
            name: currentUserName ?? "You",
            avatar: currentUserAvatar ?? undefined,
            color: localColor,
        });
        awareness.setLocalStateField("schemaId", schemaId ?? null);

        return () => {
            awareness.setLocalState(null);
        };
    }, [enabled, awareness, sessionId, currentUserName, currentUserAvatar, localColor, schemaId]);

    useEffect(() => {
        if (!enabled || !awareness) {
            setRemoteCursors([]);
            setRemoteUsers([]);
            return;
        }

        const handleChange = () => {
            const entries = Array.from(awareness.getStates().entries());
            const nextCursors: RemoteCursor[] = [];
            const nextUsers: RemoteCollaborator[] = [];

            entries.forEach(([clientId, state]) => {
                if (!state) return;
                if (clientId === awareness.clientID) return;
                const user = (state.user ?? {}) as { sessionId?: string; name?: string; color?: string; avatar?: string };
                const color = user.color ?? generateColorFromId(String(clientId));
                const viewport = state.viewport as { x: number; y: number; zoom: number } | undefined;

                nextUsers.push({
                    clientId,
                    sessionId: user.sessionId,
                    name: user.name,
                    avatar: user.avatar,
                    color,
                    viewport,
                    schemaId: (state.schemaId as string | undefined) ?? undefined,
                    isOnline: true,
                });

                const cursor = (state.cursor ?? null) as CursorState | null;
                if (cursor) {
                    nextCursors.push({
                        clientId,
                        cursor,
                        sessionId: user.sessionId,
                        name: user.name,
                        color,
                    });
                }
            });

            setRemoteCursors(nextCursors);
            setRemoteUsers(nextUsers);
        };

        awareness.on("change", handleChange);
        handleChange();

        return () => {
            awareness.off("change", handleChange);
        };
    }, [enabled, awareness]);

    const broadcastCursorPosition = useCallback(
        (cursor: CursorState | null) => {
            if (!enabled || !awareness) return;
            awareness.setLocalStateField("cursor", cursor);
        },
        [enabled, awareness]
    );

    const broadcastViewport = useCallback(
        (viewport: { x: number; y: number; zoom: number } | null) => {
            if (!enabled || !awareness) return;
            awareness.setLocalStateField("viewport", viewport);
        },
        [enabled, awareness]
    );

    return {
        remoteCursors,
        remoteUsers,
        broadcastCursorPosition,
        broadcastViewport,
    };
};

