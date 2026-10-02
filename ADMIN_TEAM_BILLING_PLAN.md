# DBFlow Admin, Subscription, Team & Billing Implementation Plan

> Status: Implementation started — workspace/team foundation is in progress.
>
> Scope: DBFlow frontend, NestJS backend, PostgreSQL database, LangGraph AI service, admin portal, personal/team subscriptions, usage metering, and payment integration.

## 1. Mục tiêu 

Xây dựng DBFlow thành sản phẩm SaaS có thể:

- Bán gói cho người dùng cá nhân và team.
- Giới hạn tính năng/quota theo gói một cách an toàn ở backend.
- Quản lý team, thành viên, lời mời và phân quyền theo workspace.
- Tính phí team theo số seat hoặc gói cố định.
- Cho admin quản lý user, workspace, subscription, order, payment và usage.
- Theo dõi chính xác AI usage, storage và các tài nguyên có tính phí.
- Không xóa dữ liệu ngay khi user hạ gói hoặc thanh toán thất bại.

## 2. Hiện trạng dự án

### 2.1 Kiến trúc hiện tại

- `dbflow-frontend`: Next.js 15, React 19, Ant Design, NextAuth.
- `dbflow-backend`: NestJS 11, TypeORM, PostgreSQL, JWT.
- `dbflow-ai`: Python/LangGraph cho schema generation, SQL generation và RAG.

### 2.2 Thành phần có thể tái sử dụng

- User login bằng email/password và Google.
- Role hệ thống `user` và `admin`.
- `JwtAuthGuard`, `RolesGuard`, `@Roles(Role.Admin)`.
- Khung API `GET /admin/users` và `GET /admin/projects`.
- Trang frontend `/usage` đã tồn tại nhưng chưa có nội dung.
- Các resource đã có owner/user reference: projects, schemas, conversations, documents, DB connections, schema versions và exports.

### 2.3 Khoảng trống cần bổ sung

- Admin API hiện chỉ trả danh sách rỗng và chưa có admin frontend.
- Chưa có plan, subscription, order, transaction hoặc webhook.
- Workspace/team foundation đã bắt đầu ở backend: workspace, membership,
  personal-workspace backfill và API create/list/get/update/member-list.
- Project hiện gắn trực tiếp với `owner_id`, chưa thuộc workspace.
- Chưa có entitlement service và quota enforcement.
- AI frontend gọi trực tiếp LangGraph nên có thể bỏ qua backend quota.
- Chưa có user suspension, admin audit log hoặc billing reconciliation.

### 2.4 Phần workspace đã implement trong slice đầu tiên

- `workspaces` và `workspace_members` entities.
- Migration tạo enum/table/index và backfill personal workspace cho user cũ.
- Registration và Google login đảm bảo personal workspace tồn tại.
- API tạo Team workspace trong transaction cùng owner membership.
- API list/get/update workspace và list members.
- Invitation email/token, accept/revoke, đổi role, remove/leave và transfer
  ownership đã được implement.

Project và DB connection workspace ownership migration đã được implement, gồm
backfill về personal workspace và chặn link chéo workspace.

Active workspace selector và workspace-filtered Projects list đã được
implement; Create Project cũng cho chọn workspace.

Workspace settings/members UI đã được implement: create team, edit name,
invite/revoke, role update, remove/leave và transfer ownership.

Chưa implement: reusable workspace guard, resend invitation, seat quota,
subscription và payment.

Update: plan/subscription foundation và seat quota đã được implement. Personal
workspace nhận Free, Team nhận Team Free; Workspace Settings hiển thị plan và
seat usage. Chưa có checkout/payment nên Pro/Team paid plans chưa thể mua.

Project, schema-per-project và DB connection quotas cũng đã được backend
enforce và hiển thị trong Workspace Settings.

AI usage ledger/counter và authenticated LangGraph gateway đã được implement.
AI Chat và text-to-SQL hiện dùng workspace quota thay vì gọi AI public trực
tiếp.

Document storage, monthly export và schema-version quotas đã được backend
enforce. Workspace Settings hiển thị storage/export usage.

PayOS billing foundation đã được implement: orders, transactions, server-side
price calculation, checkout link, HMAC signature, webhook verification và
subscription activation. Chưa có renewal automation, refund và admin orders UI.

Admin MVP, user suspension, audit log, billing history, reservation cleanup và
subscription expiry handling đã được implement. Refund/invoice và distributed
production scheduling vẫn là post-MVP.

## 3. Các quyết định kiến trúc chính

