# DDL Generator — Algorithm Documentation

## 1. Tổng quan

File: `src/components/EditProject/utils/ddl-generator.ts`

DDL Generator nhận đầu vào là **PhysicalModelPayload** (model JSON) và **DDLOptions** (DBMS target + tuỳ chọn), trả về **DDLResult** chứa SQL script hoàn chỉnh.

Toàn bộ quá trình chạy **frontend-only** (không gọi API), kết quả là deterministic (cùng input → cùng output).

---

## 2. Data Flow Pipeline

```
PhysicalModelPayload
        │
        ▼
┌──────────────────────┐
│  1. Normalize        │  ModelTable[] → TableInfo[]
│     (flatten roles)  │  Tách FK info ra khỏi column roles
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  2. Topological Sort │  Sắp xếp theo dependency graph
│     (DFS)            │  Tables không FK → trước
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  3. Collect FKs      │  Duyệt sorted tables, resolve
│     (resolve refs)   │  refTableId → tên bảng thật
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  4. Generate SQL     │  Theo thứ tự:
│     (per statement)  │  DROP → CREATE → FK → INDEX
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  5. Assemble Script  │  Header + sections → string
│     (join sections)  │
└──────────────────────┘
           │
           ▼
      DDLResult { sql, statements[], warnings[] }
```

---

## 3. Chi tiết từng bước

### 3.1 Normalize — Model → Internal Types

**Input**: `PhysicalModelPayload.tables[]`

**Output**: `TableInfo[]` — cấu trúc phẳng, dễ xử lý

```
ModelColumn {                      ColumnInfo {
  name, dataType, length,    →       name, dataType, length,
  nullable, unique,                  nullable, unique,
  autoIncrement, defaultValue,       autoIncrement, defaultValue,
  roles: {                           isPrimaryKey: boolean,
    primaryKey: true,                 foreignKey?: {
    foreignKey: {                       refTableId, refColumnId,
      refTableId, refColumnId,          onDelete, onUpdate
      onDelete, onUpdate             }
    }                              }
  }
}
```

Đồng thời build lookup map `tableIdToName: Map<tableId, tableName>` để resolve FK references ở bước sau.

**Tại sao normalize?**
- Model dùng `roles.primaryKey` / `roles.foreignKey` dạng nested → flatten thành `isPrimaryKey` boolean và `foreignKey?` optional object cho đơn giản
- Tách biệt concern: normalize 1 lần, dùng nhiều lần ở các bước sau

---

### 3.2 Topological Sort — Dependency-aware ordering

**Mục đích**: Đảm bảo `CREATE TABLE` của bảng cha xuất hiện **trước** bảng con (bảng có FK trỏ tới).

**Thuật toán**: DFS-based Topological Sort

```
Input:  tables[] + tableIdToName map
Output: sorted[] (tables theo thứ tự dependency)

1. Build dependency graph:
   deps: Map<tableName, Set<tableName>>

   Với mỗi table T, mỗi column C có FK:
     refName = tableIdToName[C.foreignKey.refTableId]
     Nếu refName tồn tại, thuộc nameSet, và != T.name:
       deps[T.name].add(refName)    // T phụ thuộc vào refName

2. DFS với cycle detection:
   visited:  Set  — đã xử lý xong
   visiting: Set  — đang trong call stack (dùng detect cycle)

   visit(name):
     if name ∈ visited → return
     if name ∈ visiting → CYCLE DETECTED → fallback
     visiting.add(name)
     for each dep ∈ deps[name]:
       visit(dep)
     visiting.remove(name)
     visited.add(name)
     sorted.push(table)     ← post-order = dependency trước

3. Gọi visit() cho mỗi table
```

**Ví dụ**:

```
Tables: student, course, enrollment, grade
FKs:
  enrollment.student_id → student
  enrollment.course_id  → course
  grade.enrollment_id   → enrollment

Dependency graph:
  student    → {}
  course     → {}
  enrollment → {student, course}
  grade      → {enrollment}

DFS order (post-order):
  visit(student)    → sorted: [student]
  visit(course)     → sorted: [student, course]
  visit(enrollment) → visit deps first → sorted: [student, course, enrollment]
  visit(grade)      → visit deps first → sorted: [student, course, enrollment, grade]
```

**Circular dependency handling**:
- Nếu detect cycle (node đang `visiting` được visit lại) → `hasCycle = true`
- Fallback: trả về original order (không sort)
- FK vẫn được tách thành `ALTER TABLE` riêng nên circular FK không gây lỗi SQL

---

### 3.3 Collect FKs — Resolve references

Duyệt qua sorted tables, cho mỗi column có `foreignKey`:

