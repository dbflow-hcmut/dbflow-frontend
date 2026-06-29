# DBMS Shared Infrastructure & Schema Export: Kết nối, Phân quyền, Export History và Xuất Schema

Tài liệu này mô tả hai phần:
1. **DBMS Shared Infrastructure** — tập hợp các cơ chế dùng chung cho mọi tính năng liên quan đến DBMS (Query Executor, Schema Export, Migration Apply...): connection management, permission detection, export history & rollback.
2. **Schema Export** — xuất physical schema thiết kế trong dbflow trực tiếp vào một DBMS đang kết nối.

Tính năng **chỉ khả dụng ở Physical level**.

---

## Phần 1 — DBMS Shared Infrastructure

Các module này được tái sử dụng bởi Query Executor, Schema Export và bất kỳ tính năng DBMS nào thêm sau. Không duplicate logic giữa các tính năng.

---

### 1.1. Connection Manager (shared với Query Executor)

Xem `query-executor-implementation-rules.md` §3 cho toàn bộ spec Connection Manager.

**Điểm bổ sung cho Schema Export:**
- Mỗi connection có thêm field `default_schema` (ví dụ: `public` với PostgreSQL, tên database với MySQL) — dùng làm target schema khi export nếu user không chọn override.
- Connection được resolve tại runtime; FE không cache credential — mỗi lần gọi BE đều dùng `connection_id` để lookup credential từ vault.

---

### 1.2. Permission Detector

#### Mục đích

Trước khi thực hiện bất kỳ thao tác nào ảnh hưởng đến DB (export schema, apply migration...), hệ thống phải biết user DBMS đang kết nối có đủ quyền không.

#### Cách hoạt động

BE chạy một loạt query kiểm tra quyền, tổng hợp thành `PermissionMatrix` và trả về FE. FE hiển thị ma trận này trong panel trước khi cho phép thực hiện thao tác.

```ts
interface PermissionMatrix {
  can_create_table: boolean;
  can_drop_table: boolean;
  can_alter_table: boolean;
  can_create_index: boolean;
  can_drop_index: boolean;
  can_insert: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_create_schema: boolean;   // chỉ relevant nếu target schema chưa tồn tại
  is_superuser: boolean;
  missing_permissions: string[]; // danh sách quyền thiếu so với thao tác đang thực hiện
}
```

#### Query kiểm tra theo DBMS

| DBMS | Cách detect |
|---|---|
| PostgreSQL | `SELECT has_schema_privilege`, `has_table_privilege`, `pg_roles.rolsuper` |
| MySQL | `SHOW GRANTS FOR CURRENT_USER()` rồi parse |
| MSSQL | `fn_my_permissions`, `IS_SRVROLEMEMBER` |

#### UX

- Hiển thị `PermissionMatrix` dưới dạng checklist trước khi export.
- Item màu đỏ = thiếu quyền cần cho thao tác đang chọn.
- User vẫn có thể tiếp tục nếu muốn (không chặn cứng), nhưng FE hiển thị warning rõ.
- Kết quả được cache **per connection per session** (không gọi lại mỗi lần click).

---

### 1.3. Export History & Rollback

#### Triết lý thiết kế

Thay vì dump data (chậm, không scalable, vẫn mất data ghi sau backup), hệ thống tái dụng logic migration hiện có (`migration-generator.ts`, `schema-diff.ts`) để sinh tự động **UP + DOWN migration** tại mỗi lần export. Rollback = chạy DOWN migration — nhanh, gọn, không cần lưu file dump.

> **Giới hạn cần nói rõ với user:** DOWN migration chỉ rollback được **cấu trúc** (schema). Data đã ghi vào column/table bị DROP sau thời điểm export là irrecoverable nếu không có backup infra riêng (PITR, cloud snapshot). Dbflow không xử lý data backup — đây là trách nhiệm của user/infra team. Tool này phù hợp nhất cho dev/staging.

#### Mỗi lần export tạo một `ExportRecord`

```ts
interface ExportRecord {
  id: string;                     // uuid
  connection_id: string;
  project_id: string;
  created_at: string;
  triggered_by: string;           // user id
  trigger: 'manual' | 'auto';
  status: 'success' | 'partial' | 'failed';

  // Schema state trước khi export — lấy từ introspection đã chạy ở bước Schema Diff
  // Không cần gọi DB thêm lần nào; tái dùng DBIntrospectionResult đã có.
  ddl_snapshot_before: string;    // DDL text của DB state trước export (for reference/audit)

  // Migration pair — sinh từ migration-generator.ts, tái dùng logic hiện có
  up_migration: string;           // SQL đã apply lên DB
  down_migration: string;         // SQL reverse — dùng để rollback

  // Liên kết về phía dbflow version history
  schema_version_ref?: string;    // version id trong dbflow tại thời điểm export

  notes?: string;
}
```

#### Sinh DOWN migration — tái dụng code hiện có

Schema Diff (§2.3) đã produce `SchemaDiff` từ `diffSchemas(introspectedModel, designedModel)`. DOWN migration chính là `generateMigration(diff.reverse())` — đảo chiều diff rồi chạy lại `migration-generator.ts`.