### 3.1 Workspace là billing owner

Mọi user sau khi đăng ký có một personal workspace. Team cũng là một workspace. Subscription, quota và resource ownership được gắn với workspace thay vì gắn trực tiếp với user.

```text
User
 ├── Personal workspace (owner)
 └── Team workspace(s) (owner/admin/member/viewer)

Workspace
 ├── Subscription
 ├── Members / seats
 ├── Projects
 ├── DB connections
 ├── Usage
 └── Billing information
```

Lợi ích:

- Dùng chung một cơ chế cho cá nhân và team.
- Project không bị phụ thuộc vào một user duy nhất.
- Dễ chuyển ownership, mời thành viên và tính quota chung.
- Dễ mở rộng organization/business sau này.

### 3.2 Backend là nơi quyết định quyền và quota

Frontend chỉ dùng entitlement để hiển thị/disable UI. Backend phải kiểm tra lại toàn bộ permission và quota trước mọi thao tác có tính phí.

### 3.3 AI phải đi qua authenticated gateway

Luồng production đề xuất:

```text
Frontend
   -> NestJS AI Gateway
      -> kiểm tra workspace membership
      -> kiểm tra entitlement/quota
      -> tạo usage reservation
      -> gọi LangGraph bằng internal credential
      -> commit/release usage
```

Không để browser gọi trực tiếp public LangGraph API khi đã triển khai billing.

### 3.4 Không hard-code limits trong controller

Limit và feature flags lưu trong plan/version của plan. Controller gọi `EntitlementsService`, không tự biết Free có bao nhiêu project hoặc Pro có bao nhiêu AI request.

## 4. Gói sản phẩm đề xuất

Con số dưới đây là giá trị khởi tạo để triển khai, cần được product/business xác nhận trước khi seed production.

| Tính năng | Free | Pro | Team | Business |
|---|---:|---:|---:|---:|
| Base seats | 1 | 1 | 5 | Custom |
| Project/workspace | 3 | 30 | 100 | Custom |
| Schema/project | 3 | 20 | 50 | Custom |
| AI requests/tháng | 30 | 1.000 | 5.000 pooled | Custom |
| DB connections | 1 | 10 | 30 | Custom |
| Document storage | 100 MB | 5 GB | 25 GB pooled | Custom |
| Thành viên/project | 2 | 10 | Theo workspace seats | Custom |
| Schema versions/schema | 5 | 100 | 500 | Custom |
| Export/rollback | Limited | Enabled | Enabled | Enabled |
| Team roles | No | No | Yes | Yes |
| Audit log | No | No | 90 ngày | Custom |

Billing cycles:

- Monthly.
- Yearly, có thể giảm 15–20%.
- Team mặc định tính `base price + extra seat price`.
- Business dùng custom contract và admin có thể cấp subscription thủ công.

## 5. Data model đề xuất

### 5.1 `workspaces`

```text
id uuid PK
type enum: personal | team
name varchar
slug varchar unique
owner_user_id uuid FK users
status enum: active | suspended | archived
avatar_key nullable
created_at
updated_at
```

Rules:

- Mỗi user có đúng một personal workspace.
- Personal workspace không cho thêm member trong MVP.
- Team workspace phải luôn có ít nhất một owner.
- Không hard-delete workspace đang có order/subscription.

### 5.2 `workspace_members`

```text
workspace_id uuid PK/FK
user_id uuid PK/FK
role enum: owner | admin | member | viewer | billing
status enum: active | suspended
joined_at
updated_at
```

Unique: `(workspace_id, user_id)`.

### 5.3 `workspace_invitations`

```text
id uuid PK
workspace_id uuid FK
email varchar
role enum
token_hash varchar unique
invited_by uuid FK users
status enum: pending | accepted | revoked | expired
expires_at
accepted_at nullable
created_at
updated_at
```

Rules:

- Lưu hash của token, không lưu raw token.
- Invitation pending giữ trước một seat hoặc được kiểm tra seat khi accept; chọn một rule và áp dụng thống nhất.
- Không cho mời owner trực tiếp; ownership transfer là flow riêng.

### 5.4 Thay đổi resource ownership

Thêm `workspace_id` vào:

- `projects` — bắt buộc.
- `db_connections` — bắt buộc.
- Các resource con suy ra workspace từ project/schema nếu không cần query độc lập.

Migration strategy:

1. Tạo personal workspace cho từng user hiện tại.
2. Backfill project theo `projects.owner_id`.
3. Backfill DB connection theo `created_by`.
4. Giữ `owner_id`/`created_by` làm actor/creator để audit, không dùng làm billing owner.
5. Sau khi verify dữ liệu mới đặt `workspace_id NOT NULL`.

### 5.5 `plans`

```text
id uuid PK
code varchar
version int
name varchar
description text nullable
workspace_type enum: personal | team | any
currency varchar(3)
monthly_base_price decimal
yearly_base_price decimal
monthly_seat_price decimal nullable
yearly_seat_price decimal nullable
included_seats int
limits jsonb
features jsonb
is_active boolean
display_order int
created_at
updated_at
```

Unique: `(code, version)`.

Không sửa limits lịch sử của subscription bằng cách overwrite plan cũ. Khi thay đổi thương mại đáng kể, tạo plan version mới.

Ví dụ `limits`:

```json
{
  "projects": 30,
  "schemas_per_project": 20,
  "ai_requests_monthly": 1000,
  "db_connections": 10,
  "document_storage_bytes": 5368709120,
  "workspace_seats": 1,
  "schema_versions_per_schema": 100
}
```

Ví dụ `features`:

```json
{
  "export": true,
  "rollback": true,
  "team_roles": false,
  "audit_log": false,
  "priority_support": true
}
```

### 5.6 `subscriptions`

```text
id uuid PK
workspace_id uuid FK
plan_id uuid FK
status enum: trialing | active | past_due | canceled | expired | paused
billing_cycle enum: monthly | yearly | custom
quantity int
provider varchar
provider_customer_id nullable
provider_subscription_id nullable unique
current_period_start
current_period_end
cancel_at_period_end boolean
canceled_at nullable
trial_end nullable
metadata jsonb
created_at
updated_at
```

Rules:

- Một workspace chỉ có một subscription current.
- `quantity` là số seat được thanh toán, không nhất thiết là số active member.
- Subscription Free có thể được lưu explicit để query đơn giản.

### 5.7 `orders`

```text
id uuid PK
order_number varchar unique
workspace_id uuid FK
subscription_id uuid nullable FK
plan_id uuid FK
created_by uuid FK users
billing_cycle enum
quantity int
subtotal decimal
discount_amount decimal
tax_amount decimal
total_amount decimal
currency varchar(3)
status enum: pending | paid | failed | canceled | expired | refunded | partially_refunded
provider varchar
provider_order_id nullable
checkout_url nullable
paid_at nullable
expires_at nullable
metadata jsonb
created_at
updated_at
```

### 5.8 `payment_transactions`

```text
id uuid PK
order_id uuid FK
provider varchar
provider_transaction_id varchar
provider_event_id varchar nullable
type enum: charge | refund | adjustment
status enum
amount decimal
currency varchar(3)
raw_payload jsonb
processed_at nullable
created_at
```

Unique theo provider cho transaction/event ID để webhook idempotent.

### 5.9 `usage_events`

```text
id uuid PK
workspace_id uuid FK
user_id uuid nullable FK
subscription_id uuid nullable FK
metric varchar
quantity bigint
operation_id varchar nullable
resource_type varchar nullable
resource_id uuid nullable
period_key varchar
status enum: reserved | committed | released
metadata jsonb
created_at
updated_at
```

Metric ban đầu:

- `ai_requests`
- `ai_input_tokens` và `ai_output_tokens` nếu provider hỗ trợ.
- `projects`
- `schemas`
- `db_connections`
- `document_storage_bytes`
- `workspace_seats`
- `schema_versions`
- `exports`
- `sandbox_queries`

### 5.10 `usage_counters`

Dùng cho hot path, tránh `SUM(usage_events)` trên mọi request.

```text
workspace_id uuid PK
metric varchar PK
period_key varchar PK
used bigint
reserved bigint
updated_at
```

Update counter bằng transaction/atomic operation. `usage_events` là audit ledger; `usage_counters` là read model hiệu năng cao.

### 5.11 `admin_audit_logs`

```text
id uuid PK
admin_user_id uuid FK
action varchar
target_type varchar
target_id varchar
before_data jsonb nullable
after_data jsonb nullable
reason text nullable
ip_address nullable
created_at
```

Mọi thao tác suspend, đổi role, cấp gói, đổi order status hoặc override quota phải được audit.

### 5.12 User status

Thêm vào `users`:

```text
status enum: active | suspended
suspended_at nullable
suspended_reason nullable
```

Không dùng hard delete user trong MVP vì nhiều foreign key hiện đang cascade.

