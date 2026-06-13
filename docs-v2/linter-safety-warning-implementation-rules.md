# Linter & Safety Warning: Thuật toán kiểm tra schema

Tài liệu này mô tả implementation hiện tại của tính năng Linter & Safety Warning. Phần UI flow chỉ tóm tắt ngắn; trọng tâm là cách engine build model đầu vào, chạy rule theo từng schema level, tạo `LintIssue`, đếm severity và hiển thị/focus node trên canvas.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Engine rule linter cho cả 3 schema level | `src/components/EditProject/utils/schema-linter.ts` |
| Tính `lintResult` trong màn Edit Project | `src/components/EditProject/index.tsx` |
| Panel hiển thị issue, filter, group, focus node | `src/components/EditProject/components/LinterPanel/index.tsx` |
| Nút mở panel và badge số lượng issue | `src/components/EditProject/components/Header/index.tsx` |
| Build conceptual model từ nodes/edges | `src/components/EditProject/utils/conceptual-model.builder.ts` |
| Build logical model từ nodes/edges | `src/components/EditProject/utils/logical-model.builder.ts` |
| Build physical model từ nodes/edges | `src/components/EditProject/utils/physical-model.builder.ts` |

## 2. Flow runtime sơ lược

Trong `EditProject`, linter được tính bằng `useMemo`, chạy synchronous cùng render với `nodes/edges`.

Flow:

1. Xác định schema hiện tại: Conceptual, Logical hoặc Physical.
2. Rebuild fresh model từ canvas hiện tại:
   - Conceptual: `mapConceptualReactToStored` -> `mapConceptualReactEdgesToStored` -> `buildConceptualModel`.
   - Logical: `mapLogicalReactToStored` -> `mapLogicalReactEdgesToStored` -> `buildLogicalModel`.
   - Physical: `mapPhysicalReactToStored` -> `mapPhysicalReactEdgesToStored` -> `buildPhysicalModel`.
3. Nếu canvas chưa có stored nodes, fallback về model cache từ collaboration hook:
   - `_conceptualModelData`.
   - `_logicalModelData`.
   - `_physicalModelData`.
4. Gọi runner tương ứng:
   - `runConceptualLinter(model)`.
   - `runLogicalLinter(model)`.
   - `runPhysicalLinter(model)`.
5. Truyền `lintResult.counts` xuống Header để hiện badge.
6. Truyền `lintResult.issues` và `lintResult.counts` xuống `LinterPanel`.

Điểm quan trọng: linter không mutate model, không lưu database, không block thao tác edit. Nó chỉ tạo danh sách cảnh báo/lỗi để user review.

## 3. Data model của linter

### 3.1. LintSeverity

```ts
export type LintSeverity = "error" | "warning" | "info";
```

Ý nghĩa:

| Severity | Ý nghĩa |
|---|---|
| `error` | Lỗi cấu trúc hoặc integrity có khả năng làm model/DDL sai. |
| `warning` | Rủi ro thiết kế, best-practice deviation hoặc safety warning. |
| `info` | Gợi ý/hint, không nhất thiết sai. |

### 3.2. LintIssue

```ts
export type LintIssue = {
    ruleId: string;
    severity: LintSeverity;
    message: string;
    target?: string;
    targetId?: string;
};
```

Rule:

- `ruleId`: mã rule, ví dụ `C004`, `L006`, `P019`.
- `severity`: mức độ issue.
- `message`: nội dung hiển thị trong panel.
- `target`: label phụ, thường là tên entity/table/relationship.
- `targetId`: id node/model element dùng để focus canvas khi click issue.

### 3.3. LintResult

```ts
export type LintResult = {
    issues: LintIssue[];
    counts: { error: number; warning: number; info: number };
};
```

Ba public runner đều cùng pattern:

```ts
issues = lintX(payload)
counts = {
    error: issues.filter(severity === "error").length,
    warning: issues.filter(severity === "warning").length,
    info: issues.filter(severity === "info").length,
}
return { issues, counts }
```

## 4. Kiến trúc rule engine

`schema-linter.ts` là pure TypeScript, không phụ thuộc React.

Có 3 hàm private:

```ts
lintConceptual(payload): LintIssue[]
lintLogical(payload): LintIssue[]
lintPhysical(payload): LintIssue[]
```

