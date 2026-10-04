# Schema Conversion: Thuật toán convert giữa Conceptual, Logical, Physical

Tài liệu này mô tả implementation hiện tại của tính năng convert schema. Phần UI flow chỉ tóm tắt ngắn; trọng tâm là thuật toán trong `schema-conversion.ts`: rule mapping, heuristic suy luận, cách xử lý ID/FK/PK, DBMS, và các giới hạn khi maintain.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| UI gọi convert, tạo schema mới, lưu model, điều hướng | `src/components/EditProject/index.tsx` |
| Thuật toán convert chính | `src/components/EditProject/utils/schema-conversion.ts` |
| Build conceptual model từ canvas | `src/components/EditProject/utils/conceptual-model.builder.ts` |
| Build logical model từ canvas | `src/components/EditProject/utils/logical-model.builder.ts` |
| Build physical model từ canvas | `src/components/EditProject/utils/physical-model.builder.ts` |
| DBMS type/config | `src/components/EditProject/utils/dbms-config.ts` |
| Modal chọn DBMS khi convert sang Physical | `src/components/EditProject/components/ConvertToPhysicalModal/index.tsx` |

## 2. Flow runtime sơ lược

Entry point UI là `handleConvertSchema` trong `src/components/EditProject/index.tsx`.

Flow chung:

1. Rebuild model mới nhất từ canvas:
   - Conceptual: map React nodes/edges sang stored diagram rồi `buildConceptualModel`.
   - Logical: map React nodes/edges sang stored diagram rồi `buildLogicalModel`.
   - Physical: map React nodes/edges sang stored diagram rồi `buildPhysicalModel`.
   - Nếu canvas không có stored nodes, fallback về model cache từ collaboration hook.
2. Chọn hàm convert theo source type và target type.
3. Nếu target là Physical, UI mở `ConvertToPhysicalModal` để chọn DBMS trước.
4. Sau khi có converted model:
   - `createSchema(projectId, { name, type })`.
   - `saveSchemaModel(projectId, newSchema.id, convertedModel)`.
   - `router.push(/projects/:projectId?schemaId=:newSchemaId)`.

Sync schema khác convert schema:

- Convert: tạo schema mới.
- Sync: ghi đè model đã convert vào schema target có sẵn bằng `saveSchemaModel`.
- Sync sang Physical hiện không mở DBMS picker, nên gọi `convertLogicalToPhysical(fresh)` hoặc `convertConceptualToPhysical(fresh)` không truyền `dbms`.

## 3. Pipeline thuật toán tổng quát

Các hướng convert đang có:

```text
Logical    -> Physical     convertLogicalToPhysical
Physical   -> Logical      convertPhysicalToLogical
Logical    -> Conceptual   convertLogicalToConceptual
Conceptual -> Logical      convertConceptualToLogical
Physical   -> Conceptual   Physical -> Logical -> Conceptual
Conceptual -> Physical     Conceptual -> Logical -> Physical
```

Hai chiều chain không có thuật toán riêng:

```ts
convertPhysicalToConceptual(p):
    l = convertPhysicalToLogical(p)
    return convertLogicalToConceptual(l)

convertConceptualToPhysical(c, dbms):
    l = convertConceptualToLogical(c)
    return convertLogicalToPhysical(l, { dbms })
```

## 4. Quy tắc ID và prefix

File `schema-conversion.ts` có 3 nhóm id generator:

- `generatePid()` -> `pid_<uuid>`.
- `generateLid()` -> `lid_<uuid>`.
- `generateCid()` -> `cid_<uuid>`.

Column ID được remap theo prefix khi đi giữa Logical và Physical:

```ts
lid_... -> pid_...
pid_... -> lid_...
```

Helper:

- `remapColId(id)` đổi `lid_` sang `pid_`.
- `remapColIdToLogical(id)` đổi `pid_` sang `lid_`.

Lưu ý quan trọng:

- Table id thường được giữ nguyên khi Logical <-> Physical để FK `refTableId` không bị gãy.
- Column id được đổi prefix, nên mọi `foreignKey.refColumnId` cũng phải đổi prefix tương ứng.
- Conceptual entity id thường giữ theo table id khi reverse Logical -> Conceptual.
- Khi Conceptual -> Logical, table id của entity giữ nguyên `entity.id`, còn các column mới sinh bằng `generateLid()`.

## 5. DBMS trong convert sang Physical

DBMS chỉ ảnh hưởng khi target là Physical.

Mapping generic type sang DBMS-native nằm trong `DBMS_TYPE_MAP`:

| Generic | MySQL | PostgreSQL | SQL Server |
|---|---|---|---|
| `int` | `int` | `integer` | `int` |
| `boolean` | `tinyint` | `boolean` | `bit` |
| `datetime` | `datetime` | `timestamp` | `datetime2` |
| `text` | `text` | `text` | `nvarchar` |
| `varchar` | `varchar` | `varchar` | `nvarchar` |
| `decimal` | `decimal` | `numeric` | `decimal` |

Nếu không truyền `dbms`:

- `inferPhysicalDataType` trả generic type.
- Physical model không có `model.dbms`.
- Đây là case xảy ra khi sync sang Physical.

Nếu có `dbms`:

- Type được map sang native type.
- `model.dbms` được set trong physical model.

## 6. Logical -> Physical

Hàm: `convertLogicalToPhysical(logicalModel, opts)`.

Mục tiêu:

- Giữ cấu trúc relational.
- Thêm physical-only fields: `dataType`, `length`, `autoIncrement`, `indexes`.
- Map type theo DBMS nếu có.

### 6.1. Pseudo-code

