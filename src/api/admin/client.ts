import { PROXY_ADMIN } from "@/api";
import { apiGet, apiPatch, apiPost } from "@/lib/clientFetch";
import { BillingOrder, Plan, Subscription } from "@/api/subscriptions/client";

export interface AdminDashboard {
  users: number;
  suspendedUsers: number;
  workspaces: number;
  subscriptions: number;
  paidOrders: number;
  pendingOrders: number;
  revenueVnd: number;
}

export interface AdminRevenuePoint {
  period: string;
  revenue: number;
}

export type AnalyticsBucket = "day" | "week" | "month";

export interface AdminAnalyticsStat {
  key: string;
  label: string;
  value: number;
  previousValue: number;
  changePct: number;
  series: { period: string; value: number }[];
}

export interface AdminOrderStatusBreakdown {
  status: string;
  count: number;
}

export interface AdminAiAnalytics {
  totalCredits: number;
  totalModelCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  series: {
    period: string;
    credits: number;
    modelCalls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }[];
}

export interface AdminDbEngineBreakdown {
  name: string;
  count: number;
}

export interface AdminProjectAnalytics {
  totalProjects: number;
  totalExports: number;
}

export interface AdminPlanDistribution {
  planName: string;
  count: number;
}

export interface AdminOverviewAnalytics {
  range: { from: string; to: string; bucket: AnalyticsBucket };
  stats: AdminAnalyticsStat[];
  orderStatusBreakdown: AdminOrderStatusBreakdown[];
  paidOrderRate: number;
  aiAnalytics?: AdminAiAnalytics;
  dbEngineBreakdown?: AdminDbEngineBreakdown[];
  planDistribution?: AdminPlanDistribution[];
  projectAnalytics?: AdminProjectAnalytics;
}

export interface AdminPersonSummary {
  id: string;
  fullName: string;
  email: string;
  avatar: string;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  avatar: string;
  role: string;
  status: "active" | "suspended";
  createdAt: string;
}

export type AdminSubscription = Subscription & {
  owner: AdminPersonSummary | null;
  workspace?: {
    id: string;
    name: string;
    type: "personal" | "team";
  } | null;
};

export type AdminOrder = BillingOrder & {
  buyer: AdminPersonSummary | null;
  workspace?: {
    id: string;
    name: string;
    type: "personal" | "team";
  } | null;
};

export interface PlanConfigInput {
  name: string;
  description?: string;
  workspaceType: "personal" | "team" | "any";
  currency: string;
  monthlyBasePrice: string;
  yearlyBasePrice: string;
  monthlySeatPrice?: string;
  yearlySeatPrice?: string;
  includedSeats: number;
  isActive: boolean;
  displayOrder: number;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
}

export type CreatePlanInput = PlanConfigInput & { code: string };

export function getAdminDashboard() {
  return apiGet<AdminDashboard>(`${PROXY_ADMIN}/dashboard`);
}

export function getAdminOverviewAnalytics(from?: string, to?: string, bucket?: AnalyticsBucket) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (bucket) params.set("bucket", bucket);
  const query = params.toString();
  return apiGet<AdminOverviewAnalytics>(`${PROXY_ADMIN}/analytics/overview${query ? `?${query}` : ""}`);
}

export function getAdminUsers() {
  return apiGet<{ items: AdminUser[] }>(`${PROXY_ADMIN}/users?limit=100`);
}

export function updateAdminUserStatus(
  userId: string,
  status: "active" | "suspended",
  reason?: string,
) {
  return apiPatch<{ id: string; status: string }, { status: string; reason?: string }>(
    `${PROXY_ADMIN}/users/${userId}/status`,
    { status, reason },
  );
}

export function getAdminOrders() {
  return apiGet<AdminOrder[]>(`${PROXY_ADMIN}/orders`);
}

export function createAdminRenewalBill(subscriptionId: string) {
  return apiPost<AdminOrder, Record<string, never>>(
    `${PROXY_ADMIN}/subscriptions/${subscriptionId}/bills`,
    {},
  );
}

export function cancelAdminBill(orderId: string) {
  return apiPatch<AdminOrder, Record<string, never>>(
    `${PROXY_ADMIN}/orders/${orderId}/cancel`,
    {},
  );
}

export function getAdminSubscriptions() {
  return apiGet<AdminSubscription[]>(`${PROXY_ADMIN}/subscriptions`);
}

export type AdminSubscriptionAction =
  | "pause"
  | "resume"
  | "cancel_at_period_end"
  | "resume_renewal"
  | "revoke";

export function updateAdminSubscription(
  subscriptionId: string,
  action: AdminSubscriptionAction,
  reason: string,
) {
  return apiPatch<AdminSubscription, { action: AdminSubscriptionAction; reason: string }>(
    `${PROXY_ADMIN}/subscriptions/${subscriptionId}`,
    { action, reason },
  );
}

export function getAdminPlans() {
  return apiGet<Plan[]>(`${PROXY_ADMIN}/plans`);
}

export function createAdminPlan(values: CreatePlanInput) {
  return apiPost<Plan, CreatePlanInput>(`${PROXY_ADMIN}/plans`, values);
}

export function updateAdminPlan(planId: string, values: Partial<PlanConfigInput>) {
  return apiPatch<Plan, typeof values>(`${PROXY_ADMIN}/plans/${planId}`, values);
}
