import useSWR from "swr";
import { apiGet, apiDelete } from "@/lib/clientFetch";
import { PROXY_PROJECTS, PROXY_DELETE_SCHEMA } from "@/api";
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

