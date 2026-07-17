"use client";

import {
  AdminDashboard,
  AdminUser,
  getAdminDashboard,
  getAdminOrders,
  getAdminSubscriptions,
  getAdminUsers,
  updateAdminUserStatus,
} from "@/api/admin/client";
import { BillingOrder, Subscription } from "@/api/subscriptions/client";
import { Button, Card, Col, Modal, Row, Spin, Table, Tabs, Tag } from "antd";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard>();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  const load = async () => {
    const [stats, userData, orderData, subscriptionData] = await Promise.all([
      getAdminDashboard(),
      getAdminUsers(),
      getAdminOrders(),
      getAdminSubscriptions(),
    ]);
    setDashboard(stats);
    setUsers(userData.items);
    setOrders(orderData);
    setSubscriptions(subscriptionData);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!dashboard) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spin /></div>;
  }

  const stats = [
    ["Users", dashboard.users],
    ["Suspended", dashboard.suspendedUsers],
    ["Workspaces", dashboard.workspaces],
    ["Subscriptions", dashboard.subscriptions],
    ["Paid orders", dashboard.paidOrders],
    ["Revenue", `${dashboard.revenueVnd.toLocaleString("vi-VN")} VND`],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Admin</h1>
      <Row gutter={[16, 16]} className="mb-8">
        {stats.map(([label, value]) => (
          <Col xs={12} md={8} lg={4} key={String(label)}>
            <Card><div className="text-xs text-gray-500">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></Card>
          </Col>
        ))}
      </Row>
      <Tabs items={[
        {
          key: "users",
          label: "Users",
          children: <Table rowKey="id" dataSource={users} columns={[
            { title: "User", render: (_: unknown, user: AdminUser) => <div><div>{user.fullName}</div><div className="text-xs text-gray-500">{user.email}</div></div> },
            { title: "Role", dataIndex: "role" },
            { title: "Status", dataIndex: "status", render: (status: string) => <Tag>{status}</Tag> },
            { title: "Action", render: (_: unknown, user: AdminUser) => (
              <Button danger={user.status === "active"} onClick={() => {
                const next = user.status === "active" ? "suspended" : "active";
                Modal.confirm({
                  title: `${next === "suspended" ? "Suspend" : "Activate"} user?`,
                  async onOk() {
                    await updateAdminUserStatus(user.id, next, "Admin action");
                    await load();
                  },
                });
              }}>{user.status === "active" ? "Suspend" : "Activate"}</Button>
            ) },
          ]} />,
        },
        {
          key: "orders",
          label: "Orders",
          children: <Table rowKey="id" dataSource={orders} columns={[
            { title: "Order", dataIndex: "orderNumber" },
            { title: "Amount", render: (_: unknown, order: BillingOrder) => `${Number(order.amount).toLocaleString("vi-VN")} ${order.currency}` },
            { title: "Status", dataIndex: "status", render: (status: string) => <Tag>{status}</Tag> },
          ]} />,
        },
        {
          key: "subscriptions",
          label: "Subscriptions",
          children: <Table rowKey="id" dataSource={subscriptions} columns={[
            { title: "Workspace", dataIndex: "workspaceId" },
            { title: "Plan", render: (_: unknown, subscription: Subscription) => subscription.plan?.name ?? "-" },
            { title: "Status", dataIndex: "status", render: (status: string) => <Tag>{status}</Tag> },
            { title: "Quantity", dataIndex: "quantity" },
          ]} />,
        },
      ]} />
    </div>
  );
}
