"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Input } from "antd";
import { Play, Clock, Rows3, Lock, Sparkles, Database, PlugZap, Network, MonitorSmartphone, User, CheckCircle, XCircle, Info, GripHorizontal, Wand2 } from "lucide-react";
import Editor from "@monaco-editor/react";
import { executeQueryDbConnection, generateSqlFromNl, type QueryResultDto } from "@/api/db-connections/client";
import type { DBConnection } from "@/types/db-connection.type";

const { TextArea } = Input;

interface QueryExecutorModalProps {
    open: boolean;
    onClose: () => void;
    connId: string;
    conn?: DBConnection;
    schema?: string;
    projectId?: string;
}

interface LogEntry {
    time: string;
    type: "info" | "success" | "error";
    msg: string;
}

const DBMS_COLORS: Record<string, string> = {
    postgresql: "#336791",
    mysql: "#e47911",
    sqlserver: "#cc2927",
};

const DBMS_LABELS: Record<string, string> = {
    postgresql: "PostgreSQL",
    mysql: "MySQL",
    sqlserver: "SQL Server",
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
    direct: <PlugZap size={11} />,
    ssh: <Network size={11} />,
    local_agent: <MonitorSmartphone size={11} />,
};

const METHOD_LABELS: Record<string, string> = {
    direct: "Direct",
    ssh: "SSH Tunnel",
    local_agent: "Local Agent",
};