Có 3 hàm public:

```ts
runConceptualLinter(payload): LintResult
runLogicalLinter(payload): LintResult
runPhysicalLinter(payload): LintResult
```

Pipeline mỗi linter:

```ts
function lintX(payload):
    issues = []
    normalize missing arrays to []

    if empty model:
        push info issue
        return issues

    build lookup maps / sets if needed

    for each rule:
        scan model
        if condition violated:
            issues.push({ ruleId, severity, message, target, targetId })

    return issues
```

Empty model rule là short-circuit ở cả 3 schema level:

- Conceptual `C001`: không có entity và relationship -> return ngay.
- Logical `L001`: không có table -> return ngay.
- Physical `P001`: không có table -> return ngay.

## 5. Thuật toán Conceptual Linter

Payload tối thiểu:

- `entities`.
- `relationships`.
- `generalizations`.

Conceptual linter kiểm tra semantic của ER/EER model: entity, key attribute, relationship ends, weak entity, generalization.

### 5.1. C001 - Empty diagram

Điều kiện:

- `entities.length === 0`.
- `relationships.length === 0`.

Kết quả:

- Severity: `info`.
- Push một issue rồi return ngay.

Mục đích: diagram trống không cần chạy các rule còn lại.

### 5.2. C002 - Entity with no attributes

Với mỗi entity:

- Nếu `entity.attributes` không có hoặc length `0`.
- Push `warning`.

Ý nghĩa: entity nên có ít nhất một attribute để mô tả dữ liệu.

### 5.3. C003 - Strong entity missing key attribute

Với mỗi entity:

- Chỉ xét `entity.kind === "strong"`.
- Nếu entity có attributes nhưng không có attribute nào `isKey`.
- Push `warning`.

Weak entity không bị rule này bắt vì weak entity có thể được định danh qua identifying relationship.

### 5.4. C004 - Duplicate entity names

Thuật toán:

1. Normalize tên entity bằng `trim().toLowerCase()`.
2. Dùng `Set` để detect duplicate.
3. Entity duplicate thứ 2 trở đi bị push `error`.

Rule này case-insensitive.

### 5.5. C005 - Relationship with fewer than 2 ends

Với mỗi relationship:

- Nếu `rel.ends` không có hoặc length `< 2`.
- Push `warning`.

Ý nghĩa: relationship hợp lệ thường phải nối ít nhất 2 entity.

### 5.6. C006 - Relationship references deleted entity

Thuật toán:

1. Build `entityIdSet` từ `entities`.
2. Duyệt mọi `rel.ends`.
3. Nếu `end.entityId` không nằm trong set.
4. Push `error`.

Đây là rule integrity cho stale reference trong model.

### 5.7. C007 - Duplicate relationship names

Giống duplicate entity:

- Normalize `rel.name.trim().toLowerCase()`.
- Duplicate relationship name bị push `warning`.

Không phải lỗi cứng vì có thể có nhiều relationship cùng tên, nhưng dễ gây mơ hồ.

### 5.8. C008 - Weak entity without identifying relationship

Với mỗi entity `kind === "weak"`:

- Tìm relationship có:
  - `r.type === "identifying"`.
  - Và một end có `entityId === weakEntity.id`.
- Nếu không có, push `warning`.

Ý nghĩa: weak entity cần identifying relationship tới owner entity.

### 5.9. C009 - Isolated entity

Với mỗi entity:

1. Check có relationship nào chứa entity id không.
2. Check entity có tham gia generalization không:
   - Là parent.
   - Hoặc nằm trong `childEntityIds`.
3. Nếu không connected và không trong generalization, push `info`.

Rule này là hint, không phải lỗi.

### 5.10. C010 - Missing cardinality on relationship end

Với mỗi relationship end:

- Nếu `end.cardinality` không có hoặc trim rỗng.
- Tìm entity name tương ứng để viết message.
- Push `info`.

### 5.11. C011 - Generalization with fewer than 2 subclasses

Với mỗi generalization:

- Nếu `childEntityIds.length < 2`.
- Push `info`.

Ý nghĩa: generalization thường mô tả parent có nhiều subtype; một subtype vẫn có thể hợp lệ nhưng đáng review.

