# AI Chat Title Generation — Implementation Rules

## 1. Phạm vi và vị trí code

Tính năng dùng Router LLM đang có để sinh tiêu đề ngắn cho conversation đầu tiên,
không tạo thêm một request AI riêng.

- `dbflow-ai/src/agent/prompts.py`: rule sinh `suggested_title`.
- `dbflow-ai/src/agent/models.py`: khai báo field structured output.
- `dbflow-ai/src/agent/nodes/router.py`: chuẩn hóa và phát title trong routing message.
- `dbflow-frontend/src/api/ai/client.ts`: parse `suggested_title` từ SSE routing message.
- `dbflow-frontend/src/components/AIChatView/index.tsx`: lưu title cho full-page chat và dùng
  cùng title làm tên project khi AI tạo project mới.
- `dbflow-frontend/src/components/EditProject/components/ChatBox/index.tsx`: lưu title cho chat
  được mở trong project editor.
- `dbflow-backend/src/modules/chat/chat.service.ts`: fallback cũ vẫn lấy tối đa 80 ký tự đầu
  của user message nếu generated title không có hoặc không lưu được.

## 2. Payload

Router structured output thêm field:

```json
{
  "intent": "create",
  "detected_level": "conceptual",
  "detected_dbms": null,
  "reasoning": "...",
  "suggested_title": "Thiết kế hệ thống bán hàng"
}
```

`suggested_title` chỉ là metadata routing. Nó không được hiển thị như assistant message.
Frontend nhận field này qua callback `onReasoning` của `streamChatToLangGraph`.

## 3. Runtime flow

```text
User gửi message đầu tiên
  -> frontend tạo conversation với title mặc định "New Chat"
  -> LangGraph Router phân loại intent và sinh suggested_title trong cùng một LLM call
  -> frontend stream câu trả lời như bình thường
  -> frontend lưu user/assistant messages
  -> frontend PATCH conversation bằng suggested_title
  -> nếu full-page chat tạo project mới, dùng suggested_title làm project name
```

Không gọi model lần hai chỉ để sinh title. Những lượt chat sau vẫn đi qua Router nhưng frontend
không ghi đè title hiện tại; title do user sửa hoặc title đã sinh ở lượt đầu được giữ nguyên.

## 4. Rule sinh và chuẩn hóa title

- Title dài 3-7 từ, tóm tắt chủ đề hoặc tác vụ của latest user request.
- Dùng cùng ngôn ngữ với user.
- Không thêm dấu nháy, dấu câu cuối hoặc prefix như `AI:` / `Chat:`.
- Không dùng title chung chung như `New Chat`, `Conversation`, `Database Request`.
- AI service gom whitespace, bỏ quote bao ngoài và giới hạn tối đa 80 ký tự.
- Nếu vượt giới hạn, cắt tại ranh giới từ gần nhất.

## 5. Fallback và edge cases

- Nếu Router chưa trả title, model trả rỗng, stream lỗi hoặc PATCH title lỗi, backend fallback về
  nội dung user message tối đa 80 ký tự khi `saveMessages` chạy.
- Tên project fallback về tối đa 50 ký tự đầu của user message và không thêm prefix `AI:`.
- Retry không được coi là conversation mới và không được ghi đè title.
- Existing conversation được load lại không được đổi title tự động.
- Explicit `input_intent` của Query Executor/Seed Data bỏ qua LLM Router và dùng ephemeral thread,
  nên không tham gia chat-title flow này.

## 6. Invariants cần giữ khi sửa

1. `suggested_title` phải nằm trong routing JSON để không bị render thành chat content.
2. Frontend chỉ persist generated title cho message đầu tiên của conversation.
3. Lỗi cập nhật title không được làm hỏng việc tạo project, lưu message hoặc redirect editor.
4. Backend fallback phải tiếp tục hoạt động độc lập với AI title.
5. Conversation title và project name của flow tạo project phải dùng cùng generated title khi có.