function nowTime() {
    return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function QueryExecutorModal({
    open,
    onClose,
    connId,
    conn,
    schema,
    projectId,
}: QueryExecutorModalProps) {
    const [sql, setSql] = useState("SELECT * FROM users\nLIMIT 10;");
    const [nlInput, setNlInput] = useState("");
    const [generating, setGenerating] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<QueryResultDto | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [hasQueried, setHasQueried] = useState(false);
    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const [nlHeight, setNlHeight] = useState(56);
    const [editorHeight, setEditorHeight] = useState(140);
    const [logHeight, setLogHeight] = useState(96);
    const [dragging, setDragging] = useState<"nl" | "editor" | "log" | null>(null);

    const sqlRef = useRef(sql);
    const logsEndRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const editorRef = useRef<any>(null);
    const handleRunRef = useRef<() => Promise<void>>(async () => {});
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartY = useRef(0);
    const dragStartVal = useRef(0);
    // Refs so drag closure always sees latest values without re-registering listeners
    const nlHeightRef = useRef(nlHeight);
    const editorHeightRef = useRef(editorHeight);
    const logHeightRef = useRef(logHeight);
    nlHeightRef.current = nlHeight;
    editorHeightRef.current = editorHeight;
    logHeightRef.current = logHeight;
    sqlRef.current = sql;

    // Overhead = 3 drag handles (6px each) + toolbar (36px)
    const DRAG_OVERHEAD = 54;
    const MIN_RESULTS = 60;

    const startDrag = useCallback(
        (target: "nl" | "editor" | "log", currentVal: number) => (e: React.MouseEvent) => {
            e.preventDefault();
            dragStartY.current = e.clientY;
            dragStartVal.current = currentVal;
            setDragging(target);
        },
        [],
    );

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e: MouseEvent) => {
            const delta = e.clientY - dragStartY.current;
            const containerH = containerRef.current?.clientHeight ?? 600;
            const nl = nlHeightRef.current;
            const ed = editorHeightRef.current;
            const lg = logHeightRef.current;

            if (dragging === "nl") {
                const maxNl = containerH - DRAG_OVERHEAD - ed - lg - MIN_RESULTS;
                setNlHeight(Math.max(32, Math.min(maxNl, dragStartVal.current + delta)));
            } else if (dragging === "editor") {
                const maxEd = containerH - DRAG_OVERHEAD - nl - lg - MIN_RESULTS;
                setEditorHeight(Math.max(60, Math.min(maxEd, dragStartVal.current + delta)));
            } else if (dragging === "log") {
                const maxLg = containerH - DRAG_OVERHEAD - nl - ed - MIN_RESULTS;
                setLogHeight(Math.max(28, Math.min(maxLg, dragStartVal.current - delta)));
            }
        };
        const onUp = () => setDragging(null);
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        return () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };
    }, [dragging, DRAG_OVERHEAD]);

    const addLog = useCallback((type: LogEntry["type"], msg: string) => {
        setLogs((prev) => [...prev, { time: nowTime(), type, msg }]);
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }, []);

    const handleGenerate = useCallback(async () => {
        if (!nlInput.trim() || generating) return;
        setGenerating(true);
        addLog("info", `Generating SQL from: "${nlInput}"`);
        try {
            const res = await generateSqlFromNl(connId, nlInput, {
                schema,
                projectId,
            });
            setSql(res.sql);
            addLog("success", "SQL generated successfully.");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog("error", `Generation failed: ${msg}`);
        } finally {
            setGenerating(false);
        }
    }, [nlInput, generating, addLog, connId, schema, projectId]);

    const handleRun = useCallback(async () => {
        const query = sqlRef.current.trim();
        if (!query || running) return;
        setRunning(true);
        setResult(null);
        setError(null);
        setHasQueried(true);
        addLog("info", `Executing: ${query.split("\n")[0]}${query.includes("\n") ? " …" : ""}`);
        try {
            const prefixed = schema && conn?.dbms === "postgresql"
                ? `SET search_path TO "${schema}";\n${query}`
                : query;
            const res = await executeQueryDbConnection(connId, prefixed, undefined, { resultLimit: 500 });
            if (res.success) {
                setResult(res);
                addLog("success", `Query completed: ${res.rowCount} row${res.rowCount !== 1 ? "s" : ""} in ${res.executionTimeMs}ms.`);
            } else {
                setError(res.message ?? "Query failed.");
                addLog("error", res.message ?? "Query failed.");
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
            addLog("error", msg);
        } finally {
            setRunning(false);
        }
    }, [connId, running, addLog]);

    handleRunRef.current = handleRun;

    const handleBeautify = useCallback(() => {
        editorRef.current?.getAction("editor.action.formatDocument")?.run();
    }, []);

    const handleEditorMount = useCallback((editor: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = editor as any;
        editorRef.current = e;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const monaco = (window as any).monaco;
        const ctrlEnter = (monaco?.KeyMod?.CtrlCmd ?? 2048) | (monaco?.KeyCode?.Enter ?? 3);
        e.addCommand(ctrlEnter, () => handleRunRef.current());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e.onDidChangeCursorPosition((ev: any) => {
            setCursorPos({ line: ev.position.lineNumber, col: ev.position.column });
        });
    }, []);

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                conn ? (
                    <div className="flex items-center gap-2">
                        <Database size={14} style={{ color: DBMS_COLORS[conn.dbms] ?? "#666" }} />
                        <span className="text-xs font-medium">{conn.name}</span>
                        <span className="text-xs text-gray-400 font-normal">
                            {DBMS_LABELS[conn.dbms] ?? conn.dbms} · {conn.host}:{conn.port}/{conn.database}
                        </span>
                        {conn.ssl && (
                            <span className="flex items-center gap-0.5 text-xs text-green-600 font-normal">
                                <Lock size={10} />SSL
                            </span>
                        )}
                        {schema && (
                            <span className="text-xs text-gray-400 font-normal font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                {schema}
                            </span>
                        )}
                    </div>
                ) : <span>Query Generator</span>
            }
            width={1000}
            footer={null}
            destroyOnClose
            centered
            styles={{ body: { padding: 0, height: "calc(90vh - 55px)", overflow: "hidden" } }}
        >
            <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
            {/* NL Input */}
            <div className="px-3 pt-2 flex-shrink-0 bg-gray-50" style={{ height: nlHeight }}>
                <div className="flex items-start gap-2 h-full">
                    <TextArea
                        placeholder='Describe what you want, e.g. "Show all users created in the last 7 days"'
                        value={nlInput}
                        onChange={(e) => setNlInput(e.target.value)}
                        variant="borderless"
                        style={{ height: nlHeight - 16, resize: "none" }}
                        className="!text-xs !bg-transparent flex-1 !p-0"
                    />
                </div>
            </div>
            {/* NL toolbar */}
            <div className="flex items-center justify-end px-3 h-9 border-t border-b border-gray-100 bg-gray-50 flex-shrink-0">
                <Button
                    type="primary"
                    size="small"
                    className="!h-6 !px-3 !text-[11px]"
                    icon={<Sparkles size={11} />}
                    loading={generating}
                    onClick={handleGenerate}
                    disabled={!nlInput.trim()}
                >
                    Generate
                </Button>
            </div>
            {/* NL drag handle */}
            <div
                className={`h-1.5 flex-shrink-0 flex items-center justify-center cursor-row-resize select-none transition-colors border-b border-gray-100 ${dragging === "nl" ? "bg-blue-200" : "bg-gray-50 hover:bg-blue-100"}`}
                onMouseDown={startDrag("nl", nlHeight)}
            >
                <GripHorizontal size={10} className="text-gray-300" />
            </div>

            {/* SQL Editor — flex-1 when no results, fixed height when results are shown */}
            <div
                className={hasQueried ? "flex-shrink-0" : "flex-1 min-h-0"}
                style={hasQueried ? { height: editorHeight } : undefined}
            >
                <Editor
                    height={hasQueried ? editorHeight : "100%"}
                    language="sql"
                    value={sql}
                    onChange={(v) => setSql(v ?? "")}
                    onMount={handleEditorMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        scrollBeyondLastLine: false,
                        lineNumbers: "on",
                        lineNumbersMinChars: 2,
                        lineDecorationsWidth: 4,
                        wordWrap: "on",
                        renderLineHighlight: "none",
                        scrollbar: { vertical: "hidden", horizontal: "hidden" },
                        overviewRulerLanes: 0,
                    }}
                    theme="light"
                />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 h-9 border-t border-b border-gray-100 bg-gray-50 flex-shrink-0">
                <span className="text-[11px] text-gray-400 font-mono">
                    line {cursorPos.line}, col {cursorPos.col}
                </span>
                <div className="flex items-center gap-1.5">
                    <Button
                        size="small"
                        className="!h-6 !text-[11px] !px-2"
                        icon={<Wand2 size={11} />}
                        onClick={handleBeautify}
                    >
                        Beautify
                    </Button>
                    <Button
                        type="primary"
                        size="small"
                        className="!h-6 !text-[11px] !px-3"
                        icon={<Play size={11} />}
                        loading={running}
                        onClick={handleRun}
                        disabled={!sql.trim()}
                    >
                        Run
                    </Button>
                </div>
            </div>

            {/* Editor drag handle — only when results are shown */}
            {hasQueried && (
                <div
                    className={`h-1.5 flex-shrink-0 flex items-center justify-center cursor-row-resize select-none transition-colors ${dragging === "editor" ? "bg-blue-200" : "bg-gray-100 hover:bg-blue-100"}`}
                    onMouseDown={startDrag("editor", editorHeight)}
                >
                    <GripHorizontal size={10} className="text-gray-300" />
                </div>
            )}

            {/* Results — only after first query */}
            {hasQueried && (
                <div className="flex-1 min-h-[80px] flex flex-col min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 h-8 border-b border-gray-100 bg-gray-50 flex-shrink-0 text-xs text-gray-500">
                        <span className="font-medium">Results</span>
                        {result && (
                            <>
                                <span className="text-gray-300">·</span>
                                <span className="flex items-center gap-1 text-gray-400">
                                    <Rows3 size={11} />{result.rowCount} rows
                                </span>
                                <span className="flex items-center gap-1 text-gray-400">
                                    <Clock size={11} />{result.executionTimeMs}ms
                                </span>
                            </>
                        )}
                    </div>

                    {error && (
                        <div className="px-3 py-1.5 flex-shrink-0 flex items-center gap-1.5 text-xs justify-center">
                            <span className="truncate">No results to display</span>
                        </div>
                    )}

                    <div className="flex-1 min-h-0 overflow-auto">
                        {result && result.columns.length > 0 ? (
                            <table className="w-full text-xs border-collapse">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="px-2 py-1.5 text-gray-300 font-normal text-right w-8 border-r border-gray-100">#</th>
                                        {result.columns.map((col) => (
                                            <th key={col} className="text-left px-2.5 py-1.5 font-medium text-gray-600 whitespace-nowrap border-r border-gray-100 last:border-r-0">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, i) => (
                                        <tr key={i} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                                            <td className="px-2 py-1.5 text-gray-300 border-r border-gray-100 text-right">{i + 1}</td>
                                            {result.columns.map((col) => (
                                                <td
                                                    key={col}
                                                    className="px-2.5 py-1.5 text-gray-700 whitespace-nowrap border-r border-gray-100 last:border-r-0 max-w-[180px] truncate"
                                                    title={String(row[col] ?? "")}
                                                >
                                                    {row[col] === null ? (
                                                        <span className="text-gray-300 italic">NULL</span>
                                                    ) : (
                                                        String(row[col])
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Log drag handle — always visible */}
            <div
                className={`h-1.5 flex-shrink-0 flex items-center justify-center cursor-row-resize select-none transition-colors ${dragging === "log" ? "bg-blue-200" : "bg-gray-100 hover:bg-blue-100"}`}
                onMouseDown={startDrag("log", logHeight)}
            >
                <GripHorizontal size={10} className="text-gray-300" />
            </div>

            {/* Log — always visible at fixed height */}
            <div
                className="flex flex-col overflow-hidden border-t border-gray-100 bg-white flex-shrink-0"
                style={{ height: logHeight }}
            >
                <div className="flex items-center justify-between px-3 h-7 border-b border-gray-100 flex-shrink-0 bg-gray-50">
                    <span className="text-xs font-medium text-gray-400">Log</span>
                    <button onClick={() => setLogs([])} className="!text-xs cursor-pointer text-gray-400 hover:text-gray-600 transition-colors">
                        Clear
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5 font-mono">
                    {logs.length === 0 ? (
                        <span className="text-xs text-gray-600">No log entries.</span>
                    ) : (
                        logs.map((entry, i) => (
                            <div key={i} className="flex items-start gap-1.5 mb-1 last:mb-0">
                                <span className="text-gray-600 text-[10px] leading-4 shrink-0">{entry.time}</span>
                                {entry.type === "success" && <CheckCircle size={11} className="text-green-400 shrink-0 mt-0.5" />}
                                {entry.type === "error" && <XCircle size={11} className="text-red-400 shrink-0 mt-0.5" />}
                                {entry.type === "info" && <Info size={11} className="text-blue-400 shrink-0 mt-0.5" />}
                                <span className={`text-[11px] leading-4 break-all ${
                                    entry.type === "success" ? "text-green-600" :
                                    entry.type === "error" ? "text-red-500" :
                                    "text-gray-500"
                                }`}>
                                    {entry.msg}
                                </span>
                            </div>
                        ))
                    )}
                    <div ref={logsEndRef} />
                </div>
            </div>
            </div>
        </Modal>
    );
}
