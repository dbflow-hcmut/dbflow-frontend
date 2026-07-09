# Query/Seed Data Sandbox: SQLite giả lập theo từng Physical Schema

Tài liệu này mô tả hạ tầng **sandbox** mà nút Run trong Query Generator và Seed Data (`SqlWorkbenchModal`) chạy vào — thay cho việc kết nối DBMS thật. Mỗi physical schema có đúng 1 sandbox SQLite riêng, persist lâu dài, tự động đồng bộ khi schema bị chỉnh sửa. Phần lớn code nằm ở **dbflow-backend** (không phải dbflow-frontend), nhưng tài liệu đặt ở đây theo đúng convention đã dùng cho `DOC-text-to-sql-pipeline.md` (feature xuyên suốt nhiều repo, tài liệu đặt ở phía chịu trách nhiệm UI/luồng chính).

---

## 1. Vị trí code chính

**Backend (`dbflow-backend`)** — module `src/modules/sandbox/`:
- `sandbox.controller.ts` — `POST /projects/:projectId/schemas/:schemaId/sandbox/execute`, `POST /projects/:projectId/schemas/:schemaId/sandbox/reset`.
- `sandbox.service.ts` — orchestration: đảm bảo sandbox tồn tại + đồng bộ trước mỗi lần chạy, cache handle `better-sqlite3` trong process, persist lên S3.
- `sandbox-sync.ts` — thuật toán đồng bộ khi schema đổi (provision / no-op / migrate-per-table / fallback wipe). Plain functions, không phụ thuộc NestJS DI — test được trực tiếp với `:memory:` sqlite thật (`sandbox-sync.spec.ts`).
- `sqlite-ddl-builder.ts` — build DDL SQLite từ `PhysicalModelPayload` (`sqlite-ddl-builder.spec.ts`).
- `entity/schema-sandbox.entity.ts` — bảng `schema_sandboxes` (metadata: s3 key, hash, last used).
- `ProjectsService.getCurrentSchemaModel()` (`src/modules/projects/projects.service.ts`) — public wrapper mới, đọc model.json mới nhất (Redis/Yjs trước, S3 fallback) — nguồn sự thật duy nhất sandbox đọc vào.
- `S3Service.putObject`/`getObjectBuffer` (`src/modules/s3/s3.service.ts`) — thêm mới để lưu file `.sqlite` nhị phân (trước đó chỉ có JSON put/get).

**Frontend (`dbflow-frontend`)**:
- `src/api/sandbox/client.ts` — `executeSandboxQuery()`, `resetSandbox()`.
- `src/components/EditProject/features/dbms/shared/SqlWorkbenchModal.tsx` — `handleRun` gọi `executeSandboxQuery`, hiển thị `syncReport` vào Log panel; nút "Reset Sandbox" gọi `resetSandbox`.
- `schemaId` được truyền xuống từ `EditProject/index.tsx` (`selectedSchema?.id`) → `Header` → `DbFlowController flow="ai-tools"` → `QueryExecutorModal`/`SeedDataModal`.

---

## 2. Vì sao SQLite, không phải Postgres/MySQL/SQL Server thật

- Sandbox chỉ để **thử nghiệm** query/seed data trên cấu trúc schema, không nhằm mô phỏng chính xác 100% dialect của DBMS mà schema nhắm tới (`model.dbms`).
- `better-sqlite3` được chọn vì: đồng bộ (synchronous API, không cần async/await lồng nhau khi build DDL), thuần Node addon (không cần Docker-in-Docker), mature.
- **Rủi ro triển khai đã xác minh**: prebuilt binary của `better-sqlite3` KHÔNG chạy được trên base image `node:20-alpine` (musl libc) — phải compile từ source. `Dockerfile` đã thêm `python3 make g++` vào bước `apk add` để node-gyp compile được lúc `yarn install`. Nếu đổi base image hoặc bump version `better-sqlite3`, phải re-verify bằng cách build thử trong container.
- Do không dùng `esModuleInterop`, `import Database from 'better-sqlite3'` type-check được nhưng **resolve ra `undefined` lúc runtime** (silent bug). Bắt buộc dùng `import Database = require('better-sqlite3')` (TS import-equals). Áp dụng cho mọi file import `better-sqlite3` sau này.

---

## 3. Data model — SQLite DDL từ physical model.json

`sqlite-ddl-builder.ts` map `PhysicalModelPayload` (JSON contract y hệt `docs/physical/model.schema.json` phía dbflow-ai) sang SQLite:

| Physical `dataType` | SQLite affinity |
|---|---|
| varchar/char/text/uuid/json(b)/enum/nvarchar/uniqueidentifier | `TEXT` |
| integer/int/bigint/smallint/tinyint/serial/bigserial | `INTEGER` |
| decimal/numeric/float/double/real/money | `REAL` |
| boolean/bit | `INTEGER` (0/1) |
| date/time/timestamp(tz)/datetime(2) | `TEXT` (không convert giá trị, chỉ đổi type khai báo) |

