"use client";

import {
  getWorkspace,
  getWorkspaceAuditLogs,
  getWorkspaceInvitations,
  getWorkspaceMembers,
  inviteWorkspaceMember,
  leaveWorkspace,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  transferWorkspaceOwnership,
  updateWorkspace,
  updateWorkspaceMemberRole,
  WorkspaceAuditLog,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "@/api/workspaces/client";
import { getUserMe } from "@/api/users/client";
import {
  AiUsageBreakdownEntry,
  BillingOrder,
  createStripeBillingPortal,
  getBillingOrders,
  getWorkspaceAiUsageBreakdown,
  getWorkspaceEntitlements,
  WorkspaceEntitlements,
} from "@/api/subscriptions/client";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  getGroups,
  Group,
  removeGroupMember,
} from "@/api/groups/client";
import { notificationProvider } from "@/providers/notification";
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  type TabsProps,
  Progress,
} from "antd";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { formatBytes } from "@/utils/functions";
import LoadingIndicator from "@/components/LoadingIndicator";
import { clearActiveWorkspaceId } from "@/utils/active-workspace";

type Props = { workspaceId: string; embedded?: boolean };
type WorkspaceTab = "general" | "plan" | "orders" | "members" | "invitations" | "groups" | "activity";
type InviteValues = {
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
};

const ASSIGNABLE_ROLES: Exclude<WorkspaceRole, "owner" | "billing">[] = [
  "admin",
  "member",
  "viewer",
];

const ROLE_DESCRIPTIONS: Record<
  Exclude<WorkspaceRole, "owner" | "billing">,
  string
> = {
  admin: "Manages members, projects, and workspace settings.",
  member: "Creates and edits projects, cannot manage members.",
  viewer: "Read-only access to shared projects.",
};

function StatusPill({ value }: { value: string }) {
  const normalizedValue = value.toLowerCase();
  const colorClass = ["active", "paid", "completed", "success"].includes(normalizedValue)
    ? "bg-emerald-50 text-emerald-700"
    : ["pending", "trialing", "processing"].includes(normalizedValue)
      ? "bg-amber-50 text-amber-700"
      : "bg-gray-100 text-gray-700";

  return (
    <span className={`inline-flex min-h-9 items-center rounded-xl px-3 text-[13px] font-semibold capitalize ${colorClass}`}>
      {value}
    </span>
  );
}

function describeAuditTarget(log: WorkspaceAuditLog): string {
  const data = (log.afterData ?? log.beforeData) as
    | Record<string, unknown>
    | null;
  const str = (value: unknown) => (typeof value === "string" ? value : undefined);

  if (data) {
    switch (log.targetType) {
      case "group_member": {
        const userLabel = str(data.userName) ?? str(data.userEmail);
        const groupLabel = str(data.groupName);
        if (userLabel || groupLabel) {
          return `${userLabel ?? "Unknown user"} in ${groupLabel ?? "Unknown group"}`;
        }
        break;
      }
      case "workspace_member": {
        const userLabel = str(data.userName) ?? str(data.userEmail);
        if (userLabel) return userLabel;
        break;
      }
      case "group": {
        const name = str(data.name);
        if (name) return name;
        break;
      }
      case "workspace_invitation": {
        const email = str(data.email);
        if (email) return email;
        break;
      }
      case "workspace": {
        const ownerLabel = str(data.ownerName) ?? str(data.ownerEmail);
        if (ownerLabel) return `Owner → ${ownerLabel}`;
        break;
      }
    }
  }
  return `${log.targetType} · ${log.targetId}`;
}