## 6. Thuật toán Logical Linter

Payload tối thiểu:

- `tables`.
- Mỗi table có `columns`, optional `functionalDependencies`.

Logical linter kiểm tra relational structure nhưng chưa kiểm tra physical-only detail như data type, index, auto increment.

### 6.1. Lookup map

Sau empty check, code build:

```ts
tableIdToName = new Map(tables.map(t => [t.id, t.name]))
tableIdToColumns = new Map(tables.map(t => [t.id, t.columns]))
```

Hai map này dùng cho FK validation.

### 6.2. L001 - Empty schema

Nếu `tables.length === 0`:

- Push `info`.
- Return ngay.

### 6.3. L002 - Table with no columns

Với mỗi table:

- Nếu `table.columns` rỗng.
- Push `error`.

### 6.4. L003 - Table with no primary key

Với mỗi table:

- Nếu table có columns.
- Và không có column nào `roles.primaryKey`.
- Push `warning`.

### 6.5. L004 - Duplicate table names

Thuật toán:

- Normalize `table.name.trim().toLowerCase()`.
- Detect duplicate bằng `Set`.
- Duplicate bị push `error`.

### 6.6. L005 - Duplicate column names within a table

Với từng table:

- Normalize từng `col.name.trim().toLowerCase()`.
- Detect duplicate bằng `Set`.
- Duplicate bị push `error`.

### 6.7. L006 - FK references non-existent table

Với từng column có `roles.foreignKey`:

- Nếu `fk.refTableId` không tồn tại trong `tableIdToName`.
- Push `error`.

Nếu table không tồn tại, code không chạy check column cho FK đó nữa.

### 6.8. L007 - FK references non-existent column

Chỉ chạy khi target table tồn tại.

Rule:

- Lấy `refCols = tableIdToColumns.get(fk.refTableId)`.
- Nếu không có column nào `id === fk.refColumnId`.
- Push `error`.

### 6.9. L008 - FK references non-key column

Chỉ chạy khi target table tồn tại.

Rule:

- Tìm target column bằng `fk.refColumnId`.
- Nếu target column tồn tại nhưng:
  - Không `roles.primaryKey`.
  - Không `roles.candidateKey`.
- Push `warning`.

Lưu ý: logical level không xem `unique` là đủ cho FK target; rule chỉ chấp nhận PK hoặc candidate key.

### 6.10. L009 - Removed

Trong code hiện tại, `L009` đã bị bỏ:

```ts
// L009 — (Removed) Nullability is a physical-level concern, not checked at logical level.
```

Vì vậy logical linter không còn cảnh báo nullable primary key. Rule này chuyển về physical level `P007`.

### 6.11. L010 - Functional dependency references unknown column

Với mỗi table:

1. Build `colNames` bằng lowercase column names.
2. Với mỗi FD:
   - Gộp `fd.left` và `fd.right`.
   - Nếu ref column không nằm trong `colNames`.
   - Push `warning`.

So sánh theo name, không theo column id.

### 6.12. L011 - Wide composite primary key

Với mỗi table:

- Đếm PK columns.
- Nếu `pkCols.length > 4`.
- Push `info`.

Đây là performance/usability hint, không phải lỗi.

## 7. Thuật toán Physical Linter

Payload tối thiểu:

- `tables`.
- Mỗi table có `columns`, optional `indexes`, optional `functionalDependencies`.

Physical linter kiểm tra structural rule, physical data type, FK action, index, performance và security/safety warning.

### 7.1. Type sets

Physical linter có các set type dùng cho rule PK:

```ts
BLOB_TYPES = blob, mediumblob, longblob, tinyblob, bytea, image, varbinary, binary
TEXT_TYPES = text, tinytext, mediumtext, longtext, clob, ntext, nvarchar(max), varchar(max)
FLOAT_TYPES = float, real, double, double precision
```

So sánh bằng `col.dataType.trim().toLowerCase()`.

### 7.2. Lookup map

Sau empty check:

```ts
tableIdToName = new Map(tables.map(t => [t.id, t.name]))
tableIdToColumns = new Map(tables.map(t => [t.id, t.columns]))
```

Dùng cho FK validation.

### 7.3. P001 - Empty schema

