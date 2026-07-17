"use client";

import {
  getWorkspace,
  getWorkspaceInvitations,
  getWorkspaceMembers,
  inviteWorkspaceMember,
  leaveWorkspace,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  transferWorkspaceOwnership,
  updateWorkspace,
  updateWorkspaceMemberRole,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "@/api/workspaces/client";
import { getUserMe } from "@/api/users/client";
import {
  BillingOrder,
  getBillingOrders,
  getWorkspaceEntitlements,
  WorkspaceEntitlements,
} from "@/api/subscriptions/client";
import { notificationProvider } from "@/providers/notification";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Progress,
} from "antd";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = { workspaceId: string };
type InviteValues = {
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
};

const ASSIGNABLE_ROLES: Exclude<WorkspaceRole, "owner">[] = [
  "admin",
  "billing",
  "member",
  "viewer",
];

export default function WorkspaceSettings({ workspaceId }: Props) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceSummary>();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements>();
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [generalForm] = Form.useForm<{ name: string }>();
  const [inviteForm] = Form.useForm<InviteValues>();
  const [transferForm] = Form.useForm<{ targetUserId: string }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        workspaceData,
        memberData,
        invitationData,
        user,
        entitlementData,
        orderData,
      ] =
        await Promise.all([
          getWorkspace(workspaceId),
          getWorkspaceMembers(workspaceId),
          getWorkspaceInvitations(workspaceId).catch(() => []),
          getUserMe(),
          getWorkspaceEntitlements(workspaceId),
          getBillingOrders(workspaceId).catch(() => []),
        ]);
      setWorkspace(workspaceData);
      setMembers(memberData);
      setInvitations(invitationData);
      setCurrentUserId(user.id);
      setEntitlements(entitlementData);
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

  const canManage = ["owner", "admin"].includes(
    workspace?.currentUserRole ?? "",
  );
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
    try {
      await updateWorkspaceMemberRole(workspaceId, member.userId, role);
      await load();
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
    }
  };

  const handleRemove = (member: WorkspaceMember) => {
    Modal.confirm({
      title: `Remove ${member.fullName || member.email}?`,
      content: "This user will lose access to team projects.",
      okText: "Remove",
      okButtonProps: { danger: true },
      async onOk() {
        await removeWorkspaceMember(workspaceId, member.userId);
        await load();
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
        localStorage.removeItem("active_workspace_id");
        router.push("/projects");
      },
    });
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
    suffix?: string,
  ) => (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span>{label}</span>
        <span>
          {used}/{limit ?? "Unlimited"}
          {suffix ?? ""}
        </span>
      </div>
      <Progress
        percent={
          limit
            ? Math.min(100, Math.round((used / limit) * 100))
            : 0
        }
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spin size="large" />
      </div>
    );
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
        member.role === "owner" || !canManage ? (
          <Tag>{member.role}</Tag>
        ) : (
          <Select
            size="small"
            value={member.role}
            className="w-32"
            options={ASSIGNABLE_ROLES.map((role) => ({
              value: role,
              label: role,
            }))}
            onChange={(role) => void handleRoleChange(member, role)}
          />
        ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, member: WorkspaceMember) =>
        canManage &&
        member.role !== "owner" &&
        member.userId !== currentUserId ? (
          <Button danger type="link" onClick={() => handleRemove(member)}>
            Remove
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{workspace.name}</h1>
        <p className="text-sm text-gray-500">
          {workspace.type === "team" ? "Team workspace" : "Personal workspace"}
        </p>
      </div>

      <Tabs
        items={[
          {
            key: "general",
            label: "General",
            children: (
              <Card>
                <Form
                  form={generalForm}
                  layout="vertical"
                  onFinish={handleUpdateGeneral}
                >
                  <Form.Item
                    name="name"
                    label="Workspace name"
                    rules={[
                      { required: true },
                      { min: 2, max: 100 },
                    ]}
                  >
                    <Input disabled={!canManage} />
                  </Form.Item>
                  {canManage && (
                    <Button type="primary" htmlType="submit" loading={saving}>
                      Save changes
                    </Button>
                  )}
                </Form>

                {workspace.type === "team" && (
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <Space wrap>
                      {isOwner && (
                        <Button onClick={() => setTransferOpen(true)}>
                          Transfer ownership
                        </Button>
                      )}
                      {!isOwner && (
                        <Button danger onClick={handleLeave}>
                          Leave workspace
                        </Button>
                      )}
                    </Space>
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: "plan",
            label: "Plan & usage",
            children: (
              <Card>
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <div className="text-sm text-gray-500">Current plan</div>
                    <div className="mt-1 text-xl font-semibold text-gray-900">
                      {entitlements?.plan.name ?? "Unknown"}
                    </div>
                    <Tag className="mt-2">
                      {entitlements?.subscription.status ?? "unknown"}
                    </Tag>
                    <div className="mt-4">
                      <Link
                        href={`/pricing?workspaceId=${workspaceId}`}
                        className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Upgrade plan
                      </Link>
                    </div>
                  </div>
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
                    `AI requests (${entitlements?.usage.aiRequests.periodKey ?? "current month"})`,
                    (entitlements?.usage.aiRequests.used ?? 0) +
                      (entitlements?.usage.aiRequests.reserved ?? 0),
                    entitlements?.usage.aiRequests.limit,
                  )}
                  {renderUsage(
                    "Document storage",
                    entitlements?.usage.documentStorage.used ?? 0,
                    entitlements?.usage.documentStorage.limit,
                    " bytes",
                  )}
                  {renderUsage(
                    `Exports (${entitlements?.usage.exports.periodKey ?? "current month"})`,
                    entitlements?.usage.exports.used ?? 0,
                    entitlements?.usage.exports.limit,
                  )}
                  <div>
                    <div className="text-sm text-gray-500">
                      Schemas currently stored
                    </div>
                    <div className="mt-1 text-lg font-medium text-gray-900">
                      {entitlements?.usage.schemas.used ?? 0}
                    </div>
                    <div className="text-xs text-gray-500">
                      Limit per project:{" "}
                      {entitlements?.usage.schemas.limitPerProject ??
                        "Unlimited"}
                    </div>
                  </div>
                </div>
              </Card>
            ),
          },
          {
            key: "orders",
            label: `Billing history (${orders.length})`,
            children: (
              <Card>
                <Table
                  rowKey="id"
                  dataSource={orders}
                  pagination={{ pageSize: 10 }}
                  columns={[
                    { title: "Order", dataIndex: "orderNumber" },
                    {
                      title: "Plan",
                      render: (_: unknown, order: BillingOrder) =>
                        order.plan?.name ?? "-",
                    },
                    { title: "Cycle", dataIndex: "billingCycle" },
                    {
                      title: "Amount",
                      render: (_: unknown, order: BillingOrder) =>
                        `${Number(order.amount).toLocaleString("vi-VN")} ${order.currency}`,
                    },
                    {
                      title: "Status",
                      dataIndex: "status",
                      render: (status: string) => <Tag>{status}</Tag>,
                    },
                    {
                      title: "Action",
                      render: (_: unknown, order: BillingOrder) =>
                        order.status === "pending" && order.checkoutUrl ? (
                          <Button
                            type="link"
                            onClick={() => {
                              window.location.href = order.checkoutUrl!;
                            }}
                          >
                            Continue payment
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: "members",
            label: `Members (${members.length})`,
            disabled: workspace.type === "personal",
            children: (
              <Card
                extra={
                  canManage ? (
                    <Button type="primary" onClick={() => setInviteOpen(true)}>
                      Invite member
                    </Button>
                  ) : null
                }
              >
                <Table
                  rowKey="userId"
                  dataSource={members}
                  columns={memberColumns}
                  pagination={false}
                />
              </Card>
            ),
          },
          {
            key: "invitations",
            label: `Invitations (${invitations.length})`,
            disabled: workspace.type === "personal" || !canManage,
            children: (
              <Card>
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
                      render: (status: string) => <Tag>{status}</Tag>,
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
              </Card>
            ),
          },
        ]}
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
              options={ASSIGNABLE_ROLES.map((role) => ({
                value: role,
                label: role,
              }))}
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
    </div>
  );
}
