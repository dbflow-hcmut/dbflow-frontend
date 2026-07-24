# Admin & Billing Operations Implementation Rules

## Implemented

- User status: active/suspended.
- JWT validation rejects suspended users.
- Admin dashboard totals and revenue.
- Admin lists: users, projects, workspaces, orders, subscriptions, plans,
  audit logs.
- Admin suspend/activate user with audit log.
- Frontend `/admin` dashboard with a responsive sidebar, KPI cards, revenue trend
  visualization, user and order tables, a dedicated `/admin/subscriptions`
  management page, and plan pricing management.
- Admin tables expose client-side search over the currently loaded result set.
- The subscription management page excludes the non-renewing `free` and
  `team_free` plans; those subscriptions provide default access and are not
  admin-managed billing subscriptions.
- Each managed subscription row identifies its workspace name/type in addition
  to the owner, and subscription search includes the workspace name.
- Admin plan price edits are restricted to the admin API, persisted on the plan,
  and recorded as `plan.update` audit entries.
- Admin billing can pause/resume a subscription, cancel renewal at period end,
  or revoke it immediately. Pause/revoke fall the workspace back to the
  default Free plan while keeping existing projects readable; quotas and
  feature gates then use Free-plan entitlements. Admin actions require a
  message stored in subscription metadata; users see that message in
  Workspace Settings. It is not written to the admin audit log.
- Plan feature flags are enforced by the backend: `export` gates export record
  creation/tracking, `rollback` gates applying a DOWN migration, and
  `team_roles` gates workspace member/invitation management. The unsupported
  `audit_log` flag is not offered in the admin plan form or pricing copy.
- Admin revenue analytics groups paid orders by calendar month for the current
  month plus the preceding 11 months; the frontend renders only this API data.
- Workspace billing history with continue-payment action.
- Stale AI reservation cleanup every 5 minutes.
- Expired PayOS subscriptions marked expired every 10 minutes; entitlement
  lookup then provisions the default free subscription.

## Authorization

- Admin APIs require JWT, `RolesGuard` and system role `admin`.
- Frontend `AdminShell` also gates all `/admin/*` routes by the loaded system
  role; non-admin users are redirected to the existing `/not-found` page
  instead of rendering admin pages and triggering misleading API responses.
- Billing history requires workspace owner or billing role.
- Admin Subscriptions có action `Create bill` cho paid active subscription.
  Action này dùng cùng renewal service với scheduler và trả lại bill hiện có nếu
  kỳ đó đã có bill chưa canceled.
- Admin Billing chỉ cho `Cancel bill` với renewal bill còn pending/failed. Hủy
  bill sẽ tắt auto-renew (`cancelAtPeriodEnd = true`) cho subscription liên quan.
- Admin Billing identifies the workspace name/type for each order and includes
  workspace names in billing search. Pre-workspace checkout orders display the
  requested workspace name as `pending creation`.
- Suspension is checked on every JWT-authenticated request.
- The Users page hides status actions for the current administrator, and the
  backend independently rejects attempts by an administrator to suspend their
  own account.

## Limitations

- Admin tables currently use the existing bounded API result sets; advanced
  server-side pagination/filtering remains a follow-up.
- PayOS reconciliation/cancel-link/refund are not implemented.
- In-process timers are suitable for one instance; multi-instance production
  should move cleanup/expiry to a distributed scheduler.
- Plan and user mutations are audited; other admin mutations must add audit
  entries when implemented.