## 6. Permission model cho team

### 6.1 Workspace roles

| Action | Owner | Admin | Billing | Member | Viewer |
|---|---:|---:|---:|---:|---:|
| Xem workspace | Yes | Yes | Yes | Yes | Yes |
| Sửa workspace | Yes | Yes | No | No | No |
| Mời/xóa member | Yes | Yes | No | No | No |
| Đổi role | Yes | Limited | No | No | No |
| Transfer ownership | Yes | No | No | No | No |
| Xem billing | Yes | Optional | Yes | No | No |
| Mua/đổi/hủy gói | Yes | No | Yes | No | No |
| Tạo project | Yes | Yes | No | Yes | No |
| Xem project được cấp | Yes | Yes | No | Yes | Yes |

Admin không được promote chính mình thành owner hoặc demote owner. Một workspace luôn phải còn owner.

### 6.2 Project permissions

Giữ các quyền project hiện có để cấp quyền chi tiết. Quyền hiệu lực là kết quả kết hợp:

```text
system role
  -> workspace membership/status
     -> workspace role
        -> project permission
           -> plan entitlement/quota
```

Quyền cao ở workspace không tự động bỏ qua quota. System admin chỉ bypass khi dùng endpoint admin explicit và phải audit.

### 6.3 Active workspace context

Frontend lưu `active_workspace_id` và gửi qua route/path hoặc header. Backend không tin header một mình; phải kiểm tra membership từ JWT user.

Khuyến nghị API scoped rõ ràng:

```text
/workspaces/:workspaceId/projects
/workspaces/:workspaceId/members
/workspaces/:workspaceId/billing
```

## 7. Entitlement và quota engine

### 7.1 Service contract

```ts
getCurrentSubscription(workspaceId)
getEntitlements(workspaceId)
getUsage(workspaceId, metric, period)
assertFeature(workspaceId, feature)
assertQuota(workspaceId, metric, quantity)
reserveUsage(workspaceId, metric, quantity, operationId)
commitUsage(operationId)
releaseUsage(operationId)
```

### 7.2 Resource count và event usage

- Đếm trực tiếp: projects, schemas, DB connections, active seats.
- Ledger/counter: AI request, token, export, sandbox query.
- Storage: cộng khi document upload hoàn tất; trừ khi xóa thành công khỏi storage/database.

### 7.3 Concurrency

Quy trình cho metered action:

1. Lock/update atomic `usage_counters`.
2. Kiểm tra `used + reserved + requested <= limit`.
3. Tạo reservation với `operation_id` duy nhất.
4. Thực thi action.
5. Thành công thì commit; thất bại trước khi tiêu thụ thì release.
6. Scheduled job giải phóng reservation bị treo quá TTL.

### 7.4 Response khi vượt quota

```json
{
  "statusCode": 403,
  "code": "QUOTA_EXCEEDED",
  "message": "Project limit reached",
  "metric": "projects",
  "used": 3,
  "reserved": 0,
  "limit": 3,
  "workspaceId": "...",
  "upgradeUrl": "/pricing"
}
```

Các error code khác:

- `FEATURE_NOT_INCLUDED`
- `SUBSCRIPTION_INACTIVE`
- `SEAT_LIMIT_REACHED`
- `WORKSPACE_SUSPENDED`
- `PAYMENT_REQUIRED`

### 7.5 Downgrade behavior

- Không xóa project/document/member ngay.
- Resource hiện có vẫn đọc được.
- Chặn tạo mới khi usage vượt limit mới.
- Có grace period cấu hình cho `past_due`.
- Tính năng write/export có thể bị khóa theo policy; policy phải hiển thị trước khi user downgrade.

## 8. Backend modules cần xây dựng

```text
modules/workspaces
modules/workspace-members
modules/plans
modules/subscriptions
modules/billing
modules/payments
modules/usage
modules/entitlements
modules/admin/dashboard
modules/admin/workspaces
modules/admin/subscriptions
modules/admin/orders
modules/admin/plans
modules/admin/usage
modules/admin/audit-logs
```

### 8.1 User/workspace APIs

```http
GET    /workspaces
POST   /workspaces
GET    /workspaces/:workspaceId
PATCH  /workspaces/:workspaceId
POST   /workspaces/:workspaceId/transfer-ownership
POST   /workspaces/:workspaceId/archive

GET    /workspaces/:workspaceId/members
POST   /workspaces/:workspaceId/invitations
DELETE /workspaces/:workspaceId/invitations/:invitationId
POST   /workspace-invitations/accept
PATCH  /workspaces/:workspaceId/members/:userId/role
DELETE /workspaces/:workspaceId/members/:userId
POST   /workspaces/:workspaceId/leave
```

