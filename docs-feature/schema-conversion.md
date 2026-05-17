# Schema Conversion — Logical ↔ Physical ↔ Conceptual

## Tổng quan

Tính năng **Convert schema** cho phép người dùng chuyển đổi qua lại giữa các mức độ của schema mà không cần AI. Hiện tại hỗ trợ **sáu chiều** đều deterministic:

| Từ | Sang | Phương pháp |
|---|---|---|
| Logical | Physical | Deterministic (tự động suy ra data type) |
| Physical | Logical | Deterministic (strip physical details) |
| Logical | Conceptual | Deterministic (detect ISA, map FK → Relationship) |
| Conceptual | Logical | Deterministic (map Entity → Table, Relationship/Generalization → FK) |
| Physical | Conceptual | Deterministic (chain: Physical → Logical → Conceptual) |
| Conceptual | Physical | Deterministic (chain: Conceptual → Logical → Physical) |

**File implementation:** `src/components/EditProject/utils/schema-conversion.ts`  
**Entry point:** `handleConvertSchema` trong `src/components/EditProject/index.tsx`

---

## Quy trình thực thi

```
User click "Convert schema" → chọn target type
    │
    ▼
handleConvertSchema(targetType)
    │  ← rebuild model tươi từ nodes/edges hiện tại trước khi convert
    │
    ├─ isLogical && target = physical    ──► convertLogicalToPhysical()
    ├─ isPhysical && target = logical    ──► convertPhysicalToLogical()
    ├─ isLogical && target = conceptual  ──► convertLogicalToConceptual()
    ├─ isConceptual && target = logical  ──► convertConceptualToLogical()
    ├─ isPhysical && target = conceptual ──► convertPhysicalToConceptual()  [chain P→L→C]
    ├─ isConceptual && target = physical ──► convertConceptualToPhysical()  [chain C→L→P]
    │
    │  (sau khi convert)
    │  createSchema() → saveSchemaModel() → router.push(new schema)
    │
    └─ else ─────────────────────────────► mở ChatBox + set convertTo param
```

> **Lưu ý quan trọng:** Trước khi convert, model được rebuild từ `nodes`/`edges` đang hiển thị trên canvas (không phải từ cache của collaboration hook). Điều này đảm bảo mọi thay đổi trực tiếp trên canvas (xóa node, đổi tên...) đều được phản ánh đúng.

Trong khi đang convert, nút **Convert schema** ở Header sẽ hiển thị loading spinner và bị disabled — không cho bấm lại cho đến khi navigate xong hoặc có lỗi.

---

## 1. Logical → Physical (`convertLogicalToPhysical`)

### Mục đích

Chuyển `LogicalModelPayload` thành `PhysicalModelPayload`. Physical schema bổ sung thêm thông tin implementation: data type cụ thể, index, constraint vật lý. Bước chuyển này tự động suy ra data type từ role và tên column.

### Quy tắc chuyển đổi — Model level

| Trường | Hành vi |
|---|---|
| `model.id` | Tạo mới với prefix `pid_` |
| `model.name` | Thay "logical"/"Logical" → "Physical"; nếu không thay được thì thêm " (Physical)" |
| `model.version` | Reset về `1` |
| `model.notes` | Giữ nguyên |

### Quy tắc chuyển đổi — Table level

| Trường | Hành vi |
|---|---|
| `table.id` | **Giữ nguyên** (để FK references không bị đứt) |
| `table.name` | Giữ nguyên |
| `table.notes` | Giữ nguyên |
| `table.indexes` | Khởi tạo rỗng `[]` (logical không có indexes) |
| `table.functionalDependencies` | Giữ nguyên (carry over) |

### Quy tắc chuyển đổi — Column level

| Trường | Hành vi |
|---|---|
| `col.id` | Remap prefix: `lid_` → `pid_` |
| `col.name` | Giữ nguyên |
| `col.nullable` | Giữ nguyên; **ngoại lệ**: PK column → `false` |
| `col.unique` | Giữ nguyên |
| `col.autoIncrement` | Mặc định `false` (user có thể bật sau) |
| `col.defaultValue` | Không set (undefined) |
| `col.length` | Không set (undefined) |
| `col.roles.primaryKey` | Giữ nguyên |
| `col.roles.candidateKey` | Giữ nguyên |
| `col.roles.foreignKey.refTableId` | Giữ nguyên |
| `col.roles.foreignKey.refColumnId` | Remap prefix: `lid_` → `pid_` |
| `col.dataType` | **Suy ra** theo bảng `inferDataType` bên dưới |

### Bảng suy ra `dataType` (inferDataType)

