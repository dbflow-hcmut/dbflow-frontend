"use client";

import React from "react";
import { Modal, Tag } from "antd";
import { Layers, Sparkles, Table2, Wand2 } from "lucide-react";

interface SeedDataModalProps {
    open: boolean;
    onClose: () => void;
    connName?: string;
}

const PLANNED_FEATURES = [
    {
        icon: <Table2 size={14} className="text-orange-400" />,
        title: "Select tables to seed",
        desc: "Pick which tables you want to generate data for.",
    },
    {
        icon: <Wand2 size={14} className="text-purple-400" />,
        title: "AI-generated realistic data",
        desc: "Claude generates contextual, type-aware sample rows.",
    },
    {
        icon: <Sparkles size={14} className="text-blue-400" />,
        title: "One-click insert",
        desc: "Preview the INSERT statements then apply directly to the DB.",
    },
];

export default function SeedDataModal({ open, onClose, connName }: SeedDataModalProps) {
    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <div className="flex items-center gap-2">
                    <Layers size={16} className="text-orange-500" />
                    <span>Seed Data</span>
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
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
                    <Layers size={24} className="text-orange-400" />
                </div>

                <div>
                    <div className="font-semibold text-gray-800 mb-1">Coming soon</div>
                    <p className="text-sm text-gray-500 max-w-sm">
                        Seed Data will let you generate and insert realistic sample data
                        into your connected database directly from the schema.
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