Không cần viết thêm logic mới, chỉ cần:
1. Gọi `diffSchemas(introspectedModel, designedModel)` → `upDiff`
2. Gọi `diffSchemas(designedModel, introspectedModel)` → `downDiff` (đảo chiều)
3. Gọi `generateMigration(upDiff, options)` → `up_migration`
4. Gọi `generateMigration(downDiff, options)` → `down_migration`

#### Export History Panel

Panel nằm trong drawer hoặc dedicated tab của project. Hiển thị toàn bộ `ExportRecord` của project.

**Chức năng:**

| Hành động | Mô tả |
|---|---|
| Xem danh sách | Sort theo `created_at` desc, hiển thị status, triggered_by, connection name |
| Xem UP migration | Mở Monaco read-only, hiển thị `up_migration` |
| Xem DOWN migration | Mở Monaco read-only, hiển thị `down_migration` |
| Xem DDL snapshot | Mở Monaco read-only, hiển thị `ddl_snapshot_before` (DB state lúc trước) |
| **Rollback** | Apply `down_migration` lên DB — chạy qua cùng Execution Flow như §2.5 nhưng input là `down_migration` text thay vì generated DDL mới. Cần confirmation + Permission check. |
| Xoá record | Xóa record. Cần confirmation. |

**Giới hạn lưu trữ:** Giữ tối đa **50 record** gần nhất per project (auto-purge cũ nhất khi vượt).

---

## Phần 2 — Schema Export

### 2.1. Tổng quan

Schema Export đọc `schema_model` (physical `model.json`) hiện tại, diff với DB đang kết nối, sinh UP + DOWN migration (tái dùng `migration-generator.ts`), sau đó apply UP lên DB. Không yêu cầu user copy DDL ra ngoài và chạy tay.

---

### 2.2. Entry point

Nút **"Apply to Database"** trong màn Physical diagram, chỉ active khi:
1. Schema type = Physical.
2. Có ít nhất một DB connection trong project.

---

### 2.3. Schema Diff — so sánh trước khi export

Trước khi apply, hệ thống **luôn** lấy trạng thái hiện tại của DB và so sánh với schema đang thiết kế. Mục tiêu: cho user thấy chính xác cái gì sẽ thay đổi, và là input để sinh UP/DOWN migration.

#### Cách lấy trạng thái DB hiện tại

BE introspect DB thông qua các bảng hệ thống:

| DBMS | Nguồn |
|---|---|
| PostgreSQL | `information_schema.tables`, `information_schema.columns`, `pg_indexes`, `pg_constraint` |
| MySQL | `information_schema.TABLES`, `information_schema.COLUMNS`, `SHOW INDEX`, `SHOW CREATE TABLE` |
| MSSQL | `sys.tables`, `sys.columns`, `sys.indexes`, `sys.foreign_keys` |

Kết quả được normalize thành `DBIntrospectionResult` (cùng shape với `PhysicalModelPayload`) để diff trực tiếp với schema từ dbflow bằng `schema-diff.ts` hiện có.

#### Phân loại thay đổi

```ts
type ChangeType =
  | 'table_added'
  | 'table_dropped'
  | 'column_added'
  | 'column_dropped'
  | 'column_type_changed'
  | 'column_constraint_changed'
  | 'index_added'
  | 'index_dropped'
  | 'fk_added'
  | 'fk_dropped'
  | 'no_change';
```

#### Schema Diff Panel

Hiển thị trước khi user xác nhận export:

```
┌─ Schema Diff ─────────────────────────────────────────────────┐
│  [+] users         — table mới                                │
│  [~] orders        — 2 columns thay đổi                      │
│      [+] discount  — column mới (DECIMAL 10,2 NOT NULL)       │
│      [~] status    — type: VARCHAR(20) → VARCHAR(50)          │
│  [-] legacy_logs   — table sẽ bị DROP ⚠                      │
│                                                               │
│  [x] Bỏ chọn table không muốn apply (selective export)       │
└───────────────────────────────────────────────────────────────┘
```

- Change màu xanh lá = thêm mới (safe).
- Change màu vàng = thay đổi (cần review).
- Change màu đỏ = DROP (nguy hiểm, unchecked mặc định).

---

### 2.4. Conflict Strategy

User chọn cách xử lý khi table/column đã tồn tại trong DB:

| Strategy | Mô tả | Khi nào dùng |
|---|---|---|
| `add_only` | Chỉ thêm mới (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS). Không đụng đến thứ đã có. | **Mặc định** — an toàn nhất |
| `alter_existing` | Dùng `ALTER TABLE` để sync column/index thay đổi. Không DROP bất kỳ thứ gì. | Khi muốn update schema mà giữ data |
| `drop_and_recreate` | DROP TABLE rồi CREATE lại. **Mất toàn bộ data trong table đó.** | Chỉ dùng cho dev/test DB, cần xác nhận đặc biệt |

`drop_and_recreate` được disable mặc định; user phải toggle "Allow destructive operations" trước khi strategy này hiện ra.

---

### 2.5. Export Execution Flow