Nếu `tables.length === 0`:

- Push `info`.
- Return ngay.

### 7.4. P002 - Table with no columns

Với mỗi table:

- Nếu không có columns hoặc columns rỗng.
- Push `error`.

### 7.5. P003 - Table with no primary key

Với mỗi table:

- Nếu có columns.
- Và không có column nào `roles.primaryKey`.
- Push `warning`.

### 7.6. P004 - Duplicate table names

Case-insensitive duplicate table name:

- Normalize `trim().toLowerCase()`.
- Duplicate bị push `error`.

### 7.7. P005 - Duplicate column names within a table

Case-insensitive duplicate column name trong từng table:

- Duplicate bị push `error`.

### 7.8. P006 - Column with no data type

Với mỗi column:

- Nếu `!col.dataType` hoặc `col.dataType.trim() === ""`.
- Push `error`.

Đây là lỗi có thể làm DDL generation fail.

### 7.9. P007 - Nullable primary key

Với mỗi column:

- Nếu `col.roles.primaryKey` và `col.nullable` là true.
- Push `error`.

### 7.10. P008 - TEXT/BLOB as primary key

Với mỗi PK column có data type:

- Lowercase data type.
- Nếu thuộc `BLOB_TYPES` hoặc `TEXT_TYPES`.
- Push `error`.

Ý nghĩa: TEXT/BLOB làm PK thường bị DBMS reject hoặc không phù hợp.

### 7.11. P009 - FLOAT/DOUBLE as primary key

Với mỗi PK column có data type:

- Nếu type thuộc `FLOAT_TYPES`.
- Push `warning`.

Lý do: floating point precision không ổn cho equality/key lookup.

### 7.12. P010 - AutoIncrement on non-integer column

Với mỗi column:

- Nếu `col.autoIncrement` true và có `col.dataType`.
- Lowercase data type.
- Chỉ chấp nhận:
  - `int`, `integer`, `bigint`, `smallint`, `mediumint`, `tinyint`, `serial`, `bigserial`, `smallserial`.
- Nếu type không thuộc danh sách trên, push `warning`.

### 7.13. P011 - FK missing ON DELETE / ON UPDATE action

Với mỗi FK:

- Nếu không có `fk.onDelete`, push một `info`.
- Nếu không có `fk.onUpdate`, push một `info`.

Lưu ý: cùng một FK có thể sinh 2 issue `P011`: một cho missing ON DELETE, một cho missing ON UPDATE.

### 7.14. P012 - FK references non-existent table

Với mỗi FK:

- Nếu `fk.refTableId` không tồn tại trong `tableIdToName`.
- Push `error`.

### 7.15. P013 - FK references non-existent column

Chỉ chạy khi target table tồn tại.

Rule:

- Lấy target columns.
- Nếu không có column nào `id === fk.refColumnId`.
- Push `error`.

### 7.16. P014 - FK references non-unique column

Chỉ chạy khi target table tồn tại và target column tìm được.

Target column hợp lệ nếu có ít nhất một trong:

- `roles.primaryKey`.
- `roles.candidateKey`.
- `unique === true`.

Nếu không, push `warning`.

Khác với logical `L008`, physical rule cho phép `unique` vì DBMS thường cho FK reference tới unique key.

### 7.17. P015 - Index references non-existent column

Với mỗi table:

1. Build set lowercase column names.
2. Duyệt `table.indexes`.
3. Duyệt `idx.columns`.
4. Nếu `idxCol.columnName` không nằm trong set.
5. Push `error`.

Index validation dùng column name, không dùng id.

### 7.18. P016 - Very large VARCHAR without index

Với mỗi column:

- Nếu `dataType` là `varchar`.
- Có `length`.
- `parseInt(length, 10) > 1000`.
- Và column không nằm trong bất kỳ index nào.
- Push `info`.

Lưu ý:

- `parseInt("1000,2")` vẫn parse được phần đầu nếu có, nhưng rule chỉ chạy với `varchar`.
- Check index bằng column name case-insensitive.

### 7.19. P017 - Wide composite primary key

Với mỗi table:

- Nếu số PK columns `> 4`.
- Push `info`.

### 7.20. P018 - Duplicate index names within a table

