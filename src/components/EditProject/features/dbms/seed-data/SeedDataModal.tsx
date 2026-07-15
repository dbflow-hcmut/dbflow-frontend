"use client";

import React from "react";
import SqlWorkbenchModal from "@/components/EditProject/features/dbms/shared/SqlWorkbenchModal";
import type { PhysicalModelPayload } from "@/components/EditProject/utils/physical-model.builder";

interface SeedDataModalProps {
    open: boolean;
    onClose: () => void;
    projectId: string;
    schemaId: string;
    /** Physical schema model.json — grounds the AI seed data generator. */
    model?: PhysicalModelPayload | null;
}

export default function SeedDataModal(props: SeedDataModalProps) {
    return (
        <SqlWorkbenchModal
            {...props}
            inputIntent="seed_data"
            title="Seed Data"
            nlPlaceholder='Describe the sample data you want, e.g. "10 users and 30 orders for an e-commerce store"'
            defaultSql={"-- Describe the sample data you want above, then click Generate"}
            noModelTooltip="Open a physical schema to enable AI seed data generation"
        />
    );
}
