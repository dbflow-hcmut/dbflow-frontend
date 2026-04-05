import useSWR from "swr";
import { apiGet, apiDelete } from "@/lib/clientFetch";
import { PROXY_PROJECTS, PROXY_DELETE_SCHEMA, PROXY_PROJECT_DETAIL, PROXY_DELETE_PROJECT } from "@/api";
import { ProjectsResponse } from "@/types/projects.type";

export async function getProjects(page: number = 1, limit: number = 9, keyword?: string) {
    const url = new URL(PROXY_PROJECTS, typeof window !== "undefined" ? window.location.origin : "");
    url.searchParams.set("page", page.toString());
    url.searchParams.set("limit", limit.toString());
    if (keyword) {
        url.searchParams.set("keyword", keyword);
    }
    const res = await apiGet<ProjectsResponse>(url.toString());
    return res;
}

export function useProjects(page: number = 1, limit: number = 9, keyword?: string, enabled: boolean = true) {
    const { data, isLoading, error } = useSWR<ProjectsResponse>(
        enabled ? `projects-${page}-${limit}-${keyword || ""}` : null,
        enabled ? async () => {
            return await getProjects(page, limit, keyword);
        } : null,
        { revalidateOnFocus: false }
    );

    return {
        data: data ?? null,
        isLoading,
        error: error as Error | undefined,
    };
}

export async function deleteSchema(projectId: string, schemaId: string): Promise<void> {
    const url = PROXY_DELETE_SCHEMA(projectId, schemaId);
    await apiDelete<void>(url);
}

export async function deleteProject(projectId: string): Promise<void> {
    const url = PROXY_DELETE_PROJECT(projectId);
    await apiDelete<void>(url);
}


export async function checkSchemaExistence(projectId: string, schemaId: string): Promise<boolean> {
    try {
        const url = `${PROXY_PROJECTS}/${projectId}/schemas/${schemaId}`;
        await apiGet(url);
        return true;
    } catch {
        return false;
    }
}

export async function getProjectPermissions(projectId: string): Promise<{
    permission: string;
    invitationId?: string;
    invitePermission?: string;
} | null> {
    try {
        const url = `${PROXY_PROJECT_DETAIL(projectId)}/me/permissions`;
        const res = await apiGet<{
            permission: string;
            invitationId?: string;
            invitePermission?: string;
        }>(url);
        return res;
    } catch {
        return null;
    }
}