```ts
convertLogicalToPhysical(logicalModel, opts):
    modelName = opts.newModelName ?? deriveName(logical -> Physical)
    dbms = opts.dbms

    for each table:
        pkCols = columns where roles.primaryKey
        singleNonFKPK = pkCols.length == 1 && !pkCols[0].roles.foreignKey

        for each column:
            inferred = inferPhysicalDataType(column, dbms)
            isPK = !!column.roles.primaryKey
            isAutoIncrement =
                singleNonFKPK &&
                isPK &&
                inferred.dataType in ["int", "integer", "bigint", "smallint"]

            physicalColumn = {
                id: remapColId(column.id),
                name,
                dataType: inferred.dataType,
                length: inferred.length,
                nullable: isPK ? false : column.nullable ?? true,
                unique: column.unique ?? false,
                autoIncrement: isAutoIncrement,
                roles: keep PK/candidateKey/FK but remap FK.refColumnId,
                       FK adds onDelete: "NO ACTION", onUpdate: "NO ACTION",
                notes: column.notes
            }

        physicalTable = {
            id: table.id,
            name: table.name,
            notes: table.notes,
            columns,
            indexes: [],
            showFunctionalDependencies: table.showFunctionalDependencies,
            functionalDependencies: table.functionalDependencies
        }
```

### 6.2. Rule infer data type

Hàm: `inferPhysicalDataType(col, dbms)`.

Rule chạy theo thứ tự ưu tiên, first match wins:

1. PK hoặc FK -> generic `int`.
2. Tên date/time:
   - `_at`, `_date`, `_time`.
   - chứa `date`, chứa `time`.
   - bằng `created`, `updated`, `born`, `dob`, `birthday`.
   - -> generic `datetime`.
3. Tên tiền tệ/decimal:
   - chứa `price`, `cost`, `amount`, `salary`, `total`, `balance`, `fee`, `tax`, `rate`, `discount`, `revenue`, `budget`.
   - -> generic `decimal`, length `10,2`.
4. Tên numeric:
   - chứa `count`, `_num`, bắt đầu `num_`, chứa `qty`, `quantity`, `score`, `rank`, `age`, `year`, `level`, `priority`, `weight`, `height`, `width`, `duration`, `attempts`, `limit`.
   - -> generic `int`.
5. Tên boolean:
   - bắt đầu `is_`, `has_`, `can_`, `should_`, `allow_`.
   - hoặc bằng `active`, `enabled`, `deleted`, `verified`, `published`, `visible`, `approved`, `locked`, `archived`, `confirmed`, `featured`.
   - -> generic `boolean`.
6. Tên long text:
   - chứa `description`, `content`, `body`, `notes`, `comment`, `bio`, `message`, `summary`, `text`, `html`, `markdown`, `metadata`, `payload`.
   - -> generic `text`.
7. Email/address/url:
   - chứa `email`, `address`, `street`, `url`, `path`.
   - -> generic `varchar`, length `255`.
8. Short string:
   - chứa `name`, `label`, `code`, `slug`, `sku`, `status`, `type`, `category`, `role`, `gender`, `country`, `city`, `state`, `zip`, `phone`, `fax`, `color`, `currency`, `locale`, `language`, `timezone`, `extension`.
   - hoặc bằng `title`.
   - -> generic `varchar`, length `100`.
9. Fallback -> generic `varchar`, length `255`.

Sau khi có generic type, nếu `dbms` tồn tại thì map qua `DBMS_TYPE_MAP`.

### 6.3. Rule autoIncrement

`autoIncrement: true` chỉ khi đồng thời:

- Table có đúng 1 PK.
- PK đó không đồng thời là FK.
- Column hiện tại là PK đó.
- Data type sau infer thuộc `int`, `integer`, `bigint`, `smallint`.

Vì type PostgreSQL cho key là `integer`, MySQL/SQL Server là `int`, rule này hoạt động với DBMS đã chọn hoặc generic.

### 6.4. Rule FK onDelete / onUpdate

Logical FK không có `onDelete`/`onUpdate`, nên khi convert sang Physical sẽ set default theo SQL standard:

- `onDelete: "NO ACTION"`.
- `onUpdate: "NO ACTION"`.

Giá trị này cho phép user chỉnh sửa sau trong physical editor. Các giá trị hợp lệ: `NO ACTION`, `CASCADE`, `SET NULL`, `SET DEFAULT`, `RESTRICT`.

### 6.5. Field được giữ/bỏ

Giữ:

- Table `id`, `name`, `notes`.
- Column `name`, `nullable`, `unique`, `notes`.
- `roles.primaryKey`, `roles.candidateKey`, `roles.foreignKey` (có thêm `onDelete`/`onUpdate` default).
- `functionalDependencies`.
- `showFunctionalDependencies`.

Thêm:

- `dataType`, `length`.
- `autoIncrement`.
- `indexes: []`.
- `model.dbms` nếu truyền `dbms`.

Không sinh:

- Index từ logical, vì logical model hiện không có index.
- Default value, vì logical không có dữ liệu này.

## 7. Physical -> Logical

Hàm: `convertPhysicalToLogical(physicalModel, opts)`.

Mục tiêu:

- Bỏ chi tiết implementation-specific.
- Trả về relational schema DBMS-agnostic.

### 7.1. Pseudo-code

```ts
convertPhysicalToLogical(physicalModel, opts):
    modelName = opts.newModelName ?? deriveName(physical -> Logical)

    for each physical table:
        logicalTable = {
            id: table.id,
            name: table.name,
            notes: table.comment || table.notes,
            columns: table.columns.map(col => ({
                id: remapColIdToLogical(col.id),
                name: col.name,
                nullable: col.nullable ?? true,
                unique: col.unique ?? false,
                roles: keep PK/candidateKey/FK but remap FK.refColumnId,
                       FK drops onDelete/onUpdate (logical is action-agnostic),
                notes: col.comment || col.notes
            })),
            showFunctionalDependencies: table.showFunctionalDependencies,
            functionalDependencies: table.functionalDependencies
        }
```

### 7.2. Field bị bỏ

Các physical-only field không đưa sang logical:

- `dataType`.
- `length`.
- `autoIncrement`.
- `defaultValue`.
- `indexes`.
- `model.dbms`.
- `model.description`.
- FK `onDelete`, `onUpdate` (logical layer là implementation-agnostic).

Field được giữ:

- Table `id`, `name`.
- Column `name`, `nullable`, `unique`.
- `roles.primaryKey`, `roles.candidateKey`, `roles.foreignKey` (chỉ `refTableId`, `refColumnId`).
- `notes` (ưu tiên `comment`, fallback `notes`).
- `functionalDependencies`.
- `showFunctionalDependencies`.

### 7.3. Rule notes/comment

