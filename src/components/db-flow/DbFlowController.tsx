"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DB_FLOW_CONFIGS, type DbFlowName, type DbFlowEvent, type DbFlowStep, type DbFlowStepConfig } from "./db-flow-config";
import { useDbFlow } from "./useDbFlow";
import DBConnectionModal from "@/components/DBConnectionModal";
import SchemaExportModal from "@/components/EditProject/features/dbms/schema-export/SchemaExportModal";
import type { PhysicalModelPayload } from "@/components/EditProject/utils/physical-model.builder";
import ConnectDbStep from "./steps/ConnectDbStep";
import QuerySeedHubStep from "./steps/QuerySeedHubStep";
import SyncSchemaStep from "./steps/SyncSchemaStep";
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

interface DbFlowControllerProps {
    flow: DbFlowName;
    open: boolean;
    onClose: () => void;
    projectId: string | null;
    /** Currently-open schema id — required for 'ai-tools' (Run targets this schema's sandbox). */
    schemaId?: string | null;
    /** Physical model payload — required for 'apply-schema' (schema export) and
     *  optionally provided for 'ai-tools' (grounds AI SQL generation). */
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
    schemaId,
    model,
    onNewSchemaCreated,
}: DbFlowControllerProps) {
    const { step, dispatch, goTo } = useDbFlow(flow, open, projectId);
    const [syncingSchema, setSyncingSchema] = useState(false);

    // Reset syncing state whenever the flow closes
    useEffect(() => {
        if (!open) setSyncingSchema(false);
    }, [open]);

    // Keep connection data alive only for the sync-schema step — the
    // ai-tools flow's feature steps (query-executor/seed-data) run against
    // the schema's sandbox now, not a live connection.
    const { data: projectConns } = useProjectDbConnections(
        open && step === "sync-schema" ? projectId : null,
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

            {/* Step: ai-tools — only relevant in the 'ai-tools' flow */}
            <QuerySeedHubStep
                open={step === "ai-tools"}
                onClose={() => send("closed")}
                onOpenQueryExecutor={() => send("open-query-executor")}
                onOpenSeedData={() => send("open-seed-data")}
                projectId={projectId}
                schemaId={schemaId}
            />

            {/* Step: sync-schema — only relevant in the 'sync-schema' flow */}
            <SyncSchemaStep
                open={step === "sync-schema"}
                projectId={projectId}
                onChangeDb={() => send("change-db")}
                onClose={() => send("closed")}
                onSync={handleSyncSchema}
                isSyncing={syncingSchema}
            />

            {/* Feature steps — rendered at controller level so only 1 modal is ever open */}
            <QueryExecutorModal
                open={step === "query-executor"}
                onClose={() => send("closed")}
                projectId={projectId ?? ""}
                schemaId={schemaId ?? ""}
                model={model}
            />
            <SeedDataModal
                open={step === "seed-data"}
                onClose={() => send("closed")}
                projectId={projectId ?? ""}
                schemaId={schemaId ?? ""}
                model={model}
            />
        </>
    );
}
