"use client";

import { AdminUser, getAdminUsers, updateAdminUserStatus } from "@/api/admin/client";
import LoadingIndicator from "@/components/LoadingIndicator";
import { getUserMe } from "@/api/users/client";
import { Avatar, Button, Input, Modal, Table } from "antd";
import { useEffect, useMemo, useState } from "react";
import { ADMIN_TABLE_CLASS } from "../_lib/styles";
import { formatDate } from "../_lib/format";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>();
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [query, setQuery] = useState("");
  const [modal, modalContextHolder] = Modal.useModal();

  const load = async () => {
    const [data, currentUser] = await Promise.all([getAdminUsers(), getUserMe()]);
    setUsers(data.items);
    setCurrentUserId(currentUser.id);
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredUsers = useMemo(
    () => (users ?? []).filter((user) => `${user.fullName} ${user.email} ${user.role} ${user.status}`.toLowerCase().includes(query.toLowerCase())),
    [query, users],
  );
  if (!users) return <LoadingIndicator fullArea size="medium" label="Loading users" />;

  const columns = [
    {
      title: "User",
      render: (_: unknown, user: AdminUser) => (
        <div className="flex items-center gap-2">
          <Avatar src={user.avatar} size={32} />
          <div className="min-w-0">
            <div className="truncate font-medium text-gray-100">{user.fullName}</div>
            <div className="truncate text-xs text-gray-400">{user.email}</div>
          </div>
        </div>
      ),
    },
    { title: "Role", dataIndex: "role" },
    { title: "Registered", dataIndex: "createdAt", render: (createdAt: string) => formatDate(createdAt) },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ${status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
          {status}
        </span>
      ),
    },
    {
      title: "Action",
      render: (_: unknown, user: AdminUser) =>
        user.id === currentUserId ? null : (
        <Button
          className="!h-8 cursor-pointer !px-3 !text-xs !font-semibold"
          danger={user.status === "active"}
          onClick={() =>
            modal.confirm({
              title: `${user.status === "active" ? "Suspend" : "Activate"} user?`,
              async onOk() {
                await updateAdminUserStatus(user.id, user.status === "active" ? "suspended" : "active", "Admin action");
                await load();
              },
            })
          }
        >
          {user.status === "active" ? "Suspend" : "Activate"}
        </Button>
      ),
    },
  ];

  return (
    <>
      {modalContextHolder}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 text-gray-100">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Users</h2>
          <p className="mt-1 text-sm text-gray-400">Manage user accounts and access.</p>
        </div>
        <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-gray-200">User directory</h3><Input allowClear value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users" className="!w-64" /></div>
          <div className="overflow-hidden rounded-lg">
            <Table
              rowKey="id"
              dataSource={filteredUsers}
              columns={columns}
              pagination={{ pageSize: 10 }}
              className={ADMIN_TABLE_CLASS}
            />
          </div>
        </div>
      </div>
    </>
  );
}