### 8.2 Plan/billing APIs

```http
GET  /plans
GET  /workspaces/:workspaceId/billing/subscription
GET  /workspaces/:workspaceId/billing/usage
GET  /workspaces/:workspaceId/billing/orders
GET  /workspaces/:workspaceId/billing/orders/:orderId
POST /workspaces/:workspaceId/billing/checkout
POST /workspaces/:workspaceId/billing/subscription/cancel
POST /workspaces/:workspaceId/billing/subscription/resume
POST /workspaces/:workspaceId/billing/subscription/change-plan
POST /billing/webhooks/:provider
```

`checkout` request không được nhận giá từ browser; chỉ nhận `planCode/version`, cycle, quantity và return URL hợp lệ.

### 8.3 Usage response contract

```json
{
  "workspace": { "id": "...", "type": "team", "name": "Core Team" },
  "plan": { "code": "team", "name": "Team", "version": 1 },
  "subscription": {
    "status": "active",
    "periodStart": "...",
    "periodEnd": "...",
    "cancelAtPeriodEnd": false
  },
  "metrics": [
    {
      "key": "ai_requests",
      "used": 320,
      "reserved": 2,
      "limit": 5000,
      "unit": "requests",
      "resetAt": "..."
    }
  ]
}
```

### 8.4 Admin APIs

```http
GET    /admin/dashboard

GET    /admin/users
GET    /admin/users/:userId
PATCH  /admin/users/:userId/status
PATCH  /admin/users/:userId/system-role

GET    /admin/workspaces
GET    /admin/workspaces/:workspaceId
PATCH  /admin/workspaces/:workspaceId/status
GET    /admin/workspaces/:workspaceId/usage

GET    /admin/projects
GET    /admin/projects/:projectId

GET    /admin/plans
POST   /admin/plans
PATCH  /admin/plans/:planId

GET    /admin/subscriptions
GET    /admin/subscriptions/:subscriptionId
POST   /admin/workspaces/:workspaceId/subscription
PATCH  /admin/subscriptions/:subscriptionId

GET    /admin/orders
GET    /admin/orders/:orderId
POST   /admin/orders/:orderId/reconcile

GET    /admin/transactions
GET    /admin/usage
POST   /admin/usage/adjustments
GET    /admin/audit-logs
```

List APIs bắt buộc có cursor/page pagination, search, filter, sort và giới hạn page size.

## 9. Payment integration

### 9.1 Provider abstraction

```ts
interface PaymentProvider {
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(input: RawWebhookInput): Promise<PaymentEvent>;
  getPaymentStatus(externalId: string): Promise<PaymentStatus>;
  cancelSubscription(externalId: string): Promise<void>;
  changeQuantity?(externalId: string, quantity: number): Promise<void>;
}
```

Chọn provider sau khi xác nhận quốc gia pháp nhân, loại tiền, recurring payment, invoice/tax và khả năng thanh toán quốc tế/nội địa.

### 9.2 Checkout flow

```text
User chọn plan/cycle/seats
 -> backend kiểm tra billing permission
 -> backend đọc giá từ plan version
 -> tạo pending order
 -> provider tạo checkout
 -> user thanh toán
 -> provider webhook tới backend
 -> verify signature + idempotency
 -> transaction cập nhật payment/order/subscription
 -> frontend poll/refetch billing status
```

Redirect success không được dùng làm bằng chứng đã thanh toán.

### 9.3 Team seat billing

- `included_seats` nằm trong base price.
- `quantity` tối thiểu bằng included seats hoặc được chuẩn hóa theo provider.
- Mời thêm member khi full seat phải tăng quantity trước hoặc mở checkout.
- Giảm seat chỉ có hiệu lực khi số active member không vượt quantity mới.
- Có thể áp dụng proration nếu provider hỗ trợ; nếu không, thay đổi từ kỳ tiếp theo.

### 9.4 Webhook requirements

- Verify signature từ raw request body.
- Idempotency theo provider event ID.
- Transaction database cho order, transaction và subscription.
- Cho phép event đến sai thứ tự bằng state transition rules.
- Không log secret/card data.
- Retry có backoff.
- Dead-letter/manual reconciliation cho event lỗi liên tục.

### 9.5 Subscription state rules

