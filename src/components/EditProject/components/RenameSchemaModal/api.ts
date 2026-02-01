import { apiPatch } from "@/lib/clientFetch";
import { PROXY_UPDATE_SCHEMA } from "@/api";
import { revalidateProjectSchemas } from "@/app/projects/actions";

export interface UpdateSchemaRequest {
    name: string;
}

export async function updateSchemaName(
    projectId: string,
    schemaId: string,
    name: string
): Promise<void> {
    const url = PROXY_UPDATE_SCHEMA(projectId, schemaId);
    await apiPatch<void, UpdateSchemaRequest>(url, { name });
    // Revalidate project schemas cache
    await revalidateProjectSchemas(projectId);
}