export default function WorkspaceSettings({ workspaceId, embedded = false }: Props) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceSummary>();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements>();
  const [aiUsageBreakdown, setAiUsageBreakdown] = useState<AiUsageBreakdownEntry[]>([]);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [auditLogs, setAuditLogs] = useState<WorkspaceAuditLog[]>();
  const [groups, setGroups] = useState<Group[]>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string>();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("general");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [generalForm] = Form.useForm<{ name: string }>();
  const [inviteForm] = Form.useForm<InviteValues>();
  const [transferForm] = Form.useForm<{ targetUserId: string }>();
  const [createGroupForm] = Form.useForm<{ name: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceData, user, entitlementData, orderData] =
        await Promise.all([
          getWorkspace(workspaceId),
          getUserMe(),
          getWorkspaceEntitlements(workspaceId),
          getBillingOrders(workspaceId).catch(() => []),
        ]);
      const memberData = await getWorkspaceMembers(workspaceId);
      const invitationData = entitlementData.access.restricted
        ? []
        : await getWorkspaceInvitations(workspaceId).catch(() => []);
      const aiUsageData =
        workspaceData.type === "team"
          ? await getWorkspaceAiUsageBreakdown(workspaceId).catch(() => [])
          : [];
      setWorkspace(workspaceData);
      setMembers(memberData);
      setInvitations(invitationData);
      setCurrentUserId(user.id);
      setEntitlements(entitlementData);
      setAiUsageBreakdown(aiUsageData);
      setOrders(orderData);
      generalForm.setFieldsValue({ name: workspaceData.name });
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to load workspace",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [generalForm, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshMembers = useCallback(async () => {
    const memberData = await getWorkspaceMembers(workspaceId);
    setMembers(memberData);
  }, [workspaceId]);

  const canManageWorkspace = ["owner", "admin"].includes(
    workspace?.currentUserRole ?? "",
  );
  const canManageTeam =
    canManageWorkspace && entitlements?.plan.features?.team_roles === true;
  const canViewBilling = ["owner", "billing"].includes(
    workspace?.currentUserRole ?? "",
  );
  useEffect(() => {
    if (!canViewBilling && activeTab === "orders") setActiveTab("general");
  }, [activeTab, canViewBilling]);
  useEffect(() => {
    if (activeTab === "activity" && canManageWorkspace && auditLogs === undefined) {
      void getWorkspaceAuditLogs(workspaceId)
        .then(setAuditLogs)
        .catch(() => setAuditLogs([]));
    }
  }, [activeTab, canManageWorkspace, auditLogs, workspaceId]);

  const loadGroups = useCallback(async () => {
    try {
      setGroups(await getGroups(workspaceId));
    } catch {
      setGroups([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (activeTab === "groups" && canManageWorkspace && groups === undefined) {
      void loadGroups();
    }
  }, [activeTab, canManageWorkspace, groups, loadGroups]);
  const showUpgrade =
    entitlements &&
    (entitlements.access.restricted ||
      ["free", "team_free"].includes(entitlements.plan.code));
  const isOwner = workspace?.currentUserRole === "owner";

  const handleUpdateGeneral = async (values: { name: string }) => {
    setSaving(true);
    try {
      const updated = await updateWorkspace(workspaceId, values);
      setWorkspace((current) =>
        current ? { ...current, ...updated } : updated,
      );
      notificationProvider.open({
        type: "success",
        message: "Workspace updated",
      });
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to update workspace",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (values: InviteValues) => {
    setSaving(true);
    try {
      await inviteWorkspaceMember(workspaceId, values);
      setInviteOpen(false);
      inviteForm.resetFields();
      await load();
      notificationProvider.open({
        type: "success",
        message: "Invitation sent",
      });
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to invite member",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (
    member: WorkspaceMember,
    role: Exclude<WorkspaceRole, "owner">,
  ) => {
    setMemberActionId(member.userId);
    try {
      await updateWorkspaceMemberRole(workspaceId, member.userId, role);
      await refreshMembers();
      notificationProvider.open({
        type: "success",
        message: "Member role updated",
      });
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to update role",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setMemberActionId(undefined);
    }
  };

  const handleRemove = (member: WorkspaceMember) => {
    Modal.confirm({
      title: `Remove ${member.fullName || member.email}?`,
      content: "This user will lose access to team projects.",
      okText: "Remove",
      okButtonProps: { danger: true },
      async onOk() {
        setMemberActionId(member.userId);
        try {
          await removeWorkspaceMember(workspaceId, member.userId);
          await refreshMembers();
        } finally {
          setMemberActionId(undefined);
        }
      },
    });
  };

  const handleLeave = () => {
    Modal.confirm({
      title: "Leave workspace?",
      content: "You will lose access to projects owned by this workspace.",
      okText: "Leave",
      okButtonProps: { danger: true },
      async onOk() {
        await leaveWorkspace(workspaceId);
        clearActiveWorkspaceId();
        router.push("/projects");
      },
    });
  };

  const handleCreateGroup = async (values: { name: string }) => {
    setSaving(true);
    try {
      await createGroup(workspaceId, values.name);
      setCreateGroupOpen(false);
      createGroupForm.resetFields();
      await loadGroups();
      notificationProvider.open({ type: "success", message: "Group created" });
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to create group",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGroup = (group: Group) => {
    Modal.confirm({
      title: `Delete "${group.name}"?`,
      content:
        "Projects scoped to this group become visible to the whole team again.",
      okText: "Delete",
      okButtonProps: { danger: true },
      async onOk() {
        await deleteGroup(workspaceId, group.id);
        await loadGroups();
      },
    });
  };

  const handleAddGroupMember = async (group: Group, targetUserId: string) => {
    try {
      await addGroupMember(workspaceId, group.id, targetUserId);
      await loadGroups();
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to add member",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const handleRemoveGroupMember = async (group: Group, targetUserId: string) => {
    await removeGroupMember(workspaceId, group.id, targetUserId);
    await loadGroups();
  };

  const transferTargets = useMemo(
    () =>
      members.filter(
        (member) =>
          member.userId !== currentUserId && member.status === "active",
      ),
    [currentUserId, members],
  );

  const handleTransfer = async (values: { targetUserId: string }) => {
    setSaving(true);
    try {
      await transferWorkspaceOwnership(workspaceId, values.targetUserId);
      setTransferOpen(false);
      transferForm.resetFields();
      await load();
      notificationProvider.open({
        type: "success",
        message: "Ownership transferred",
      });
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to transfer ownership",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const renderUsage = (
    label: string,
    used: number,
    limit: number | null | undefined,
    formatValue: (value: number) => string = (value) => value.toLocaleString(),
  ) => (
    <div className="border-b border-gray-100 py-4">
      <div className="mb-2 flex justify-between text-sm text-gray-700">
        <span className="font-medium">{label}</span>
        <span className="text-gray-500">
          {formatValue(used)}/{limit != null ? formatValue(limit) : "Unlimited"}
        </span>
      </div>
      <Progress
        size="small"
        strokeColor="#42a5f5"
        percent={
          limit
            ? Math.min(100, Math.round((used / limit) * 100))
            : 0
        }
      />
    </div>
  );

  if (loading) {
    return <LoadingIndicator fullArea label="Loading workspace settings" />;
  }

  if (!workspace) return null;

  const memberColumns = [
    {
      title: "Member",
      key: "member",
      render: (_: unknown, member: WorkspaceMember) => (
        <div>
          <div className="font-medium text-gray-900">{member.fullName}</div>
          <div className="text-xs text-gray-500">{member.email}</div>
        </div>
      ),
    },
    {
      title: "Role",
      key: "role",
      render: (_: unknown, member: WorkspaceMember) =>
        member.role === "owner" || !canManageTeam ? (
          <StatusPill value={member.role} />
        ) : (
          <Select
            size="small"
            value={member.role}
            popupMatchSelectWidth={false}
            loading={memberActionId === member.userId}
            disabled={memberActionId === member.userId}
            className="!h-9 w-32 [&_.ant-select-arrow]:!translate-y-[1px] [&_.ant-select-selector]:!h-9 [&_.ant-select-selector]:!rounded-xl [&_.ant-select-selector]:!border-0 [&_.ant-select-selector]:!bg-gray-100 [&_.ant-select-selector]:!px-3 [&_.ant-select-selector]:!shadow-none [&_.ant-select-selection-item]:!flex [&_.ant-select-selection-item]:!items-center [&_.ant-select-selection-item]:!text-[13px] [&_.ant-select-selection-item]:!font-semibold"
            options={ASSIGNABLE_ROLES.map((role) => ({
              value: role,
              label: role.charAt(0).toUpperCase() + role.slice(1),
            }))}
            optionRender={(option) => (
              <div className="py-0.5">
                <div className="font-medium">{option.label}</div>
                <div className="text-xs text-gray-500">
                  {ROLE_DESCRIPTIONS[option.value as keyof typeof ROLE_DESCRIPTIONS]}
                </div>
              </div>
            )}
            onChange={(role) => void handleRoleChange(member, role)}
          />
        ),
    },
    ...(canManageTeam
      ? [
          {
            title: "Actions",
            key: "actions",
            render: (_: unknown, member: WorkspaceMember) =>
              member.role !== "owner" && member.userId !== currentUserId ? (
                <Button
                  danger
                  loading={memberActionId === member.userId}
                  disabled={memberActionId !== undefined && memberActionId !== member.userId}
                  className="!h-9 !rounded-xl !border-0 !bg-red-50 !px-4 !text-[13px] !font-semibold !shadow-none hover:!bg-red-100"
                  onClick={() => handleRemove(member)}
                >
                  Remove
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div className={embedded ? "w-full" : "mx-auto max-w-5xl px-4 py-8"}>
      {entitlements?.access.restricted && (
        <div className={`mb-6 rounded-lg px-4 py-3 text-sm ${entitlements.access.action === "revoke" ? "bg-rose-50 text-rose-900" : "bg-amber-50 text-amber-900"}`}>
          <div className="font-semibold">
            {entitlements.access.action === "revoke" ? "Subscription access revoked" : "Subscription paused — Free plan active"}
          </div>
          <div className="mt-1">{entitlements.access.message || (entitlements.access.action === "revoke" ? "Your paid subscription was revoked. Existing projects remain available under Free plan limits." : "Your paid subscription is paused. Existing projects remain available under Free plan limits.")}</div>
        </div>
      )}
      <div className="mb-6">
        <h2 className="mb-8 !text-[15px] !font-semibold text-gray-950">Workspace</h2>
        <p className="mt-2 text-sm font-medium text-gray-500">Manage workspace details, access, billing, and usage.</p>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as WorkspaceTab)}
        className="workspace-settings-tabs"
        items={[
          {
            key: "general",
            label: "General",
            children: (
              <div>
                <div className="border-b border-gray-100 pb-5">
                  <p className="mt-1 text-sm font-medium text-gray-500">Basic details about this workspace and your current access.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="py-3">
                      <div className="text-xs !font-semibold uppercase tracking-wide text-gray-500">Current plan</div>
                      <div className="mt-2 font-medium text-gray-900">{entitlements?.plan.name ?? "Free"}</div>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {entitlements?.access.restricted ? "This workspace is currently using Free plan limits." : "Your current subscription and entitlements for this workspace."}
                      </p>
                    </div>
                    <div className="py-3">
                      <div className="text-xs !font-semibold  uppercase tracking-wide text-gray-500">Your role</div>
                      <div className="mt-2 font-medium capitalize text-gray-900">{workspace.currentUserRole}</div>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {canManageWorkspace ? "You can update workspace details and manage access." : "Your access is managed by a workspace owner or admin."}
                      </p>
                    </div>
                    <div className="py-3 sm:col-span-2 lg:col-span-1">
                      <div className="text-xs !font-semibold  uppercase tracking-wide text-gray-500">Status</div>
                      <div color={workspace.status === "active" ? "green" : "default"} className="mt-2 font-medium capitalize text-gray-900">{entitlements?.access.restricted ? "Free plan" : workspace.status}</div>
                      <p className="mt-1 text-xs leading-5 text-gray-500">Active workspaces are available to all permitted members.</p>
                    </div>
                </div>
                </div>

                <Form
                  className="[&_.ant-form-item-explain]:hidden"
                  id="workspace-general-form"
                  form={generalForm}
                  layout="horizontal"
                  labelAlign="left"
                  colon={false}
                  labelCol={{ flex: "auto" }}
                  wrapperCol={{ flex: "0 0 320px" }}
                  onFinish={handleUpdateGeneral}
                  onFinishFailed={({ errorFields }) => notificationProvider.open({
                    type: "error",
                    message: errorFields[0]?.errors[0] ?? "Please check the workspace information",
                  })}
                >
                  <Form.Item
                    className="!mb-0 border-b border-gray-100 [&_.ant-form-item-row]:min-h-14 [&_.ant-form-item-row]:items-center"
                    name="name"
                    label={<span className="text-sm font-medium text-gray-900">Workspace name</span>}
                    rules={[
                      { required: true, message: "Please enter a workspace name" },
                      { min: 2, message: "Workspace name must be at least 2 characters" },
                      { max: 100, message: "Workspace name cannot exceed 100 characters" },
                    ]}
                  >
                    <Input style={{ height: 32 }} className="!border-gray-200 !text-sm" disabled={!canManageWorkspace} />
                  </Form.Item>
                </Form>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {workspace.type === "team" && (
                    <Space wrap size={8}>
                      {isOwner && (
                        <Button className="!h-8 !px-4 !text-xs !font-medium" onClick={() => setTransferOpen(true)}>
                          Transfer ownership
                        </Button>
                      )}
                      {!isOwner && (
                        <Button className="!h-8 !px-4 !text-xs !font-medium" danger onClick={handleLeave}>
                          Leave workspace
                        </Button>
                      )}
                    </Space>
                  )}
                  {canManageTeam && (
                    <Button form="workspace-general-form" className="!h-8 !px-4 !text-xs !font-medium" type="primary" htmlType="submit" loading={saving}>
                      Save changes
                    </Button>
                  )}
                  {showUpgrade && (
                    <Button
                      type="primary"
                      className="!h-8 !px-4 !text-xs !font-semibold"
                      onClick={() => router.push(`/pricing?workspaceId=${encodeURIComponent(workspaceId)}`)}
                    >
                      Upgrade this workspace
                    </Button>
                  )}
                  </div>
              </div>
            ),
          },
          {
            key: "plan",
            label: "Plan & usage",
            children: (
              <div>
                <div className="mb-6">
                  <h2 className="!text-[15px] !font-semibold text-gray-900">Plan & usage</h2>
                  <p className="mt-1 text-sm text-gray-500">Review your current plan and monitor workspace limits.</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    {renderUsage(
                      "Workspace seats",
                      entitlements?.usage.workspaceSeats.used ?? 0,
                      entitlements?.usage.workspaceSeats.limit,
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      {entitlements?.usage.workspaceSeats.active ?? 0} active,{" "}
                      {entitlements?.usage.workspaceSeats.pending ?? 0} pending
                    </div>
                  </div>
                  {renderUsage(
                    "Projects",
                    entitlements?.usage.projects.used ?? 0,
                    entitlements?.usage.projects.limit,
                  )}
                  {renderUsage(
                    "DB connections",
                    entitlements?.usage.dbConnections.used ?? 0,
                    entitlements?.usage.dbConnections.limit,
                  )}
                  {renderUsage(
                    `AI requests${workspace.type === "team" ? " (your seat)" : ""} (${entitlements?.usage.aiRequests.periodKey ?? "current month"})`,
                    (entitlements?.usage.aiRequests.used ?? 0) +
                      (entitlements?.usage.aiRequests.reserved ?? 0),
                    entitlements?.usage.aiRequests.limit,
                  )}
                  {renderUsage(
                    "Document storage",
                    entitlements?.usage.documentStorage.used ?? 0,
                    entitlements?.usage.documentStorage.limit,
                    formatBytes,
                  )}
                  {renderUsage(
                    `Exports (${entitlements?.usage.exports.periodKey ?? "current month"})`,
                    entitlements?.usage.exports.used ?? 0,
                    entitlements?.usage.exports.limit,
                  )}
                  <div>
                    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-gray-100 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-700">Schemas</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {entitlements?.usage.schemas.used ?? 0} currently stored
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        {entitlements?.usage.schemas.limitPerProject == null
                          ? "Unlimited"
                          : `${entitlements.usage.schemas.limitPerProject}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-h-16 items-center justify-between gap-4 border-b border-gray-100 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-700">Schema versions</div>
                      <div className="mt-1 text-xs text-gray-500">Version history retained for each schema</div>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      {entitlements?.plan.limits.schema_versions_per_schema == null
                        ? "Unlimited"
                        : `${entitlements.plan.limits.schema_versions_per_schema.toLocaleString()}`}
                    </div>
                  </div>
                </div>
                {workspace.type === "team" && aiUsageBreakdown.length > 1 && (
                  <div className="mt-8">
                    <div className="mb-2 text-sm font-medium text-gray-700">
                      AI requests by member
                    </div>
                    <div className="overflow-hidden rounded-lg border border-gray-100">
                      <Table
                        size="small"
                        rowKey="userId"
                        pagination={false}
                        dataSource={aiUsageBreakdown}
                        columns={[
                          {
                            title: "Member",
                            key: "member",
                            render: (_: unknown, row: AiUsageBreakdownEntry) => (
                              <div>
                                <div className="font-medium text-gray-900">{row.fullName}</div>
                                <div className="text-xs text-gray-500">{row.email}</div>
                              </div>
                            ),
                          },
                          {
                            title: "Used",
                            key: "used",
                            render: (_: unknown, row: AiUsageBreakdownEntry) =>
                              `${(row.used + row.reserved).toLocaleString()}/${row.limit != null ? row.limit.toLocaleString() : "Unlimited"}`,
                          },
                          {
                            title: "",
                            key: "progress",
                            render: (_: unknown, row: AiUsageBreakdownEntry) => (
                              <Progress
                                size="small"
                                strokeColor="#42a5f5"
                                percent={
                                  row.limit
                                    ? Math.min(100, Math.round(((row.used + row.reserved) / row.limit) * 100))
                                    : 0
                                }
                              />
                            ),
                          },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </div>
            ),
          },
          canViewBilling && {
            key: "orders",
            label: `Billing history (${orders.length})`,
            children: (
              <div>
                {entitlements?.subscription.status === "active" &&
                  entitlements.subscription.provider === "stripe" && (
                  <div className="mb-4 flex justify-end">
                    <Button
                      type="primary"
                      onClick={async () => {
                        try {
                          const session = await createStripeBillingPortal(workspaceId);
                          window.location.href = session.url;
                        } catch (error) {
                          notificationProvider.open({
                            type: "error",
                            message: "Unable to open Stripe billing portal",
                            description: error instanceof Error ? error.message : undefined,
                          });
                        }
                      }}
                    >
                      Manage subscription
                    </Button>
                  </div>
                )}
                <Table
                  rowKey="id"
                  dataSource={orders}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 850, y: 420 }}
                  columns={[
                    {
                      title: "Order",
                      dataIndex: "orderNumber",
                      width: 210,
                    },
                    {
                      title: "Plan",
                      width: 130,
                      render: (_: unknown, order: BillingOrder) =>
                        order.plan?.name ?? "-",
                    },
                    {
                      title: "Billing period",
                      width: 180,
                      render: (_: unknown, order: BillingOrder) => {
                        const periodDate =
                          order.renewalPeriodStart ?? order.createdAt;
                        return new Intl.DateTimeFormat("en-US", {
                          month: "short",
                          year: "numeric",
                        }).format(new Date(periodDate));
                      },
                    },
                    {
                      title: "Cycle",
                      dataIndex: "billingCycle",
                      width: 110,
                    },
                    {
                      title: "Amount",
                      width: 140,
                      render: (_: unknown, order: BillingOrder) =>
                        `${Number(order.amount).toLocaleString("vi-VN")} ${order.currency}`,
                    },
                    {
                      title: "Status",
                      dataIndex: "status",
                      width: 120,
                      render: (status: string) => <StatusPill value={status} />,
                    },
                  ]}
                />
              </div>
            ),
          },
          workspace.type === "team" && {
            key: "members",
            label: `Members (${members.length})`,
            children: (
              <div>
                {canManageTeam && (
                  <div className="mb-4 flex justify-end">
                    <Button
                      type="primary"
                      className="!h-9 !rounded-xl !border-0 !px-4 !text-[13px] !font-semibold !shadow-none"
                      onClick={() => setInviteOpen(true)}
                    >
                      Invite member
                    </Button>
                  </div>
                )}
                <Table
                  className="[&_.ant-table]:!overflow-hidden [&_.ant-table]:!rounded-2xl [&_.ant-table-thead>tr>th]:!border-b-0 [&_.ant-table-thead>tr>th]:!bg-gray-50 [&_.ant-table-thead>tr>th]:!text-xs [&_.ant-table-thead>tr>th]:!font-semibold [&_.ant-table-tbody>tr>td]:!py-4"
                  rowKey="userId"
                  dataSource={members}
                  columns={memberColumns}
                  pagination={false}
                />
              </div>
            ),
          },
          workspace.type === "team" && canManageTeam && {
            key: "invitations",
            label: `Invitations (${invitations.length})`,
            children: (
              <div>
                <Table
                  rowKey="id"
                  dataSource={invitations}
                  pagination={false}
                  columns={[
                    { title: "Email", dataIndex: "email" },
                    { title: "Role", dataIndex: "role" },
                    {
                      title: "Status",
                      dataIndex: "status",
                      render: (status: string) => <StatusPill value={status} />,
                    },
                    {
                      title: "Actions",
                      render: (_: unknown, invitation: WorkspaceInvitation) =>
                        invitation.status === "pending" ? (
                          <Button
                            danger
                            type="link"
                            onClick={() => {
                              void revokeWorkspaceInvitation(
                                workspaceId,
                                invitation.id,
                              ).then(load);
                            }}
                          >
                            Revoke
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </div>
            ),
          },
          workspace.type === "team" && canManageWorkspace && {
            key: "groups",
            label: `Groups (${groups?.length ?? 0})`,
            children: (
              <div>
                <div className="mb-4 flex justify-end">
                  <Button
                    type="primary"
                    className="!h-9 !rounded-xl !border-0 !px-4 !text-[13px] !font-semibold !shadow-none"
                    onClick={() => setCreateGroupOpen(true)}
                  >
                    Create group
                  </Button>
                </div>
                {groups === undefined ? (
                  <LoadingIndicator label="Loading groups" />
                ) : groups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                    No groups yet — every project is visible to the whole team.
                  </div>
                ) : (
                  <Table
                    className="[&_.ant-table]:!overflow-hidden [&_.ant-table]:!rounded-2xl [&_.ant-table-thead>tr>th]:!border-b-0 [&_.ant-table-thead>tr>th]:!bg-gray-50 [&_.ant-table-thead>tr>th]:!text-xs [&_.ant-table-thead>tr>th]:!font-semibold [&_.ant-table-tbody>tr>td]:!py-4"
                    rowKey="id"
                    dataSource={groups}
                    pagination={false}
                    columns={[
                      {
                        title: "",
                        dataIndex: "name",
                        width: 260,
                        render: (name: string) => (
                          <span className="font-semibold text-gray-900">{name}</span>
                        ),
                      },
                      {
                        title: "Members",
                        key: "members",
                        width: 120,
                        render: (_: unknown, group: Group) => group.members.length,
                      },
                      {
                        title: "Actions",
                        key: "actions",
                        width: 100,
                        render: (_: unknown, group: Group) => (
                          <Button
                            danger
                            size="small"
                            className="!rounded-lg !border-0 !bg-red-50 !text-xs !font-semibold !shadow-none hover:!bg-red-100"
                            onClick={() => handleDeleteGroup(group)}
                          >
                            Delete
                          </Button>
                        ),
                      },
                    ]}
                    expandable={{
                      expandedRowRender: (group: Group) => {
                        const memberIds = new Set(
                          group.members.map((member) => member.userId),
                        );
                        const addableMembers = members.filter(
                          (member) => !memberIds.has(member.userId),
                        );
                        return (
                          <div>
                            <div className="flex items-center justify-between border-b border-gray-100 py-3">
                              <Select
                                key={`${group.id}-${group.members.length}`}
                                variant="borderless"
                                size="small"
                                className="w-64 [&_.ant-select-selector]:!p-0 [&_.ant-select-selection-placeholder]:!text-gray-900"
                                placeholder="Add member"
                                disabled={addableMembers.length === 0}
                                options={addableMembers.map((addable) => ({
                                  value: addable.userId,
                                  label: addable.fullName || addable.email,
                                }))}
                                onChange={(targetUserId: string) =>
                                  void handleAddGroupMember(group, targetUserId)
                                }
                              />
                              <span className="w-[100px]" />
                            </div>
                            {group.members.map((member) => (
                              <div
                                key={member.userId}
                                className="flex items-center justify-between border-b border-gray-50 py-3 last:border-b-0"
                              >
                                <div>
                                  <div className="text-gray-900">{member.fullName || member.email}</div>
                                  <div className="text-xs text-gray-500">{member.email}</div>
                                </div>
                                <Button
                                  danger
                                  type="link"
                                  size="small"
                                  className="w-[100px]"
                                  onClick={() =>
                                    void handleRemoveGroupMember(group, member.userId)
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                          </div>
                        );
                      },
                    }}
                  />
                )}
              </div>
            ),
          },
          workspace.type === "team" && canManageWorkspace && {
            key: "activity",
            label: "Activity log",
            children: (
              <div>
                <Table
                  rowKey="id"
                  loading={auditLogs === undefined}
                  dataSource={auditLogs ?? []}
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: "max-content" }}
                  columns={[
                    {
                      title: "Time",
                      dataIndex: "createdAt",
                      width: 170,
                      render: (createdAt: string) => dayjs(createdAt).format("D MMM YYYY, HH:mm"),
                    },
                    {
                      title: "Actor",
                      key: "actor",
                      render: (_: unknown, log: WorkspaceAuditLog) => log.actor?.fullName ?? log.actorUserId,
                    },
                    {
                      title: "Action",
                      dataIndex: "action",
                    },
                    {
                      title: "Target",
                      key: "target",
                      render: (_: unknown, log: WorkspaceAuditLog) => describeAuditTarget(log),
                    },
                  ]}
                  expandable={{
                    expandedRowRender: (log: WorkspaceAuditLog) => (
                      <div className="flex gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Before</div>
                          <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-[12px] text-gray-700">
                            {log.beforeData ? JSON.stringify(log.beforeData, null, 2) : "—"}
                          </pre>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">After</div>
                          <pre className="max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-[12px] text-gray-700">
                            {log.afterData ? JSON.stringify(log.afterData, null, 2) : "—"}
                          </pre>
                        </div>
                      </div>
                    ),
                    rowExpandable: (log: WorkspaceAuditLog) => Boolean(log.beforeData || log.afterData),
                  }}
                />
              </div>
            ),
          },
        ].filter(Boolean) as TabsProps["items"]}
      />

      <Modal
        title="Invite team member"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        onOk={() => inviteForm.submit()}
        confirmLoading={saving}
      >
        <Form
          form={inviteForm}
          layout="vertical"
          initialValues={{ role: "member" }}
          onFinish={handleInvite}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true }, { type: "email" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select
              className="h-9!"
              options={ASSIGNABLE_ROLES.map((role) => ({
                value: role,
                label: role.charAt(0).toUpperCase() + role.slice(1),
              }))}
              optionRender={(option) => (
                <div className="py-0.5">
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-gray-500">
                    {ROLE_DESCRIPTIONS[option.value as keyof typeof ROLE_DESCRIPTIONS]}
                  </div>
                </div>
              )}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Transfer ownership"
        open={transferOpen}
        onCancel={() => setTransferOpen(false)}
        onOk={() => transferForm.submit()}
        confirmLoading={saving}
      >
        <Form
          form={transferForm}
          layout="vertical"
          onFinish={handleTransfer}
        >
          <Form.Item
            name="targetUserId"
            label="New owner"
            rules={[{ required: true }]}
          >
            <Select
              options={transferTargets.map((member) => ({
                value: member.userId,
                label: `${member.fullName} (${member.email})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Create group"
        open={createGroupOpen}
        onCancel={() => setCreateGroupOpen(false)}
        onOk={() => createGroupForm.submit()}
        confirmLoading={saving}
      >
        <Form
          form={createGroupForm}
          layout="vertical"
          onFinish={handleCreateGroup}
        >
          <Form.Item
            name="name"
            label="Group name"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g. Backend Team" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
