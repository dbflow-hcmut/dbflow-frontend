"use client";

import {
  createStripeCheckout,
  getPlans,
  Plan,
} from "@/api/subscriptions/client";
import { getWorkspaces, WorkspaceSummary } from "@/api/workspaces/client";
import { notificationProvider } from "@/providers/notification";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react";
import { Input, Select, Skeleton } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Cycle = "monthly" | "yearly";

export default function ConfigureTeamPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedWorkspaceId = searchParams.get("workspaceId");
  const requestedPlanCode = searchParams.get("planCode") ?? "team";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState(requestedWorkspaceId ?? undefined);
  const [workspaceName, setWorkspaceName] = useState("My Team");
  const [planCode, setPlanCode] = useState(requestedPlanCode);
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [seats, setSeats] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void Promise.all([getPlans(), getWorkspaces()])
      .then(([planData, workspaceData]) => {
        const teamWorkspaces = workspaceData.filter((item) => item.type === "team");
        const selected = teamWorkspaces.find((item) => item.id === requestedWorkspaceId) ?? teamWorkspaces[0];
        const selectedPlan = planData.find((plan) => plan.code === requestedPlanCode && plan.workspaceType === "team") ?? planData.find((plan) => plan.code === "team");
        setPlans(planData);
        setWorkspaces(teamWorkspaces);
        setWorkspaceId(selected?.id);
        setPlanCode(selectedPlan?.code ?? requestedPlanCode);
        setSeats(Math.max(selectedPlan?.includedSeats ?? 5, 1));
      })
      .catch((error) => notificationProvider.open({
        type: "error",
        message: "Unable to load plan configuration",
        description: error instanceof Error ? error.message : undefined,
      }))
      .finally(() => setLoading(false));
  }, [requestedPlanCode, requestedWorkspaceId]);

  const plan = useMemo(
    () => plans.find((item) => item.code === planCode && item.workspaceType === "team"),
    [planCode, plans],
  );
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const basePrice = Number(cycle === "yearly" ? plan?.yearlyBasePrice : plan?.monthlyBasePrice) || 0;
  const seatPrice = Number((cycle === "yearly" ? plan?.yearlySeatPrice : plan?.monthlySeatPrice) ?? 0);
  const total = basePrice + Math.max(0, seats - (plan?.includedSeats ?? 0)) * seatPrice;

  const subscribe = async () => {
    if (!plan || (!workspaceId && workspaceName.trim().length < 2)) return;
    setSubmitting(true);
    try {
      const order = await createStripeCheckout({
        workspaceId,
        workspaceName: workspaceId ? undefined : workspaceName.trim(),
        planCode: plan.code,
        billingCycle: cycle,
        quantity: seats,
      });
      if (!order.checkoutUrl) throw new Error("Stripe checkout URL is missing");
      window.location.href = order.checkoutUrl;
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Unable to create checkout",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-full bg-[#f7f7f8] px-4 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[960px]">
          <div className="mb-8 flex items-center gap-3">
            <Skeleton.Button active shape="circle" size="small" />
            <Skeleton.Input active size="small" className="!w-56" />
          </div>
          <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
            <section>
              <Skeleton.Input active size="small" className="mb-4 !w-28" />
              <Skeleton.Input active block className="mb-6 !h-10" />
              <div className="mb-6 grid grid-cols-2 gap-3">
                <Skeleton.Node active className="!h-[122px] !w-full rounded-2xl" />
                <Skeleton.Node active className="!h-[122px] !w-full rounded-2xl" />
              </div>
              <Skeleton.Node active className="!h-[110px] !w-full rounded-2xl" />
            </section>
            <aside className="rounded-3xl border border-gray-200 bg-white p-7">
              <Skeleton active title={{ width: "55%" }} paragraph={{ rows: 6 }} />
              <Skeleton.Button active block className="mt-7 !h-12 rounded-full" />
            </aside>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[#f7f7f8] px-4 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[960px]">
        <div className="mb-8 flex items-center justify-between">
          <button type="button" onClick={() => router.back()} className="flex cursor-pointer items-center gap-3 text-gray-950 hover:text-primary-600">
            <ArrowLeft className="h-5 w-5" /> <span className="text-2xl font-semibold tracking-tight">Configure your plan</span>
          </button>
          <button type="button" aria-label="Close" onClick={() => router.push("/pricing")} className="cursor-pointer rounded-full p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-950"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
            <section>
              <h2 className="mb-4 text-lg font-semibold text-gray-950">Plan details</h2>
              {workspace ? (
                <Select
                  className="mb-6 w-full cursor-pointer [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selection-item]:cursor-pointer"
                  size="large"
                  value={workspaceId}
                  options={workspaces.map((item) => ({ value: item.id, label: item.name }))}
                  onChange={setWorkspaceId}
                />
              ) : (
                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">Team workspace name</label>
                  <Input
                    size="large"
                    value={workspaceName}
                    maxLength={120}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    className="!rounded-2xl"
                    placeholder="My Team"
                  />
                </div>
              )}
              <div className="mb-6 pt-6 grid grid-cols-2 gap-3">
                {(["monthly", "yearly"] as Cycle[]).map((item) => (
                  <button key={item} type="button" onClick={() => setCycle(item)} className={`cursor-pointer rounded-2xl border p-5 text-left transition ${cycle === item ? "border-primary-400 bg-white shadow-[0_8px_24px_-16px_rgba(66,165,245,.6)]" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <strong className="block text-base capitalize text-gray-950">{item} billing</strong>
                    <span className="mt-2 block text-sm text-gray-500">{Number(item === "monthly" ? plan?.monthlyBasePrice : plan?.yearlyBasePrice).toLocaleString("vi-VN")}₫ / {item === "monthly" ? "month" : "year"}</span>
                    {item === "yearly" && <span className="mt-2 inline-block rounded-full bg-primary-50 px-2 py-1 text-[10px] font-semibold text-primary-700">SAVE 17%</span>}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <label className="mb-1 block text-sm font-semibold text-gray-950">Seats</label>
                <div className="flex items-center justify-between">
                  <button type="button" aria-label="Remove seat" onClick={() => setSeats((value) => Math.max(plan?.includedSeats ?? 1, value - 1))} className="cursor-pointer rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Minus className="h-5 w-5" /></button>
                  <span className="text-lg font-medium text-gray-950">{seats}</span>
                  <button type="button" aria-label="Add seat" onClick={() => setSeats((value) => Math.min(1000, value + 1))} className="cursor-pointer rounded-lg p-2 text-gray-500 hover:bg-gray-100"><Plus className="h-5 w-5" /></button>
                </div>
              </div>
            </section>

            <aside className="rounded-3xl border border-gray-200 bg-white p-7 shadow-[0_18px_45px_-28px_rgba(31,41,55,.45)]">
              <h2 className="text-2xl font-semibold text-gray-950">{plan?.name ?? "Team"} plan</h2>
              <p className="mt-2 text-sm text-gray-500">{plan?.description}</p>
              <ul className="mt-7 space-y-3 text-sm text-gray-700">
                {(plan ? [`${plan.includedSeats} seats included`, `${plan.limits.projects ?? "Unlimited"} projects`, `${plan.limits.ai_requests_monthly ?? "Unlimited"} AI requests per month`, ...(plan.features.team_roles ? ["Team roles and permissions"] : []), ...(plan.features.export ? ["Schema and DDL exports"] : [])] : []).map((item) => <li key={item} className="flex gap-2"><Check className="h-4 w-4 text-primary-500" />{item}</li>)}
              </ul>
              <div className="my-7 border-t border-gray-200 pt-5 text-sm text-gray-600">
                <div className="flex justify-between"><span>{seats}x {cycle} subscription</span><span>{total.toLocaleString("vi-VN")}₫</span></div>
                <div className="mt-3 flex justify-between text-base font-semibold text-gray-950"><span>Due today</span><span>{total.toLocaleString("vi-VN")}₫</span></div>
              </div>
              <button type="button" disabled={submitting || !plan || (!workspaceId && workspaceName.trim().length < 2)} onClick={() => void subscribe()} className="h-12 w-full cursor-pointer rounded-full bg-primary-500 !text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Preparing checkout…" : "Subscribe"}</button>
            </aside>
          </div>
      </div>
    </main>
  );
}
