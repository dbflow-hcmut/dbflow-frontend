import { apiDelete } from "@/lib/clientFetch";
import { PROXY_DELETE_SCHEMA } from "@/api";
import { revalidateProjectSchemas } from "@/app/projects/actions";

export async function deleteSchema(projectId: string, schemaId: string): Promise<void> {
    const url = PROXY_DELETE_SCHEMA(projectId, schemaId);
    await apiDelete<void>(url);
    // Revalidate project schemas cache
    await revalidateProjectSchemas(projectId);
}


