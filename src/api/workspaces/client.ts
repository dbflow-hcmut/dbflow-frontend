import {
  PROXY_ACCEPT_WORKSPACE_INVITATION,
  PROXY_WORKSPACE_AUDIT_LOGS,
  PROXY_WORKSPACE_DETAIL,
  PROXY_WORKSPACE_INVITATIONS,
  PROXY_WORKSPACE_LEAVE,
  PROXY_WORKSPACE_MEMBER,
  PROXY_WORKSPACE_MEMBER_ROLE,
  PROXY_WORKSPACE_MEMBERS,
  PROXY_WORKSPACE_TRANSFER_OWNERSHIP,
  PROXY_WORKSPACES,
} from "@/api";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/clientFetch";

export interface WorkspaceSummary {
  id: string;
  type: "personal" | "team";
  name: string;
  slug: string;
  ownerUserId: string;
  status: "active" | "suspended" | "archived";
  currentUserRole: "owner" | "admin" | "billing" | "member" | "viewer";
}

export type WorkspaceRole = "owner" | "admin" | "billing" | "member" | "viewer";

export interface WorkspaceMember {
  userId: string;
  email: string;
  fullName: string;
  avatar: string;
  role: WorkspaceRole;
  status: "active" | "suspended";
  joinedAt: string;
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt?: string;
}

export interface WorkspaceAuditLog {
  id: string;
  workspaceId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
}

export function getWorkspaceAuditLogs(workspaceId: string) {
  return apiGet<WorkspaceAuditLog[]>(PROXY_WORKSPACE_AUDIT_LOGS(workspaceId));
}

export function getWorkspaces() {
  return apiGet<WorkspaceSummary[]>(PROXY_WORKSPACES);
}

export function createTeamWorkspace(name: string) {
  return apiPost<WorkspaceSummary, { name: string }>(PROXY_WORKSPACES, { name });
}

export function getWorkspace(workspaceId: string) {
  return apiGet<WorkspaceSummary>(PROXY_WORKSPACE_DETAIL(workspaceId));
}

export function updateWorkspace(
  workspaceId: string,
  values: { name?: string; avatarKey?: string },
) {
  return apiPatch<WorkspaceSummary, typeof values>(
    PROXY_WORKSPACE_DETAIL(workspaceId),
    values,
  );
}

export function getWorkspaceMembers(workspaceId: string) {
  return apiGet<WorkspaceMember[]>(PROXY_WORKSPACE_MEMBERS(workspaceId));
}

export function getWorkspaceInvitations(workspaceId: string) {
  return apiGet<WorkspaceInvitation[]>(
    PROXY_WORKSPACE_INVITATIONS(workspaceId),
  );
}

export function inviteWorkspaceMember(
  workspaceId: string,
  values: { email: string; role: Exclude<WorkspaceRole, "owner"> },
) {
  return apiPost<WorkspaceInvitation, typeof values>(
    PROXY_WORKSPACE_INVITATIONS(workspaceId),
    values,
  );
}

export function revokeWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
) {
  return apiDelete<{ message: string }>(
    `${PROXY_WORKSPACE_INVITATIONS(workspaceId)}/${invitationId}`,
  );
}

export function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: Exclude<WorkspaceRole, "owner">,
) {
  return apiPatch<WorkspaceMember, { role: Exclude<WorkspaceRole, "owner"> }>(
    PROXY_WORKSPACE_MEMBER_ROLE(workspaceId, userId),
    { role },
  );
}

export function removeWorkspaceMember(workspaceId: string, userId: string) {
  return apiDelete<{ message: string }>(
    PROXY_WORKSPACE_MEMBER(workspaceId, userId),
  );
}

export function leaveWorkspace(workspaceId: string) {
  return apiPost<{ message: string }, Record<string, never>>(
    PROXY_WORKSPACE_LEAVE(workspaceId),
    {},
  );
}

export function transferWorkspaceOwnership(
  workspaceId: string,
  targetUserId: string,
) {
  return apiPost<WorkspaceSummary, { targetUserId: string }>(
    PROXY_WORKSPACE_TRANSFER_OWNERSHIP(workspaceId),
    { targetUserId },
  );
}

export function acceptWorkspaceInvitation(token: string) {
  return apiPost<WorkspaceSummary, { token: string }>(
    PROXY_ACCEPT_WORKSPACE_INVITATION,
    { token },
  );
}