Với mỗi table:

- Normalize `idx.name.trim().toLowerCase()`.
- Duplicate index name trong cùng table bị push `error`.

### 7.21. P019 - Short password column

Với mỗi column:

1. Tên column lowercase phải đúng một trong:
   - `password`.
   - `passwd`.
   - `pwd`.
2. `dataType` lowercase phải là `varchar`.
3. Có `length`.
4. `parseInt(length, 10) < 60`.
5. Push `warning`.

Ý nghĩa safety: password hash như bcrypt cần khoảng 60 chars trở lên; column ngắn gợi ý rủi ro lưu plain text hoặc hash yếu.

### 7.22. P020 - Functional dependency references unknown column

Giống logical `L010`, nhưng chạy trên physical table:

- Build set lowercase column names.
- Với mỗi FD, check tất cả refs trong `left` và `right`.
- Ref không tồn tại thì push `warning`.

## 8. UI LinterPanel

Component: `src/components/EditProject/components/LinterPanel/index.tsx`.

### 8.1. Input props

```ts
type Props = {
    issues: LintIssue[];
    counts: { error: number; warning: number; info: number };
    isOpen: boolean;
    onClose: () => void;
    onIssueClick?: (nodeId: string) => void;
};
```

### 8.2. Panel state

Panel có state riêng:

- `filter`: `"all" | "error" | "warning" | "info"`.
- `expandedGroups`: mặc định mở `error`, `warning`, `info`.
- `isMinimized`: thu gọn panel.
- `position`: vị trí panel.
- `isDragging`, `dragOffset`: kéo thả panel.

Khi mở lần đầu, panel đặt ở góc phải dưới-ish:

```ts
x = window.innerWidth - 360 - 16
y = 80
```

Drag được clamp trong viewport:

- `x` từ `0` tới `window.innerWidth - 360`.
- `y` từ `0` tới `window.innerHeight - 50`.

### 8.3. Filtering và grouping

Filter:

```ts
filtered = filter === "all"
    ? issues
    : issues.filter(i => i.severity === filter)
```

Group hiển thị theo thứ tự cố định:

```ts
["error", "warning", "info"]
```

Mỗi group có thể expand/collapse.

### 8.4. Header badge

Trong Header, badge hiển thị tổng:

```ts
counts.error + counts.warning + counts.info
```

Màu badge:

- Có error -> đỏ.
- Không error nhưng có warning -> vàng.
- Chỉ info -> xanh.

Trong panel header cũng hiển thị total issue với logic màu tương tự.

### 8.5. Click issue để focus canvas node

Trong `EditProject`, `onIssueClick(nodeId)`:

1. Tìm node trong `nodes` bằng `node.id === nodeId`.
2. Set node đó selected, các node khác unselected.
3. Gọi `reactFlowInstance.fitView({ nodes: [{ id: nodeId }], duration: 500, padding: 0.5 })`.

Điều kiện: rule phải set `targetId`.

Hiện đa số rule set `targetId` là entity/table/relationship id. Nếu model id không khớp ReactFlow node id thì click có thể không focus được. Với các model builder hiện tại, table/entity id thường tương ứng node id.

## 9. Severity và safety policy hiện tại

Linter không block user action. Severity chỉ ảnh hưởng UI.

Pattern hiện tại:

- `error`: stale reference, duplicate name, missing required structure, invalid physical type.
- `warning`: design risk, missing PK, weak entity issue, FK target không phải key/unique, password length risk.
- `info`: empty model, isolated entity, missing cardinality, missing FK action, performance hint.

Safety warnings đáng chú ý:

- `P008`: TEXT/BLOB làm primary key.
- `P009`: FLOAT/DOUBLE làm primary key.
- `P010`: auto increment trên non-integer.
- `P011`: FK thiếu ON DELETE/ON UPDATE action.
- `P014`: FK trỏ cột không unique/key.
- `P016`: VARCHAR quá lớn không có index.
- `P019`: password column quá ngắn.

## 10. Bảng tóm tắt rule

### 10.1. Conceptual