```
For each table in sorted:
  For each column with foreignKey:
    targetName = tableIdToName[foreignKey.refTableId]
    if targetName not found → push warning, skip

    targetTable = tables.find(t.id == refTableId)
    targetColumn = targetTable.columns.find(isPrimaryKey)
    targetColName = targetColumn?.name ?? "id"

    → FKInfo {
        constraintName: "fk_{tableName}_{columnName}"
        sourceTable, sourceColumn,
        targetTable: targetName,
        targetColumn: targetColName,
        onDelete, onUpdate
      }
```

**Constraint naming convention**: `fk_{source_table}_{source_column}` — deterministic, unique per FK.

---

### 3.4 Generate SQL — Statement builders

Statements được generate theo **thứ tự cố định**:

```
 ①  DROP TABLE IF EXISTS   (reverse topological order)
 ②  CREATE TABLE           (topological order)
 ③  ALTER TABLE ADD FK     (topological order)
 ④  CREATE INDEX           (topological order)
```

#### 3.4.1 DROP TABLE (reverse order)

```
Reversed = sorted.reverse()
For each table in reversed:
  "DROP TABLE IF EXISTS {quote(name)};"
```

**Tại sao reverse?** Bảng con (enrollment) phải drop trước bảng cha (student) vì FK constraint.

#### 3.4.2 CREATE TABLE

Cho mỗi table, generate block:

```sql
CREATE TABLE [IF NOT EXISTS] "tableName" (
    -- ① Column definitions
    "col1" TYPE [NOT NULL] [DEFAULT value],
    "col2" TYPE [NOT NULL] [DEFAULT value],
    -- ② PRIMARY KEY constraint
    CONSTRAINT "pk_tableName" PRIMARY KEY ("col1"),
    -- ③ UNIQUE constraints (non-PK only)
    CONSTRAINT "uq_tableName_col2" UNIQUE ("col2")
);
```

**Column DDL algorithm** (`buildColumnDDL`):

```
parts = [quote(name)]

if dataType ∈ config.serialTypes:
  parts.push(serialMapping)          # e.g. "SERIAL" or "INT AUTO_INCREMENT"
else:
  typeStr = dataType.toUpperCase()
  if length exists:
    typeStr += "({length})"          # e.g. "VARCHAR(255)" or "DECIMAL(5,2)"
  parts.push(typeStr)

if NOT nullable:
  parts.push("NOT NULL")

if defaultValue exists:
  parts.push("DEFAULT {defaultValue}")

return parts.join(" ")
```

**Serial type handling**: Các type `serial`, `bigserial`, `smallserial` được map sang DBMS-specific syntax thông qua `config.serialTypes`:

| Model dataType | PostgreSQL | MySQL | SQL Server | SQLite |
|---|---|---|---|---|
| `serial` | `SERIAL` | `INT AUTO_INCREMENT` | `INT IDENTITY(1,1)` | `INTEGER` |
| `bigserial` | `BIGSERIAL` | `BIGINT AUTO_INCREMENT` | `BIGINT IDENTITY(1,1)` | `INTEGER` |

#### 3.4.3 ALTER TABLE ADD FOREIGN KEY

```sql
ALTER TABLE "enrollment" ADD CONSTRAINT "fk_enrollment_student_id"
    FOREIGN KEY ("student_id") REFERENCES "student" ("id") ON DELETE CASCADE;
```

- `ON DELETE` / `ON UPDATE` chỉ emit khi **khác NO ACTION** (vì NO ACTION là default)

#### 3.4.4 CREATE INDEX

```sql
CREATE [UNIQUE] INDEX "idx_name" ON "table" [USING type] ("col1" ASC, "col2" DESC);
```

- `USING {type}` chỉ emit khi:
  - `config.supportsIndexUsing === true` (PostgreSQL, MySQL — yes; SQL Server, SQLite — no)
  - Và `type !== "BTREE"` (BTREE là default, không cần specify)

---

### 3.5 Assemble Script

```
Header:
  -- Generated by DBFlow
  -- DBMS: PostgreSQL
  -- Date: 2026-04-17

Sections (mỗi section cách nhau 1 dòng trống):
  -- Drop Tables        (nếu có)
  -- Tables             (CREATE TABLE, cách nhau 1 dòng trống)
  -- Foreign Keys       (ALTER TABLE, cách nhau 1 dòng trống)
  -- Indexes            (CREATE INDEX, liên tiếp)
```

---

## 4. DBMS-specific Syntax Handling

Mọi syntax khác biệt giữa DBMS được abstract qua `DBMSConfig`:

| Config field | MySQL | PostgreSQL | SQL Server | SQLite |
|---|---|---|---|---|
| `quoteChar` | `` ` ` `` | `" "` | `[ ]` | `" "` |
| `serialTypes.serial` | `INT AUTO_INCREMENT` | `SERIAL` | `INT IDENTITY(1,1)` | `INTEGER` |
| `nowFunction` | `NOW()` | `NOW()` | `GETDATE()` | `datetime('now')` |
| `supportsIfNotExists` | ✅ | ✅ | ❌ | ✅ |
| `supportsIndexUsing` | ✅ | ✅ | ❌ | ❌ |

