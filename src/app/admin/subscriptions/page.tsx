"use client";

import { AdminSubscription, AdminSubscriptionAction, getAdminSubscriptions, updateAdminSubscription } from "@/api/admin/client";
import LoadingIndicator from "@/components/LoadingIndicator";
import { Avatar, Button, Input, Modal, Table } from "antd";
import { useEffect, useState } from "react";
import { ADMIN_TABLE_CLASS } from "../_lib/styles";
import { notificationProvider } from "@/providers/notification";

const statusClass: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  paused: "bg-amber-500/15 text-amber-400",
  canceled: "bg-rose-500/15 text-rose-400",
  expired: "bg-gray-500/15 text-gray-400",
};

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState<AdminSubscription[]>();
  const [query, setQuery] = useState("");
  const [actionState, setActionState] = useState<{ item: AdminSubscription; action: AdminSubscriptionAction }>();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => setItems(await getAdminSubscriptions());
  useEffect(() => { void load(); }, []);
  if (!items) return <LoadingIndicator fullArea size="medium" label="Loading subscriptions" />;

  const managedSubscriptions = items.filter(
    (item) => !["free", "team_free"].includes(item.plan?.code ?? ""),
  );
  const filtered = managedSubscriptions.filter((item) => `${item.owner?.fullName ?? ""} ${item.owner?.email ?? ""} ${item.workspace?.name ?? ""} ${item.plan?.name ?? ""} ${item.status}`.toLowerCase().includes(query.toLowerCase()));
  const openAction = (item: AdminSubscription, action: AdminSubscriptionAction) => { setReason(""); setActionState({ item, action }); };
  const submit = async () => {
    if (!actionState || !reason.trim()) return;
    setSaving(true);
    try {
      await updateAdminSubscription(actionState.item.id, actionState.action, reason.trim());
      setActionState(undefined);
      await load();
      notificationProvider.open({ type: "success", message: "Subscription updated" });
    } finally { setSaving(false); }
  };
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-gray-100 sm:px-6 lg:px-10 lg:py-10">
      <div className="mb-6"><h2 className="text-2xl font-bold text-white">Subscriptions</h2><p className="mt-1 text-sm text-gray-400">Manage plan access and subscription lifecycle.</p></div>
      <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-gray-200">All subscriptions</h3><Input allowClear value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search owner, workspace, plan or status" className="!w-80" /></div>
        <Table rowKey="id" dataSource={filtered} pagination={{ pageSize: 10 }} className={ADMIN_TABLE_CLASS} columns={[
          { title: "Owner", render: (_: unknown, item: AdminSubscription) => <div className="flex items-center gap-2"><Avatar src={item.owner?.avatar} size={30} /><div><div className="font-medium text-gray-100">{item.owner?.fullName ?? "-"}</div><div className="text-xs text-gray-400">{item.owner?.email}</div></div></div> },
          { title: "Workspace", render: (_: unknown, item: AdminSubscription) => <div><div className="text-sm font-medium text-gray-100">{item.workspace?.name ?? "-"}</div><div className="text-xs capitalize text-gray-400">{item.workspace?.type ?? ""}</div></div> },
          { title: "Plan", render: (_: unknown, item: AdminSubscription) => item.plan?.name ?? "-" },
          { title: "Status", render: (_: unknown, item: AdminSubscription) => <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${statusClass[item.status] ?? statusClass.expired}`}>{item.status}</span> },
          { title: "Period ends", dataIndex: "currentPeriodEnd", render: (value: string) => new Date(value).toLocaleDateString() },
          { title: "Actions", render: (_: unknown, item: AdminSubscription) => <div className="flex flex-wrap gap-1">
            {item.status === "paused" ? <Button className="!h-8 !px-3 !text-xs !font-semibold" onClick={() => openAction(item, "resume")}>Resume</Button> : item.status === "active" ? <Button className="!h-8 !px-3 !text-xs !font-semibold" onClick={() => openAction(item, "pause")}>Pause</Button> : null}
            {!["canceled", "expired"].includes(item.status) ? <Button danger className="!h-8 !px-3 !text-xs !font-semibold" onClick={() => openAction(item, "revoke")}>Revoke now</Button> : null}
          </div> },
        ]} />
      </div>
      <Modal title={`${actionState?.action.replaceAll("_", " ") ?? ""} subscription`} open={Boolean(actionState)} onCancel={() => setActionState(undefined)} onOk={() => void submit()} confirmLoading={saving} okButtonProps={{ disabled: !reason.trim(), danger: actionState?.action === "revoke" }}>
        <p className="mb-3 text-sm text-gray-400">{actionState?.action === "pause" || actionState?.action === "revoke" ? "The workspace will fall back to the Free plan. This message will be shown to the workspace user." : "Add a note for this subscription change."}</p>
        <Input.TextArea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter the message shown to the user" />
      </Modal>
    </div>
  );
}