| Event/state | Hành vi |
|---|---|
| `active` | Dùng đầy đủ entitlement |
| `trialing` | Dùng entitlement trial |
| `past_due` | Grace period, cảnh báo owner/billing |
| `canceled` + còn kỳ | Dùng tới `current_period_end` |
| `expired` | Chuyển entitlement về Free/read-only policy |
| `paused` | Theo policy admin/business contract |

### 9.6 Reconciliation job

Scheduled job:

- Kiểm tra order pending quá hạn.
- Đồng bộ subscription `past_due/active/canceled` với provider.
- Retry webhook chưa process.
- Phát hiện subscription trùng hoặc thiếu provider ID.
- Báo admin khi amount/currency không khớp.

## 10. Frontend plan

### 10.1 Workspace UX

- Workspace switcher trong sidebar/header.
- Tạo team modal/page.
- Workspace settings: general, members, billing, usage.
- Invite member bằng email và chọn role.
- Pending invitations list.
- Transfer ownership, leave workspace, archive team.
- Hiển thị active workspace rõ ràng trên Projects và AI Chat.

Routes:

```text
/workspaces/new
/workspaces/[workspaceId]/settings
/workspaces/[workspaceId]/members
/workspaces/[workspaceId]/billing
/workspaces/[workspaceId]/usage
/accept-workspace-invite
```

### 10.2 Pricing

Route `/pricing`:

- Personal/Team tabs.
- Monthly/yearly toggle.
- So sánh features và limits.
- Seat calculator cho Team.
- Current plan state.
- Upgrade/downgrade/contact sales actions.
- Login return URL nếu user chưa đăng nhập.

### 10.3 Billing

- Plan và subscription status hiện tại.
- Renewal/cancel date.
- Paid seats, used seats, pending invitations.
- Upgrade/downgrade/change seat quantity.
- Cancel/resume subscription.
- Billing order history.
- Pending/failed payment recovery.
- Không hiển thị thông tin thẻ nếu provider không cung cấp tokenized summary an toàn.

### 10.4 Usage

Hoàn thiện trang `/usage` hiện có hoặc redirect tới active workspace usage:

- Progress bar theo từng metric.
- Reset date cho monthly metric.
- Pooled team usage và breakdown theo member nếu cần.
- Warning tại 80%, 90%, 100%.
- CTA nâng cấp hoặc mua thêm seat.
- Unlimited phải render riêng, không dùng số cực lớn giả lập.

### 10.5 Quota error UX

- Chuẩn hóa API error handling cho `QUOTA_EXCEEDED`.
- Modal giải thích metric, used/limit và workspace liên quan.
- Link đúng tới billing của workspace.
- Không chỉ disable button; luôn xử lý trường hợp backend từ chối do race condition.

### 10.6 Admin portal

Routes:

```text
/admin
/admin/users
/admin/users/[userId]
/admin/workspaces
/admin/workspaces/[workspaceId]
/admin/projects
/admin/orders
/admin/orders/[orderId]
/admin/subscriptions
/admin/plans
/admin/usage
/admin/audit-logs
```

Dashboard widgets:

- Total/new/active/suspended users.
- Personal/team workspaces.
- Active/trialing/past-due subscriptions.
- MRR/ARR hoặc paid revenue theo dữ liệu provider.
- Paid/failed/pending orders.
- AI requests, storage và top-consuming workspaces.
- Seat utilization.
- Webhook/reconciliation failures.

Admin layout phải kiểm tra system role ở server. Backend guard vẫn là nguồn bảo vệ chính.

## 11. Enforcement points trong code hiện tại

| Action | Enforcement |
|---|---|
| Tạo project | `POST /projects` hoặc workspace-scoped replacement |
| Tạo schema | `POST /projects/:projectId/schemas` |
| Tạo DB connection | `POST /db-connections` |
| Mời project member | Project invitation endpoint |
| Mời workspace member | Workspace invitation/accept endpoint |
| Upload document | Trước presigned URL và sau upload confirmation |
| Tạo schema version | Schema versions endpoint |
| Export/rollback | Export records endpoints |
| Sandbox query | Sandbox execute endpoint |
| Text-to-SQL | DB connection text-to-SQL endpoint |
| AI Chat/generation | NestJS AI gateway mới |

Mọi endpoint resource phải resolve `workspace_id` từ database, không nhận workspace ownership từ payload rồi tin trực tiếp.

## 12. Security requirements

