# Seed Data Generation: Sinh INSERT mẫu bằng AI từ Physical Schema

Tài liệu này mô tả tính năng Seed Data — cho phép user mô tả bằng ngôn ngữ tự nhiên loại dữ liệu mẫu cần tạo (bảng nào, bao nhiêu dòng), AI sinh ra các câu `INSERT` tôn trọng FK/constraint của physical schema, sau đó user review/chỉnh sửa trong Monaco editor rồi Run vào **sandbox SQLite riêng của schema** (không phải DB thật — xem `query-sandbox-implementation-rules.md`). Tính năng **chỉ khả dụng ở Physical level** (giống Query Executor — xem `query-executor-implementation-rules.md`).

Đây là intent thứ 2 (`seed_data`) tái sử dụng gần như toàn bộ hạ tầng của intent `text_to_sql` — cả AI pipeline (dbflow-ai) lẫn UI (dbflow-frontend) đều dùng chung code, chỉ khác prompt và một vài ràng buộc validate.

---

## 1. Vị trí code chính

**Frontend**:
- `src/components/EditProject/features/dbms/seed-data/SeedDataModal.tsx` — wrapper mỏng, set `inputIntent="seed_data"` + copy riêng, gọi `SqlWorkbenchModal`.
- `src/components/EditProject/features/dbms/shared/SqlWorkbenchModal.tsx` — UI dùng chung với Query Executor (NL input, Generate, Monaco editor, Run, Result Viewer, Log panel). **Không có UI riêng cho Seed Data** — y hệt Query Executor, chỉ khác `inputIntent`/title/placeholder/default editor content truyền vào qua props.
- Entry point: toolbar "AI Data Tools" (`Header/index.tsx`) → `DbFlowController flow="ai-tools"` → `QuerySeedHubStep` → nút "Seed Data" → `SeedDataModal`. Không yêu cầu kết nối DBMS để mở, và Run cũng không cần connection — chạy thẳng vào sandbox (xem `query-executor-implementation-rules.md` mục 2 và `query-sandbox-implementation-rules.md` — cùng cơ chế với Query Executor).

**dbflow-ai**:
- `src/agent/nodes/sql_generator.py` — node `sql_generator_node` dùng chung với `text_to_sql`, chọn `SEED_DATA_GENERATOR_PROMPT` khi `state["user_intent"] == "seed_data"`.
- `src/agent/nodes/sql_validator.py` — node `sql_validator_node` dùng chung, truyền `require_insert_only=True` và `expect_single_statement=False` khi intent là `seed_data`.
- `src/agent/prompts.py` — `SEED_DATA_GENERATOR_PROMPT`.
- `src/agent/models.py` — `UserIntent.SEED_DATA = "seed_data"`.
- `src/agent/nodes/router.py` — `_EXPLICIT_OVERRIDE_INTENTS` bao gồm cả `text_to_sql` và `seed_data`, cả hai đều set thẳng từ `input_intent` do FE gửi, bỏ qua LLM classify.

---

## 2. Flow runtime

Giống hệt pipeline `text_to_sql` (xem `dbflow-ai/docs-feature/DOC-text-to-sql-pipeline.md`), chỉ khác ở bước 5 (prompt) và bước 7 (validator rule):

```
User mô tả ("seed 10 users và 30 orders cho e-commerce")
  → FE gọi streamChatToLangGraph với input_intent="seed_data", input_model=physical schema hiện tại
  → router_node: nhận input_intent="seed_data" → set user_intent, bỏ qua LLM classify,
      current_level="physical", suy target_dbms từ schema_model.model.dbms
  → retriever_node + reranker_node: giống hệt text_to_sql (spec RAG physical + project docs RAG)
  → sql_generator_node: dùng SEED_DATA_GENERATOR_PROMPT thay vì SQL_GENERATOR_PROMPT
      → Gemini (temperature=0, max_output_tokens mặc định 8192 — lớn hơn text_to_sql vì
        cần sinh nhiều INSERT statement) → 1 fenced ```sql block chứa NHIỀU câu INSERT
  → sql_validator_node: parse TỪNG statement bằng sqlglot, validate:
      - Mỗi statement PHẢI là INSERT (require_insert_only=True) — DELETE/UPDATE/DDL bị reject
      - Không giới hạn số lượng statement (expect_single_statement=False, khác text_to_sql)
      - Table/column trong danh sách cột của INSERT phải tồn tại trong schema_model
      → có issue: quay lại sql_generator_node tự sửa, tối đa VALIDATION_MAX_RETRIES lần
  → SQL (nhiều INSERT trong 1 fenced block) stream về FE → extractSqlFromContent() → Monaco editor
  → User review, bấm Run → executeSandboxQuery(projectId, schemaId, sql) → chạy INSERT vào sandbox
      SQLite của schema (không phải DB thật) — xem query-sandbox-implementation-rules.md