Áp dụng theo thứ tự ưu tiên — rule đầu tiên match sẽ được dùng:

| Ưu tiên | Điều kiện | `dataType` |
|---|---|---|
| 1 | `roles.primaryKey === true` | `int` |
| 2 | `roles.foreignKey` có giá trị | `int` |
| 3 | Tên kết thúc bằng `_at`, `_date`, `_time` | `datetime` |
| 4 | Tên chứa `date`, `time`, `created`, `updated` | `datetime` |
| 5 | Tên chứa `count`, `_num`, `qty`, `quantity`, `amount`, `price`, `total`, `score`, `rank`, `age`, `year` | `int` |
| 6 | Tên bắt đầu bằng `is_`, `has_`, `can_` | `boolean` |
| 7 | Tên là `active`, `enabled`, `deleted`, `verified`, `published` | `boolean` |
| 8 | Tên chứa `description`, `content`, `body`, `notes`, `comment`, `bio`, `message` | `text` |
| 9 | Mặc định | `varchar` |

> **Lưu ý:** `dataType` chỉ là gợi ý khởi đầu. User có thể chỉnh sửa thủ công trong Properties Panel sau khi convert.

---

## 2. Physical → Logical (`convertPhysicalToLogical`)

### Mục đích

Chuyển `PhysicalModelPayload` thành `LogicalModelPayload`. Logical schema là lớp trừu tượng — không quan tâm đến implementation details như data type, index, auto-increment. Bước chuyển này loại bỏ các thông tin physical và giữ lại cấu trúc quan hệ.

### Quy tắc chuyển đổi — Model level

| Trường | Hành vi |
|---|---|
| `model.id` | Tạo mới với prefix `lid_` |
| `model.name` | Thay "physical"/"Physical" → "Logical"; nếu không thay được thì thêm " (Logical)" |
| `model.version` | Reset về `1` |
| `model.notes` | Giữ nguyên |

### Quy tắc chuyển đổi — Table level

| Trường | Hành vi |
|---|---|
| `table.id` | **Giữ nguyên** |
| `table.name` | Giữ nguyên |
| `table.notes` | Giữ nguyên |
| `table.indexes` | **Bỏ** (logical không có khái niệm index) |
| `table.functionalDependencies` | Giữ nguyên |

### Quy tắc chuyển đổi — Column level

| Trường | Hành vi |
|---|---|
| `col.id` | Remap prefix: `pid_` → `lid_` |
| `col.name` | Giữ nguyên |
| `col.nullable` | Giữ nguyên |
| `col.unique` | Giữ nguyên |
| `col.dataType` | **Bỏ** (không có trong logical model) |
| `col.length` | **Bỏ** |
| `col.autoIncrement` | **Bỏ** |
| `col.defaultValue` | **Bỏ** |
| `col.roles.primaryKey` | Giữ nguyên |
| `col.roles.candidateKey` | Giữ nguyên |
| `col.roles.foreignKey.refTableId` | Giữ nguyên |
| `col.roles.foreignKey.refColumnId` | Remap prefix: `pid_` → `lid_` |

---

## 3. Logical → Conceptual (`convertLogicalToConceptual`)

### Mục đích

Chuyển `LogicalModelPayload` thành `ConceptualModelPayload`. Conceptual schema là lớp trừu tượng cao nhất — thể hiện entity, relationship, và generalization, không có thông tin implementation.

### Tại sao `generalizations`, `categories`, `constraints` đôi khi rỗng?

| Trường | Có thể tái tạo? | Lý do |
|---|---|---|
| `generalizations` | **Một phần** — dùng heuristic | Detect pattern ISA (xem bên dưới) |
| `categories` | **Không** | Union type không có dạng chuẩn trong relational schema |
| `constraints[top-level]` | **Không** | Metadata disjointness/completeness không lưu trong logical |

### ISA detection — Class table inheritance heuristic

Nếu một table có column **vừa là PK vừa là FK** đến table khác → đó là *class table inheritance*, tức là pattern ISA trong conceptual ER:

```
-- Logical: employee.id là PK và FK → person.id
-- Conceptual: Employee IS-A Person (Generalization)

employee (id PK+FK→person.id, salary)
person   (id PK, name, email)
```

Với mỗi nhóm (parent → [children]) phát hiện được, tạo một `Generalization`:
- `disjointness`: `"disjoint"` (mặc định bảo thủ)
- `completeness`: `"partial"` (mặc định bảo thủ)
- User có thể chỉnh sau khi convert

Nếu một table có nhiều PK+FK (ít gặp), chỉ lấy **FK đầu tiên** làm parent.

