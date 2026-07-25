"use client";

import { createAdminPlan, getAdminPlans, updateAdminPlan } from "@/api/admin/client";
import { Plan } from "@/api/subscriptions/client";
import LoadingIndicator from "@/components/LoadingIndicator";
import { Button, Table } from "antd";
import { notificationProvider } from "@/providers/notification";
import { Plus } from "lucide-react";
import { ADMIN_TABLE_CLASS } from "../_lib/styles";
import { useMemo, useState, useEffect } from "react";
import PlanFormModal from "../_components/PlanFormModal";
import { money } from "../_lib/format";

type ModalState = { mode: "create" } | { mode: "edit"; plan: Plan } | undefined;

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>();
  const [modalState, setModalState] = useState<ModalState>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getAdminPlans().then(setPlans);
  }, []);

  const activePlans = useMemo(() => (plans ?? []).filter((plan) => plan.workspaceType !== "any"), [plans]);

  if (!plans) return <LoadingIndicator fullArea size="medium" label="Loading plans" />;

  const columns = [
    {
      title: "Plan",
      render: (_: unknown, plan: Plan) => (
        <div>
          <div className="font-medium text-gray-100">{plan.name}</div>
          <div className="text-xs text-gray-400">{plan.code} · {plan.workspaceType}</div>
        </div>
      ),
    },
    { title: "Monthly", render: (_: unknown, plan: Plan) => money(plan.monthlyBasePrice) },
    { title: "Yearly", render: (_: unknown, plan: Plan) => money(plan.yearlyBasePrice) },
    { title: "Seats", dataIndex: "includedSeats" },
    {
      title: "AI model",
      render: (_: unknown, plan: Plan) => (
        <span className="text-xs text-gray-300">
          {plan.effectiveAiModel || "—"}
        </span>
      ),
    },
    {
      title: "Status",
      render: (_: unknown, plan: Plan) => (
        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${plan.isActive ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-700/40 text-zinc-400"}`}>
          {plan.isActive ? "Live" : "Hidden"}
        </span>
      ),
    },
    {
      title: "Action",
      render: (_: unknown, plan: Plan) => (
        <Button className="!h-8 !px-3 !text-xs !font-semibold" onClick={() => setModalState({ mode: "edit", plan })}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 text-gray-100">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Plans & pricing</h2>
          <p className="mt-1 text-sm text-gray-400">Tune pricing, seats and configuration. Changes are recorded in the admin audit log.</p>
        </div>
        <Button type="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModalState({ mode: "create" })}>
          Add plan
        </Button>
      </div>
      <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-200">Plans & pricing</h3>
          <span className="text-xs text-gray-400">{activePlans.length} live plans</span>
        </div>
        <div className="overflow-hidden rounded-lg">
          <Table
            rowKey="id"
            dataSource={plans}
            columns={columns}
            pagination={false}
            className={ADMIN_TABLE_CLASS}
          />
        </div>
      </div>
      <PlanFormModal
        open={Boolean(modalState)}
        mode={modalState?.mode ?? "create"}
        plan={modalState?.mode === "edit" ? modalState.plan : undefined}
        confirmLoading={saving}
        onCancel={() => setModalState(undefined)}
        onSubmitCreate={async (values) => {
          setSaving(true);
          try {
            const created = await createAdminPlan(values);
            setPlans((current) => [...(current ?? []), created]);
            setModalState(undefined);
            notificationProvider.open({ type: "success", message: "Plan created" });
          } finally {
            setSaving(false);
          }
        }}
        onSubmitEdit={async (values) => {
          if (modalState?.mode !== "edit") return;
          setSaving(true);
          try {
            const updated = await updateAdminPlan(modalState.plan.id, values);
            setPlans((current) => (current ?? []).map((plan) => (plan.id === updated.id ? updated : plan)));
            setModalState(undefined);
            notificationProvider.open({ type: "success", message: "Plan updated" });
          } finally {
            setSaving(false);
          }
        }}
      />
    </div>
  );
}