- JWT chỉ xác định user/system role; workspace role đọc từ database hoặc cache ngắn hạn.
- Invalidate membership/entitlement cache sau khi đổi role, plan hoặc subscription.
- Billing actions yêu cầu owner hoặc billing role.
- Admin mutation yêu cầu reason cho action nhạy cảm.
- Rate limit login, invitation, checkout, webhook và AI gateway.
- Chống IDOR bằng workspace/project membership check.
- Không trả password, encrypted DB credentials hoặc payment raw secret cho admin frontend.
- Validate webhook raw body, signature và timestamp.
- Encrypt provider secrets trong environment/secret manager.
- Audit admin override và ownership transfer.
- Chống self-removal nếu user là owner cuối cùng.

## 13. Migration và backward compatibility

### Phase migration dữ liệu

1. Thêm bảng workspace/membership nhưng chưa đổi API.
2. Tạo personal workspace cho toàn bộ user.
3. Backfill resource workspace IDs.
4. Dual-read/dual-write trong khoảng chuyển đổi nếu cần zero downtime.
5. Chuyển API/UI sang active workspace.
6. Verify orphan resources và constraint.
7. Đặt `NOT NULL` và bỏ compatibility code sau khi ổn định.

### Data checks bắt buộc

- User nào cũng có personal workspace và owner membership.
- Project nào cũng có workspace.
- DB connection nào cũng có workspace.
- Không workspace nào không có owner.
- Không subscription nào trỏ plan không active/version không tồn tại.
- Usage counter khớp ledger trong sai số cho phép.

## 14. Test plan

### Unit tests

- Workspace permission matrix.
- Entitlement merge và unlimited handling.
- Monthly period calculation/timezone.
- Seat price calculation.
- Subscription state transitions.
- Webhook signature parser/idempotency.
- Usage reserve/commit/release.

### Integration tests

- Create team, invite, accept, change role, remove/leave.
- Owner transfer và last-owner protection.
- Project/resource isolation giữa workspace.
- Concurrent quota requests không vượt limit.
- Checkout tạo đúng server-side amount.
- Webhook duplicate không tạo subscription/payment trùng.
- Payment failure/grace/expiry/downgrade.
- Seat increase/decrease và pending invite.

### E2E frontend

- Workspace switcher cập nhật project/usage đúng scope.
- Pricing -> checkout -> return -> active plan.
- Quota modal và upgrade CTA.
- Team member management.
- Admin search/filter/detail/mutations.

### Security tests

- User giả workspace ID khác.
- Member gọi billing endpoint.
- Admin API bằng user token.
- Replay webhook.
- Checkout sửa giá/quantity từ browser.
- Invitation token expired/reused.

## 15. Observability và vận hành

- Structured logs có `request_id`, `workspace_id`, `user_id`, `operation_id`.
- Metrics: quota denials, AI requests, checkout conversion, webhook failures, reconciliation lag.
- Alert khi webhook signature fail tăng đột biến hoặc pending order tồn quá lâu.
- Dashboard usage/provider status cho admin.
- Email/in-app notifications:
  - Invitation.
  - 80/90/100% quota.
  - Payment success/failure.
  - Renewal/cancel/downgrade.
  - Seat limit reached.

## 16. Roadmap triển khai

### Phase 0 — Product decisions (bắt buộc chốt trước coding billing)

- [ ] Chọn payment provider và supported currencies.
- [ ] Chốt Free/Pro/Team/Business pricing.
- [ ] Chốt team seat pricing/proration.
- [ ] Chốt quota reset timezone và grace period.
- [ ] Chốt downgrade/read-only behavior.
- [ ] Chốt refund/invoice/tax scope.

### Phase 1 — Admin foundation

- [ ] Sửa cấu trúc admin projects module đang nằm trong folder `orders`.
- [ ] Implement admin users/projects services và pagination.
- [ ] Thêm user status/suspension guard.
- [ ] Tạo admin layout, dashboard cơ bản, users và projects UI.
- [ ] Thêm admin audit log.
- [ ] Unit/integration tests cho admin authorization.

### Phase 2 — Workspace/team foundation

- [ ] Migration workspace, members, invitations.
- [ ] Tạo personal workspace và backfill data.
- [ ] Workspace APIs, roles và permission guards.
- [ ] Workspace switcher và active workspace context.
- [ ] Team creation/invite/accept/remove/leave/transfer ownership UI.
- [ ] Chuyển project và DB connections sang workspace scope.

### Phase 3 — Plans, entitlements và usage

