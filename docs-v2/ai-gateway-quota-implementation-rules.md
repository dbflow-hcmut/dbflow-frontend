# AI Gateway & Usage Quota Implementation Rules

## 1. Vị trí code

- `dbflow-backend/src/modules/ai-gateway/**`
- `dbflow-backend/src/modules/usage/**`
- `dbflow-backend/src/migrations/1778500000000-CreateUsageLedger.ts`
- `dbflow-backend/src/migrations/1784764800000-AddTokenUsageToUsageEvents.ts`
- `dbflow-backend/src/migrations/1784793600000-AddUserScopeToUsageCounters.ts`
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
 -> resolve plan AI model
 -> LangGraph
 -> commit on accepted upstream response
 -> stream SSE back to browser
```

Nếu upstream không nhận request hoặc trả non-2xx, reservation được release.

## 3. Billing workspace resolution

- AI request có `project_id`: dùng `project.workspace_id`.
- `project_id` luôn được ưu tiên hơn `workspace_id`; client không gửi
  `workspace_id` cho project-scoped chat.
- Backend kiểm tra user có resource workspace access.
- AI chat không có project: dùng active `workspace_id` hợp lệ; nếu request
  không có workspace thì fallback personal workspace của actor.
- Usage event lưu cả actor `user_id` và billing `workspace_id`.
- Khi reserve, backend lấy `subscription.plan.ai_model` và ghi vào metadata.
  Gateway resolve model theo thứ tự `plan.ai_model -> backend API_MODEL` rồi
  luôn inject `input.model_name`, để persisted thread state không giữ model cũ.
  `dbflow-ai` không đọc `API_MODEL` và chỉ dùng model backend truyền vào.

## 4. Usage data model

### `usage_events`

- Một row cho mỗi operation.
- Unique `operation_id`.
- Status: `reserved | committed | released`.
- Lưu metric, quantity, period, metadata, `input_tokens`, `output_tokens` và
  `model_calls`.
- `model_name` lưu model do provider trả về. Dữ liệu cũ hoặc event không có
  model metadata giữ `NULL` và được admin analytics hiển thị là `Unknown`.

### `usage_counters`

- Primary key `(workspace_id, user_id, metric, period_key)` — đổi từ
  `(workspace_id, metric, period_key)` kể từ migration
  `1784793600000-AddUserScopeToUsageCounters.ts`. Quota giờ là **per-seat**
  (mỗi thành viên team có hạn mức riêng bằng nhau, mô hình giống Claude.ai
  Team/Enterprise), không còn là 1 pool dùng chung cho cả workspace — 1 thành
  viên dùng hết phần của mình không ảnh hưởng tới người khác. `plan.limits[metric]`
  được hiểu là mức **cho mỗi seat**, không nhân theo `subscription.quantity`.
- `used`: usage đã commit (của riêng user đó).
- `reserved`: request đang thực thi (của riêng user đó).
- Counter được lock bằng pessimistic transaction trước khi reserve/transition.
- Migration rebuild counter từ `usage_events` (group theo `workspace_id, user_id,
  metric, period_key`) thay vì reset về 0, để không "tặng" thêm quota khi migrate.

## 5. Quota algorithm

```text
used + reserved + requested <= plan limit   (tính riêng theo từng user)
```

1. Tạo counter (workspace, user, metric, period) nếu chưa tồn tại.
2. Lock counter.
3. Kiểm tra plan limit (per-seat).
4. Tăng reserved và tạo event.
5. Commit: giảm reserved, tăng used.
6. Release: chỉ giảm reserved.

Metric hiện tại: `ai_requests_monthly` (và `exports_monthly`, dùng chung bảng
`usage_counters` nên cũng tự động trở thành per-seat).
Period key dùng UTC `YYYY-MM`.

Per-member breakdown: `SubscriptionsService.getMemberUsageBreakdown(actorUserId,
workspaceId, metric)` — Owner/Admin thấy toàn bộ member, người khác chỉ thấy
chính mình. Expose qua `GET /workspaces/:workspaceId/usage/ai-requests`.

## 6. Streaming contract

- NestJS gateway forward content type `text/event-stream`.
- Next proxy không gọi `.text()` với SSE; response body được forward trực tiếp.
- Frontend parser và callback contract hiện tại được giữ nguyên.
- Thread create/cancel đi qua authenticated gateway nhưng không trừ AI quota.
- Các endpoint dùng `@Res()` để proxy JSON phải gửi response trực tiếp và
  không return đối tượng `Response`; nếu return object này, global
  `ClassSerializerInterceptor` có thể serialize socket nội bộ của Node và gây
  lỗi `this.removeListener is not a function`/`ERR_HTTP_HEADERS_SENT`.
- Nhánh SSE cũng phải gọi `res.write`/`res.end` mà không return giá trị của
  Express; nhánh lỗi sau khi đã gửi header chỉ được đóng response.
- AI requests không thuộc project include active workspace ID từ
  `active_workspace_id`; gateway kiểm tra membership trước khi reserve quota.
  Với project chat, gateway resolve billing workspace trực tiếp từ project.
  AI-created projects vẫn nhận active workspace ID khi được tạo.

## 7. Text-to-SQL

- Text-to-SQL reserve cùng metric `ai_requests_monthly`.
- Billing workspace lấy từ DB connection.
- Model lấy từ plan của billing workspace giống LangGraph flow; request trực
  tiếp tới AI ingestion luôn nhận `model_name` đã resolve từ backend.
- Success commit; exception release.

## 8. Limitations

- Commit xảy ra khi LangGraph chấp nhận và mở stream; lỗi giữa stream vẫn tính
  một request vì upstream đã bắt đầu xử lý.
- Quota phía user vẫn tính theo `ai_requests_monthly` (credit/request).
- Mỗi committed `usage_event` ghi `input_tokens`, `output_tokens` và
  `model_calls` từ provider usage metadata để phục vụ admin analytics; các số
  token này không tham gia chặn quota.
- Gateway gom token metadata từ toàn bộ model messages trong LangGraph stream.
  Đồng thời collector lấy `response_metadata.model_name`; nếu một operation
  dùng nhiều model khác nhau thì `model_name` của event là `multiple`.
  Endpoint text-to-SQL trực tiếp trả usage metadata để backend ghi cùng event.
- Admin analytics lấy credits và token thật từ `usage_events`, không ước lượng
  bằng độ dài `chat_messages`.
- Admin analytics group theo time bucket và `model_name`, đồng thời trả cả
  series tổng và `models[]`. Dropdown `AI Assistant Activity` lọc client-side
  trên payload này. Credit của một model là số committed usage event được ghi
  nhận với model đó; token và model calls là tổng các cột tương ứng.
- Payload còn có `dailyModels[]`, luôn group theo ngày dù overview đang chọn
  week/month. `Model Usage Trend` render mỗi model thành một line và cho phép
  chuyển metric giữa calls, credits và tổng tokens.
- Chưa có cleanup job cho reservation bị treo do process crash.
- Chưa có Redis counter; PostgreSQL transaction là source of truth hiện tại.
- Chưa proxy các endpoint LangGraph ngoài thread create, stream và cancel.
- `LANGGRAPH_API_URL` phải được cấu hình ở backend production.

## 9. Bước tiếp theo

1. Reservation TTL cleanup job.
2. Cost metering theo model nếu cần quy đổi token thành chi phí.
3. Document storage và export usage.
4. Admin usage dashboard và manual adjustment audit.
