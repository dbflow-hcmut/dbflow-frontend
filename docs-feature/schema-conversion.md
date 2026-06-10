# Schema Conversion — Logical <-> Physical <-> Conceptual

## Tong quan

Tinh nang **Convert schema** cho phep nguoi dung chuyen doi qua lai giua cac muc do cua schema ma khong can AI. Hien tai ho tro **sau chieu** deu deterministic:

| Tu | Sang | Phuong phap |
|---|---|---|
| Logical | Physical | Deterministic (DBMS-aware type inference, auto-increment) |
| Physical | Logical | Deterministic (strip physical details, preserve comments) |
| Logical | Conceptual | Deterministic (detect ISA, junction table, multi-valued attr, weak entity) |
| Conceptual | Logical | Deterministic (map Entity -> Table, Rel/Gen -> FK, multi-valued -> table) |
| Physical | Conceptual | Deterministic (chain: Physical -> Logical -> Conceptual) |
| Conceptual | Physical | Deterministic (chain: Conceptual -> Logical -> Physical, with optional DBMS) |

**File implementation:** `src/components/EditProject/utils/schema-conversion.ts`
**Entry point:** `handleConvertSchema` trong `src/components/EditProject/index.tsx`

---

## Quy trinh thuc thi

```
User click "Convert schema" -> chon target type
    |
    v
handleConvertSchema(targetType)
    |  <- rebuild model tuoi tu nodes/edges hien tai truoc khi convert
    |
    +- isLogical && target = physical    --> convertLogicalToPhysical()
    +- isPhysical && target = logical    --> convertPhysicalToLogical()
    +- isLogical && target = conceptual  --> convertLogicalToConceptual()
    +- isConceptual && target = logical  --> convertConceptualToLogical()
    +- isPhysical && target = conceptual --> convertPhysicalToConceptual()  [chain P->L->C]
    +- isConceptual && target = physical --> convertConceptualToPhysical()  [chain C->L->P]
    |
    |  (sau khi convert)
    |  createSchema() -> saveSchemaModel() -> router.push(new schema)
    |
    +- else --> mo ChatBox + set convertTo param
```

> **Luu y quan trong:** Truoc khi convert, model duoc rebuild tu `nodes`/`edges` dang hien thi tren canvas (khong phai tu cache cua collaboration hook). Dieu nay dam bao moi thay doi truc tiep tren canvas (xoa node, doi ten...) deu duoc phan anh dung.

---

## 1. Logical -> Physical (`convertLogicalToPhysical`)

### Muc dich

Chuyen `LogicalModelPayload` thanh `PhysicalModelPayload`. Physical schema bo sung them thong tin implementation: data type cu the, index, constraint vat ly.

### Options

| Option | Mo ta |
|---|---|
| `newModelId` | Override model ID (mac dinh: tao moi `pid_*`) |
| `newModelName` | Override model name |
| `dbms` | Target DBMS (`mysql` / `postgresql` / `sqlserver`) -- bat type mapping theo DBMS |

### Quy tac chuyen doi -- Model level

| Truong | Hanh vi |
|---|---|
| `model.id` | Tao moi voi prefix `pid_` |
| `model.name` | Thay "logical"/"Logical" -> "Physical"; neu khong thay duoc thi them " (Physical)" |
| `model.version` | Reset ve `1` |
| `model.dbms` | Set theo `opts.dbms` (neu cung cap) |
| `model.notes` | Giu nguyen |

### Quy tac chuyen doi -- Column level

| Truong | Hanh vi |
|---|---|
| `col.id` | Remap prefix: `lid_` -> `pid_` |
| `col.name` | Giu nguyen |
| `col.nullable` | Giu nguyen; **ngoai le**: PK column -> `false` |
| `col.unique` | Giu nguyen |
| `col.autoIncrement` | `true` neu la single-column integer PK (khong phai FK); `false` con lai |
| `col.defaultValue` | Khong set (undefined) |
| `col.dataType` | **Suy ra** theo bang `inferPhysicalDataType` ben duoi |
| `col.length` | **Suy ra** tu heuristic (vd: varchar -> "255", decimal -> "10,2") |
| `col.roles` | Giu nguyen; FK refColumnId duoc remap `lid_` -> `pid_` |

### Bang suy ra `dataType` (inferPhysicalDataType)

Ap dung theo thu tu uu tien -- rule dau tien match se duoc dung:

| Uu tien | Dieu kien | Generic type | Default length |
|---|---|---|---|
| 1 | `roles.primaryKey` hoac `roles.foreignKey` | `int` | -- |
| 2 | Ten chua date/time patterns | `datetime` | -- |
| 3 | Ten chua monetary patterns (price, cost, amount...) | `decimal` | `"10,2"` |
| 4 | Ten chua numeric patterns (count, qty, age...) | `int` | -- |
| 5 | Ten chua boolean patterns (is_, has_, active...) | `boolean` | -- |
| 6 | Ten chua large-text patterns (description, content...) | `text` | -- |
| 7 | Ten chua email, address, url | `varchar` | `"255"` |
| 8 | Ten chua name, title, code, status... | `varchar` | `"100"` |
| 9 | Mac dinh | `varchar` | `"255"` |

### DBMS-specific type mapping

Khi `opts.dbms` duoc cung cap, generic types duoc map sang native types:

| Generic | MySQL | PostgreSQL | SQL Server |
|---|---|---|---|
| `int` | `int` | `integer` | `int` |
| `boolean` | `tinyint` | `boolean` | `bit` |
| `datetime` | `datetime` | `timestamp` | `datetime2` |
| `text` | `text` | `text` | `nvarchar` |
| `varchar` | `varchar` | `varchar` | `nvarchar` |
| `decimal` | `decimal` | `numeric` | `decimal` |

---

## 2. Physical -> Logical (`convertPhysicalToLogical`)

### Muc dich

Chuyen `PhysicalModelPayload` thanh `LogicalModelPayload`. Loai bo thong tin physical, giu lai cau truc quan he.

### Quy tac chuyen doi

| Truong | Hanh vi |
|---|---|
| `col.id` | Remap prefix: `pid_` -> `lid_` |
| `col.dataType`, `length`, `autoIncrement`, `defaultValue` | **Bo** |
| `table.indexes` | **Bo** |
| `table.comment` | Merge vao `table.notes` (comment uu tien hon notes) |
| `col.comment` | Merge vao `col.notes` (comment uu tien hon notes) |
| `model.dbms`, `model.description` | **Bo** (logical la DBMS-agnostic) |
| Con lai | Giu nguyen |

---

## 3. Logical -> Conceptual (`convertLogicalToConceptual`)

### Muc dich

Chuyen `LogicalModelPayload` thanh `ConceptualModelPayload`. Day la buoc **reverse engineering** chinh -- tu relational schema tai tao lai EER model.

### Table Classification (Reverse Engineering Heuristics)

Moi table duoc phan loai truoc khi chuyen doi. Thu tu uu tien:

| Classification | Dieu kien | Ket qua conceptual |
|---|---|---|
| **ISA_CHILD** | Single PK column la FK den table khac | Generalization (IS-A) |
| **JUNCTION** | >= 2 PK columns, **tat ca** deu la FK | N:M hoac N-ary Relationship |
| **MULTI_VALUED** | Dung 2 cols, ca hai PK, 1 FK, 0 non-PK | Multi-valued Attribute tren parent entity |
| **WEAK** | Composite PK, co it nhat 1 PK-FK + 1 PK non-FK, co non-PK cols | Weak Entity + Identifying Relationship |
| **REGULAR** | Tat ca truong hop con lai | Strong Entity |

### Chi tiet tung classification

#### ISA_CHILD (Class table inheritance)
```
employee (id PK+FK->person.id, salary)
person   (id PK, name, email)
```
- Employee IS-A Person
- Column `id` (PK+FK) khong tao attribute, khong tao relationship
- Tao Generalization: parent=person, children=[employee]
- Defaults: disjoint / partial

#### JUNCTION (N:M / N-ary relationship)
```
enrollment (student_id PK+FK->student.id, course_id PK+FK->course.id, grade)
```
- Khong tao entity cho "enrollment"
- Tao Relationship "enrollment" giua Student va Course
- Cardinality: N:N
- Non-PK column `grade` thanh relationship attribute

#### MULTI_VALUED (Multi-valued attribute)
```
employee_phones (employee_id PK+FK->employee.id, phone PK)
```
- Khong tao entity cho "employee_phones"
- Them attribute `phone` voi `kind: "multi_valued"` vao entity Employee