Nếu table/column có cả `comment` và `notes`:

- `comment` được ưu tiên.
- Nếu không có `comment`, dùng `notes`.

## 8. Logical -> Conceptual

Hàm: `convertLogicalToConceptual(logicalModel, opts)`.

Đây là chiều reverse-engineering phức tạp nhất. Code dùng heuristic PK/FK để suy ra entity, relationship, ISA, weak entity và multi-valued attribute.

### 8.1. Step 0: classify logical tables

Hàm nội bộ: `classifyTables(tables)`.

Với mỗi logical table, code tính:

- `pkCols`: columns có `roles.primaryKey`.
- `pkFkCols`: PK columns đồng thời có `roles.foreignKey`.
- `pkNonFkCols`: PK columns không có FK.
- `nonPkCols`: columns không phải PK.

Classification chạy theo thứ tự ưu tiên, first match wins:

### 8.1.1. ISA_CHILD

Điều kiện:

- Có đúng 1 PK.
- PK đó cũng là FK.
- FK trỏ đến table tồn tại.

Ý nghĩa:

```text
child.id PK + FK -> parent.id
=> child IS-A parent
```

Output classification:

- `kind: "ISA_CHILD"`.
- `isaParentId = FK.refTableId`.

### 8.1.2. JUNCTION

Điều kiện:

- Có ít nhất 2 PK.
- Tất cả PK đều là FK.
- Có ít nhất 2 referenced table hợp lệ.

Ý nghĩa:

```text
student_course(student_id PK/FK, course_id PK/FK)
=> relationship N:M hoặc N-ary
```

Output:

- `kind: "JUNCTION"`.
- `junctionRefTableIds = danh sách refTableId`.

### 8.1.3. MULTI_VALUED

Điều kiện:

- Table có đúng 2 columns.
- Cả 2 đều là PK.
- Đúng 1 PK là FK.
- Đúng 1 PK không phải FK.
- Không có non-PK column.
- FK trỏ đến table tồn tại.

Ý nghĩa:

```text
student_phone(student_id PK/FK, phone PK)
=> phone là multi-valued attribute của student
```

Output:

- `kind: "MULTI_VALUED"`.
- `mvParentId = FK.refTableId`.
- `mvValueCol = PK non-FK`.

### 8.1.4. WEAK

Điều kiện:

- Có composite PK, tức `pkCols.length >= 2`.
- Có ít nhất 1 PK là FK.
- Không phải tất cả PK đều là FK.
- Có ít nhất 1 non-PK column.
- FK owner trỏ đến table tồn tại.

Ý nghĩa:

```text
order_item(order_id PK/FK, item_no PK, name)
=> order_item là weak entity của order
```

Output:

- `kind: "WEAK"`.
- `weakOwnerId = refTableId của PK/FK đầu tiên`.

### 8.1.5. REGULAR

Mọi table còn lại:

- `kind: "REGULAR"`.
- Sẽ thành strong entity.

### 8.2. Step 1: ISA generalizations

Code gom các `ISA_CHILD` theo `isaParentId`.

Mỗi parent tạo một generalization:

```ts
{
    id: generateCid(),
    parentEntityId,
    childEntityIds,
    constraints: {
        disjointness: "disjoint",
        completeness: "partial",
    },
}
```

Lưu ý:

- `disjoint/partial` là default conservative.
- Logical schema không chứa đủ thông tin để biết chính xác disjoint/overlap hoặc total/partial.

### 8.3. Step 2: tables -> entities

Table trở thành entity nếu classification là:

- `REGULAR`.
- `ISA_CHILD`.
- `WEAK`.

Table không trở thành entity nếu là:

- `JUNCTION`.
- `MULTI_VALUED`.

Rule entity:

- `entity.id = table.id`.
- `entity.name = table.name`.
- `entity.kind = "weak"` nếu `WEAK`, ngược lại `"strong"`.
- `entity.notes = table.notes`.

### 8.3.1. Rule column -> conceptual attribute

Với từng column trong entity table:

Skip column nếu:

- FK-only: có FK nhưng không phải PK và không phải candidate key.
- ISA PK+FK: PK đồng thời là FK trỏ parent của ISA child.
- Weak owner PK+FK: PK/FK trỏ owner của weak entity.

Các column còn lại thành simple attribute:

```ts
{
    id: generateCid(),
    name: col.name,
    kind: "simple",
    isKey: !!(col.roles.primaryKey || col.roles.candidateKey),
}
```

Hệ quả:

- FK-only không thành attribute vì sẽ thành relationship.
- Candidate key FK vẫn có thể thành attribute vì không bị xem là FK-only.
- PK của weak entity phần owner bị bỏ khỏi attributes vì đã encode bằng identifying relationship.

### 8.4. Step 2b: multi-valued table -> multi-valued attribute

Với mỗi classification `MULTI_VALUED`:

1. Tìm entity parent bằng `mvParentId`.
2. Lấy value column `mvValueCol`.
3. Thêm attribute vào parent:

```ts
{
    id: generateCid(),
    name: mvValueCol.name,
    kind: "multi_valued",
    isKey: false,
}
```

### 8.5. Step 3a: junction table -> association relationship

Với mỗi classification `JUNCTION`:

1. `junctionRefTableIds` trở thành relationship ends.
2. Mỗi end:

```ts
{
    entityId: refId,
    cardinality: "N",
    optional: true,
}
```

3. Nếu có nhiều hơn 2 ends, set `arity = ends.length`.
4. Non-PK columns trong junction table thành relationship attributes `kind: "simple"`.
5. Relationship:

```ts
{
    id: generateCid(),
    name: junctionTable.name,
    type: "association",
    ends,
    attributes?: relAttrs,
}
```

Sau khi tạo relationship từ junction, code đánh dấu tất cả cặp entity trong junction là đã emitted để tránh tạo duplicate relationship từ FK thường.

### 8.6. Step 3b: weak entity -> identifying relationship

Với mỗi classification `WEAK`:

1. Tạo pair key giữa weak table và owner.
2. Nếu pair đã emitted thì bỏ qua.
3. Relationship name:

```ts
`${ownerTable?.name ?? "owner"}_${weakTable.name}`
```

4. Ends:

```ts
[
    { entityId: ownerId, cardinality: "1", optional: true },
    { entityId: weakId,  cardinality: "N", optional: false },
]
```

5. `type: "identifying"`.

### 8.7. Step 3c: regular FK -> association N:1

Code duyệt FK columns còn lại trong các table đã thành entity.

Skip FK nếu:

- Table source là `JUNCTION` hoặc `MULTI_VALUED`.
- FK trỏ đến table không tồn tại.
- FK trỏ đến junction/multi-valued table.
- FK là ISA PK/FK đã encode bằng generalization.
- FK là weak owner PK/FK đã encode bằng identifying relationship.
- Pair entity đã emitted.

Nếu không skip, tạo association:

```ts
{
    id: generateCid(),
    name: `${sourceTable.name}_${refTable?.name ?? refTableId}`,
    type: "association",
    ends: [
        {
            entityId: sourceTable.id,
            cardinality: "N",
            optional: col.roles?.primaryKey ? false : col.nullable !== false,
        },
        {
            entityId: fk.refTableId,
            cardinality: "1",
            optional: true,
        },
    ],
}
```

Participation khi reverse: đầu phía N (chứa FK) là `optional: false` nếu cột FK thuộc PK hoặc `nullable === false`, ngược lại `optional: true`. Model logical dựng từ diagram không lưu nullability (`logical-model.builder.ts` luôn `nullable: true`) nên với lược đồ logical chỉ biết được cột FK nằm trong PK hay không; đầu phía 1 luôn `optional: true` (FK không buộc bảng được tham chiếu phải có dòng con) và owner của weak entity cũng `optional: true`, khớp với chiều xuôi (chiều xuôi chỉ đọc `optional` của đầu phía N).

Dedup pair không phân biệt hướng:

```ts
[a, b].sort().join("↔")
```

Hệ quả: nếu có nhiều FK khác nhau giữa cùng 2 tables, chỉ tạo một relationship conceptual.

### 8.8. Output

Output conceptual:

- `model.id`: `opts.newModelId` hoặc `generateCid()`.
- `model.name`: tên derived.
- `model.version = 1`.
- `model.notes = logicalModel.model.notes`.
- `entities`.
- `relationships`.
- `generalizations`.
- `categories: []`.
- `constraints: []`.

## 9. Conceptual -> Logical

Hàm: `convertConceptualToLogical(conceptualModel, opts)`.

Đây là forward-engineering từ conceptual model sang relational logical model. Thuật toán bám theo quy tắc ánh xạ ER/EER-to-relational của sách *Fundamentals of Database Systems* (Elmasri & Navathe), Chapter 9. Hàm này cũng là hàm được dùng cho **Sync schema** (Conceptual -> Logical), nên mọi thay đổi ở đây ảnh hưởng cả convert lẫn sync.

Thứ tự bước trong code:

```text
Pre-scan  tìm weak entity + owner qua identifying relationship
Step 1    entity thường -> table + cột thuộc tính
Step 2    weak entity   -> PK = PK của owner + partial key
Step 3    generalization -> class table inheritance
Step 4/5  relationship  -> FK hoặc junction table
Step 6    multi-valued attribute -> table riêng
```

### 9.0. Helper dùng chung

`getPKCols(tableId)`: trả về **tất cả** cột PK của table (trước đây chỉ lấy PK đầu tiên, nên không hỗ trợ khóa tổ hợp).

`makeFkCols(existing, refTableId, opts)`: tạo các cột FK tham chiếu **toàn bộ** cột PK của `refTableId` (sách: "include as foreign key the primary key of ..."):

| PK của bảng được tham chiếu | Tên cột FK |
|---|---|
| 1 cột | `<refTable.name>_id` (convention cũ); self-reference: `parent_<refTable.name>_id` |
| Nhiều cột | Mỗi cột PK sinh một cột FK, giữ tên cột PK; self-reference: `parent_<pkName>` |

Tên được làm duy nhất so với các cột đã có: nếu trùng thì thêm tiền tố `<refTable.name>_`, nếu vẫn trùng thì thêm hậu tố `_2`, `_3`...

Opts:

- `primaryKey`: FK cũng là một phần PK (weak entity, junction, generalization, multi-valued).
- `nullable`: bị ép `false` khi `primaryKey = true`.
- `unique`: chỉ áp dụng khi FK có đúng 1 cột; FK nhiều cột luôn `unique: false` (không biểu diễn được UNIQUE tổ hợp trên từng cột).
- `selfRef`: dùng tiền tố `parent_`.

### 9.0.1. Pre-scan: weak entity và owner

Duyệt các relationship có `type = "identifying"` và đúng 2 end hợp lệ. Xác định:

1. Phía N (`cardinality` là `N` hoặc `M`) là weak entity, phía còn lại là owner.
2. Nếu không phân biệt được bằng cardinality thì dùng `entity.kind === "weak"`: end nào weak mà end kia không weak là weak end.
3. Bắt buộc `weakEnd` có `entity.kind === "weak"`, nếu không thì bỏ qua relationship này (nó được xử lý như relationship thường).
4. Một weak entity có thể có nhiều owner (nhiều identifying relationship). `rel.attributes` của các identifying relationship được gom lại để thêm vào bảng của weak entity.

Kết quả: `weakInfo: Map<weakEntityId, { ownerIds, relAttributes }>` và `identifyingRelIds` (các relationship đã được xử lý ở Step 2, bị bỏ qua ở Step 4/5).

### 9.0.2. Tên trống

Entity hoặc attribute (kể cả thành phần composite và thuộc tính của relationship) có tên rỗng hoặc chỉ toàn khoảng trắng được đặt tên mặc định duy nhất trước khi map (không sửa model đầu vào): entity `unnamed_entity`, attribute `unnamed_attribute`, thêm hậu tố `_2`, `_3`... khi trùng tên đã có (không phân biệt hoa/thường). Mỗi lần đặt tên mặc định có một notice `warning`.

### 9.1. Step 1: entities -> base tables

Mỗi entity tạo một table:

```ts
{
    id: entity.id,
    name: entity.name,
    columns,
    notes: entity.notes,
}
```

### 9.1.1. Attribute mapping

Với từng attribute:

- `derived`: bỏ qua, không lưu relational.
- `multi_valued`: bỏ qua ở step này, xử lý riêng ở Step 6.
- `composite` có components: flatten thành một column cho mỗi component. Nếu attribute composite được đánh dấu `isKey`, mỗi column thành phần là `primaryKey` (`nullable: false`, không `unique` riêng lẻ) và được tính vào số cột khóa của entity, nên khóa composite kết hợp với khóa đơn vẫn tạo một PK ghép; entity không còn bị tự thêm cột `id`.
  Tên column thành phần: nếu tên đó xuất hiện nhiều hơn một lần trong table (giữa các thuộc tính thường và các thành phần composite, không phân biệt hoa/thường) thì thành phần được đặt tên `<tên composite cấp trên cùng>_<tên thành phần>` (thuộc tính thường giữ nguyên tên); nếu vẫn trùng thì thêm hậu tố số. Mỗi thành phần bị đổi tên có một notice `warning` ghi tên mới.
- Attribute thường:

```ts
{
    id: generateLid(),
    name: attr.name,
    nullable: attr.isKey ? false : true,
    unique: attr.isKey && storedKeyCount === 1 && !isOwnedWeak,
    roles: attr.isKey ? { primaryKey: true } : undefined,
    notes: attr.notes,
}
```

Quy tắc `unique` (khác phiên bản cũ): các thuộc tính key của một entity **cùng nhau** tạo thành **một** khóa. Vì vậy chỉ khi entity có đúng 1 thuộc tính key (và không phải weak entity có owner) thì cột mới `unique: true`. Với khóa tổ hợp hoặc partial key, từng cột không UNIQUE riêng lẻ (theo sách: "the set of simple attributes that form it will together form the primary key").

### 9.1.2. Auto-add primary key

Nếu entity **không phải weak entity có owner** và không có key attribute sau khi map:

```ts
{
    id: generateLid(),
    name: "id",
    nullable: false,
    unique: true,
    roles: { primaryKey: true },
}
```

Column này được unshift vào đầu table. Tên là `id`; nếu entity đã có column tên `id` (không phân biệt hoa/thường) thì dùng `<entity>_id` (thêm hậu tố số nếu vẫn trùng). Weak entity có owner không được thêm `id`, vì PK của nó lấy từ owner (Step 2). Weak entity **không** có identifying relationship hợp lệ được coi như entity thường (có auto `id` nếu thiếu key).

### 9.2. Step 2: weak entities -> PK = PK owner + partial key

Theo sách (Chapter 9, Step 2): *"The primary key of R is the combination of the primary key(s) of the owner(s) and the partial key of the weak entity type W, if any."*

Với mỗi weak entity (duyệt DFS để **owner được ánh xạ trước**: weak entity có owner cũng là weak entity thì owner xử lý trước; có chống vòng lặp bằng `visitingWeak`):

1. Với từng owner, `makeFkCols(..., { primaryKey: true, nullable: false })` tạo các cột FK tham chiếu toàn bộ PK của owner.
2. Các cột FK này được `unshift` vào đầu bảng của weak entity.
3. Partial key (các thuộc tính `isKey` của chính weak entity, đã map ở Step 1 với `primaryKey: true`) giữ nguyên.
4. Kết quả: PK của weak entity = (các cột FK của owner) + (partial key).
5. `rel.attributes` của identifying relationship thành cột thường (`nullable: true`) trong bảng weak entity.

Ví dụ (bài Journal): `issue` là weak entity của `journal`, partial key = `{issue_number, date_issued}` thì:

```text
issue(journal_id PK/FK -> journal.journal_id, issue_number PK, date_issued PK)
```

Nếu `issue` có thêm một weak entity `section` (partial key `section_no`) thì:

```text
section(journal_id PK/FK, issue_number PK/FK, date_issued PK/FK, section_no PK)
```

(các cột FK tham chiếu từng cột PK của `issue`).

Sách còn khuyến nghị `ON DELETE/UPDATE CASCADE` cho FK của weak entity. Model Logical không có `onDelete/onUpdate` (xem 6.4), nên điểm này chưa được thể hiện ở Logical; Logical -> Physical hiện luôn dùng `NO ACTION`.

### 9.3. Step 3: generalizations -> class table inheritance

Với mỗi generalization:

1. Tìm parent table và **toàn bộ PK cols** của parent.
2. Với mỗi child entity:

**Parent có PK 1 cột** (hành vi cũ, giữ nguyên):

- Child đã có PK: giữ column đó là PK, thêm FK trỏ parent PK, đổi tên child PK thành `parentPK.name`.
- Child chưa có PK: thêm column `${parentTable.name}_id` vào đầu (PK + FK, `unique: true`).

**Parent có PK nhiều cột** (mới):

- Bỏ cờ `primaryKey` của các cột PK riêng của child (chúng thành cột thường).
- Thêm vào đầu child các cột FK sao chép toàn bộ PK parent (`makeFkCols` với `primaryKey: true`), nên PK child = PK parent.

Lưu ý: class table inheritance luôn dùng child PK làm FK về parent. Step 3 chạy **sau** Step 2, nên parent là weak entity vẫn có PK đầy đủ; ngược lại, nếu một weak entity có owner là child của generalization thì PK của owner có thể chưa phản ánh phép kế thừa (giới hạn, xem mục 14).

Nếu một `childEntityIds` của generalization không tồn tại thì bị bỏ qua và converter thêm notice `warning` "Generalization of <parent>: child entity "<id>" does not exist, so it was ignored" (hiển thị theo id vì entity không có tên); các con còn lại vẫn được chuyển bình thường.

### 9.3.1. Step 3b: categories (union types) -> surrogate key hoặc khóa chung

Theo EER step 9 (slide trang 85-86). Chạy sau Step 3, trước Step 4/5, cho từng phần tử của `conceptualModel.categories`:

- Nếu category không có `categoryEntityId` (hoặc entity không tồn tại): `warning` "A category has no entity of its own, so it was not converted", bỏ qua.
- `supers` = `superclassEntityIds` còn tồn tại và khác category; thiếu thì `warning`; rỗng thì `warning` và bỏ qua.
- So sánh chữ ký khóa (tên cột PK, không phân biệt hoa/thường, đã sắp xếp) của tất cả superclass.

