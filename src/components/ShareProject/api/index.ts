import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/clientFetch";
import { PROXY_PROJECT_DETAIL } from "@/api";
import { ISharedPermissionResponse } from "@/types/projects.type";

// Fetch all shared permissions for a project (list of users + project visibility)
export function useFetchSharedPermission(projectId: string) {
    const { data, isLoading, error, mutate } = useSWR<ISharedPermissionResponse>(
        projectId ? `shared-permissions-${projectId}` : null,
        projectId
            ? async () => {
                  const url = `${PROXY_PROJECT_DETAIL(projectId)}/permissions`;
                  return await apiGet<ISharedPermissionResponse>(url);
              }
            : null,
        { revalidateOnFocus: false }
    );

    return {
        data: data ?? null,
        isLoading,
        error: error as Error | undefined,
        refetch: mutate,
    };
}

// Fetch the current user's own permission for a project
export function useFetchUserPermission(projectId: string) {
    const { data, isLoading, error, mutate } = useSWR<{
        userId: string;
        permission: string;
        canManage: boolean;
    }>(
        projectId ? `user-permission-${projectId}` : null,
        projectId
            ? async () => {
                  const url = `${PROXY_PROJECT_DETAIL(projectId)}/me/permissions`;
                  const res = await apiGet<{
                      permission: string;
                      invitationId?: string;
                      invitePermission?: string;
                      canManage?: boolean;
                  }>(url);
                  return {
                      userId: "",
                      permission: res?.permission ?? "",
                      canManage: res?.canManage ?? false,
                  };
              }
            : null,
        { revalidateOnFocus: false }
    );

    return {
        data: data ?? null,
        isLoading,
        error: error as Error | undefined,
        refetch: mutate,
    };
}

// Update project Group (Team workspace only — creator or workspace Owner/Admin)
export function useUpdateProjectGroup() {
    const { trigger, isMutating } = useSWRMutation(
        "update-project-group",
        async (
            _key: string,
            { arg }: { arg: { projectId: string; groupId: string | null } }
        ) => {
            const url = `${PROXY_PROJECT_DETAIL(arg.projectId)}/group`;
            return await apiPatch<unknown, { groupId: string | null }>(url, {
                groupId: arg.groupId,
            });
        }
    );

    return {
        updateGroup: trigger,
        isLoading: isMutating,
    };
}

// Update project visibility (owner only)
export function useUpdateProjectVisibility() {
    const { trigger, isMutating } = useSWRMutation(
        "update-project-visibility",
        async (
            _key: string,
            { arg }: { arg: { projectId: string; projectMode: string } }
        ) => {
            const url = `${PROXY_PROJECT_DETAIL(arg.projectId)}/visibility`;
            return await apiPatch<unknown, { projectMode: string }>(url, {
                projectMode: arg.projectMode,
            });
        }
    );

    return {
        updateVisibility: trigger,
        isLoading: isMutating,
    };
}

// Update user permission (owner only)
export function useUpdateUserPermission() {
    const { trigger, isMutating } = useSWRMutation(
        "update-user-permission",
        async (
            _key: string,
            {
                arg,
            }: {
                arg: {
                    projectId: string;
                    targetUserId: string;
                    permission: string;
                };
            }
        ) => {
            const url = `${PROXY_PROJECT_DETAIL(arg.projectId)}/permissions/${arg.targetUserId}`;
            return await apiPatch<unknown, { permission: string }>(url, {
                permission: arg.permission,
            });
        }
    );

    return {
        updateUserPermission: trigger,
        isLoading: isMutating,
    };
}

// Remove user access (owner only)
export function useRemoveUserAccess() {
    const { trigger, isMutating } = useSWRMutation(
        "remove-user-access",
        async (
            _key: string,
            {
                arg,
            }: { arg: { projectId: string; email: string } }
        ) => {
            const encodedEmail = encodeURIComponent(arg.email);
            const url = `${PROXY_PROJECT_DETAIL(arg.projectId)}/permissions/${encodedEmail}`;
            return await apiDelete<unknown>(url);
        }
    );

    return {
        removeAccess: trigger,
        isLoading: isMutating,
    };
}

// Invite users to the project (owner only)
export function useInviteUsers() {
    const { trigger, isMutating } = useSWRMutation(
        "invite-users",
        async (
            _key: string,
            {
                arg,
            }: {
                arg: {
                    projectId: string;
                    sendEmail: boolean;
                    message?: string;
                    users: Array<{
                        email: string;
                        invite_permission: string;
                    }>;
                };
            }
        ) => {
            const url = `${PROXY_PROJECT_DETAIL(arg.projectId)}/invitations`;
            return await apiPost<
                unknown,
                {
                    sendEmail: boolean;
                    message?: string;
                    users: Array<{
                        email: string;
                        invite_permission: string;
                    }>;
                }
            >(url, {
                sendEmail: arg.sendEmail,
                message: arg.message,
                users: arg.users,
            });
        }
    );

    return {
        invite: trigger,
        isLoading: isMutating,
    };
}