### Quy tắc chuyển đổi — Model level

| Trường | Hành vi |
|---|---|
| `model.id` | Tạo mới với prefix `cid_` |
| `model.name` | Thay "logical"/"Logical" → "Conceptual"; nếu không thay được thì thêm " (Conceptual)" |
| `model.version` | Reset về `1` |
| `model.notes` | Giữ nguyên |

### Quy tắc chuyển đổi — Table → Entity

| Logical | Conceptual |
|---|---|
| Table | Entity (`kind: "strong"`) |
| `table.id` | **Giữ nguyên** làm `entity.id` |
| `table.name` | Giữ nguyên |
| `table.notes` | Giữ nguyên |
| `table.functionalDependencies` | **Bỏ** |

### Quy tắc chuyển đổi — Column → Attribute / Relationship / Generalization

| Loại column | Kết quả |
|---|---|
| PK column (không phải FK) | Attribute `isKey: true`, kind `"simple"` |
| Candidate key column | Attribute `isKey: true`, kind `"simple"` |
| Column thường (không FK) | Attribute `isKey: false`, kind `"simple"` |
| FK-only column (không phải PK) | **Bỏ** khỏi attributes → tạo **Relationship** N:1 |
| PK + FK column (ISA pattern) | **Bỏ** khỏi attributes → tạo **Generalization** |

### Quy tắc tạo Relationship từ FK

- Tên: `<sourceTable>_<refTable>`
- Cardinality: `N` phía source, `1` phía target
- Nếu cùng một cặp (source, target) xuất hiện nhiều lần → chỉ tạo **1** relationship (deduplicate)
- ISA FK (PK+FK) **không** tạo relationship, chỉ tạo generalization

---

## 4. Conceptual → Logical (`convertConceptualToLogical`)

### Mục đích

Chuyển `ConceptualModelPayload` thành `LogicalModelPayload`. Bước này "hiện thực hóa" schema từ mức thiết kế khái niệm xuống relational schema — ánh xạ entity sang table, attribute sang column, relationship sang FK hoặc junction table, generalization sang class table inheritance.

### Quy tắc chuyển đổi — Model level

| Trường | Hành vi |
|---|---|
| `model.id` | Tạo mới với prefix `lid_` |
| `model.name` | Thay "conceptual"/"Conceptual" → "Logical"; nếu không thay được thì thêm " (Logical)" |
| `model.version` | Reset về `1` |
| `model.notes` | Giữ nguyên |

### Quy tắc chuyển đổi — Entity → Table

| Trường | Hành vi |
|---|---|
| `entity.id` | **Giữ nguyên** làm `table.id` (FK references vẫn resolve đúng) |
| `entity.name` | Giữ nguyên |
| `entity.notes` | Giữ nguyên |

### Quy tắc chuyển đổi — Attribute → Column

| Loại attribute | Kết quả |
|---|---|
| `isKey: true` | Column PK (`nullable: false`, `unique: true`, `roles.primaryKey: true`) |
| `kind: "derived"` | **Bỏ** (giá trị tính toán, không lưu trong relational) |
| `kind: "composite"` có components | **Flatten** — mỗi leaf component thành 1 column riêng |
| Còn lại | Column thường (`nullable: true`, `unique: false`) |

> **Entity không có key attribute** → tự động thêm cột `id` PK ở đầu.

### Quy tắc chuyển đổi — Generalization → Class table inheritance

Mỗi Generalization tạo ra quan hệ ISA (class table inheritance) giữa parent và các child:

| Trường hợp | Hành vi |
|---|---|
| Child đã có PK column | PK column đó thêm FK → parent's PK; tên column được align với tên PK của parent |
| Child chưa có PK | Prepend cột `<parentName>_id` với `primaryKey: true` + `foreignKey → parent PK` |

### Quy tắc chuyển đổi — Relationship → FK / Junction table

Phân theo cardinality của hai đầu:

| Loại quan hệ | Chiến lược |
|---|---|
| **1:N hoặc N:1** | FK column (`<refTableName>_id`) trên phía N |
| **1:1** | FK column trên phía có `optional: true`; nếu cả hai optional thì chọn endA |
| **N:M** | Junction table mới với hai cột PK+FK (một cho mỗi bên) |
| **N-ary (3+ ends)** | Junction table mới với một cột PK+FK cho mỗi participant |
| **Self-referential** | FK column được đặt tên `parent_<tableName>_id` để tránh trùng |

**Relationship attributes** được thêm vào bảng nhận FK (1:N, 1:1) hoặc junction table (N:M, N-ary).