**Khóa khác nhau** (ví dụ PERSON `Ssn`, BANK `Bname`, COMPANY `Cname` -> OWNER):

1. Bảng category dùng khóa thay thế. Nếu entity category không có key attribute, cột `id` tự thêm ở Step 1 được đổi tên thành `<category>_id` (ví dụ `owner_id`); nếu có key attribute riêng thì dùng khóa đó.
2. Mỗi bảng superclass thêm cột FK tới PK của category (`makeFkCols`, `primaryKey: false`, `nullable: true`, tên `<category>_id`).

**Khóa giống nhau** (ví dụ CAR, TRUCK cùng `Vehicle_id` -> REGISTERED_VEHICLE):

1. Bảng category dùng khóa chung làm PK (cột tự thêm `id` bị bỏ; key attribute khai báo riêng trên category được giữ lại thành cột `unique`).
2. Cột PK của mỗi superclass đồng thời là FK trỏ về cột tương ứng của category (không thêm cột). Nếu cột PK của superclass đã là FK tới bảng khác (superclass là subclass trong generalization) thì không ghi đè, thêm `warning`.

Quan hệ nối tới category (ví dụ OWNS N:M) được map ở Step 4/5 như entity thường, tham chiếu PK của bảng category. Completeness `total/partial` không ảnh hưởng schema quan hệ. Tên cột FK theo quy ước của tool (`registered_vehicle_id`), khác tên `Vehicle_id` trong slide nhưng cùng cấu trúc.

### 9.4. Step 4/5: relationships -> FK hoặc junction table

Quy tắc tên bảng: mọi entity table được tạo trước (Step 1), nên `uniqueTableName(base)` so sánh `base` (không phân biệt hoa/thường) với tên của tất cả table đã có; nếu trùng thì thêm hậu tố `_2`, `_3`, ... cho đến khi duy nhất. Áp dụng cho junction table (binary N:M và n-ary) và table của multi-valued attribute. Chỉ khi `rel.name` do người dùng đặt mà bị đổi tên thì mới thêm notice `warning` ghi tên mới; tên do công cụ tự sinh (`A_B`) bị đổi thì không báo.

Bỏ qua các identifying relationship đã xử lý ở Step 2. Code chỉ xử lý relationship có ít nhất 2 ends hợp lệ trong `tableMap`.

`rel.attributes` được map thành columns:

- Với N:M/N-ary: thêm vào junction table.
- Với 1:N/N:1/1:1: thêm vào table chứa FK.

Mọi FK đều dùng `makeFkCols`, tức luôn tham chiếu **toàn bộ PK** của bảng được tham chiếu (kể cả PK tổ hợp, ví dụ `article` -> `issue` sinh 3 cột FK).

Cardinality chưa đặt: đầu không có `cardinality` được đọc là `1` ở quan hệ 2 ngôi (không phải "nhiều") và là nhiều (N) ở quan hệ n ngôi (giữ FK trong PK). Mỗi quan hệ có đầu bỏ trống sinh một notice `warning` nêu tên quan hệ, entity bị bỏ trống và cách đã đọc (one-to-one, one-to-many hoặc many (N)).

Thuộc tính của relationship (áp dụng cho FK-table 1:N/1:1, junction N:M, junction n ngôi và bảng của weak entity với identifying relationship) đi qua helper `attributeColumns`:

- `derived`: không lưu, `warning` "<label>.<attr>: derived attribute is not stored".
- Có `components` (composite): một column cho mỗi thành phần đơn (lồng nhau được flatten xuống lá), `nullable: true`, không thuộc PK; thành phần `derived`/`multi_valued` bị bỏ kèm `warning`; thành phần trùng tên column đã có thì thêm tiền tố `<tên composite>_` (hậu tố số nếu vẫn trùng) và có `warning`. Theo slide trang 70 (n-ary) và trang 72 (composite → tập thành phần đơn).
- Còn lại: một column mang tên thuộc tính.

### 9.4.1. N-ary relationship

Điều kiện: `ends.length > 2`.

1. Tạo junction table `tbl_${rel.id}`, tên `rel.name || participantNames.join("_")`, rồi làm duy nhất bằng `uniqueTableName` (xem bên dưới).
2. Mỗi participant sinh các cột FK (`nullable: false`) tham chiếu toàn bộ PK của participant. Participant có `cardinality === "1"` được xác định bởi các participant còn lại nên cột FK của nó KHÔNG thuộc PK; các cột FK của participant còn lại cùng tạo PK của junction. Nếu mọi participant đều là `"1"` thì cả các FK đều ở trong PK. Participant chưa đặt cardinality được coi là không phải `"1"` (giữ FK trong PK).
3. `rel.attributes` thành cột thường (`nullable: true`).

### 9.4.2. Binary N:M

Điều kiện: cả 2 end có `cardinality` `N` hoặc `M`, và cả hai table đều có PK.

Converter chỉ nhận chính xác `N` hoặc `M` là phía many. Các dạng min-max như `0..N`, `1..N`, `(0,N)` chưa được parse và hiện sẽ rơi vào nhánh one; PropertiesPanel vì vậy chỉ cho chọn `1`, `N`, `M`.

1. Tạo junction table `tbl_${rel.id}`, tên `rel.name || "${A.name}_${B.name}"`, rồi làm duy nhất bằng `uniqueTableName` (xem bên dưới).
2. Cột FK của phía A, rồi của phía B (`primaryKey: true`, `nullable: false`); tất cả cùng tạo PK của junction.
3. N:M self-relationship: phía B dùng tiền tố `parent_` để không trùng tên.
4. `rel.attributes` thành cột thường.

### 9.4.3. Binary 1:N, N:1, 1:1

- `isAMany && !isBMany`: FK ở end A, ref là end B.
- `!isAMany && isBMany`: FK ở end B, ref là end A.
- Còn lại (1:1): ưu tiên end có `optional === false` làm phía chứa FK, fallback end A.

FK cột:

```ts
makeFkCols(fkTable.columns, refEnd.entityId, {
    primaryKey: false,
    nullable: fkEnd.optional !== false,   // total participation -> NOT NULL
    unique: !isAMany && !isBMany,         // chỉ áp dụng khi FK 1 cột (1:1)
    selfRef: endA.entityId === endB.entityId,
})
```

