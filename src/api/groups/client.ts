import {
  PROXY_WORKSPACE_GROUPS,
  PROXY_WORKSPACE_GROUP,
  PROXY_WORKSPACE_GROUP_MEMBER,
} from "@/api";
import { apiDelete, apiGet, apiPost } from "@/lib/clientFetch";

export interface GroupMember {
  userId: string;
  fullName: string;
  email: string;
}

export interface Group {
  id: string;
  name: string;
  createdAt: string;
  members: GroupMember[];
}

export function getGroups(workspaceId: string) {
  return apiGet<Group[]>(PROXY_WORKSPACE_GROUPS(workspaceId));
}

export function createGroup(workspaceId: string, name: string) {
  return apiPost<Group, { name: string }>(PROXY_WORKSPACE_GROUPS(workspaceId), {
    name,
  });
}

export function deleteGroup(workspaceId: string, groupId: string) {
  return apiDelete<{ message: string }>(
    PROXY_WORKSPACE_GROUP(workspaceId, groupId),
  );
}

export function addGroupMember(
  workspaceId: string,
  groupId: string,
  targetUserId: string,
) {
  return apiPost<{ groupId: string; userId: string }, Record<string, never>>(
    PROXY_WORKSPACE_GROUP_MEMBER(workspaceId, groupId, targetUserId),
    {},
  );
}

export function removeGroupMember(
  workspaceId: string,
  groupId: string,
  targetUserId: string,
) {
  return apiDelete<{ message: string }>(
    PROXY_WORKSPACE_GROUP_MEMBER(workspaceId, groupId, targetUserId),
  );
}
