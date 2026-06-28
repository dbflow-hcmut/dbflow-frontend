import useSWRMutation from "swr/mutation";
import { mutate } from "swr";
import { apiPost, apiPut } from "@/lib/clientFetch";
import { PROXY_PROJECT_SCHEMAS, PROXY_SCHEMA_MODEL } from "@/api";
import { ProjectSchemasResponse } from "@/types/projects.type";
import { SchemaType } from "@/utils/constants";
import { revalidateProjectSchemas } from "@/app/projects/actions";

export interface CreateSchemaRequest {
    name: string;
    type: SchemaType | string;
    dbms?: string;
}

export async function createSchema(
    projectId: string,
    body: CreateSchemaRequest
): Promise<ProjectSchemasResponse> {
    const url = PROXY_PROJECT_SCHEMAS(projectId);
    const res = await apiPost<ProjectSchemasResponse, CreateSchemaRequest>(url, body);
    return res;
}

export function useCreateSchema(projectId: string | null) {
    const { trigger, data, error, isMutating } = useSWRMutation(
        projectId ? `create-schema-${projectId}` : null,
        async (_key: string, { arg }: { arg: CreateSchemaRequest }) => {
            if (!projectId) throw new Error("Project ID is required");
            const result = await createSchema(projectId, arg);
            await mutate(`schemas-${projectId}`);
            await revalidateProjectSchemas(projectId);
            return result;
        }
    );

    return {
        create: (body: CreateSchemaRequest) => trigger(body),
        data,
        error,
        isLoading: isMutating,
    };
}

/**
 * Save model JSON directly to S3 for a schema.
 * Used by AI chat to persist generated model data before the user opens the editor.
 */
export async function saveSchemaModel(
    projectId: string,
    schemaId: string,
    modelData: Record<string, unknown>
): Promise<{ message: string }> {
    const url = PROXY_SCHEMA_MODEL(projectId, schemaId);
    const res = await apiPut<{ message: string }, Record<string, unknown>>(url, modelData);
    return res;
}

