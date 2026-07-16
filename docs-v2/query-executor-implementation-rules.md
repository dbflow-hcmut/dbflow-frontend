# Query Executor: Kết nối DB và thực thi SQL trực tiếp từ Physical Schema

Tài liệu này mô tả thiết kế tính năng Query Executor — cho phép user kết nối đến một DBMS thật, sinh SQL tự động từ physical schema bằng AI, chỉnh sửa và thực thi trực tiếp trong dbflow. Tính năng **chỉ khả dụng ở Physical level**.

**UI implementation**: từ khi thêm tính năng Seed Data (xem `seed-data-generation-implementation-rules.md`), toàn bộ UI (NL input, Generate button, Monaco editor, Run, Result Viewer, Log panel) được factor ra thành component dùng chung `SqlWorkbenchModal` (`src/components/EditProject/features/dbms/shared/SqlWorkbenchModal.tsx`). `QueryExecutorModal.tsx` giờ chỉ là wrapper mỏng truyền `inputIntent="text_to_sql"` + copy riêng vào `SqlWorkbenchModal`. Mọi thay đổi UI/behavior chung (schema picker, Run, Safeguard sau này, Result Viewer) nên sửa ở `SqlWorkbenchModal`, không sửa riêng từng wrapper.

---

## 1. Tổng quan tính năng

| Sub-feature | Mô tả |
|---|---|
| **Connection Manager** | Thêm/sửa/xóa DB connection cho project. Credential lưu phía backend, FE không giữ password. |
| **AI SQL Generator** | User mô tả bằng ngôn ngữ tự nhiên → AI đọc `schema_model` (physical) → sinh SQL → đặt vào editor để review trước khi chạy. |
| **Query Editor** | Monaco editor với SQL syntax highlighting. User có thể viết tay hoặc nhận SQL từ AI. |
| **Safeguard Layer** | Parse SQL client-side, phân loại mức độ nguy hiểm, chặn/yêu cầu xác nhận trước khi execute destructive query. |
| **Result Viewer** | Hiển thị kết quả dạng bảng, row count, execution time, error message. |
| **Query History** | Lưu N câu query gần nhất trong session (không persist qua reload). |

---

## 2. Entry point & điều kiện mở (đã đổi — không còn bắt buộc kết nối DBMS)

Query Executor mở từ toolbar button **"AI Data Tools"** (`Header/index.tsx`, icon `Sparkles`) → `DbFlowController flow="ai-tools"` → hub `QuerySeedHubStep` (`src/components/db-flow/steps/QuerySeedHubStep.tsx`) → nút "Generate Query".

Nút toolbar **"AI Data Tools" chỉ render khi `schemaType === 'physical'`** (`Header/index.tsx`, điều kiện `{schemaType === 'physical' && (...)}`) — ẩn hoàn toàn (không phải disable) khi đang xem Conceptual/Logical, vì cả Generate Query lẫn Seed Data đều cần physical `schema_model`. Nút **"Sync Schema"** không bị gate theo `schemaType` — luôn hiện, vì nó tạo MỘT physical schema MỚI nên không phụ thuộc schema đang mở.

Khác với thiết kế cũ: **KHÔNG còn yêu cầu kết nối DBMS để mở, và KHÔNG còn cần connection để Run** — hub `ai-tools` không có bước `connect-db` trong state machine (`db-flow-config.ts`). Nút **Run** giờ luôn thực thi vào **sandbox SQLite riêng của schema** (xem `query-sandbox-implementation-rules.md`) — không còn phụ thuộc DB connection, không còn disable/tooltip "connect a database" nào cả. `connId`/`conn`/schema-picker (chọn schema DB như `public`) đã bị xoá khỏi `SqlWorkbenchModal` — không còn ý nghĩa vì sandbox không có khái niệm "schema" theo nghĩa DBMS.

"Sync Schema" (toolbar button riêng, icon `DatabaseZap` → `DbFlowController flow="sync-schema"`, bắt buộc `connect-db` trước) vẫn tồn tại nhưng **không liên quan gì đến Run nữa** — nó chỉ dùng để pull cấu trúc DB thật vào một physical schema MỚI (import), độc lập hoàn toàn với Query Executor/Seed Data.