Participation: nullable của FK phụ thuộc `optional` của end chứa FK (end phía N). `optional: false` (tham gia bắt buộc) -> `NOT NULL`; `optional: true` hoặc không khai báo -> cho phép `NULL`.

### 9.5. Step 6: multi-valued attributes -> separate tables

Mỗi attribute `multi_valued`:

1. Tạo table `tbl_mv_${entity.id}_${attr.id}`, tên `${entity.name}_${attr.name}`, rồi làm duy nhất bằng `uniqueTableName`. Nếu multi-valued attribute có `components` (slide trang 66) thì bảng chứa một column cho mỗi thành phần đơn (qua `attributeColumns`, tiền tố tên attribute khi trùng với cột FK) thay vì một column mang tên attribute; PK = FK về owner + tất cả các column thành phần. Nếu không còn thành phần nào lưu được thì bỏ bảng và `warning`.
2. Các cột FK tham chiếu **toàn bộ PK** của entity sở hữu (`primaryKey: true`, `nullable: false`).
3. Cột giá trị `attr.name` (`nullable: false`, `primaryKey: true`).
4. PK của table = (PK owner) + (cột giá trị).

### 9.5.1. Kiểm tra tên trùng

Trước khi trả kết quả, converter gom tên table, và tên column trong từng table, theo khóa so sánh `normalize("NFC")` + `trim()` + `toLowerCase()` (không phân biệt hoa/thường, bỏ khoảng trắng đầu/cuối, chuẩn hóa Unicode để chữ có dấu viết dạng precomposed hoặc dạng chữ + dấu rời được coi là một). Mỗi nhóm có từ hai tên trở lên sinh một notice `warning`; converter không đổi tên các cột/bảng này. Tên chỉ khác dấu (`Ma` / `Mã`) là hai tên khác nhau. Tên được giữ nguyên như người dùng nhập (kể cả dấu, khoảng trắng đầu/cuối và giữa tên, ký tự đặc biệt) vì DDL generator luôn đặt tên trong dấu nháy; đây là quyết định có chủ đích: khoảng trắng trong tên được coi là hợp lệ, kể cả trong tên tự sinh (`order item_id`, `học sinh_môn học`). Tên rỗng hoặc chỉ toàn khoảng trắng được xử lý ở mục 9.0.2.

### 9.6. Output

```ts
{
    model: {
        id: opts.newModelId ?? generateLid(),
        name: modelName,
        version: 1,
        notes: conceptualModel.model.notes,
    },
    tables: Array.from(tableMap.values()).map(t => ({ ...t, columns: pkColumnsFirst(t.columns) })),
}
```

**Thứ tự cột PK**: mọi cột `primaryKey` của một table (kể cả PK ghép) được gom thành một nhóm và xếp lên đầu table qua `pkColumnsFirst` (stable sort: thứ tự tương đối trong nhóm PK và trong nhóm cột còn lại giữ nguyên). Helper này được áp dụng ở output của Conceptual -> Logical, Logical -> Physical và Physical -> Logical, nên các table sau convert luôn có PK ở trên cùng. Khi user bật/tắt PK thủ công trong properties panel (`updateLogicalTableAttribute` với `isKey`, `updateRelationTableColumn` với `isPrimary` trong `utils/functions.ts`), table cũng được xếp lại bằng cùng quy tắc (`pkFirst`). Logical pin `column.id` trước khi xếp để handle không phụ thuộc vị trí; physical dùng tên cột làm handle nên edge không bị ảnh hưởng. Trong properties panel, kéo thả reorder chỉ được thả trong cùng nhóm: PK với PK (đổi thứ tự trong khóa tổ hợp) hoặc cột thường với cột thường; thả khác nhóm bị bỏ qua, nên PK luôn nằm trên cùng.

Kiểm thử: `src/components/EditProject/utils/schema-conversion.test.ts` (chạy bằng `npx tsx src/components/EditProject/utils/schema-conversion.test.ts`), gồm bài Journal (weak entity `issue`, composite FK, junction `writes`), weak entity lồng nhau, participation -> nullability, khóa tổ hợp của strong entity.

## 10. Physical -> Conceptual

Hàm: `convertPhysicalToConceptual(physicalModel, opts)`.

Không có thuật toán riêng. Code chạy chain:

```ts
logicalModel = convertPhysicalToLogical(physicalModel)
return convertLogicalToConceptual(logicalModel, {
    newModelId: opts.newModelId,
    newModelName: derivedConceptualName,
})
```

Hệ quả:

- Mất physical-only fields trước: DBMS, type, length, index, default, autoIncrement.
- Sau đó dùng heuristic Logical -> Conceptual.

## 11. Conceptual -> Physical

Hàm: `convertConceptualToPhysical(conceptualModel, opts)`.

Không có thuật toán riêng. Code chạy chain:

```ts
logicalModel = convertConceptualToLogical(conceptualModel)
return convertLogicalToPhysical(logicalModel, {
    newModelId: opts.newModelId,
    newModelName: derivedPhysicalName,
    dbms: opts.dbms,
})
```

Hệ quả:

- Tất cả rule Conceptual -> Logical chạy trước.
- Sau đó Logical -> Physical infer data type, autoIncrement, DBMS mapping.
- Nếu UI convert sang Physical, `opts.dbms` đến từ `ConvertToPhysicalModal`.
- Nếu sync sang Physical, thường không có `opts.dbms`.

## 12. Naming rule cho converted model

Mỗi hàm convert đều có logic derive name:

- Nếu có `opts.newModelName`, dùng trực tiếp.
- Nếu không:
  - Replace chữ source level trong model name sang target level.
  - Nếu replace không làm đổi tên, thêm suffix `(<Target>)`.

Ví dụ:

```text
Shop Logical -> Shop Physical
Shop          -> Shop (Physical)
```

Trong UI convert, code thường truyền `newModelName: ${diagramName} (<Target>)`, nên tên từ UI có thể override derive-name mặc định trong utility.

## 13. Convert schema vs Sync schema

### 13.1. Convert schema

