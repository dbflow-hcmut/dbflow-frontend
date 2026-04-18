"use client";

import React from "react";
import dynamic from "next/dynamic";

const DiffEditor = dynamic(
    () => import("@monaco-editor/react").then((mod) => mod.DiffEditor),
    { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-gray-400 text-sm">Loading editor…</div> },
);

interface LazyDiffEditorProps {
    original: string;
    modified: string;
    language?: string;
    height?: number | string;
}

const LazyDiffEditor: React.FC<LazyDiffEditorProps> = ({
    original,
    modified,
    language = "sql",
    height = 340,
}) => (
    <DiffEditor
        height={height}
        language={language}
        original={original}
        modified={modified}
        theme="vs-dark"
        options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "on",
            renderSideBySide: true,
            overviewRulerLanes: 0,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: "auto", horizontal: "auto", verticalScrollbarSize: 5, horizontalScrollbarSize: 5, useShadows: false },
            padding: { top: 8, bottom: 8 },
            wordWrap: "on",
            domReadOnly: true,
            automaticLayout: true,
        }}
    />
);

export default LazyDiffEditor;
