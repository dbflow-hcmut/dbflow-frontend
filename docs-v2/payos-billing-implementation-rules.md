# PayOS Billing Implementation Rules

## 1. Vị trí code

- `dbflow-backend/src/modules/billing/**`
- `dbflow-backend/src/migrations/1778700000000-CreatePayOSBillingTables.ts`
- `dbflow-frontend/src/app/pricing/page.tsx`
- `dbflow-frontend/src/api/subscriptions/client.ts`

## 2. Environment

```env
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
FRONTEND_URL=http://localhost:3000
```

Webhook URL:

```text
POST <BACKEND_URL>/billing/webhooks/payos
```

## 3. Checkout flow

1. Owner hoặc billing role chọn plan/cycle/quantity.
2. Backend đọc plan version và giá từ database.
3. Backend chuẩn hóa seat quantity và tính amount.
4. Tạo pending order với numeric PayOS order code.
5. Ký request bằng HMAC-SHA256 checksum key.
6. Gọi `POST https://api-merchant.payos.vn/v2/payment-requests`.
7. Lưu payment link ID và checkout URL.
8. Frontend redirect tới PayOS hosted checkout.

Frontend không được gửi amount/currency đáng tin cậy; backend tự tính lại.

## 4. Signature

Checkout signature dùng đúng chuỗi field theo PayOS:

```text
amount&cancelUrl&description&orderCode&returnUrl
```

Tên key được sắp alphabet trong chuỗi hoàn chỉnh theo contract PayOS.

Webhook signature:

- Chỉ ký object `data`.
- Sort key alphabet.
- Array được JSON stringify với object element sort key.
- HMAC-SHA256 với `PAYOS_CHECKSUM_KEY`.
- So sánh bằng timing-safe comparison.

## 5. Webhook/idempotency

- Amount và currency phải khớp order.
- Order đã paid trả success mà không activate lần nữa.
- `provider_transaction_id` unique theo PayOS reference.
- Order, transaction và subscription update trong một DB transaction.
- Webhook sample/unknown signed order trả 2xx để PayOS có thể confirm URL.

## 6. Subscription activation

- Webhook thành công đổi order sang paid.
- Current workspace subscription được update plan, cycle, quantity và period.
- Monthly cộng một tháng; yearly cộng một năm.
- PayOS payment link hiện là one-time transfer; recurring renewal automation
  chưa được implement.

## 7. Pricing hiện tại

Migration chuyển plan price sang VND:

- Pro: 199.000/tháng hoặc 1.990.000/năm.
- Team: 499.000/tháng hoặc 4.990.000/năm.
- Extra Team seat: 79.000/tháng hoặc 790.000/năm.

Đây là seed product price và cần được business xác nhận trước production.

## 8. Limitations

- Chưa có cancel payment link/reconciliation API.
- Chưa có refund.
- Chưa có automatic renewal vì PayOS flow hiện dùng payment request.
- Return URL chỉ hiển thị trạng thái chờ webhook; không tự tin redirect result.
- Chưa có admin orders UI.
- Chưa có invoice/tax flow.

## 9. Nguồn contract

- PayOS API: `https://payos.vn/docs/api/`
- PayOS signature: `https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/`
- PayOS Node SDK guide: `https://payos.vn/docs/sdks/back-end/node/`