**Junction table:**
- `id` = `tbl_<relationship.id>`
- `name` = `relationship.name` hoặc `<tableA>_<tableB>` nếu không có tên

**FK column:**
- `nullable` = giá trị `optional` của end tương ứng (mặc định `true` nếu không xác định)
- `unique: true` cho 1:1
- `roles.foreignKey.refTableId` = entity id phía được tham chiếu
- `roles.foreignKey.refColumnId` = PK column id của bảng tham chiếu

### Những gì không thể convert

| Conceptual | Logical |
|---|---|
| `categories` (union/category types) | Tạo table bình thường **không có FK** — user tự thêm liên kết |
| `kind: "weak"` entity | Tạo table bình thường (weak entity phụ thuộc vào identifying relationship cần map thủ công) |
| Composite attribute (nested > 2 cấp) | Chỉ flatten 1 cấp components; nested sâu hơn cần chỉnh tay |

---

## 5. Physical → Conceptual (`convertPhysicalToConceptual`)

### Mục đích

Chuyển `PhysicalModelPayload` thành `ConceptualModelPayload`. Thực hiện qua chuỗi hai bước:

```
Physical → Logical  (xem Section 2)
    └── Logical → Conceptual  (xem Section 3)
```

Không có quy tắc bổ sung — toàn bộ logic nằm trong hai hàm trung gian. Tên model được thay "Physical" → "Conceptual" trực tiếp (không qua tên "Logical" trung gian).

---

## 6. Conceptual → Physical (`convertConceptualToPhysical`)

### Mục đích

Chuyển `ConceptualModelPayload` thành `PhysicalModelPayload`. Thực hiện qua chuỗi hai bước:

```
Conceptual → Logical  (xem Section 4)
    └── Logical → Physical  (xem Section 1 — infer data types, add indexes)
```

Không có quy tắc bổ sung — toàn bộ logic nằm trong hai hàm trung gian. Tên model được thay "Conceptual" → "Physical" trực tiếp.

---

## Ví dụ

### Logical → Physical

```json
// Input: LogicalModelPayload
{
  "tables": [{
    "id": "tbl-1", "name": "users",
    "columns": [
      { "id": "lid_1", "name": "id",         "nullable": false, "unique": true,  "roles": { "primaryKey": true } },
      { "id": "lid_2", "name": "email",      "nullable": false, "unique": true,  "roles": {} },
      { "id": "lid_3", "name": "created_at", "nullable": true,  "unique": false, "roles": {} },
      { "id": "lid_4", "name": "is_active",  "nullable": false, "unique": false, "roles": {} }
    ]
  }]
}

// Output: PhysicalModelPayload
{
  "tables": [{
    "id": "tbl-1", "name": "users",
    "columns": [
      { "id": "pid_1", "name": "id",         "dataType": "int",      "nullable": false },
      { "id": "pid_2", "name": "email",      "dataType": "varchar",  "nullable": false },
      { "id": "pid_3", "name": "created_at", "dataType": "datetime", "nullable": true  },
      { "id": "pid_4", "name": "is_active",  "dataType": "boolean",  "nullable": false }
    ],
    "indexes": []
  }]
}
```

### Logical → Conceptual (thường)

```json
// Input: orders (id PK, user_id FK→users.id, total)  |  users (id PK, email)
// Output:
{
  "entities": [
    { "id": "tbl-orders", "name": "orders", "kind": "strong",
      "attributes": [{ "name": "id", "isKey": true }, { "name": "total", "isKey": false }] },
    { "id": "tbl-users",  "name": "users",  "kind": "strong",
      "attributes": [{ "name": "id", "isKey": true }, { "name": "email", "isKey": false }] }
  ],
  "relationships": [
    { "name": "orders_users", "type": "association",
      "ends": [
        { "entityId": "tbl-orders", "cardinality": "N" },
        { "entityId": "tbl-users",  "cardinality": "1" }
      ]
    }
  ],
  "generalizations": []
}
```

### Logical → Conceptual (có ISA)

```json
// Input: employee.id là PK + FK → person.id
// Output:
{
  "entities": [
    { "id": "person",   "name": "person",   "attributes": [{ "name": "id", "isKey": true }, { "name": "name" }] },
    { "id": "employee", "name": "employee", "attributes": [{ "name": "salary" }] }
  ],
  "relationships": [],
  "generalizations": [
    {
      "parentEntityId": "person",
      "childEntityIds": ["employee"],
      "constraints": { "disjointness": "disjoint", "completeness": "partial" }
    }
  ]
}
```

### Conceptual → Logical (N:M relationship)

