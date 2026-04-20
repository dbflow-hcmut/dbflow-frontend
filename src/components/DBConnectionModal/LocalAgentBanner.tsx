"use client";

import React, { useEffect, useState } from "react";
import { Alert, Spin, Tooltip } from "antd";
import { MonitorCheck, MonitorX, Copy, Check } from "lucide-react";

const MACOS_COMMANDS = [
    "chmod +x dbflow-agent-darwin-arm64",
    "xattr -rd com.apple.quarantine dbflow-agent-darwin-arm64",
    "./dbflow-agent-darwin-arm64",
];

function CopyableCode({ lines }: { lines: string[] }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(lines.join("\n")).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    };

    return (
        <div className="relative bg-gray-900 rounded-md px-3 pt-2 pb-2">
            <div className="flex flex-col gap-0.5 pr-8">
                {lines.map((line) => (
                    <code key={line} className="block font-mono text-gray-300 select-all leading-[1.6]" style={{ fontSize: "10px" }}>
                        {line}
                    </code>
                ))}
            </div>
            <Tooltip title={copied ? "Copied!" : "Copy all"}>
                <button
                    onClick={handleCopy}
                    className="absolute top-1.5 right-1.5 p-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
                >
                    {copied
                        ? <Check className="w-3 h-3 text-green-400" />
                        : <Copy className="w-3 h-3" />}
                </button>
            </Tooltip>
        </div>
    );
}

const RELEASE_BASE = "https://github.com/dbflow-hcmut/dbflow-agent/releases/latest/download";

const DOWNLOAD_LINKS = [
    { label: "macOS (Apple Silicon)", href: `${RELEASE_BASE}/dbflow-agent-darwin-arm64` },
    { label: "macOS (Intel)", href: `${RELEASE_BASE}/dbflow-agent-darwin-amd64` },
    { label: "Windows", href: `${RELEASE_BASE}/dbflow-agent-windows-amd64.exe` },
    { label: "Linux", href: `${RELEASE_BASE}/dbflow-agent-linux-amd64` },
];

export type AgentStatus = "checking" | "running" | "not_running";

interface LocalAgentBannerProps {
    onStatusChange?: (status: AgentStatus) => void;
}

const LOCAL_AGENT_PORT = 27182;

export default function LocalAgentBanner({ onStatusChange }: LocalAgentBannerProps) {
    const [status, setStatus] = useState<AgentStatus>("checking");

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 1500);
                const res = await fetch(`http://localhost:${LOCAL_AGENT_PORT}/health`, {
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (!cancelled) {
                    const next: AgentStatus = res.ok ? "running" : "not_running";
                    setStatus(next);
                    onStatusChange?.(next);
                }
            } catch {
                if (!cancelled) {
                    setStatus("not_running");
                    onStatusChange?.("not_running");
                }
            }
        };

        check();

        const interval = setInterval(check, 2000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [onStatusChange]);

    if (status === "checking") {
        return (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                <Spin size="small" />
                <span>Checking for Local Agent…</span>
            </div>
        );
    }

    if (status === "running") {
        return (
            <div className="flex items-center gap-2 py-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">
                    <MonitorCheck className="w-4 h-4" />
                    DBFlow Local Agent running · Port {LOCAL_AGENT_PORT}
                </div>
            </div>
        );
    }

    // not_running
    return (
        <Alert
            type="info"
            showIcon
            icon={<MonitorX className="w-4 h-4 mt-1" />}
            className="!rounded-lg"
            message={
                <span className="font-medium text-sm">DBFlow Local Agent is not running</span>
            }
            description={
                <div className="flex flex-col gap-2 mt-1">
                    <p className="text-[11px] text-gray-500">
                        The Local Agent is a small binary (&lt; 10 MB) that runs on your machine,
                        allowing DBFlow to connect to databases that are only accessible from localhost
                        (such as Docker containers, development databases, etc.).
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[11px] text-gray-500 font-medium">Download:</span>
                        {DOWNLOAD_LINKS.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline"
                            >
                                {link.label}
                            </a>
                        ))}
                    </div>
                    <div className="flex flex-col gap-1">
                        <p className="text-[11px] font-medium text-gray-500">macOS — Run for the first time:</p>
                        <CopyableCode lines={MACOS_COMMANDS} />
                        <p className="text-[10px] text-gray-400">Replace <span className="font-mono">darwin-arm64</span> with <span className="font-mono">darwin-amd64</span> for Intel Macs.</p>
                    </div>
                </div>
            }
        />
    );
}