Flow:

1. Build fresh model.
2. Convert sang target model.
3. Tạo schema mới.
4. Lưu model vào schema mới.
5. Điều hướng sang schema mới.

Target Physical:

- Không convert ngay.
- Lưu `pendingPhysicalConvert`.
- User chọn DBMS.
- `handleConfirmConvertToPhysical(dbms)` mới gọi:
  - `convertLogicalToPhysical(..., { dbms })`, hoặc
  - `convertConceptualToPhysical(..., { dbms })`.

### 13.2. Sync schema

Flow:

1. Build fresh model.
2. Convert sang target model.
3. Ghi đè model vào schema target bằng `saveSchemaModel`.

Khác biệt quan trọng:

- Sync không tạo schema mới.
- Sync không điều hướng.
- Sync sang Physical hiện không hỏi DBMS.
- Vì không truyền DBMS, physical model sync ra thường dùng generic type và không có `model.dbms`.

## 14. Những giới hạn và điểm cần chú ý

1. Logical -> Conceptual là heuristic reverse-engineering, không khôi phục được đầy đủ semantic conceptual ban đầu.
2. Category/union được convert ở Step 3b (mục 9.3.1). Ràng buộc "mỗi instance của category chỉ thuộc đúng một superclass" và `completeness` không thể hiện được trong schema quan hệ. Chiều ngược lại (Logical -> Conceptual) không khôi phục được category.
   Generalization chỉ hỗ trợ MỘT cha (giới hạn có chủ đích của phạm vi đồ án): nếu `parentEntityIds` có nhiều phần tử thì chỉ dùng cha đầu tiên và `convertConceptualToLogical` thêm notice `warning` "multiple parents are not supported, only the first parent was used"; không tạo FK cho các cha còn lại.
3. Logical -> Conceptual luôn output `categories: []`, `constraints: []`.
4. Generalization reverse từ logical luôn default `disjoint + partial`.
5. Relationship dedup Logical -> Conceptual dùng pair không phân biệt hướng; nhiều FK giữa cùng 2 table chỉ còn một relationship.
6. Junction table luôn tạo ends cardinality `N`, optional `true`.
7. FK thường Logical -> Conceptual luôn suy ra relationship N:1.
8. Weak entity detection yêu cầu composite PK có một phần là FK và có non-PK columns; weak entity không có non-PK column có thể bị phân loại khác.
9. Multi-valued detection rất chặt: đúng 2 columns, cả 2 PK, đúng 1 FK, không có non-PK.
10. Conceptual derived attributes bị bỏ khi sang Logical.
11. Composite attributes bị flatten, không có metadata để reverse lại composite. Thuộc tính derived của relationship cũng bị bỏ (kèm cảnh báo) như derived của entity; slide không nói gì về derived, đây là quy ước của đồ án.
12. Conceptual -> Logical relationship attributes trong 1:N/1:1 được đặt vào table chứa FK; attributes của identifying relationship được đặt vào bảng weak entity.
13. Conceptual -> Logical self relationship dùng prefix `parent_` để tránh trùng tên FK column.
    FK tới bảng có PK tổ hợp sinh một cột FK cho mỗi cột PK, giữ tên cột PK (đã đảm bảo duy nhất bằng tiền tố `<refTable>_` / hậu tố số); FK nhiều cột luôn `unique: false`.
    Weak entity chỉ được nhận diện khi `entity.kind = "weak"` và có identifying relationship hợp lệ (2 ends, weak ở phía N, hoặc phân biệt bằng `kind`). Nếu không, entity được ánh xạ như entity thường.
    Weak entity có owner là child của generalization: PK của owner có thể chưa gồm phần kế thừa vì Step 2 chạy trước Step 3.
    Logical không có `onDelete/onUpdate`; khuyến nghị CASCADE cho FK của weak entity (sách) chưa được áp dụng, Logical -> Physical luôn `NO ACTION`.
    Logical -> Conceptual chỉ nhận diện weak entity khi bảng còn ít nhất 1 cột non-PK (xem mục 8.1.4). Bảng `issue(journal_id PK/FK, issue_number PK, date_issued PK)` không có cột thường sẽ không được reverse thành weak entity.
14. Logical -> Physical không tạo indexes từ keys hoặc FK; `indexes` luôn khởi tạo rỗng.
15. Logical -> Physical infer type dựa trên tên cột, nên có thể sai nếu tên không theo convention.
16. Physical -> Logical bỏ `defaultValue`, `dataType`, `length`, `autoIncrement`, `indexes`, `dbms`.
17. Sync sang Physical không có DBMS picker, khác với convert sang Physical từ UI chính.

## 15. Bảng tóm tắt rule theo hướng

| Hướng | Hàm | Thuật toán chính |
|---|---|---|
| Logical -> Physical | `convertLogicalToPhysical` | Giữ table id, đổi column id `lid` -> `pid`, remap FK refColumnId, infer data type theo role/name/DBMS, set autoIncrement cho single integer PK không phải FK, init indexes rỗng |
| Physical -> Logical | `convertPhysicalToLogical` | Giữ table id/name/PK/FK/unique/nullable, đổi column id `pid` -> `lid`, bỏ physical-only fields, merge comment vào notes |
| Logical -> Conceptual | `convertLogicalToConceptual` | Classify table thành `REGULAR`, `ISA_CHILD`, `JUNCTION`, `MULTI_VALUED`, `WEAK`; tạo entity, relationship, generalization bằng heuristic PK/FK |
| Conceptual -> Logical | `convertConceptualToLogical` | Theo Elmasri & Navathe Ch.9: entity thành table, key attr thành PK (khóa tổ hợp không UNIQUE từng cột), weak entity có PK = PK owner + partial key, derived bị bỏ, composite flatten, multi-valued thành table riêng, generalization thành PK+FK, relationship thành FK (tham chiếu toàn bộ PK, nullable theo participation) hoặc junction |
| Physical -> Conceptual | `convertPhysicalToConceptual` | Chain Physical -> Logical -> Conceptual |
| Conceptual -> Physical | `convertConceptualToPhysical` | Chain Conceptual -> Logical -> Physical, truyền DBMS xuống bước Logical -> Physical nếu có |
