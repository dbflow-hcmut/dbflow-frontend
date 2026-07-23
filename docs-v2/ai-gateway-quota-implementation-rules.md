# AI Gateway & Usage Quota Implementation Rules

## 1. Vị trí code

- `dbflow-backend/src/modules/ai-gateway/**`
- `dbflow-backend/src/modules/usage/**`
- `dbflow-backend/src/migrations/1778500000000-CreateUsageLedger.ts`
- `dbflow-backend/src/migrations/1784764800000-AddTokenUsageToUsageEvents.ts`
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
- `project_id` luôn được ưu tiên hơn `workspace_id`; client không gửi
  `workspace_id` cho project-scoped chat.
- Backend kiểm tra user có resource workspace access.
- AI chat không có project: dùng active `workspace_id` hợp lệ; nếu request
  không có workspace thì fallback personal workspace của actor.
- Usage event lưu cả actor `user_id` và billing `workspace_id`.

## 4. Usage data model

### `usage_events`

- Một row cho mỗi operation.
- Unique `operation_id`.
- Status: `reserved | committed | released`.
- Lưu metric, quantity, period, metadata, `input_tokens`, `output_tokens` và
  `model_calls`.

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
- Success commit; exception release.

## 8. Limitations

- Commit xảy ra khi LangGraph chấp nhận và mở stream; lỗi giữa stream vẫn tính
  một request vì upstream đã bắt đầu xử lý.
- Quota phía user vẫn tính theo `ai_requests_monthly` (credit/request).
- Mỗi committed `usage_event` ghi `input_tokens`, `output_tokens` và
  `model_calls` từ provider usage metadata để phục vụ admin analytics; các số
  token này không tham gia chặn quota.
- Gateway gom token metadata từ toàn bộ model messages trong LangGraph stream.
  Endpoint text-to-SQL trực tiếp trả usage metadata để backend ghi cùng event.
- Admin analytics lấy credits và token thật từ `usage_events`, không ước lượng
  bằng độ dài `chat_messages`.
- Chưa có cleanup job cho reservation bị treo do process crash.
- Chưa có Redis counter; PostgreSQL transaction là source of truth hiện tại.
- Chưa proxy các endpoint LangGraph ngoài thread create, stream và cancel.
- `LANGGRAPH_API_URL` phải được cấu hình ở backend production.

## 9. Bước tiếp theo

1. Reservation TTL cleanup job.
2. Cost metering theo model nếu cần quy đổi token thành chi phí.
3. Document storage và export usage.
4. Admin usage dashboard và manual adjustment audit.