```json
// Input: ConceptualModelPayload
{
  "entities": [
    { "id": "e-student", "name": "student",
      "attributes": [{ "id": "a-1", "name": "id", "isKey": true, "kind": "simple" },
                     { "id": "a-2", "name": "name", "isKey": false, "kind": "simple" }] },
    { "id": "e-course",  "name": "course",
      "attributes": [{ "id": "a-3", "name": "id", "isKey": true, "kind": "simple" },
                     { "id": "a-4", "name": "title", "isKey": false, "kind": "simple" }] }
  ],
  "relationships": [
    { "id": "r-1", "name": "enrollment", "type": "association",
      "ends": [
        { "entityId": "e-student", "cardinality": "N" },
        { "entityId": "e-course",  "cardinality": "N" }
      ],
      "attributes": [{ "name": "enrolled_at", "isKey": false, "kind": "simple" }]
    }
  ],
  "generalizations": []
}

// Output: LogicalModelPayload
{
  "tables": [
    { "id": "e-student", "name": "student",
      "columns": [
        { "name": "id",   "nullable": false, "unique": true,  "roles": { "primaryKey": true } },
        { "name": "name", "nullable": true,  "unique": false, "roles": {} }
      ]
    },
    { "id": "e-course", "name": "course",
      "columns": [
        { "name": "id",    "nullable": false, "unique": true,  "roles": { "primaryKey": true } },
        { "name": "title", "nullable": true,  "unique": false, "roles": {} }
      ]
    },
    { "id": "tbl_r-1", "name": "enrollment",
      "columns": [
        { "name": "student_id",   "nullable": false, "unique": false,
          "roles": { "primaryKey": true, "foreignKey": { "refTableId": "e-student", "refColumnId": "<student.id col id>" } } },
        { "name": "course_id",    "nullable": false, "unique": false,
          "roles": { "primaryKey": true, "foreignKey": { "refTableId": "e-course",  "refColumnId": "<course.id col id>"  } } },
        { "name": "enrolled_at",  "nullable": true,  "unique": false }
      ]
    }
  ]
}
```

### Conceptual → Logical (Generalization / ISA)

```json
// Input: Person IS-A [ Employee, Customer ]
{
  "entities": [
    { "id": "e-person",   "name": "person",
      "attributes": [{ "name": "id", "isKey": true, "kind": "simple" }, { "name": "name", "isKey": false, "kind": "simple" }] },
    { "id": "e-employee", "name": "employee",
      "attributes": [{ "name": "salary", "isKey": false, "kind": "simple" }] },
    { "id": "e-customer", "name": "customer",
      "attributes": [{ "name": "tier", "isKey": false, "kind": "simple" }] }
  ],
  "relationships": [],
  "generalizations": [
    { "id": "g-1", "parentEntityId": "e-person",
      "childEntityIds": ["e-employee", "e-customer"],
      "constraints": { "disjointness": "disjoint", "completeness": "total" } }
  ]
}

// Output: LogicalModelPayload
{
  "tables": [
    { "id": "e-person",   "name": "person",
      "columns": [
        { "name": "id",   "nullable": false, "unique": true,  "roles": { "primaryKey": true } },
        { "name": "name", "nullable": true,  "unique": false }
      ]
    },
    { "id": "e-employee", "name": "employee",
      "columns": [
        { "name": "id",     "nullable": false, "unique": true,
          "roles": { "primaryKey": true, "foreignKey": { "refTableId": "e-person", "refColumnId": "<person.id col id>" } } },
        { "name": "salary", "nullable": true,  "unique": false }
      ]
    },
    { "id": "e-customer", "name": "customer",
      "columns": [
        { "name": "id",   "nullable": false, "unique": true,
          "roles": { "primaryKey": true, "foreignKey": { "refTableId": "e-person", "refColumnId": "<person.id col id>" } } },
        { "name": "tier", "nullable": true,  "unique": false }
      ]
    }
  ]
}
```

---

## Hành vi của nút Convert schema trong UI

- **Hiển thị:** Nút chỉ xuất hiện khi đang ở một schema có type xác định (conceptual / logical / physical). Menu dropdown liệt kê các target type còn lại.
- **Loading state:** Trong khi đang gọi API (createSchema + saveSchemaModel), nút chuyển sang trạng thái loading với text "Converting…" và bị disabled hoàn toàn — kể cả dropdown menu không mở được.
- **Khi thành công:** `setIsConverting(false)` được gọi trước `router.push()` để tắt loading, sau đó navigate sang schema mới.
- **Khi lỗi:** Loading tắt, nút trở lại bình thường, hiện error notification.
- **Tất cả 6 chiều đều deterministic** — không còn chiều nào cần AI.
