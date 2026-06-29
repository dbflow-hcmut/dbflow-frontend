"use client";

import React from "react";
import { Modal, Tag } from "antd";
import { RefreshCcw, GitCompare, Shield, Zap } from "lucide-react";

interface SyncSchemaModalProps {
    open: boolean;
    onClose: () => void;
    connName?: string;
}

const PLANNED_FEATURES = [
    {
        icon: <GitCompare size={14} className="text-green-400" />,
        title: "Diff live DB vs your design",
        desc: "See exactly what columns, tables, and constraints differ.",
    },
    {
        icon: <Shield size={14} className="text-blue-400" />,
        title: "Non-destructive by default",
        desc: "Only pulls additions — never deletes your local schema.",
    },
    {
        icon: <Zap size={14} className="text-yellow-400" />,
        title: "One-click merge",
        desc: "Apply the diff to your visual diagram with a single action.",
    },
];

export default function SyncSchemaModal({ open, onClose, connName }: SyncSchemaModalProps) {
    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <div className="flex items-center gap-2">
                    <RefreshCcw size={16} className="text-green-500" />
                    <span>Sync Schema</span>
                    {connName && (
                        <Tag className="!text-xs !font-normal !ml-1">{connName}</Tag>
                    )}
                </div>
            }
            width={560}
            footer={null}
            destroyOnClose
        >
            <div className="py-4 flex flex-col items-center text-center gap-6">
                <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                    <RefreshCcw size={24} className="text-green-400" />
                </div>

                <div>
                    <div className="font-semibold text-gray-800 mb-1">Coming soon</div>
                    <p className="text-sm text-gray-500 max-w-sm">
                        Sync Schema pulls the latest structure from your live database
                        and merges it into your visual diagram automatically.
                    </p>
                </div>

                <div className="w-full flex flex-col gap-2.5 text-left">
                    {PLANNED_FEATURES.map((f) => (
                        <div
                            key={f.title}
                            className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                        >
                            <div className="mt-0.5 shrink-0">{f.icon}</div>
                            <div>
                                <div className="text-xs font-medium text-gray-700 mb-0.5">{f.title}</div>
                                <div className="text-xs text-gray-400">{f.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
