# Subscription & Entitlement Implementation Rules

## 1. Phạm vi hiện tại

Đã implement plan/subscription theo workspace, seat entitlement và resource
quota cho project, schema và DB connection.
Quota document storage, export và schema version cũng đã được nối vào các
write flow tương ứng.
Chưa implement checkout, orders, payment provider hoặc webhook.

Code chính:

- `dbflow-backend/src/modules/subscriptions/**`
- `dbflow-backend/src/migrations/1778400000000-CreatePlansAndSubscriptions.ts`
- `dbflow-backend/src/modules/workspaces/workspaces.service.ts`
- `dbflow-frontend/src/api/subscriptions/client.ts`
- `dbflow-frontend/src/components/WorkspaceSettings/index.tsx`

## 2. Plan model

- Plan được version bằng `(code, version)`.
- Plan target: `personal | team | any`.
- Limits và features lưu JSONB.
- `null` limit biểu thị unlimited.
- Plan đang seed:
  - `free`: personal, 1 seat.
  - `pro`: personal paid target.
  - `team_free`: team starter, 3 seats.
  - `team`: paid team target, 5 included seats.

Giá hiện tại chỉ là seed cho development/planning, chưa được nối payment.

## 3. Subscription model

- Subscription thuộc workspace, không thuộc trực tiếp user.
- Current statuses: `trialing`, `active`, `past_due`, `paused`.
- Database có partial unique index để mỗi workspace chỉ có một current
  subscription.
- Free/default subscription dùng cycle `custom` và period dài để không cần job
  renewal trước khi payment được implement.

## 4. Default subscription flow

- Personal workspace nhận plan `free`.
- Team workspace nhận plan `team_free`.
- Migration backfill subscription cho workspace hiện tại.
- Workspace tạo mới gọi `ensureDefaultSubscription`.
- Flow idempotent: nếu đã có current subscription thì không tạo thêm.

## 5. Entitlement API

```http
GET /plans
GET /workspaces/:workspaceId/subscription
GET /workspaces/:workspaceId/entitlements
```

Entitlement response hiện có plan, subscription và workspace seat usage.
Response cũng có project count, DB connection count, tổng schema và
schema-per-project limit.

## 6. Seat calculation

```text
used seats = active workspace members + pending invitations
```

- Invitation pending giữ trước một seat.
- Revoke/expire invitation giải phóng seat khỏi lần count tiếp theo.
- Accept thay pending invitation bằng active member.
- Invite và accept đều kiểm tra seat limit.
- Seat limit lấy từ `plan.limits.workspace_seats`, fallback về subscription
  quantity.

## 7. UI behavior

- Workspace Settings có tab `Plan & usage`.
- Hiển thị plan, subscription status, active/pending/used seats và progress.
- Backend vẫn enforce seat; UI chỉ hiển thị.
- Plan & usage tab hiển thị projects, DB connections và schema usage.
- AI request counter và monthly limit cũng được hiển thị.
- Document storage và monthly export usage được hiển thị.

## 8. Resource quota

- `projects`: đếm theo `workspace_id`, kiểm tra trước khi tạo project.
- `schemas_per_project`: đếm theo `project_id`, kiểm tra trước khi tạo schema.
- `db_connections`: đếm theo `workspace_id`, kiểm tra trước khi lưu connection.
- Khi `used >= limit`, backend trả forbidden với:

```json
{
  "code": "QUOTA_EXCEEDED",
  "metric": "projects",
  "used": 3,
  "limit": 3
}
```

- Limit `null` là unlimited.
- Backend resolve workspace/membership trước quota check.

## 9. Limitations

- Chưa có payment provider, checkout, order, webhook hoặc paid upgrade.
- Document presigned upload chưa reserve dung lượng; backend kiểm tra lại khi
  tạo metadata nhưng concurrent uploads vẫn cần storage reservation trước
  production.
- Seat count hiện query trực tiếp, chưa có counter/cache.
- Concurrent invitations khác email có thể cùng vượt qua count check; cần
  serialize theo subscription row hoặc reservation counter trước production.
- Pending invitation hết hạn chưa được scheduled cleanup; accept vẫn kiểm tra
  expiry.
- Seed price/currency chưa phải product pricing cuối cùng.

## 10. Bước tiếp theo

1. Làm seat check transaction-safe.
2. Usage ledger/counters cho AI và storage.
3. Orders, payment provider abstraction, checkout và webhook.