Quy tắc PK/FK/Index:
- Cột PK đơn, kiểu INTEGER, `autoIncrement: true` → `"col" INTEGER PRIMARY KEY AUTOINCREMENT` (dạng rowid-alias đặc biệt của SQLite).
- PK composite hoặc không phải INTEGER auto-increment → `PRIMARY KEY (col1, col2, ...)` ở cuối bảng.
- FK khai báo **ngay trong `CREATE TABLE`** (`FOREIGN KEY ... REFERENCES ... ON DELETE ... ON UPDATE ...`) — SQLite **không cho phép** `ALTER TABLE ADD CONSTRAINT` để thêm FK sau khi bảng đã tồn tại. Đây là lý do mọi thay đổi cấu trúc (thêm/sửa FK, đổi kiểu cột, đổi PK) đều phải đi qua **rebuild toàn bảng**, không dùng ALTER trực tiếp.
- Tables được tạo theo **topological sort** dựa trên FK dependency (bảng cha trước bảng con) — cycle thì fallback giữ nguyên thứ tự còn lại.
- Mỗi kết nối sandbox chạy `PRAGMA foreign_keys = ON` (SQLite tắt theo mặc định).

---

## 4. Thuật toán đồng bộ khi schema thay đổi (`sandbox-sync.ts`)

Chạy ở đầu MỖI lần gọi `execute`/`reset`:

```
currentModel = ProjectsService.getCurrentSchemaModel(projectId, schemaId)
currentHash  = sha256(canonicalize(currentModel))

chưa có SchemaSandboxEntity  → provisionSandbox(): tạo full DDL, upload sqlite + model snapshot lên S3
hash trùng builtFromModelHash → no-op, dùng lại handle đã cache (đường đi phổ biến nhất)
hash khác                     → syncSandbox(): so sánh TỪNG bảng oldModel (snapshot đã lưu) vs newModel
```

So sánh theo `table.id` (không theo tên — đổi tên bảng vẫn là "cùng 1 bảng" vì id ổn định qua các lần edit, theo đúng quy ước ID của physical model):

| Trường hợp | Hành động | Ảnh hưởng data |
|---|---|---|
| Bảng chỉ có ở model cũ | `DROP TABLE IF EXISTS` | Mất data (đúng ý — bảng đã bị xoá khỏi schema) |
| Bảng chỉ có ở model mới | `CREATE TABLE` (rỗng) | Không có data cũ để mất |
| Bảng có ở cả 2, định nghĩa **giống hệt** (so sánh cấu trúc, bỏ qua `id`) | Không đụng vào | **Giữ nguyên 100%**, rủi ro = 0 |
| Bảng có ở cả 2, định nghĩa **khác** | **Rebuild**: tạo bảng tạm với định nghĩa mới → `INSERT INTO tmp (cột trùng tên) SELECT (cột trùng tên) FROM old` → drop bảng cũ → rename tmp → tên gốc → tạo lại index | Giữ data cho các cột trùng tên nếu kiểu/constraint tương thích; cột mới trống/lỗi nếu vi phạm NOT NULL |

**Fallback 2 lớp khi rebuild thất bại** (ví dụ: cột mới `NOT NULL` không có default, row cũ không có giá trị để điền → SQLite reject bước `INSERT...SELECT`):
1. Rollback savepoint, xoá bảng tạm, `DROP` bảng cũ, tạo lại bảng theo định nghĩa MỚI nhưng **rỗng** (action = `reset`, không ảnh hưởng bảng khác).
2. Nếu bước tạo-lại-rỗng CŨNG thất bại (trường hợp cực hiếm: định nghĩa bảng mới tự nó không hợp lệ, ví dụ trùng tên cột) — bắt lỗi lần 2, trả action `reset` kèm `reason` ghi rõ cả 2 lỗi, bảng kết thúc ở trạng thái **không tồn tại** thay vì làm crash toàn bộ request. Đã có unit test cho case này (`sandbox-sync.spec.ts`).

Không có transaction bao trọn toàn bộ quá trình sync nhiều bảng — mỗi bảng xử lý độc lập, nên 1 bảng lỗi không ảnh hưởng các bảng khác đã xử lý xong trong cùng lượt sync.

`syncReport: {table, action, reason?}[]` được trả về FE, hiển thị thành Log entry trong `SqlWorkbenchModal` (action `unchanged` không hiện log, tránh spam).

---

## 5. Lưu trữ & lifecycle

