"use client";

import { AdminOrder, getAdminOrders } from "@/api/admin/client";
import LoadingIndicator from "@/components/LoadingIndicator";
import { Avatar, Input, Table } from "antd";
import { useEffect, useState } from "react";
import { money } from "../_lib/format";
import { ADMIN_TABLE_CLASS } from "../_lib/styles";

export default function AdminBillingPage() {
  const [orders, setOrders] = useState<AdminOrder[]>();
  const [query, setQuery] = useState("");
  useEffect(() => { void getAdminOrders().then(setOrders); }, []);
  if (!orders) return <LoadingIndicator fullArea size="medium" label="Loading billing orders" />;
  const filtered = orders.filter((item) => `${item.orderNumber} ${item.buyer?.fullName ?? ""} ${item.buyer?.email ?? ""} ${item.workspace?.name ?? ""} ${item.plan?.name ?? ""} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-gray-100 sm:px-6 lg:px-10 lg:py-10">
      <div className="mb-6"><h2 className="text-2xl font-bold text-white">Billing</h2><p className="mt-1 text-sm text-gray-400">Track checkout orders across all workspaces.</p></div>
      <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-gray-200">Billing orders</h3><Input allowClear value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search order, buyer, workspace or plan" className="!w-80" /></div>
        <Table rowKey="id" dataSource={filtered} pagination={{ pageSize: 10 }} className={ADMIN_TABLE_CLASS} columns={[
          { title: "Order", dataIndex: "orderNumber" },
          { title: "Buyer", render: (_: unknown, item: AdminOrder) => item.buyer ? <div className="flex items-center gap-2"><Avatar src={item.buyer.avatar} size={28} /><div><div className="text-sm font-medium text-gray-100">{item.buyer.fullName}</div><div className="text-xs text-gray-400">{item.buyer.email}</div></div></div> : "-" },
          { title: "Workspace", render: (_: unknown, item: AdminOrder) => <div><div className="text-sm font-medium text-gray-100">{item.workspace?.name ?? item.workspaceName ?? "-"}</div><div className="text-xs capitalize text-gray-400">{item.workspace?.type ?? (item.workspaceName ? "pending creation" : "")}</div></div> },
          { title: "Plan", render: (_: unknown, item: AdminOrder) => item.plan?.name ?? "-" },
          { title: "Amount", render: (_: unknown, item: AdminOrder) => money(item.amount) },
          { title: "Expires", render: (_: unknown, item: AdminOrder) => item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "-" },
          { title: "Status", dataIndex: "status", render: (value: string) => <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${value === "paid" ? "bg-emerald-500/15 text-emerald-400" : value === "pending" ? "bg-amber-500/15 text-amber-400" : "bg-rose-500/15 text-rose-400"}`}>{value}</span> },
        ]} />
      </div>
    </div>
  );
}