Tính năng vẫn **chỉ có ý nghĩa đầy đủ ở Physical level** (AI cần physical `schema_model` để sinh SQL) — nếu chưa có physical schema nào đang mở, nút "Generate" trong `QueryExecutorModal` bị disable kèm tooltip *"Open a physical schema to enable AI SQL generation"*.

---

## 3. Connection Manager

### 3.1. Vị trí

Connection Manager **không còn nằm trong Query Executor panel** (đã đổi — xem mục 2), và **`QueryExecutorModal` không còn dùng DB connection cho bất kỳ việc gì** kể từ khi Run chuyển sang chạy vào sandbox (xem `query-sandbox-implementation-rules.md`). Kết nối DB giờ chỉ phục vụ 2 entry point hoàn toàn tách biệt: toolbar "Sync Schema" (`flow="sync-schema"`, import cấu trúc DB thật) và "Apply to Database" (`flow="apply-schema"`, export DDL), cả hai đều dùng chung `ConnectDbStep`/`DBConnectionModal` (`src/components/db-flow/steps/`).

### 3.2. Data model

```ts
interface DBConnection {
  id: string;               // uuid
  project_id: string;
  name: string;             // tên do user đặt, ví dụ "Production PG"
  dbms: DBMSType;           // postgresql | mysql | mssql | ...
  host: string;
  port: number;
  database: string;
  username: string;
  // password KHÔNG có trong FE type — lưu phía backend (encrypted)
  ssl: boolean;
  created_at: string;
  updated_at: string;
}
```

### 3.3. Luồng thêm connection

1. User nhập host, port, database, username, password.
2. FE gọi `POST /api/connections` — BE lưu credential (password encrypted), trả về `DBConnection` (không có password).
3. FE hiển thị connection trong danh sách.
4. User có thể **Test Connection** trước khi lưu — BE ping DB và trả về `{ ok: boolean, latencyMs: number }`.
5. Connection active được lưu vào `QuerySession.connectionId`.

### 3.4. Lưu ý bảo mật

- Password **không bao giờ** xuất hiện trong response API hoặc state FE sau khi lưu.
- Khi edit connection, password field hiển thị placeholder `••••••••`; user phải nhập lại nếu muốn đổi.
- Mỗi connection thuộc về một `project_id` cụ thể — không share giữa projects.

---

## 4. AI SQL Generator

### 4.1. Flow (đã implement — v2, gọi thẳng LangGraph)