**Quoting**: Tất cả identifier (table name, column name, constraint name, index name) đều được quote theo DBMS config.

---

## 5. Naming Conventions

| Object | Pattern | Ví dụ |
|---|---|---|
| Primary Key | `pk_{table}` | `pk_student` |
| Unique Constraint | `uq_{table}_{column}` | `uq_student_email` |
| Foreign Key | `fk_{table}_{column}` | `fk_enrollment_student_id` |
| Index | Giữ nguyên từ model | `idx_student_email` |

---

## 6. Warning System

Generator phát warning (không block) trong các trường hợp:

| Trường hợp | Warning message |
|---|---|
| FK target table không tồn tại | `FK on {table}.{col}: target table ID "{id}" not found, skipping.` |
| SQLite + SET DEFAULT FK action | `SQLite has limited support for SET DEFAULT...` |
| DBMS không hỗ trợ IF NOT EXISTS | `{DBMS} does not support IF NOT EXISTS...` |

---

## 7. Complexity Analysis

| Bước | Time Complexity | Ghi chú |
|---|---|---|
| Normalize | O(T × C) | T = tables, C = columns/table |
| Topological Sort | O(T + E) | E = FK edges |
| Collect FKs | O(T × C) | Duyệt columns tìm FK |
| Generate SQL | O(T × C + F + I) | F = FKs, I = indexes |
| **Tổng** | **O(T × C)** | Linear với size of schema |

Memory: O(T × C) — chủ yếu là TableInfo[] normalized copy.

---

## 8. Example: Full Pipeline Trace

**Input Model** (4 tables, 3 FKs, 4 indexes):

```
student(id PK, full_name, email UQ, created_at)
course(id PK, title, code UQ)
enrollment(id PK, student_id FK→student, course_id FK→course, enrolled_at)
grade(id PK, enrollment_id FK→enrollment, score)
```

**Step 1 — Normalize**: 4 TableInfo objects, FK info flattened

**Step 2 — Topological Sort**:
```
DFS: student(0 deps) → course(0 deps) → enrollment(2 deps: student,course) → grade(1 dep: enrollment)
Result: [student, course, enrollment, grade]
```

**Step 3 — Collect FKs**:
```
fk_enrollment_student_id: enrollment.student_id → student.id (CASCADE)
fk_enrollment_course_id:  enrollment.course_id  → course.id  (CASCADE)
fk_grade_enrollment_id:   grade.enrollment_id   → enrollment.id (CASCADE)
```

**Step 4 — Generate** (PostgreSQL):

```sql
-- Generated by DBFlow
-- DBMS: PostgreSQL
-- Date: 2026-04-17

-- Tables
CREATE TABLE "student" (
    "id" SERIAL NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "pk_student" PRIMARY KEY ("id"),
    CONSTRAINT "uq_student_email" UNIQUE ("email")
);

CREATE TABLE "course" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    CONSTRAINT "pk_course" PRIMARY KEY ("id"),
    CONSTRAINT "uq_course_code" UNIQUE ("code")
);

CREATE TABLE "enrollment" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "course_id" INTEGER NOT NULL,
    "enrolled_at" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "pk_enrollment" PRIMARY KEY ("id")
);

CREATE TABLE "grade" (
    "id" SERIAL NOT NULL,
    "enrollment_id" INTEGER NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    CONSTRAINT "pk_grade" PRIMARY KEY ("id")
);

-- Foreign Keys
ALTER TABLE "enrollment" ADD CONSTRAINT "fk_enrollment_student_id"
    FOREIGN KEY ("student_id") REFERENCES "student" ("id") ON DELETE CASCADE;

ALTER TABLE "enrollment" ADD CONSTRAINT "fk_enrollment_course_id"
    FOREIGN KEY ("course_id") REFERENCES "course" ("id") ON DELETE CASCADE;

ALTER TABLE "grade" ADD CONSTRAINT "fk_grade_enrollment_id"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollment" ("id") ON DELETE CASCADE;

-- Indexes
CREATE UNIQUE INDEX "idx_student_email" ON "student" ("email" ASC);
CREATE INDEX "idx_enrollment_student_id" ON "enrollment" ("student_id" ASC);
CREATE INDEX "idx_enrollment_course_id" ON "enrollment" ("course_id" ASC);
CREATE INDEX "idx_grade_enrollment_id" ON "grade" ("enrollment_id" ASC);
```

**Step 5 — Result**:
```
DDLResult {
  sql: "-- Generated by DBFlow\n...",
  statements: [4 CREATE_TABLE, 3 ALTER_TABLE_FK, 4 CREATE_INDEX],
  warnings: []
}
```
