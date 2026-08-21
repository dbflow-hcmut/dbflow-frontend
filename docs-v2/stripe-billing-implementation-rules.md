# Stripe Recurring Billing Implementation Rules

## 1. Main code

- `dbflow-backend/src/modules/billing/**`
- `dbflow-backend/src/migrations/1784786400000-ReplacePayOSWithStripe.ts`
- `dbflow-frontend/src/app/pricing/**`
- `dbflow-frontend/src/components/WorkspaceSettings/index.tsx`
- `dbflow-frontend/src/api/subscriptions/client.ts`

## 2. Environment and local test

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:3000
```

Webhook endpoint:

```text
POST <BACKEND_URL>/billing/webhooks/stripe
```

For local testing, forward Stripe test events to the endpoint. The webhook
secret must be the secret printed by the forwarding session, not the API key.
The Nest application enables `rawBody`; signature verification must use that
buffer and must happen before interpreting the event.

## 3. Checkout

1. Owner or billing member selects plan, cycle, and seat quantity.
2. Backend reloads the active plan and calculates the amount; frontend amount is
   never trusted.
3. Backend creates a pending order.
4. Backend creates Stripe Checkout with `mode=subscription`, inline recurring
   `price_data`, and `orderId` in both Checkout and Subscription metadata.
5. VND is zero-decimal in Stripe, so the integer database amount is passed as
   `unit_amount` without multiplying by 100.
6. Frontend redirects to Stripe-hosted Checkout.

An existing Stripe subscription cannot create a second Checkout subscription.
The owner/billing member must use Stripe Billing Portal to update the payment
method, change supported settings, or cancel renewal.

## 4. Webhooks and subscription state

Handled events:

| Event | Local effect |
|---|---|
| `checkout.session.completed` | Creates a pending team workspace when necessary and stores Stripe customer/subscription IDs. |
| `invoice.created` / `invoice.finalized` | Upserts a pending billing-history row so draft and open renewal invoices are visible before collection. |
| `invoice.paid` | Sets subscription active, synchronizes its period, records a paid order and idempotent transaction. |
| `invoice.payment_failed` | Sets the local subscription to `past_due`. |
| `customer.subscription.updated` | Synchronizes status, period, cancellation flag, and cancellation timestamp. |
| `customer.subscription.deleted` | Synchronizes the canceled subscription. |

`provider_subscription_id`, `orders.provider_invoice_id`, and
`payment_transactions.provider_transaction_id` are unique idempotency keys.
Webhook delivery order is not assumed: invoice handlers can provision the local
subscription from the Stripe subscription's checkout `orderId` metadata even if
the invoice event arrives before `checkout.session.completed`. Stripe
subscription item period timestamps are the source of truth because current
Stripe API versions expose the period on the subscription item.

Invoice upserts acquire a PostgreSQL transaction advisory lock keyed by Stripe
subscription ID. This serializes concurrent `invoice.created`,
`invoice.finalized`, and `invoice.paid` deliveries. Before inserting, the handler
also falls back to the existing `(subscriptionId, renewalPeriodStart)` order so
legacy renewal rows and repeated events do not violate the open-renewal unique
constraint.

## 5. Renewal and billing history

Stripe uses automatic collection and the saved payment method. There is no
application scheduler, renewal payment link, or renewal reminder email. Each
successful `invoice.paid` creates a local paid order linked to its subscription,
so the existing workspace/admin history remains usable. The invoice ID is used
as the provider invoice/transaction key and the hosted invoice URL is retained.

Listing workspace billing history also reconciles the latest 24 invoices from
Stripe. This repairs missed or out-of-order webhooks and synchronizes existing
draft/open/paid invoice rows before returning local history. A temporary Stripe
failure does not make the already stored local history unavailable.

Pending Checkout sessions can be expired through the existing order cancel API.
Canceling an active subscription is done in Stripe Billing Portal and is then
synchronized by a subscription webhook.

## 6. Test-mode limitation

This integration is intended to work entirely with Stripe test keys and test
cards for the thesis demo. It does not require receiving real funds. Moving to
live mode later requires Stripe account activation/business verification,
separate live API keys, a live webhook endpoint/secret, and production review of
currency, taxes, pricing, payment methods, and customer communication.
