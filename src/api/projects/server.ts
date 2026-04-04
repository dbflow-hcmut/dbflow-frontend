import { serverFetchJSON } from "@/lib/serverFetch";
import { PROXY_PROJECT_DETAIL, PROXY_PROJECT_SCHEMAS } from "@/api";
import { ProjectResponse, ProjectSchemasResponse } from "@/types/projects.type";

export async function getProjectPermissionsServer(id: string): Promise<{
    permission: string;
    invitationId?: string;
    invitePermission?: string;
} | null> {
    try {
        const url = `${PROXY_PROJECT_DETAIL(id)}/me/permissions`;
        const data = await serverFetchJSON(url);
        return data as { permission: string; invitationId?: string; invitePermission?: string; } | null;
    } catch (error) {
        if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
            throw error;
        }
        return null;
    }
}

export async function getProjectDetailServer(id: string): Promise<ProjectResponse | null> {
    try {
        const data = await serverFetchJSON(PROXY_PROJECT_DETAIL(id));
        return data as ProjectResponse | null;
    } catch (error) {
        if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
            throw error;
        }
        console.error("Error fetching projects:", error);
        return null;
    }
}

export async function getProjectSchemasServer(id: string): Promise<ProjectSchemasResponse[] | null> {
    try {
        const data = await serverFetchJSON(PROXY_PROJECT_SCHEMAS(id));
        return data as ProjectSchemasResponse[] | null;
    } catch (error) {
        if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
            throw error;
        }
        console.error("Error fetching project schemas:", error);
        return null;
    }
}