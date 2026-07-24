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

### Pricing UI behavior

- `/pricing` là public route: guest được gọi public plans API và xem toàn bộ
  bảng giá mà không cần session/access token. Các API workspace và entitlement
  chỉ được gọi khi user đã đăng nhập.
- Guest nhấn plan trả phí được chuyển tới
  `/auth/signin?callbackUrl=...`; business plan giữ callback tới trang configure
  của plan đã chọn. `/pricing/configure` vẫn là protected route.
- Pricing chia plan thành hai audience hiển thị:
  - `Personal` map tới `plan.workspaceType = personal`.
  - `Business` map tới `plan.workspaceType = team`.
- Workspace selector chỉ hiển thị workspace cùng type với audience đang chọn.
- Current plan không được suy ra từ giá bằng `0`; frontend gọi
  `GET /workspaces/:workspaceId/entitlements` và so sánh `entitlements.plan.code`
  với plan card.
- Monthly/yearly và số seat chỉ là input checkout. Frontend không gửi amount;
  backend vẫn đọc plan version, giá và tính lại total.
- Business workspace dùng `quantity`; giá extra seat chỉ áp dụng phần vượt
  `includedSeats`.
- Nếu account đã đăng nhập nhưng chưa có workspace tương ứng với audience, UI
  vẫn cho xem plan. Business plan đi qua configure để tạo/chọn team workspace;
  personal checkout cần personal workspace hợp lệ.

## 8. Limitations

- Chưa có cancel payment link/reconciliation API.
- Chưa có refund.
- Renewal dùng payment request tạo trước kỳ hạn; đây không phải recurring charge
  tự động từ thẻ/ngân hàng, user vẫn chủ động thanh toán bill.
- Return URL chỉ hiển thị trạng thái chờ webhook; không tự tin redirect result.
- Admin có trang Billing để theo dõi order, hủy renewal bill còn mở; trang
  Subscriptions có thể tạo renewal bill thủ công.

## Renewal billing

- `cancelAtPeriodEnd = false` là nguồn sự thật cho auto-renew. Scheduler billing
  chạy khi server khởi động và mỗi giờ, tạo renewal bill khi subscription trả phí
  active còn tối đa 3 ngày trước `currentPeriodEnd`.
- Renewal bill lưu `subscriptionId`, `renewalPeriodStart` và
  `renewalPeriodEnd`. Partial unique index bảo đảm mỗi subscription/kỳ chỉ có một
  bill chưa canceled; scheduler và thao tác admin dùng cùng service.
- `expiresAt` của renewal bill bằng cuối kỳ hiện tại. Bill pending quá hạn được
  chuyển thành `canceled`; subscription hết kỳ được expiry job hiện có chuyển
  sang `expired`, rồi workspace dùng default Free entitlement.
- Thanh toán renewal không lấy thời điểm thanh toán làm đầu kỳ. Webhook nối kỳ
  mới từ `renewalPeriodStart` đến `renewalPeriodEnd`, tránh làm mất số ngày còn
  lại khi user trả sớm.
- Workspace member role `owner` hoặc `billing` có thể hủy renewal bill pending.
  System admin cũng có thể hủy bill từ admin portal. Cả hai thao tác đồng thời
  đặt `cancelAtPeriodEnd = true`, tức subscription không tiếp tục gia hạn.
- Billing API chỉ cấp quyền tạo checkout, xem và hủy bill của workspace cho
  member role `owner` hoặc `billing`; role `admin/member/viewer` không có quyền
  thanh toán. Checkout tạo workspace mới là ngoại lệ hợp lệ vì người tạo sẽ trở
  thành owner của workspace mới.
- Khi một renewal bill mới và payment link được tạo thành công, backend gửi
  email riêng cho workspace owner và mọi active member role `billing`. Email có
  workspace, plan, số tiền, hạn thanh toán và link PayOS. Trả lại bill đã tồn tại
  không gửi email lần nữa.
- Workspace Billing history uses an internally scrollable table, labels each
  order with its billing month, and renders payment/cancel actions as compact
  buttons. Continuing payment opens the PayOS checkout in a new browser tab.
- Bill checkout thường không có `subscriptionId` và không được đi qua API hủy
  renewal. Webhook đến sau khi renewal bill đã canceled/expired không được kích
  hoạt lại subscription.
- Chưa có invoice/tax flow.

## 9. Nguồn contract

- PayOS API: `https://payos.vn/docs/api/`
- PayOS signature: `https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/`
- PayOS Node SDK guide: `https://payos.vn/docs/sdks/back-end/node/`
