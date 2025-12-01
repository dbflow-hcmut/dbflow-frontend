import React, { useLayoutEffect, useState } from "react";
import type { RemoteCursor } from "../../hooks/useCollaborationAwareness";

type RemoteCursorsOverlayProps = {
    cursors: RemoteCursor[];
    containerRef: HTMLDivElement | null;
    viewport: { x: number; y: number; zoom: number } | null;
};

type Size = { width: number; height: number };

export const RemoteCursorsOverlay: React.FC<RemoteCursorsOverlayProps> = ({ cursors, containerRef, viewport }) => {
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!containerRef) return;

        const updateSize = () => {
            if (!containerRef) return;
            setSize({
                width: containerRef.clientWidth,
                height: containerRef.clientHeight,
            });
        };

        updateSize();
        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(updateSize);
            resizeObserver.observe(containerRef);
        } else {
            window.addEventListener("resize", updateSize);
        }

        return () => {
            if (resizeObserver) {
                resizeObserver.disconnect();
            } else {
                window.removeEventListener("resize", updateSize);
            }
        };
    }, [containerRef]);

    const hasSize = size.width > 0 && size.height > 0;

    if (!cursors.length || !viewport || !hasSize) {
        return null;
    }

    return (
        <div className="pointer-events-none absolute inset-0 z-0">
            {cursors.map((cursor) => {
                const x = cursor.cursor.flowX * viewport.zoom + viewport.x;
                const y = cursor.cursor.flowY * viewport.zoom + viewport.y;
                if (Number.isNaN(x) || Number.isNaN(y)) return null;

                return (
                    <div
                        key={cursor.clientId}
                        className="absolute text-xs"
                        style={{
                            transform: `translate(${x}px, ${y}px)`,
                        }}
                    >
                        <div className="flex flex-col gap-1" style={{ transform: "translate(-10px, -22px)" }}>
                            <svg
                                width={20}
                                height={20}
                                viewBox="0 0 24 24"
                                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}
                            >
                                <path
                                    d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z"
                                    fill={cursor.color}
                                    stroke={cursor.color}
                                    strokeWidth={1.2}
                                />
                            </svg>
                            <div
                                className="px-1.5 py-0.5 rounded text-white shadow text-sm text-center font-medium"
                                style={{ backgroundColor: cursor.color }}
                            >
                                {cursor.name ?? cursor.sessionId ?? "Collaborator"}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

