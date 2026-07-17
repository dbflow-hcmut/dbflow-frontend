import { PROXY_ADMIN } from "@/api";
import { apiGet, apiPatch } from "@/lib/clientFetch";
import { BillingOrder, Subscription } from "@/api/subscriptions/client";

export interface AdminDashboard {
  users: number;
  suspendedUsers: number;
  workspaces: number;
  subscriptions: number;
  paidOrders: number;
  pendingOrders: number;
  revenueVnd: number;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: "active" | "suspended";
  createdAt: string;
}

export function getAdminDashboard() {
  return apiGet<AdminDashboard>(`${PROXY_ADMIN}/dashboard`);
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
  return apiGet<BillingOrder[]>(`${PROXY_ADMIN}/orders`);
}

export function getAdminSubscriptions() {
  return apiGet<Subscription[]>(`${PROXY_ADMIN}/subscriptions`);
}
