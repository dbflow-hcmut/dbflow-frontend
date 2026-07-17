"use client";

import { createPayOSCheckout, getPlans, Plan } from "@/api/subscriptions/client";
import { getWorkspaces, WorkspaceSummary } from "@/api/workspaces/client";
import { notificationProvider } from "@/providers/notification";
import { Button, Card, InputNumber, Segmented, Select, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [quantity, setQuantity] = useState(5);
  const [loadingPlan, setLoadingPlan] = useState<string>();

  useEffect(() => {
    void Promise.all([getPlans(), getWorkspaces()]).then(
      ([planData, workspaceData]) => {
        setPlans(planData);
        setWorkspaces(workspaceData);
        const requestedWorkspace = new URLSearchParams(
          window.location.search,
        ).get("workspaceId");
        const stored = localStorage.getItem("active_workspace_id");
        setWorkspaceId(
          workspaceData.find((item) => item.id === requestedWorkspace)?.id ??
            workspaceData.find((item) => item.id === stored)?.id ??
            workspaceData[0]?.id,
        );
      },
    );
  }, []);

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId),
    [workspaceId, workspaces],
  );
  const availablePlans = plans.filter(
    (plan) =>
      plan.workspaceType === workspace?.type || plan.workspaceType === "any",
  );

  const checkout = async (plan: Plan) => {
    if (!workspaceId) return;
    setLoadingPlan(plan.id);
    try {
      const order = await createPayOSCheckout({
        workspaceId,
        planCode: plan.code,
        billingCycle: cycle,
        quantity: workspace?.type === "team" ? quantity : 1,
      });
      if (!order.checkoutUrl) throw new Error("PayOS checkout URL is missing");
      window.location.href = order.checkoutUrl;
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Unable to create PayOS checkout",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingPlan(undefined);
    }
  };

  if (!workspaceId) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Spin /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">DBFlow plans</h1>
        <p className="mt-2 text-gray-500">Pay securely through PayOS and VietQR.</p>
      </div>
      <div className="mb-8 flex flex-wrap justify-center gap-3">
        <Select
          className="w-64"
          value={workspaceId}
          options={workspaces.map((item) => ({ value: item.id, label: item.name }))}
          onChange={setWorkspaceId}
        />
        <Segmented
          value={cycle}
          options={[
            { label: "Monthly", value: "monthly" },
            { label: "Yearly", value: "yearly" },
          ]}
          onChange={(value) => setCycle(value as "monthly" | "yearly")}
        />
        {workspace?.type === "team" && (
          <InputNumber min={1} max={1000} value={quantity} onChange={(value) => setQuantity(value ?? 5)} addonAfter="seats" />
        )}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {availablePlans.map((plan) => {
          const amount = Number(
            cycle === "yearly" ? plan.yearlyBasePrice : plan.monthlyBasePrice,
          );
          const seatPrice = Number(
            (cycle === "yearly"
              ? plan.yearlySeatPrice
              : plan.monthlySeatPrice) ?? 0,
          );
          const total =
            amount +
            Math.max(0, quantity - plan.includedSeats) * seatPrice;
          return (
            <Card key={plan.id} title={plan.name}>
              <p className="min-h-12 text-sm text-gray-500">{plan.description}</p>
              <div className="my-5 text-2xl font-bold">
                {total.toLocaleString("vi-VN")} {plan.currency}
              </div>
              <Button
                block
                type="primary"
                disabled={amount <= 0}
                loading={loadingPlan === plan.id}
                onClick={() => void checkout(plan)}
              >
                {amount > 0 ? "Pay with PayOS" : "Current free plan"}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
