import useSWRMutation from "swr/mutation";
import { apiPost } from "@/lib/clientFetch";
import { PROXY_PROJECTS } from "@/api";
import { CreateProjectRequest, ProjectResponse } from "@/types/projects.type";
import { getActiveWorkspaceId } from "@/utils/active-workspace";

export async function createProject(body: CreateProjectRequest) {
    const url = PROXY_PROJECTS;
    const res = await apiPost<ProjectResponse>(url, {
        ...body,
        workspaceId: body.workspaceId ?? getActiveWorkspaceId(),
    });
    return res;
}

export function useCreateProject() {
    const { trigger, data, error, isMutating } = useSWRMutation(
        "create-project",
        async (_key: string, { arg }: { arg: CreateProjectRequest }) => {
            return await createProject(arg);
        }
    );

    return {
        create: (body: CreateProjectRequest) => trigger(body),
        data,
        error,
        isLoading: isMutating,
    };
}
