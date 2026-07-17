import ProjectsList from "@/components/ProjectsList";
import { PROXY_PROJECTS } from "@/api";
import { serverFetchJSON } from "@/lib/serverFetch";
import { ProjectsResponse } from "@/types/projects.type";

interface ProjectsPageProps {
    searchParams: Promise<{
        page?: string;
        limit?: string;
        keyword?: string;
        workspaceId?: string;
    }>;
}

async function fetchProjects(page: number = 1, limit: number = 9, keyword?: string, workspaceId?: string) {
    try {
        let url = PROXY_PROJECTS;
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("limit", limit.toString());
        if (keyword) {
            params.set("keyword", keyword);
        }
        if (workspaceId) {
            params.set("workspaceId", workspaceId);
        }
        url = `${url}?${params.toString()}`;
        
        const data = await serverFetchJSON(url);
        if (data && typeof data === "object" && "items" in data && "pagination" in data) {
            return data as ProjectsResponse;
        }
        return { items: [], pagination: { page: 1, limit: 9, total: 0, totalPages: 0 } };
    } catch (error) {
        if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
            throw error;
        }
        console.error("Error fetching projects:", error);
        return { items: [], pagination: { page: 1, limit: 9, total: 0, totalPages: 0 } };
    }
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
    const params = await searchParams;
    const page = parseInt(params.page || "1", 10);
    const limit = parseInt(params.limit || "9", 10);
    const keyword = params.keyword;
    const workspaceId = params.workspaceId;
    
    const result = await fetchProjects(page, limit, keyword, workspaceId);
    return (
        <ProjectsList 
            initialProjects={result.items} 
            initialPagination={result.pagination}
        />
    );
}