#### WEAK (Weak entity)
```
room (building_id PK+FK->building.id, room_number PK, capacity, type)
```
- Tao entity "room" voi `kind: "weak"`
- Attribute: room_number (isKey: true), capacity, type
- Building_id FK PK column khong tao attribute
- Tao Identifying Relationship: building (1) -- room (N), type="identifying"

#### REGULAR (Strong entity)
- Moi table -> 1 entity (kind: "strong")
- PK columns -> key attributes
- FK-only columns -> N:1 relationships (deduplicated theo entity pair)
- Candidate key columns -> key attributes

### Relationship deduplication

- Tat ca relationships duoc deduplicate theo entity pair (A, B)
- Junction table relationships duoc xu ly truoc
- Weak entity identifying relationships duoc xu ly thu hai
- Regular FK relationships duoc xu ly cuoi cung
- Neu pair da co relationship -> skip

### Nhung gi khong the tai tao

| Logical pattern | Ly do |
|---|---|
| Categories (union types) | Khong co representation trong relational schema |
| Disjointness/completeness metadata | Khong luu trong logical model (dung defaults) |
| Composite/complex attributes | Khong phan biet duoc tu flatten columns |
| Derived attributes | Khong phan biet duoc tu computed columns |

---

## 4. Conceptual -> Logical (`convertConceptualToLogical`)

### Muc dich

Chuyen `ConceptualModelPayload` thanh `LogicalModelPayload`. "Hien thuc hoa" tu conceptual xuong relational.

### Quy tac chuyen doi

**Step 1: Entity -> Table**
- Moi entity -> 1 table
- `isKey` attributes -> PK columns
- `composite` attributes -> flatten thanh leaf columns
- `multi_valued` attributes -> **skip** (xu ly o Step 4)
- `derived` attributes -> **skip**
- Entity khong co key -> auto-prepend `id` PK column

**Step 2: Generalization -> Class table inheritance**
- Child PK duoc them FK -> parent PK
- Neu child chua co PK -> prepend `{parentName}_id` PK+FK

**Step 3: Relationship -> FK / Junction table**
- 1:N/N:1 -> FK column tren phia N
- 1:1 -> FK column tren phia optional
- N:M -> junction table voi 2 PK+FK columns
- N-ary -> junction table voi N PK+FK columns
- Relationship attributes -> columns tren FK table hoac junction table
- Self-referential -> `parent_{tableName}_id`

**Step 4: Multi-valued attributes -> Separate tables** *(MỚI)*
- Moi `kind: "multi_valued"` attribute tao 1 table rieng
- Table co 2 columns: `{entity_name}_id` (PK+FK) + `{attr_name}` (PK)
- Table name: `{entity_name}_{attr_name}`

---

## 5. Physical -> Conceptual (`convertPhysicalToConceptual`)

Chain 2 buoc: Physical -> Logical -> Conceptual.
Ten model thay "Physical" -> "Conceptual" truc tiep.

---

## 6. Conceptual -> Physical (`convertConceptualToPhysical`)

Chain 2 buoc: Conceptual -> Logical -> Physical.

### Options bo sung

| Option | Mo ta |
|---|---|
| `dbms` | Truyen xuong `convertLogicalToPhysical` de dung DBMS-specific type mapping |

---

## Roundtrip correctness

Cac classification patterns duoc thiet ke de dam bao **roundtrip** (C -> L -> C hoac L -> C -> L) khong mat thong tin quan trong:

| Conceptual | Logical (C->L) | Conceptual (L->C) |
|---|---|---|
| N:M relationship | Junction table (all PK are FK) | JUNCTION -> N:M relationship |
| Multi-valued attr | 2-col table (PK+FK, PK) | MULTI_VALUED -> multi_valued attr |
| ISA generalization | Child PK is FK | ISA_CHILD -> generalization |
| Weak entity + identifying rel | Composite PK with partial FK | WEAK -> weak entity + identifying rel |

---

## Hanh vi cua nut Convert schema trong UI

- **Hien thi:** Nut chi xuat hien khi dang o mot schema co type xac dinh. Menu dropdown liet ke cac target type con lai.
- **Loading state:** Trong khi dang goi API, nut chuyen sang loading va bi disabled.
- **Khi thanh cong:** Navigate sang schema moi.
- **Khi loi:** Hien error notification.
- **Tat ca 6 chieu deu deterministic** -- khong con chieu nao can AI.
