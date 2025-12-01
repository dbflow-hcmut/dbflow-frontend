import useSWRMutation from "swr/mutation";
import { mutate } from "swr";
import { apiPost } from "@/lib/clientFetch";
import { PROXY_PROJECT_SCHEMAS } from "@/api";
import { ProjectSchemasResponse } from "@/types/projects.type";
import { SchemaType } from "@/utils/constants";
import { revalidateProjectSchemas } from "@/app/projects/actions";

export interface CreateSchemaRequest {
    name: string;
    type: SchemaType | string;
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

