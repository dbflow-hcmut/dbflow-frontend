"use client";

import {
  createStripeCheckout,
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
  const currentPlanOrder = entitlements?.plan.displayOrder;

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
      const order = await createStripeCheckout({
        workspaceId,
        planCode: plan.code,
        billingCycle: cycle,
        quantity: 1,
      });
      if (!order.checkoutUrl) throw new Error("Stripe checkout URL is missing");
      window.location.href = order.checkoutUrl;
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Unable to create Stripe checkout",
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
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-950">Upgrade your plan</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">Choose the right plan for your projects and team.</p>
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

        <div className="mb-3 flex justify-end">
          <div className="flex h-6 items-center rounded-full border border-gray-200 bg-white">
            {(["monthly", "yearly"] as BillingCycle[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCycle(item)}
                className={`h-5 cursor-pointer rounded-full px-2 text-[11px]! capitalize leading-5 transition ${cycle === item ? "bg-primary-500 !text-white" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"}`}
              >
                {item}
                {item === "yearly" && (
                  <span className={`ml-1 text-[8px] ${cycle === item ? "text-green-100" : "text-green-600"}`}>
                    save 17%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-stretch justify-center gap-6">
          {availablePlans.map((plan) => {
            const baseAmount = Number(cycle === "yearly" ? plan.yearlyBasePrice : plan.monthlyBasePrice);
            const seatPrice = Number((cycle === "yearly" ? plan.yearlySeatPrice : plan.monthlySeatPrice) ?? 0);
            const total = baseAmount + Math.max(0, quantity - plan.includedSeats) * seatPrice;
            const isCurrent = plan.code === currentPlanCode;
            const isDowngrade =
              currentPlanOrder != null &&
              (plan.displayOrder ?? 0) < currentPlanOrder;
            const isPaid = baseAmount > 0;
            const isPopular = plan.code === "pro" || plan.code === "team";
            const canCheckout =
              isPaid &&
              !isCurrent &&
              !isDowngrade &&
              (!isAuthenticated || workspaceType === "team" || Boolean(workspaceId));

            return (
              <article
                key={plan.id}
                className={`relative flex min-h-[520px] w-full flex-col rounded-2xl border bg-white p-6 md:w-[calc(50%_-_12px)] xl:w-[calc(25%_-_18px)] ${isPopular ? "border-primary-300 shadow-[0_18px_50px_-28px_rgba(66,165,245,0.65)]" : "border-gray-200"}`}
              >
                <div className="mb-3 flex min-h-7 items-center justify-end">
                    {isCurrent && (
                      <span className="inline-flex h-6 items-center rounded-full bg-green-50 px-2.5 text-[10px] font-semibold text-green-700">Current plan</span>
                    )}
                </div>
                <div className="mb-5 min-h-[76px]">
                  <h2 className="text-3xl! font-semibold! text-gray-950">{plan.name}</h2>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-gray-500">{plan.description}</p>
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
                      : isDowngrade
                        ? "Downgrade unavailable"
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
      </div>
    </div>
  );
}
