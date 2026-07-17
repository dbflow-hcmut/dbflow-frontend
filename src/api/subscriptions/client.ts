import {
  PROXY_PLANS,
  PROXY_WORKSPACE_ENTITLEMENTS,
  PROXY_WORKSPACE_SUBSCRIPTION,
  PROXY_BILLING_CHECKOUT,
  PROXY_BILLING_ORDERS,
} from "@/api";
import { apiGet } from "@/lib/clientFetch";
import { apiPost } from "@/lib/clientFetch";

export interface Plan {
  id: string;
  code: string;
  version: number;
  name: string;
  description?: string | null;
  workspaceType: "personal" | "team" | "any";
  currency: string;
  monthlyBasePrice: string;
  yearlyBasePrice: string;
  monthlySeatPrice?: string | null;
  yearlySeatPrice?: string | null;
  includedSeats: number;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
}

export interface Subscription {
  id: string;
  workspaceId: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired" | "paused";
  billingCycle: "monthly" | "yearly" | "custom";
  quantity: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  plan: Plan;
}

export interface WorkspaceEntitlements {
  subscription: Subscription;
  plan: Plan;
  usage: {
    workspaceSeats: {
      active: number;
      pending: number;
      used: number;
      limit: number | null;
    };
    projects: {
      used: number;
      limit: number | null;
    };
    dbConnections: {
      used: number;
      limit: number | null;
    };
    schemas: {
      used: number;
      limitPerProject: number | null;
    };
    aiRequests: {
      used: number;
      reserved: number;
      limit: number | null;
      periodKey: string;
    };
    documentStorage: {
      used: number;
      limit: number | null;
    };
    exports: {
      used: number;
      limit: number | null;
      periodKey: string;
    };
  };
}

export interface BillingOrder {
  id: string;
  orderNumber: string;
  workspaceId: string;
  billingCycle: "monthly" | "yearly";
  quantity: number;
  amount: string;
  currency: string;
  status: "pending" | "paid" | "failed" | "canceled" | "expired";
  checkoutUrl?: string | null;
  createdAt: string;
  plan?: Plan;
}

export function getPlans() {
  return apiGet<Plan[]>(PROXY_PLANS);
}

export function getWorkspaceSubscription(workspaceId: string) {
  return apiGet<Subscription>(PROXY_WORKSPACE_SUBSCRIPTION(workspaceId));
}

export function getWorkspaceEntitlements(workspaceId: string) {
  return apiGet<WorkspaceEntitlements>(
    PROXY_WORKSPACE_ENTITLEMENTS(workspaceId),
  );
}

export function createPayOSCheckout(values: {
  workspaceId: string;
  planCode: string;
  billingCycle: "monthly" | "yearly";
  quantity: number;
}) {
  return apiPost<BillingOrder, typeof values>(PROXY_BILLING_CHECKOUT, values);
}

export function getBillingOrders(workspaceId: string) {
  return apiGet<BillingOrder[]>(PROXY_BILLING_ORDERS(workspaceId));
}
