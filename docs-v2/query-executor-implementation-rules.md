# Query Executor: Kết nối DB và thực thi SQL trực tiếp từ Physical Schema

Tài liệu này mô tả thiết kế tính năng Query Executor — cho phép user kết nối đến một DBMS thật, sinh SQL tự động từ physical schema bằng AI, chỉnh sửa và thực thi trực tiếp trong dbflow. Tính năng **chỉ khả dụng ở Physical level**.

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

## 2. Entry point & điều kiện mở

Query Executor **chỉ mở được khi schema hiện tại là Physical**:

```tsx
// Tương tự pattern của Export DDL
onOpenQueryExecutor={isPhysicalSchema ? () => setIsQueryExecutorOpen(true) : undefined}
```

Nếu schema đang ở Conceptual hoặc Logical, nút Query bị disabled kèm tooltip: *"Query chỉ khả dụng ở Physical schema."*

---

## 3. Connection Manager

### 3.1. Vị trí

Connection Manager là một modal/drawer riêng, mở từ trong Query Executor panel.

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

### 4.1. Flow

```
User nhập mô tả ("lấy tất cả order trong tháng này kèm tên khách hàng")
  → FE gửi message + current physical schema_model lên AI endpoint
  → AI đọc schema → sinh SQL
  → SQL được đặt vào Monaco editor
  → User review, chỉnh sửa nếu cần
  → User bấm Execute (hoặc huỷ)
```

### 4.2. Input cho AI

AI nhận:
- `schema_model`: physical `model.json` hiện tại (đầy đủ, không cắt)
- `dbms`: loại DBMS của connection đang active (để sinh đúng syntax)
- `user_message`: mô tả tự nhiên của user
- `query_type_hint` (optional): `SELECT` | `INSERT` | `UPDATE` | `DELETE` — nếu user chọn rõ loại query

AI **không** được cấp quyền execute — chỉ sinh text SQL, đặt vào editor.

### 4.3. Output

AI trả về SQL text (plain string, không fenced block). FE đặt nguyên vào editor, không post-process ngoài trim whitespace.

### 4.4. Giới hạn

- AI chỉ sinh **một câu query tại một thời điểm** (không batch).
- Nếu AI sinh ra câu chứa destructive operation (DELETE/DROP/TRUNCATE), Safeguard Layer vẫn chạy bình thường sau đó — không filter ở bước này.

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

## 6. Query Execution Flow

```
User bấm Execute
  → Safeguard Layer check (xem mục 5)
  → [nếu pass] FE gọi POST /api/query/execute
      body: { connection_id, sql, project_id }
  → BE chạy query trên DB thật
  → BE trả về QueryResult
  → FE render kết quả vào Result Viewer
  → Query được thêm vào Query History
```

### 6.1. Request/Response

**Request:**
```ts
interface QueryExecuteRequest {
  connection_id: string;
  sql: string;
  project_id: string;
}
```

**Response (success):**
```ts
interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  execution_time_ms: number;
}
```

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
| AI Pipeline (`DOC-schema-gen-pipeline.md`) | AI SQL Generator thêm intent `query` vào `router_node`, **không** inject spec RAG (chỉ cần schema_model) |

---

## 11. Flow tóm tắt

```
[Physical diagram active]
  → User mở Query Executor panel
  → Chọn / tạo DB Connection
    → [Test Connection]
  → Viết SQL thủ công HOẶC dùng AI Generator
    → [AI Generator] User mô tả → AI đọc schema → SQL vào editor
  → Bấm Execute
    → Safeguard Layer check
      → SAFE: execute ngay
      → WARN: confirmation dialog
      → DANGER: gõ tên table để xác nhận
      → Read-only mode ON + non-SELECT: blocked
    → POST /api/query/execute → BE chạy → trả kết quả
  → Result Viewer hiển thị rows / error
  → Query lưu vào History
```