```
User bấm "Apply to Database"
  → Permission Detector check (§1.2)
  → BE introspect DB hiện tại → DBIntrospectionResult
  → diffSchemas(introspected, designed) → SchemaDiff
  → Schema Diff Panel hiển thị
  → User chọn Conflict Strategy, tick/bỏ tick tables
  → BE sinh UP migration  : generateMigration(upDiff, options)   [tái dùng migration-generator.ts]
  → BE sinh DOWN migration: generateMigration(downDiff, options) [tái dùng migration-generator.ts]
  → Lưu ExportRecord { ddl_snapshot_before, up_migration, down_migration } trước khi execute
  → BE execute UP migration lên DB theo transaction (nếu DBMS hỗ trợ)
  → Với mỗi statement: emit progress event về FE
  → Kết thúc: cập nhật ExportRecord.status → trả ExportResult
  → FE hiển thị Export Log + link đến ExportRecord trong Export History
```

#### Transaction behavior

| DBMS | DDL transaction |
|---|---|
| PostgreSQL | Hỗ trợ — toàn bộ export chạy trong 1 transaction, rollback tự động nếu lỗi |
| MySQL | Không hỗ trợ DDL transaction — export là best-effort, lỗi giữa chừng cần rollback thủ công bằng DOWN migration |
| MSSQL | Hỗ trợ — tương tự PostgreSQL |

FE hiển thị cảnh báo rõ cho MySQL về giới hạn này.

---

### 2.6. Export Log

```ts
interface ExportResult {
  status: 'success' | 'partial' | 'failed';
  statements_total: number;
  statements_succeeded: number;
  statements_failed: number;
  execution_time_ms: number;
  export_record_id: string;     // link đến ExportRecord trong Export History
  log: ExportLogEntry[];
}

interface ExportLogEntry {
  statement: string;
  status: 'ok' | 'error' | 'skipped';
  error_message?: string;
  execution_time_ms: number;
}
```

Log hiển thị dạng expandable list. Có nút **Copy Full Log**. Khi export thất bại một phần (MySQL), FE hiển thị thêm nút **"Rollback với DOWN migration"** trỏ thẳng đến ExportRecord.

---

### 2.7. Selective Export

Từ Schema Diff Panel, user có thể bỏ tick các table không muốn apply. FE chỉ gửi lên BE danh sách `table_ids` được chọn. BE sinh UP/DOWN migration chỉ cho tập con đó, vẫn đảm bảo thứ tự FK dependency trong tập con.

---

### 2.8. Ý tưởng bổ sung hợp lý cho sau v1

| Ý tưởng | Lý do |
|---|---|
| **Dry Run mode** | Chạy UP migration trong transaction rồi ROLLBACK ngay — user thấy trước log mà không thay đổi DB thật. PostgreSQL/MSSQL hỗ trợ, MySQL không. |
| **Scheduled export** | Tự động sync schema vào DB dev/staging mỗi khi diagram được save. |
| **Compare vs multiple connections** | Diff schema thiết kế với nhiều DB cùng lúc (dev, staging, prod) — hiển thị trạng thái sync của từng môi trường. |
| **Export audit log per user** | Lưu lịch sử ai export khi nào. Hữu ích cho team nhiều người. |
| **Auto-detect schema drift** | Định kỳ introspect DB và cảnh báo nếu DB bị thay đổi ngoài dbflow. |
| **RBAC trong dbflow** | Chỉ role `owner` / `admin` mới được Export to DBMS; `editor` chỉ được design. |

---

## Phần 3 — Quan hệ giữa các tính năng DBMS

```
DBConnection (shared)
├── Permission Detector (shared)
│   ├── Query Executor         — check trước khi execute WARN/DANGER query
│   └── Schema Export          — check trước khi apply schema
├── Export History & Rollback (shared)
│   ├── Schema Export          — tạo ExportRecord (UP+DOWN migration) trước mỗi lần apply
│   └── Apply Migration        — có thể tái dụng cùng pattern
└── DBMS Config (dbms-config.ts, đã có)
    ├── Query Executor         — syntax hint trong editor
    ├── Schema Export          — DDL generation per DBMS
    └── Export DDL (hiện có)   — đã dùng

Code tái dụng từ tính năng Migration SQL hiện có:
├── schema-diff.ts             — diffSchemas() → SchemaDiff
└── migration-generator.ts     — generateMigration() → UP/DOWN SQL text
```

---

## Phần 4 — Scope giới hạn v1

| Tính năng | v1 | Ghi chú |
|---|---|---|
| Dry Run | **Không có** | PostgreSQL/MSSQL hỗ trợ sau |
| Data backup / dump | **Không có** | Ngoài scope — user tự lo với PITR hoặc cloud snapshot |
| Scheduled / auto export | **Không có** | |
| Schema drift detection | **Không có** | |
| RBAC trong dbflow | **Không có** | |
| SSH tunnel | **Không có** | |
| Export sang nhiều connections cùng lúc | **Không có** | |
| Rollback từ Export History | **Có** — apply `down_migration` từ `ExportRecord` | Tái dụng Execution Flow §2.5 |