```

---

## 3. Thuật toán / rule chi tiết

### 3.1. Prompt (`SEED_DATA_GENERATOR_PROMPT`)

Khác biệt chính so với `SQL_GENERATOR_PROMPT` (text_to_sql):
- Cho phép **nhiều statement** trong 1 fenced block (mỗi dòng 1 câu, kết thúc bằng `;`) thay vì đúng 1 statement.
- Chỉ được sinh `INSERT` — cấm tuyệt đối `SELECT`/`UPDATE`/`DELETE`/DDL.
- Luôn liệt kê tên cột tường minh trong mỗi `INSERT INTO table (col1, col2, ...)` — không bao giờ dùng `INSERT INTO table VALUES (...)` (để validator có thể check tên cột).
- Luôn cung cấp giá trị tường minh cho **mọi** cột kể cả primary key auto-increment — để đảm bảo FK giữa các câu INSERT trong cùng batch tham chiếu đúng giá trị nhau (không dựa vào `RETURNING`/`LAST_INSERT_ID()`).
- Tôn trọng thứ tự phụ thuộc FK: INSERT bảng cha (được `roles.foreignKey.refTableId` trỏ tới) TRƯỚC bảng con.
- Mặc định 5 dòng/bảng nếu user không chỉ định số lượng hoặc bảng cụ thể.

### 3.2. Validator (`sql_validator_node` — nhánh `seed_data`)

`_validate_sql()` nhận 2 flag: `require_insert_only`, `expect_single_statement`. Với `seed_data`: `require_insert_only=True`, `expect_single_statement=False`.

Parse bằng `sqlglot.parse(sql, dialect=...)` (trả về **list** statement, khác `text_to_sql` cũ dùng `parse_one`). Với mỗi statement:
1. Phải là `exp.Query`/`exp.DML` hợp lệ (bắt được cú pháp rác kiểu "SELEKT ... FORM").
2. Nếu `require_insert_only`: phải là `exp.Insert`, không thì reject kèm message rõ loại statement sai.
3. Check table tồn tại (`exp.Table` nodes + alias map).
4. Check cột trong **danh sách cột của INSERT** — sqlglot model cột này là `Identifier` thô nằm trong `Insert.this` (kiểu `exp.Schema`), **KHÔNG PHẢI** `exp.Column` — phải trích riêng (`stmt.this.expressions`), khác hoàn toàn cách check cột của SELECT (`exp.Column` walk, dùng chung với `text_to_sql`).
5. Check cột trong mệnh đề khác (WHERE/ON, nếu INSERT...SELECT) qua `exp.Column` walk như bình thường.

### 3.3. Khác biệt với Query Executor (text_to_sql)

| Khía cạnh | text_to_sql | seed_data |
|---|---|---|
| Prompt | `SQL_GENERATOR_PROMPT` | `SEED_DATA_GENERATOR_PROMPT` |
| Số statement | Đúng 1 | Nhiều (không giới hạn) |
| Loại statement | Bất kỳ (SELECT/UPDATE/DELETE/...) | Chỉ `INSERT` |
| `max_output_tokens` mặc định | 4096 | 8192 (`SQL_GEN_MAX_OUTPUT_TOKENS` env override chung cho cả 2) |
| UI | `QueryExecutorModal` (wrapper) | `SeedDataModal` (wrapper) |
| UI thực tế | `SqlWorkbenchModal` (dùng chung) | `SqlWorkbenchModal` (dùng chung) |

---

## 4. Edge cases / Limitations

- **Không tự resolve identity/serial trên SQL Server**: prompt yêu cầu cung cấp giá trị tường minh cho PK auto-increment, nhưng SQL Server mặc định cấm insert giá trị tường minh vào cột `IDENTITY` trừ khi có `SET IDENTITY_INSERT [table] ON`. Prompt hiện **không** yêu cầu LLM tự thêm `SET IDENTITY_INSERT`. Vô hại khi Run vào sandbox (SQLite không có khái niệm IDENTITY, luôn chấp nhận giá trị PK tường minh) — nhưng nếu user copy SQL này ra chạy trên SQL Server thật (ngoài phạm vi tính năng này), câu lệnh có thể fail. Validator không chặn việc này (chỉ check identifier tồn tại, không check business rule DBMS-specific này).
- **Không check row count hoặc kiểu dữ liệu giá trị thực tế** — validator chỉ check table/column tồn tại + statement type, không check giá trị literal có đúng kiểu (`varchar` nhận số, `integer` nhận string, v.v.) hay không.
- **Không có UI chọn bảng cụ thể** (checkbox chọn table như trong `PLANNED_FEATURES` cũ) — user phải mô tả bằng NL đầy đủ bảng/số lượng muốn seed. Đây là giới hạn của v1, tương lai có thể thêm UI chọn bảng riêng.
- **INSERT...SELECT chưa test kỹ** — validator hỗ trợ về mặt logic (dùng chung `exp.Column` walk cho phần SELECT con) nhưng chưa có test case cụ thể; prompt cũng không hướng dẫn AI dùng dạng này (chỉ dạy `INSERT ... VALUES`).
- Kế thừa toàn bộ giới hạn của sandbox (xem `query-sandbox-implementation-rules.md` mục 7): không mô phỏng dialect-specific behavior, `rowCount` cho batch nhiều INSERT chỉ phản ánh statement cuối, rebuild không transaction-safe xuyên bảng khi schema đổi giữa lúc seed.