| Rule | Severity | Điều kiện chính |
|---|---|---|
| C001 | info | Không có entity và relationship |
| C002 | warning | Entity không có attribute |
| C003 | warning | Strong entity có attribute nhưng không có key attribute |
| C004 | error | Duplicate entity name case-insensitive |
| C005 | warning | Relationship có ít hơn 2 ends |
| C006 | error | Relationship end trỏ entity id không tồn tại |
| C007 | warning | Duplicate relationship name case-insensitive |
| C008 | warning | Weak entity không tham gia identifying relationship |
| C009 | info | Entity không có relationship và không nằm trong generalization |
| C010 | info | Relationship end thiếu cardinality |
| C011 | info | Generalization có ít hơn 2 child entities |

### 10.2. Logical

| Rule | Severity | Điều kiện chính |
|---|---|---|
| L001 | info | Không có table |
| L002 | error | Table không có column |
| L003 | warning | Table có column nhưng không có PK |
| L004 | error | Duplicate table name case-insensitive |
| L005 | error | Duplicate column name trong table |
| L006 | error | FK trỏ table id không tồn tại |
| L007 | error | FK trỏ column id không tồn tại trong target table |
| L008 | warning | FK trỏ cột không phải PK/candidate key |
| L009 | removed | Không còn check ở logical level |
| L010 | warning | Functional dependency ref column name không tồn tại |
| L011 | info | Composite PK có hơn 4 columns |

### 10.3. Physical

| Rule | Severity | Điều kiện chính |
|---|---|---|
| P001 | info | Không có table |
| P002 | error | Table không có column |
| P003 | warning | Table có column nhưng không có PK |
| P004 | error | Duplicate table name case-insensitive |
| P005 | error | Duplicate column name trong table |
| P006 | error | Column thiếu data type |
| P007 | error | PK nullable |
| P008 | error | TEXT/BLOB type làm PK |
| P009 | warning | FLOAT/DOUBLE type làm PK |
| P010 | warning | Auto increment trên non-integer type |
| P011 | info | FK thiếu ON DELETE hoặc ON UPDATE |
| P012 | error | FK trỏ table id không tồn tại |
| P013 | error | FK trỏ column id không tồn tại |
| P014 | warning | FK target không phải PK/candidate key/unique |
| P015 | error | Index trỏ column name không tồn tại |
| P016 | info | VARCHAR length > 1000 và không có index |
| P017 | info | Composite PK có hơn 4 columns |
| P018 | error | Duplicate index name trong cùng table |
| P019 | warning | Column `password`/`passwd`/`pwd` là varchar length < 60 |
| P020 | warning | Functional dependency ref column name không tồn tại |

## 11. Cách thêm rule mới

1. Mở `src/components/EditProject/utils/schema-linter.ts`.
2. Chọn đúng hàm:
   - `lintConceptual`.
   - `lintLogical`.
   - `lintPhysical`.
3. Thêm block rule mới theo pattern:

```ts
// PXXX — Rule title
for (const table of tables) {
    if (/* condition */) {
        issues.push({
            ruleId: "PXXX",
            severity: "warning",
            message: `Message rõ ràng cho "${table.name}".`,
            target: table.name,
            targetId: table.id,
        });
    }
}
```

4. Nếu rule cần click-to-focus, set `targetId`.
5. Nếu rule cần lookup nhanh, build map/set trước khi loop.
6. Cập nhật tài liệu này trong bảng rule tương ứng.

## 12. Những điểm cần chú ý khi maintain

1. Linter chạy synchronous trong render path qua `useMemo`; rule mới nên nhẹ, tránh thuật toán quá nặng trên mỗi keystroke/drag.
2. Empty schema rule return sớm; rule khác sẽ không chạy trên model rỗng.
3. Logical `L009` đã removed; đừng document lại như rule active.
4. Logical `L008` chỉ chấp nhận PK/candidate key, không xét `unique`.
5. Physical `P014` chấp nhận PK/candidate key/unique.
6. FD rules `L010` và `P020` check theo column name, không theo id.
7. Index rule `P015` check theo column name, không theo id.
8. Click issue chỉ focus được nếu `targetId` khớp ReactFlow node id.
9. Multiple issues có thể cùng ruleId trên cùng element, ví dụ `P011` có thể sinh 2 issue cho cùng FK.
10. Linter không tự sửa model; mọi rule chỉ là cảnh báo/diagnostic.
