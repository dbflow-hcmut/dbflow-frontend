"use client";

import React from "react";
import { Modal } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { ChevronRight, Sparkles, Layers, PencilRuler, ShieldCheck, AlertTriangle } from "lucide-react";
import { useSandboxStatus } from "@/api/sandbox/client";

dayjs.extend(relativeTime);

interface QuerySeedHubStepProps {
    open: boolean;
    onClose: () => void;
    onOpenQueryExecutor: () => void;
    onOpenSeedData: () => void;
    projectId: string | null;
    schemaId?: string | null;
}

/**
 * "AI Data Tools" hub — Generate Query and Seed Data.
 * Deliberately has no connection gating: both features work without a
 * live DB connection (query generation is grounded in the physical schema
 * model, not a DB introspect; seed data is generation-only for now).
 */
export default function QuerySeedHubStep({
    open,
    onClose,
    onOpenQueryExecutor,
    onOpenSeedData,
    projectId,
    schemaId,
}: QuerySeedHubStepProps) {
    const { data: sandboxStatus } = useSandboxStatus(open ? projectId : null, open ? schemaId ?? null : null);
    const actions = [
        {
            icon: <Sparkles size={16} />,
            label: "Generate Query",
            desc: "AI-powered SQL query executor",
            onClick: onOpenQueryExecutor,
        },
        {
            icon: <Layers size={16} />,
            label: "Seed Data",
            desc: "Generate and insert sample data",
            onClick: onOpenSeedData,
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            title={
                <div className="flex items-center gap-2">
                    <span className="font-semibold">AI Data Tools</span>
                </div>
            }
            width={650}
            destroyOnHidden
        >
            <div className="flex items-start gap-2 rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2.5 mt-1 mb-4">
                <ShieldCheck size={14} className="text-primary-500 mt-0.5 shrink-0" />
                <div className="text-xs text-primary-700 leading-snug">
                    <p>
                        Runs on an isolated sandbox — a disposable copy of this schema, not your live database.
                        It&apos;s auto-synced whenever the schema changes, so it&apos;s safe to experiment freely.
                    </p>
                    {sandboxStatus && (
                        <p className="mt-1 flex items-center gap-1 font-medium">
                            {sandboxStatus.exists ? (
                                <>
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>
                                        Sandbox ready · last used {dayjs(sandboxStatus.lastUsedAt).fromNow()}
                                    </span>
                                    {!sandboxStatus.inSync && (
                                        <span className="inline-flex items-center gap-1 text-amber-600 ml-1">
                                            <AlertTriangle size={12} />
                                            out of sync, will resync on next run
                                        </span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400" />
                                    <span>Not created yet — will provision on first run</span>
                                </>
                            )}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 pb-3">
                <PencilRuler size={13} />
                <span>Available actions</span>
            </div>

            <div className="flex flex-col gap-2 mb-1">
                {actions.map((item) => (
                    <button
                        key={item.label}
                        onClick={item.onClick}
                        className="group flex items-center justify-between rounded-lg bg-gray-50 px-3.5 py-3 text-left hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-gray-500 group-hover:text-gray-700 transition-colors">
                                {item.icon}
                            </span>
                            <div>
                                <div className="font-medium text-sm leading-none mb-1">{item.label}</div>
                                <div className="text-xs text-gray-400 leading-none">{item.desc}</div>
                            </div>
                        </div>
                        <ChevronRight
                            size={16}
                            className="text-gray-300 group-hover:text-gray-400 group-hover:translate-x-0.5 transition-all"
                        />
                    </button>
                ))}
            </div>
        </Modal>
    );
}
