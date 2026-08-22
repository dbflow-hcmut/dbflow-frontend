"use client";

import { AdminAuditLog, getAdminAuditLogs } from "@/api/admin/client";
import LoadingIndicator from "@/components/LoadingIndicator";
import { Input, Table } from "antd";
import { useEffect, useMemo, useState } from "react";
import { ADMIN_TABLE_CLASS } from "../_lib/styles";
import { formatDateTime } from "../_lib/format";

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-lg bg-[#12141B] p-3 text-xs text-gray-300">
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>();
  const [query, setQuery] = useState("");

  useEffect(() => {
    void getAdminAuditLogs().then(setLogs);
  }, []);

  const filteredLogs = useMemo(
    () =>
      (logs ?? []).filter((log) =>
        `${log.action} ${log.targetType} ${log.targetId} ${log.admin?.fullName ?? ""} ${log.admin?.email ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, logs],
  );

  if (!logs) return <LoadingIndicator fullArea size="medium" label="Loading audit logs" />;

  const columns = [
    {
      title: "Time",
      dataIndex: "createdAt",
      width: 180,
      render: (createdAt: string) => formatDateTime(createdAt),
    },
    {
      title: "Admin",
      key: "admin",
      render: (_: unknown, log: AdminAuditLog) => (
        <div>
          <div className="font-medium text-gray-100">{log.admin?.fullName ?? "Unknown"}</div>
          <div className="text-xs text-gray-500">{log.admin?.email ?? log.adminUserId}</div>
        </div>
      ),
    },
    {
      title: "Action",
      dataIndex: "action",
      render: (action: string) => (
        <span className="inline-flex items-center rounded-md bg-primary-500/15 px-2 py-0.5 text-xs font-medium text-primary-300">
          {action}
        </span>
      ),
    },
    {
      title: "Target",
      key: "target",
      render: (_: unknown, log: AdminAuditLog) => (
        <div>
          <div className="text-gray-200">{log.targetType}</div>
          <div className="text-xs text-gray-500">{log.targetId}</div>
        </div>
      ),
    },
    { title: "Reason", dataIndex: "reason", render: (reason: string | null) => reason ?? "—" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 text-gray-100 sm:px-6 lg:px-10 lg:py-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Audit logs</h2>
        <p className="mt-1 text-sm text-gray-400">History of admin actions across users, plans and subscriptions.</p>
      </div>
      <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-200">Recent activity</h3>
          <Input allowClear value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search action, target, admin" className="!w-72" />
        </div>
        <div className="overflow-hidden rounded-lg">
          <Table
            rowKey="id"
            dataSource={filteredLogs}
            columns={columns}
            pagination={{ pageSize: 20 }}
            className={ADMIN_TABLE_CLASS}
            expandable={{
              expandedRowRender: (log: AdminAuditLog) => (
                <div className="flex gap-4 bg-[#1A1C24] py-2">
                  <JsonBlock label="Before" value={log.beforeData} />
                  <JsonBlock label="After" value={log.afterData} />
                </div>
              ),
              rowExpandable: (log: AdminAuditLog) => Boolean(log.beforeData || log.afterData),
            }}
          />
        </div>
      </div>
    </div>
  );
}
