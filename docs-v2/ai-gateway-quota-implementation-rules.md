# AI Gateway & Usage Quota Implementation Rules

## 1. Vị trí code

- `dbflow-backend/src/modules/ai-gateway/**`
- `dbflow-backend/src/modules/usage/**`
- `dbflow-backend/src/migrations/1778500000000-CreateUsageLedger.ts`
- `dbflow-backend/src/modules/db-connections/db-connections.service.ts`
- `dbflow-frontend/src/api/ai/client.ts`
- `dbflow-frontend/src/app/api/proxy/[...path]/route.ts`

## 2. Runtime flow

```text
Browser
 -> Next /api/proxy
 -> NestJS /ai-gateway
 -> resolve billing workspace
 -> reserve AI usage
 -> LangGraph
 -> commit on accepted upstream response
 -> stream SSE back to browser
```

Nếu upstream không nhận request hoặc trả non-2xx, reservation được release.

## 3. Billing workspace resolution

- AI request có `project_id`: dùng `project.workspace_id`.
- Backend kiểm tra user có resource workspace access.
- AI chat không có project: dùng personal workspace của actor.
- Usage event lưu cả actor `user_id` và billing `workspace_id`.

## 4. Usage data model

### `usage_events`

- Một row cho mỗi operation.
- Unique `operation_id`.
- Status: `reserved | committed | released`.
- Lưu metric, quantity, period và metadata.

### `usage_counters`

- Primary key `(workspace_id, metric, period_key)`.
- `used`: usage đã commit.
- `reserved`: request đang thực thi.
- Counter được lock bằng pessimistic transaction trước khi reserve/transition.

## 5. Quota algorithm

```text
used + reserved + requested <= plan limit
```

1. Tạo counter nếu chưa tồn tại.
2. Lock counter.
3. Kiểm tra plan limit.
4. Tăng reserved và tạo event.
5. Commit: giảm reserved, tăng used.
6. Release: chỉ giảm reserved.

Metric hiện tại: `ai_requests_monthly`.
Period key dùng UTC `YYYY-MM`.

## 6. Streaming contract

- NestJS gateway forward content type `text/event-stream`.
- Next proxy không gọi `.text()` với SSE; response body được forward trực tiếp.
- Frontend parser và callback contract hiện tại được giữ nguyên.
- Thread create/cancel đi qua authenticated gateway nhưng không trừ AI quota.

## 7. Text-to-SQL

- Text-to-SQL reserve cùng metric `ai_requests_monthly`.
- Billing workspace lấy từ DB connection.
- Success commit; exception release.

## 8. Limitations

- Commit xảy ra khi LangGraph chấp nhận và mở stream; lỗi giữa stream vẫn tính
  một request vì upstream đã bắt đầu xử lý.
- Chưa ghi input/output token.
- Chưa có cleanup job cho reservation bị treo do process crash.
- Chưa có Redis counter; PostgreSQL transaction là source of truth hiện tại.
- Chưa proxy các endpoint LangGraph ngoài thread create, stream và cancel.
- `LANGGRAPH_API_URL` phải được cấu hình ở backend production.

## 9. Bước tiếp theo

1. Reservation TTL cleanup job.
2. Token/cost metering nếu LangGraph trả usage metadata.
3. Document storage và export usage.
4. Admin usage dashboard và manual adjustment audit.