- **Nguồn sự thật lâu dài**: S3, `sandboxes/{schemaId}/sandbox.sqlite` (file nhị phân) + `sandboxes/{schemaId}/built-from-model.json` (snapshot model.json lúc build gần nhất, dùng để diff ở lần sync sau).
- **Cache trong process**: `Map<schemaId, {db, filePath, lastUsed}>` trong `SandboxService` — tránh download lại từ S3 mỗi query. Idle > 15 phút thì tự đóng handle (sweep mỗi 5 phút qua `setInterval`), KHÔNG xoá bản S3 — lần truy cập tiếp theo tự tải lại.
- **Flush lên S3**: sau mọi câu lệnh không phải SELECT (INSERT/UPDATE/DELETE) và sau mỗi lần sync do schema đổi. Câu SELECT thuần không trigger flush (không có gì thay đổi để lưu).
- Metadata (`SchemaSandboxEntity`, bảng `schema_sandboxes`) lưu Postgres, 1-1 với `schemaId` (unique constraint), cascade-delete khi schema bị xoá.
- **Không có cleanup định kỳ cho object S3** (chỉ cleanup handle trong RAM) — đây là nợ kỹ thuật đã biết, chấp nhận cho v1 vì dung lượng file sqlite nhỏ và không ảnh hưởng correctness.

---

## 6. API contract

```
POST /projects/:projectId/schemas/:schemaId/sandbox/execute
Body:     { query: string; resultLimit?: number }
Response: { success, rowCount, columns, rows, executionTimeMs, message?, syncReport? }
          — CÙNG SHAPE với QueryResultDto của live-DB execute (db-connections module),
            cộng thêm syncReport optional. FE dùng chung type QueryResultDto + extend.

POST /projects/:projectId/schemas/:schemaId/sandbox/reset
Body:     (không có)
Response: { success: boolean; syncReport: SyncReportEntry[] }
```

Cả 2 route yêu cầu `checkWritePermission` (Editor trở lên) — Run có thể chạy INSERT/UPDATE/DELETE (đặc biệt Seed Data), nên bar quyền là Write chứ không phải chỉ View.

---

## 7. Giới hạn / Edge cases

- **Batch INSERT/UPDATE/DELETE giờ atomic**: `SandboxService.executeSandboxQuery` bọc `db.exec(trimmed)` trong `db.transaction(() => db.exec(trimmed))()` (better-sqlite3 native transaction wrapper). Cả batch fail thì rollback sạch — không còn tình trạng statement trước đã commit rồi mới fail ở statement sau, tránh việc retry cùng 1 seed script để lại state lửng lơ khác nhau mỗi lần chạy lại. `db.transaction()` tự dùng SAVEPOINT thay vì BEGIN nếu handle đã đang ở trong 1 transaction, nên an toàn kể cả khi bị gọi lồng.
- **`rowCount` cho batch nhiều statement** (Seed Data sinh nhiều câu INSERT trong 1 lần Run): `better-sqlite3`'s `exec()` chạy tất cả nhưng `changes()` chỉ phản ánh statement CUỐI — best-effort, không phải tổng số row thực sự bị ảnh hưởng. Việc bọc transaction ở trên không đổi giới hạn này, chỉ đảm bảo atomicity chứ không đổi cách đếm `changes()`.
- **Không mô phỏng dialect-specific behavior**: hàm built-in, kiểu dữ liệu nâng cao (jsonb operators, arrays, enums thật) của Postgres/MySQL/SQL Server đều bị giản lược về TEXT/INTEGER/REAL — SQL sinh ra bởi AI dùng cú pháp riêng của DBMS đích (vd `JSONB_AGG` của Postgres) sẽ FAIL khi chạy trong sandbox dù đúng cú pháp thật.
- **Rebuild không transaction-safe xuyên bảng**: nếu quá trình sync bị crash đột ngột giữa chừng (server restart), một số bảng có thể đã migrate xong, số khác chưa — do không dùng 1 transaction lớn bọc toàn bộ sync (mỗi bảng dùng SAVEPOINT riêng trong `rebuildTable`, xem mục 4). Chấp nhận được vì sandbox chỉ phục vụ thử nghiệm, không phải nguồn dữ liệu quan trọng. Lưu ý: đây là giới hạn của bước SYNC (migrate schema), khác với batch atomicity của bước EXECUTE (chạy seed/query) đã fix ở trên.
- **So khớp cột theo tên khi rebuild** — nếu user vừa đổi tên cột VÀ đổi kiểu dữ liệu cùng lúc, cột cũ được coi là "cột khác", data không carry-over (đúng ý, vì tên đã đổi nghĩa là cột "mới" theo góc nhìn tên gọi).
- Xem thêm giới hạn chung của Query Executor/Seed Data ở `query-executor-implementation-rules.md` và `seed-data-generation-implementation-rules.md` (Safeguard Layer chưa implement, v.v.).
