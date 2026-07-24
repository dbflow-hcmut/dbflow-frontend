"use client";

import {
  createPayOSCheckout,
  getPlans,
  getWorkspaceEntitlements,
  Plan,
  WorkspaceEntitlements,
} from "@/api/subscriptions/client";
import { getWorkspaces, WorkspaceSummary } from "@/api/workspaces/client";
import { notificationProvider } from "@/providers/notification";
import { Check, Users, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoadingIndicator from "@/components/LoadingIndicator";
import { useAuth } from "@/providers/AuthProvider";

type BillingCycle = "monthly" | "yearly";
type Audience = "personal" | "business";

const formatLimit = (value: number | null | undefined) =>
  value == null ? "Unlimited" : value.toLocaleString("en-US");

const formatStorage = (bytes: number | null | undefined) => {
  if (bytes == null) return "Unlimited storage";
  if (bytes >= 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)} GB document storage`;
  return `${Math.round(bytes / 1024 ** 2)} MB document storage`;
};

function getPlanBenefits(plan: Plan) {
  const limits = plan.limits;
  const benefits = [
    `${formatLimit(limits.projects)} projects`,
    `${formatLimit(limits.schemas_per_project)} schemas per project`,
    `${formatLimit(limits.ai_requests_monthly)} AI requests per month`,
    `${formatLimit(limits.db_connections)} database connections`,
    formatStorage(limits.document_storage_bytes),
  ];

  if (plan.workspaceType === "team") {
    benefits.unshift(`${plan.includedSeats} seats included`);
  }
  if (plan.features.export) benefits.push("Schema and DDL exports");
  if (plan.features.rollback) benefits.push("Schema version rollback");
  if (plan.features.team_roles) benefits.push("Team roles and permissions");

  return benefits;
}

export default function PricingPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [audience, setAudience] = useState<Audience>("personal");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [quantity, setQuantity] = useState(5);
  const [entitlements, setEntitlements] = useState<WorkspaceEntitlements>();
  const [loadingPlan, setLoadingPlan] = useState<string>();
  const [baseDataLoaded, setBaseDataLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    void Promise.all([
      getPlans(),
      isAuthenticated ? getWorkspaces() : Promise.resolve([] as WorkspaceSummary[]),
    ])
      .then(([planData, workspaceData]) => {
        setPlans(planData);
        setWorkspaces(workspaceData);

        const requestedWorkspace = new URLSearchParams(window.location.search).get("workspaceId");
        const storedWorkspace = localStorage.getItem("active_workspace_id");
        const selected =
          workspaceData.find((item) => item.id === requestedWorkspace) ??
          workspaceData.find((item) => item.id === storedWorkspace) ??
          workspaceData.find((item) => item.type === "personal") ??
          workspaceData[0];

        if (selected) {
          setWorkspaceId(selected.id);
          setAudience(selected.type === "team" ? "business" : "personal");
          setQuantity(Math.max(1, selected.type === "team" ? 5 : 1));
          localStorage.setItem("active_workspace_id", selected.id);
        }
      })
      .catch((error) => {
        notificationProvider.open({
          type: "error",
          message: "Unable to load pricing",
          description: error instanceof Error ? error.message : undefined,
        });
      })
      .finally(() => {
        setBaseDataLoaded(true);
      });
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!baseDataLoaded) return;

    if (!isAuthenticated || !workspaceId) {
      setEntitlements(undefined);
      setLoading(false);
      return;
    }

    setEntitlements(undefined);
    void getWorkspaceEntitlements(workspaceId)
      .then(setEntitlements)
      .catch((error) => {
        notificationProvider.open({
          type: "error",
          message: "Unable to load your current plan",
          description: error instanceof Error ? error.message : undefined,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [baseDataLoaded, isAuthenticated, workspaceId]);

  const workspaceType = audience === "business" ? "team" : "personal";
  const selectedWorkspace = workspaces.find((item) => item.id === workspaceId);
  const availablePlans = plans.filter(
    (plan) => plan.workspaceType === workspaceType || plan.workspaceType === "any",
  );

  const currentPlanCode = entitlements?.plan.code;

  const switchAudience = (nextAudience: Audience) => {
    setAudience(nextAudience);
    const nextType = nextAudience === "business" ? "team" : "personal";
    const nextWorkspace = workspaces.find((item) => item.type === nextType);
    setWorkspaceId(nextWorkspace?.id);
    if (nextWorkspace) {
      localStorage.setItem("active_workspace_id", nextWorkspace.id);
      setQuantity(Math.max(1, nextWorkspace.type === "team" ? 5 : 1));
    }
  };

  const checkout = async (plan: Plan) => {
    if (!isAuthenticated) {
      const callbackUrl = workspaceType === "team"
        ? `/pricing/configure?planCode=${encodeURIComponent(plan.code)}`
        : "/pricing";
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    if (workspaceType === "team") {
      const params = new URLSearchParams({ planCode: plan.code });
      if (workspaceId) params.set("workspaceId", workspaceId);
      router.push(`/pricing/configure?${params.toString()}`);
      return;
    }
    if (!workspaceId || selectedWorkspace?.type !== workspaceType) return;
    setLoadingPlan(plan.id);
    try {
      const order = await createPayOSCheckout({
        workspaceId,
        planCode: plan.code,
        billingCycle: cycle,
        quantity: 1,
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

  if (loading) {
    return (
      <div className="min-h-full bg-[#f7f7f8]">
        <LoadingIndicator fullArea label="Loading pricing" />
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-[#f7f7f8] px-4 py-10 sm:px-6 lg:px-8">
      <button
        type="button"
        aria-label="Close pricing"
        onClick={() => router.back()}
        className="absolute right-5 top-5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-200/70 hover:text-gray-900 sm:right-7 sm:top-7"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Upgrade your plan</h1>
          <p className="mt-2 text-sm text-gray-500">Choose the right plan for your projects and team.</p>
        </div>

        <div className="mx-auto mb-6 grid max-w-sm grid-cols-2 rounded-3xl bg-gray-200/70 p-1">
          <button
            type="button"
            onClick={() => switchAudience("personal")}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-3xl! px-4 py-2 text-sm font-medium transition ${audience === "personal" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            <UserRound className="h-4 w-4" /> Personal
          </button>
          <button
            type="button"
            onClick={() => switchAudience("business")}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-3xl! px-4 py-2 text-sm font-medium transition ${audience === "business" ? "bg-white text-gray-950 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
          >
            <Users className="h-4 w-4" /> Business
          </button>
        </div>

        <div className="grid items-stretch justify-center gap-8 md:grid-cols-[repeat(2,minmax(0,470px))]">
          {availablePlans.map((plan) => {
            const baseAmount = Number(cycle === "yearly" ? plan.yearlyBasePrice : plan.monthlyBasePrice);
            const seatPrice = Number((cycle === "yearly" ? plan.yearlySeatPrice : plan.monthlySeatPrice) ?? 0);
            const total = baseAmount + Math.max(0, quantity - plan.includedSeats) * seatPrice;
            const isCurrent = plan.code === currentPlanCode;
            const isPaid = baseAmount > 0;
            const isPopular = plan.code === "pro" || plan.code === "team";
            const canCheckout =
              isPaid &&
              !isCurrent &&
              (!isAuthenticated || workspaceType === "team" || Boolean(workspaceId));

            return (
              <article
                key={plan.id}
                className={`relative flex min-h-[520px] flex-col rounded-2xl border bg-white p-6 ${isPopular ? "border-primary-300 shadow-[0_18px_50px_-28px_rgba(66,165,245,0.65)]" : "border-gray-200"}`}
              >
                <div className="relative mb-5 min-h-[76px]">
                  <div className="w-full">
                    <h2 className="text-3xl! font-semibold! text-gray-950">{plan.name}</h2>
                    <p className="mt-2 min-h-10 text-sm leading-5 text-gray-500">{plan.description}</p>
                  </div>
                  <div className="absolute right-0 top-0 flex items-center gap-2">
                    {audience === "personal" && plan.code === "pro" && (
                      <div className="flex rounded-3xl border border-gray-200 bg-gray-50 p-0.5">
                        {(["monthly", "yearly"] as BillingCycle[]).map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setCycle(item)}
                            className={`cursor-pointer rounded-3xl px-2.5 py-1 text-xs! capitalize transition ${cycle === item ? "bg-primary-500 !text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900"}`}
                          >
                            {item}
                            {item === "yearly" && <span className={`ml-1 text-[9px] ${cycle === item ? "text-green-100" : "text-green-600"}`}>save 17%</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {isCurrent && (
                      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">Current plan</span>
                    )}
                  </div>
                </div>

                <div className="mb-5 min-h-[86px]">
                  <div className="flex items-end gap-2">
                    <strong className="text-4xl font-semibold tracking-tight text-gray-950">
                      {total.toLocaleString("vi-VN")}₫
                    </strong>
                    <span className="pb-1 text-sm text-gray-500">/{cycle === "monthly" ? "month" : "year"}</span>
                  </div>
                  {workspaceType === "team" && isPaid && (
                    <p className="mt-2 text-xs text-gray-500">
                      Includes {plan.includedSeats} seats · extra seats are added automatically
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canCheckout || loadingPlan === plan.id}
                  onClick={() => void checkout(plan)}
                  className={`mb-7 h-11 w-full rounded-full text-sm font-semibold transition ${isCurrent ? "cursor-default border border-gray-200 bg-gray-50 text-gray-400" : canCheckout ? "cursor-pointer bg-primary-500 !text-white hover:bg-primary-600" : "cursor-not-allowed border border-gray-200 bg-white text-gray-400"}`}
                >
                  {loadingPlan === plan.id
                    ? "Creating checkout…"
                    : isCurrent
                      ? "Your current plan"
                      : isPaid
                        ? workspaceType === "team" ? `Configure ${plan.name}` : `Upgrade to ${plan.name}`
                        : "Free plan"}
                </button>

                <div className="pt-2">
                  <p className="mb-4 text-sm font-semibold text-gray-900">
                    {isPaid ? `Everything you need with ${plan.name}:` : "What’s included:"}
                  </p>
                  <ul className="space-y-3.5">
                    {getPlanBenefits(plan).map((benefit) => (
                      <li key={benefit} className="flex gap-3 text-sm text-gray-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-gray-900" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>

        <p className="pt-8 text-center text-xs text-gray-500">
          Payments are processed securely through PayOS and VietQR. Paid plans use one-time billing for the selected period.
        </p>
      </div>
    </div>
  );
}
