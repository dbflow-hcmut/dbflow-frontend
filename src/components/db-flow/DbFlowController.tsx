"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DB_FLOW_CONFIGS, type DbFlowName, type DbFlowEvent, type DbFlowStep, type DbFlowStepConfig } from "./db-flow-config";
import { useDbFlow } from "./useDbFlow";
import DBConnectionModal from "@/components/DBConnectionModal";
import SchemaExportModal from "@/components/EditProject/features/dbms/schema-export/SchemaExportModal";
import type { PhysicalModelPayload } from "@/components/EditProject/utils/physical-model.builder";
import ConnectDbStep from "./steps/ConnectDbStep";
import DbManagementStep from "./steps/DbManagementStep";
import QueryExecutorModal from "@/components/EditProject/features/dbms/query-executor/QueryExecutorModal";
import SeedDataModal from "@/components/EditProject/features/dbms/seed-data/SeedDataModal";
import {
    useProjectDbConnections,
    introspectDbConnection,
    getDbConnectionPlainParams,
    agentIntrospect,
} from "@/api/db-connections/client";
import { createSchema, saveSchemaModel } from "@/components/EditProject/api/client";
import { introspectToPhysicalModel } from "@/utils/introspect-to-model";
import { notificationProvider } from "@/providers/notification";
import { SchemaType } from "@/utils/constants";
import { revalidateProjectSchemas } from "@/app/projects/actions";
import { mutate } from "swr";

const FEATURE_STEPS: DbFlowStep[] = ["query-executor", "seed-data"];

interface DbFlowControllerProps {
    flow: DbFlowName;
    open: boolean;
    onClose: () => void;
    projectId: string | null;
    /** Required only for the 'apply-schema' flow */
    model?: PhysicalModelPayload | null;
    /** Called after a successful sync-schema with the new schema's ID */
    onNewSchemaCreated?: (schemaId: string) => void;
}

/**
 * Renders exactly ONE modal at a time, driven by the flow config.
 * No nested modals — each step replaces the previous.
 */
export default function DbFlowController({
    flow,
    open,
    onClose,
    projectId,
    model,
    onNewSchemaCreated,
}: DbFlowControllerProps) {
    const { step, dispatch, goTo } = useDbFlow(flow, open, projectId);
    const [syncingSchema, setSyncingSchema] = useState(false);
    const [activeSchema, setActiveSchema] = useState("public");

    // Reset syncing state whenever the flow closes
    useEffect(() => {
        if (!open) setSyncingSchema(false);
    }, [open]);

    const isFeatureStep = step !== null && FEATURE_STEPS.includes(step);

    // Keep connection data alive while in feature steps + management step
    const { data: projectConns } = useProjectDbConnections(
        open && (isFeatureStep || step === "db-management") ? projectId : null,
    );
    const linkedConn = projectConns?.[0];

    /** Fire an event; if the config says 'close', also call the parent onClose. */
    const send = useCallback(
        (event: DbFlowEvent) => {
            const config = DB_FLOW_CONFIGS[flow];
            const currentStep = step;
            if (!currentStep) { onClose(); return; }
            const steps = config.steps as Partial<Record<DbFlowStep, DbFlowStepConfig>>;
            const stepConfig = steps[currentStep];
            const next = stepConfig?.on[event];
            if (!next || next === "close") {
                dispatch(event);
                onClose();
            } else {
                dispatch(event);
            }
        },
        [step, flow, dispatch, onClose],
    );

    const goToStep = useCallback((target: DbFlowStep) => goTo(target), [goTo]);

    /** Sync schema: show inline progress in management modal, close after done */
    const handleSyncSchema = useCallback(async (dbSchema: string) => {
        if (!linkedConn || !projectId || syncingSchema) return;

        setSyncingSchema(true);

        const connId = linkedConn.id;
        const isAgent = linkedConn.method === "local_agent";
        const connLabel = linkedConn.name || linkedConn.database || "database";

        try {
            // Get agent params once if needed
            const agentParams = isAgent ? await getDbConnectionPlainParams(connId) : null;

            // Introspect all tables from the selected schema
            const tables = isAgent
                ? await agentIntrospect(agentParams!, dbSchema)
                : await introspectDbConnection(connId, dbSchema);

            // Create new physical schema in current project
            const schemaName = `${connLabel} (synced)`;
            const newSchema = await createSchema(projectId, {
                name: schemaName,
                type: SchemaType.PHYSICAL,
            });

            // Build model & save to S3
            const modelPayload = introspectToPhysicalModel(tables, schemaName);
            await saveSchemaModel(
                projectId,
                newSchema.id,
                modelPayload as unknown as Record<string, unknown>,
            );

            // Close modal and navigate first, then revalidate in background
            onClose();
            onNewSchemaCreated?.(newSchema.id);

            mutate(`schemas-${projectId}`).catch(() => {});
            revalidateProjectSchemas(projectId).catch(() => {});

        } catch (err) {
            setSyncingSchema(false);
            notificationProvider.open({
                type: "error",
                message: "Sync failed",
                description: err instanceof Error ? err.message : "Failed to sync schema",
            });
        }
    }, [linkedConn, projectId, syncingSchema, onClose, onNewSchemaCreated]);

    if (!open) return null;

    return (
        <>
            {/* Step: connect-db — pick an existing connection or go create a new one */}
            <ConnectDbStep
                open={step === "connect-db"}
                projectId={projectId}
                onConnected={() => send("connected")}
                onCreateNew={() => goToStep("create-connection")}
                onClose={() => send("closed")}
            />

            {/* Step: create-connection — form to create a brand-new DB connection */}
            <DBConnectionModal
                open={step === "create-connection"}
                projectId={projectId ?? undefined}
                onSaved={async () => send("created")}
                onBack={() => send("back")}
                onClose={() => send("closed")}
            />

            {/* Step: schema-export — only relevant in the 'apply-schema' flow */}
            {model !== undefined && (
                <SchemaExportModal
                    isOpen={step === "schema-export"}
                    model={model}
                    projectId={projectId}
                    onNeedConnection={() => send("change-db")}
                    onClose={() => send("closed")}
                />
            )}

            {/* Step: db-management — only relevant in the 'db-management' flow */}
            <DbManagementStep
                open={step === "db-management"}
                projectId={projectId}
                onChangeDb={() => send("change-db")}
                onClose={() => send("closed")}
                onOpenQueryExecutor={(schema) => { setActiveSchema(schema); send("open-query-executor"); }}
                onOpenSeedData={() => send("open-seed-data")}
                onOpenSyncSchema={handleSyncSchema}
                isSyncing={syncingSchema}
            />

            {/* Feature steps — rendered at controller level so only 1 modal is ever open */}
            <QueryExecutorModal
                open={step === "query-executor"}
                onClose={() => send("closed")}
                connId={linkedConn?.id ?? ""}
                conn={linkedConn}
                schema={activeSchema}
            />
            <SeedDataModal
                open={step === "seed-data"}
                onClose={() => send("closed")}
                connName={linkedConn?.name}
            />
        </>
    );
}