```
User nhập mô tả ("lấy tất cả order trong tháng này kèm tên khách hàng")
  → FE gọi thẳng LangGraph server (streamChatToLangGraph), KHÔNG qua NestJS
      input: { messages: [{role:"user", content: nl_query}],
                current_level: "physical",
                input_model: <physical schema model.json hiện tại>,
                project_id?,
                input_intent: "text_to_sql" }
      thread_id: mới, ephemeral (generateThreadId() mỗi lần bấm Generate — không lưu vào chat history)
  → dbflow-ai router_node nhận input_intent="text_to_sql" → set user_intent thẳng,
      BỎ QUA LLM classification, set current_level="physical", suy ra target_dbms từ model.dbms
  → retriever_node đọc full spec docs/physical/model-schema.md + model.schema.json (để LLM hiểu
      đúng cấu trúc roles.foreignKey/primaryKey) + fetch project docs (ChromaDB, nếu có project_id)
  → reranker_node rerank project docs (hybrid BM25 + semantic) — giống schema-gen pipeline
  → sql_generator_node: build prompt (spec + schema_model JSON đầy đủ + project docs + user_message)
      → Gemini (temperature=0) → sinh 1 câu SQL trong fenced ```sql block
  → sql_validator_node: parse SQL bằng sqlglot theo dialect target_dbms, kiểm tra
      table/column tham chiếu có tồn tại trong schema_model không
      → nếu có issue: quay lại sql_generator_node tự sửa, tối đa VALIDATION_MAX_RETRIES lần
      → hết retry vẫn còn issue: trả kèm warning, không chặn
  → SQL (fenced ```sql block) stream về FE → FE parse bằng extractSqlFromContent() → đặt vào Monaco editor
  → User review, chỉnh sửa nếu cần
  → User bấm Execute (hoặc huỷ)
```

Chi tiết pipeline đầy đủ (9 bước, giống cấu trúc schema-gen): xem `dbflow-ai/docs-feature/DOC-text-to-sql-pipeline.md`.

### 4.2. Context cho AI (thứ tự ưu tiên — ĐÃ ĐỔI so với v1)

1. **Physical schema model.json (primary)**: `schema_model` hiện tại trong LangGraph thread — sync từ `input_model` mà FE gửi (build từ diagram physical đang mở). Đây là nguồn thực tế bây giờ, KHÔNG còn introspect DB sống.
2. **Spec RAG**: `docs/physical/model-schema.md` + `model.schema.json` — đọc full, không chunk, để LLM hiểu đúng format `roles.primaryKey`/`roles.foreignKey`.
3. **Project document hub**: ChromaDB `project_docs`, rerank hybrid BM25 + semantic (giống schema-gen), không còn chỉ cosine top-3 như v1.
4. `target_dbms`: suy ra trực tiếp từ `schema_model.model.dbms` (không cần LLM detect).

**Live DB connection KHÔNG còn là context cho AI, và cũng KHÔNG còn dùng để Execute** (đã đổi thêm 1 lần nữa — xem mục 2 và `query-sandbox-implementation-rules.md`). Đây là điểm đảo ngược so với v1 (trước đây DBMS introspect là nguồn chính, physical schema model không được inject).

AI **không** được cấp quyền execute — chỉ sinh text SQL, đặt vào editor.

### 4.3. API

Không còn gọi qua NestJS cho bước generate. Frontend gọi thẳng LangGraph server, giống hệt pattern schema-gen chat:

```ts
streamChatToLangGraph(
  DBFLOW_ASSISTANT_ID,
  generateThreadId(),               // ephemeral, mới mỗi lần Generate
  [{ role: "user", content: nlInput }],
  onChunk, onComplete, onError,
  true,                              // ensureThread
  undefined,                         // onReasoning — không cần cho UI one-shot
  undefined,                         // abortSignal
  "physical",                        // currentLevel
  model,                             // currentModel -> input_model
  projectId,
  "text_to_sql",                     // inputIntent -> input_intent (bỏ qua LLM classify)
)
```

Response là SSE stream `messages/*` giống schema-gen; FE dùng `extractSqlFromContent()` (`@/api/ai/client`) để lấy SQL từ fenced ```sql block trong nội dung AI message cuối cùng.

**Route cũ (không còn được gọi, giữ nguyên code không xoá)**:
```ts
POST /db-connections/:connId/text-to-sql   // NestJS, dbflow-backend/src/modules/db-connections
Body: { nl_query: string; schema?: string; project_id?: string }
Response: { sql: string }
```
```python
POST /api/text-to-sql   # dbflow-ai FastAPI sidecar, src/api/ingest.py
Body: { nl_query, dbms, schema_tables: IntrospectedTable[], project_id? }
Response: { sql: string }
```
`generateSqlFromNl()` trong `@/api/db-connections/client` vẫn tồn tại trong code nhưng không còn caller nào — dead code, chưa xoá vì nằm ngoài scope của lần đổi này (chạy query/BE là việc làm sau).

### 4.4. Output

AI trả về nội dung dạng: 1 câu mô tả ngắn + fenced ```sql code block. FE parse bằng `extractSqlFromContent()`, chỉ lấy phần SQL bên trong fence, đặt vào Monaco editor.

### 4.5. Giới hạn

- AI chỉ sinh **một câu query tại một thời điểm** (không batch) — validator (`sql_validator_node`) cũng chỉ parse 1 statement.
- Nếu AI sinh ra câu chứa destructive operation (DELETE/DROP/TRUNCATE), Safeguard Layer vẫn chạy bình thường sau đó — không filter ở bước này.
- `project_id` optional — nếu không có, chỉ dùng physical schema + spec RAG (không có project docs).
- Query Executor chỉ mở được khi đang xem physical schema (`isPhysicalSchema`) — nếu `model` là `null`/`undefined`, nút Generate bị disable kèm tooltip.
- `sql_validator_node` chỉ check table/column tồn tại + syntax hợp lệ theo dialect (qua `sqlglot`) — không check business logic, không check quyền, không phát hiện được mọi lỗi cú pháp cực đoan (sqlglot khá lenient khi parse).
- Column không qualify bằng table (unqualified) trong query nhiều bảng bị bỏ qua khi validate (tránh false positive) — chỉ check khi có 1 bảng duy nhất hoặc column có prefix table/alias rõ ràng.

---

## 5. Safeguard Layer

Đây là lớp bảo vệ quan trọng nhất, chạy **phía client trước mỗi lần execute**.

### 5.1. Phân loại mức độ nguy hiểm

| Loại | Trigger | Hành động |
|---|---|---|
| `SAFE` | `SELECT` | Execute ngay, không hỏi |
| `WARN` | `INSERT`, `UPDATE` có `WHERE`, `DELETE` có `WHERE` | Hiện confirmation dialog: *"Câu query này sẽ thay đổi dữ liệu. Tiếp tục?"* |
| `DANGER` | `UPDATE` không có `WHERE`, `DELETE` không có `WHERE`, `TRUNCATE`, `DROP` | Hiện dialog yêu cầu user gõ tên table vào input để xác nhận |

### 5.2. Read-only Mode

- Toggle trong Query panel: **Read-only mode** (mặc định: **OFF**).
- Khi ON: chỉ cho phép `SELECT`. Mọi câu không phải SELECT bị chặn hoàn toàn trước khi gửi lên backend, kèm message: *"Read-only mode đang bật. Tắt để chạy câu này."*
- State của toggle lưu per-connection, persist qua session (localStorage).

### 5.3. Parse SQL client-side

Parser chỉ cần detect keywords ở statement-level (không cần full parse):
- Lấy `firstToken` sau khi strip comments và whitespace.
- Detect `WHERE` bằng regex đơn giản cho WARN vs DANGER.
- Không cần AST — đủ cho mục đích safeguard.

---

## 6. Query Execution Flow (đã đổi — chạy vào sandbox, không phải DB thật)

Mục này trước đây mô tả một thiết kế PLANNED (chưa từng implement) chạy vào DB thật qua `connection_id`. Thực tế hiện tại: Run luôn chạy vào sandbox SQLite riêng của schema — xem chi tiết đầy đủ ở `docs-v2/query-sandbox-implementation-rules.md`. Tóm tắt:

```
User bấm Run trong SqlWorkbenchModal
  → FE gọi executeSandboxQuery(projectId, schemaId, sql, resultLimit)
      POST /projects/:projectId/schemas/:schemaId/sandbox/execute
  → BE: đồng bộ sandbox với model.json hiện tại nếu cần (provision/migrate/reset per-table)
  → BE chạy query vào file SQLite của sandbox (better-sqlite3)
  → BE trả về { success, rowCount, columns, rows, executionTimeMs, message?, syncReport? }
  → FE render kết quả vào Result Viewer, log syncReport (nếu có) vào Log panel
```

**Safeguard Layer (mục 5) vẫn CHƯA implement** — không đổi so với trước, và ít khẩn cấp hơn vì Run giờ luôn nhắm vào sandbox (dữ liệu thử nghiệm, không phải DB thật của user) thay vì một kết nối sống.

### 6.1. Request/Response

Xem "6. API contract" trong `query-sandbox-implementation-rules.md` — response dùng chung shape `QueryResultDto` với route execute của live-DB connection (`db-connections` module), cộng thêm `syncReport` optional.

**Response (error):**
```ts
interface QueryError {
  error_code: string;   // DB-level error code, ví dụ "42P01" (PostgreSQL: undefined_table)
  message: string;
  hint?: string;
}
```

### 6.2. Timeout

BE áp dụng query timeout mặc định **30 giây**. Nếu vượt quá, trả `error_code: "QUERY_TIMEOUT"`. FE hiển thị message và cho phép user retry.

### 6.3. Row limit

BE giới hạn result trả về tối đa **1000 rows** mặc định. Nếu result vượt quá, FE hiển thị banner: *"Hiển thị 1000/N rows đầu tiên."*

---

## 7. Result Viewer

### 7.1. Layout

```
┌─────────────────────────────────────────────────────┐
│ [1000 rows · 12ms · PostgreSQL]                      │
├────┬──────────┬───────────┬───────────┬─────────────┤
│ #  │ id       │ name      │ email     │ created_at  │
├────┼──────────┼───────────┼───────────┼─────────────┤
│ 1  │ uuid...  │ Alice     │ alice@... │ 2024-01-01  │
│ 2  │ uuid...  │ Bob       │ bob@...   │ 2024-01-02  │
└────┴──────────┴───────────┴───────────┴─────────────┘
```

- Cột có thể resize.
- NULL values hiển thị dưới dạng badge `NULL` (màu khác).
- Long text bị truncate với tooltip full value.
- Có nút **Copy as CSV** và **Copy as JSON**.

### 7.2. Error state

Nếu BE trả lỗi, Result Viewer hiển thị:
- Error code và message.
- `hint` nếu có (PostgreSQL cung cấp hint khá hữu ích).
- Không clear editor — user có thể sửa query và chạy lại.

---

## 8. Query History

- Lưu **50 câu query gần nhất** trong session (không persist qua reload).
- Mỗi entry:

```ts
interface QueryHistoryItem {
  id: string;
  sql: string;
  executed_at: Date;
  status: 'success' | 'error';
  row_count?: number;
  execution_time_ms?: number;
  error_message?: string;
}
```

- User click vào item trong history → SQL được load vào editor.
- Không có tính năng "save query" trong v1.

---

## 9. Scope giới hạn của v1

| Tính năng | v1 | Ghi chú |
|---|---|---|
| Multi-statement (`;` separated) | **Không hỗ trợ** | Chỉ một statement mỗi lần |
| Transaction / BEGIN…COMMIT | **Không hỗ trợ** | |
| Export result (CSV download) | Copy only | Không download file |
| Save named queries | **Không có** | Chỉ có session history |
| Query plan / EXPLAIN | **Không có** | Có thể thêm sau |
| SSH tunnel | **Không có** | Chỉ direct connection |
| Multiple connections cùng lúc | **Không có** | Một active connection per session |
| Pagination kết quả | **Không có** | Hard limit 1000 rows |

---

## 10. Liên kết với các tính năng khác

| Tính năng | Liên quan |
|---|---|
| Export DDL (`ddl-generator.ts`) | Query Executor dùng cùng `DBMSType` enum và DBMS config |
| Physical Schema (`physical-schema-implementation-rules.md`) | `schema_model` từ physical diagram là input cho AI SQL Generator |
| AI Pipeline (`DOC-schema-gen-pipeline.md`, `DOC-text-to-sql-pipeline.md`) | AI SQL Generator dùng chung LangGraph graph với schema-gen, qua intent `text_to_sql` (FE set cứng qua `input_intent`, không LLM classify). Input chính là physical `schema_model` (model.json) + spec RAG + project docs RAG (ChromaDB, rerank hybrid) — không còn dùng DBMS introspect làm context AI. |
| Query/Seed Sandbox (`query-sandbox-implementation-rules.md`) | Run thực thi vào sandbox SQLite riêng của schema, không phải DB thật — xem tài liệu này cho thuật toán DDL/migration/persistence đầy đủ. |

---

## 11. Flow tóm tắt

```
[Physical diagram active]
  → User mở "AI Data Tools" (toolbar, chỉ hiện khi schemaType === physical) → "Generate Query"
    — KHÔNG cần connection để mở, KHÔNG cần connection để Run
  → Viết SQL thủ công HOẶC dùng AI Generator
    → [AI Generator] User mô tả → AI đọc physical schema_model → SQL vào editor
  → Bấm Run
    → executeSandboxQuery(projectId, schemaId, sql) — chạy vào sandbox SQLite riêng của schema
      (tự provision/migrate sandbox nếu đây là lần đầu hoặc schema vừa đổi — xem query-sandbox-implementation-rules.md)
  → Result Viewer hiển thị rows / error, Log panel hiển thị syncReport nếu sandbox vừa được đồng bộ
  → (Riêng biệt) Muốn chạy trên DB thật: dùng "Sync Schema" hoặc "Apply to Database" — không liên quan đến Run ở đây
```
