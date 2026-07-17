# Admin & Billing Operations Implementation Rules

## Implemented

- User status: active/suspended.
- JWT validation rejects suspended users.
- Admin dashboard totals and revenue.
- Admin lists: users, projects, workspaces, orders, subscriptions, plans,
  audit logs.
- Admin suspend/activate user with audit log.
- Frontend `/admin` dashboard with users, orders and subscriptions.
- Workspace billing history with continue-payment action.
- Stale AI reservation cleanup every 5 minutes.
- Expired PayOS subscriptions marked expired every 10 minutes; entitlement
  lookup then provisions the default free subscription.

## Authorization

- Admin APIs require JWT, `RolesGuard` and system role `admin`.
- Billing history requires workspace owner or billing role.
- Suspension is checked on every JWT-authenticated request.

## Limitations

- Admin UI is MVP: no advanced pagination/filter/edit-plan form.
- PayOS reconciliation/cancel-link/refund are not implemented.
- In-process timers are suitable for one instance; multi-instance production
  should move cleanup/expiry to a distributed scheduler.
- Audit currently covers user status changes; other admin mutations must add
  audit entries when implemented.