- [ ] Migration plans, subscriptions, usage ledger/counters.
- [ ] Seed Free/Pro/Team/Business.
- [ ] Entitlements service và cache invalidation.
- [ ] Enforce projects, schemas, DB connections, documents, versions.
- [ ] Enforce seats và team invitations.
- [ ] Hoàn thiện Pricing và Usage UI.
- [ ] Quota error standardization.

### Phase 4 — AI metering

- [ ] Tạo NestJS AI gateway.
- [ ] Chặn browser truy cập trực tiếp production LangGraph.
- [ ] Usage reservation/commit/release cho AI.
- [ ] Meter text-to-SQL, generation và sandbox.
- [ ] Concurrency/timeout/retry tests.

### Phase 5 — Payment và team seats

- [ ] Orders và payment transactions.
- [ ] Provider adapter.
- [ ] Checkout và return flow.
- [ ] Raw webhook verification/idempotency.
- [ ] Activate/renew/cancel/past-due/expire.
- [ ] Seat quantity và proration rules.
- [ ] Billing history và failed payment recovery UI.
- [ ] Reconciliation scheduled job.

### Phase 6 — Admin billing và production hardening

- [ ] Admin workspaces/subscriptions/orders/plans/usage UI.
- [ ] Manual subscription grant và usage adjustment có audit.
- [ ] Notifications và operational alerts.
- [ ] Load/security/E2E tests.
- [ ] Data reconciliation runbook.
- [ ] Rollout bằng feature flags và staged migration.

### Phase 7 — Post-MVP

- [ ] Coupon/promotion.
- [ ] Refund automation.
- [ ] Invoice/tax integration.
- [ ] Usage add-ons/top-up credits.
- [ ] SSO/SAML/SCIM cho Business.
- [ ] Team audit export và advanced analytics.

## 17. MVP acceptance criteria

MVP được xem là hoàn thành khi:

- User mới tự động có personal workspace Free.
- Owner tạo team, mời member và phân role an toàn.
- Project và DB connection được cách ly đúng workspace.
- Free/Pro/Team limits được backend enforce.
- AI không thể bypass quota qua public LangGraph endpoint.
- Team checkout tính đúng plan, cycle và paid seats từ server.
- Webhook duplicate không tạo order/payment/subscription trùng.
- User xem được plan, usage, seats và order history.
- Admin quản lý được user, workspace, plan, subscription và order.
- Suspend, plan override và usage adjustment đều có audit log.
- Downgrade/payment failure không làm mất dữ liệu.
- Test permission, quota concurrency và payment state transition chạy ổn định.

## 18. Các rủi ro chính

| Rủi ro | Giảm thiểu |
|---|---|
| AI gọi thẳng LangGraph, bypass quota | Bắt buộc đi qua NestJS gateway/internal auth |
| Race condition làm vượt quota | Atomic counter + reservation |
| Webhook gửi trùng/sai thứ tự | Idempotency + state machine + reconciliation |
| Migration làm orphan project | Backfill, validation query, staged constraints |
| Team mất owner | Last-owner guard + transfer flow |
| User hạ gói bị mất dữ liệu | Read-only/create-block policy, không hard delete |
| Admin lạm quyền hoặc khó truy vết | Audit log + reason + least privilege |
| Seat count và provider quantity lệch | Reconciliation job + invariant checks |
| Plan thay đổi phá subscription cũ | Immutable/versioned plans |

## 19. Definition of Done cho mỗi phase

- Migration có up/down hoặc rollback strategy rõ ràng.
- API có DTO validation, Swagger contract và authorization tests.
- Business rules có unit tests.
- Frontend có loading/error/empty/permission/quota states.
- Không expose secret hoặc credentials.
- Docs implementation trong `docs-v2` được tạo/cập nhật khi code thực sự triển khai flow/rule/data model.
- Có monitoring/logging cho critical flows.
- Có hướng dẫn vận hành hoặc reconciliation cho billing changes.

## 20. Tài liệu cần tạo khi bắt đầu implementation

Planning file này không khẳng định code đã hoạt động. Khi implement, cần tạo và duy trì tối thiểu:

- `docs-v2/workspace-team-permission-implementation-rules.md`
- `docs-v2/subscription-entitlement-implementation-rules.md`
- `docs-v2/usage-metering-implementation-rules.md`
- `docs-v2/payment-webhook-implementation-rules.md`
- `docs-v2/ai-gateway-quota-implementation-rules.md`

Mỗi tài liệu phải phản ánh code thực tế, runtime flow, data model, state transition, edge cases và limitations tại thời điểm triển khai.
