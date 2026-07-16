"use client";

import React from "react";
import SqlWorkbenchModal from "@/components/EditProject/features/dbms/shared/SqlWorkbenchModal";
import type { PhysicalModelPayload } from "@/components/EditProject/utils/physical-model.builder";

interface QueryExecutorModalProps {
    open: boolean;
    onClose: () => void;
    projectId: string;
    schemaId: string;
    /** Physical schema model.json — grounds the AI SQL generator. */
    model?: PhysicalModelPayload | null;
}

export default function QueryExecutorModal(props: QueryExecutorModalProps) {
    return (
        <SqlWorkbenchModal
            {...props}
            inputIntent="text_to_sql"
            title="Query Generator"
            nlPlaceholder='Describe what you want, e.g. "Show all users created in the last 7 days"'
            defaultSql={"SELECT * FROM users\nLIMIT 10;"}
            noModelTooltip="Open a physical schema to enable AI SQL generation"
        />
    );
}
