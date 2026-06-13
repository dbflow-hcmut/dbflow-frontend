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
                roles: keep PK/candidateKey/FK but remap FK.refColumnId
            }

        physicalTable = {
            id: table.id,
            name: table.name,
            notes: table.notes,
            columns,
            indexes: [],
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

### 6.4. Field được giữ/bỏ

Giữ:

- Table `id`, `name`, `notes`.
- Column `name`, `nullable`, `unique`.
- `roles.primaryKey`, `roles.candidateKey`, `roles.foreignKey`.
- `functionalDependencies`.

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
                notes: col.comment || col.notes
            })),
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
    { entityId: ownerId, cardinality: "1", optional: false },
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
            optional: col.nullable !== false,
        },
        {
            entityId: fk.refTableId,
            cardinality: "1",
            optional: false,
        },
    ],
}
```

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

Đây là forward-engineering từ conceptual model sang relational logical model.

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
- `multi_valued`: bỏ qua ở step này, xử lý riêng ở Step 4.
- `composite` có components: flatten thành một column cho mỗi component.
- Attribute thường:

```ts
{
    id: generateLid(),
    name: attr.name,
    nullable: attr.isKey ? false : true,
    unique: attr.isKey ? true : false,
    roles: attr.isKey ? { primaryKey: true } : undefined,
    notes: attr.notes,
}
```

Composite component hiện được map đơn giản:

```ts
{
    id: generateLid(),
    name: component.name,
    nullable: true,
    unique: false,
}
```

Nó không giữ metadata rằng component từng thuộc composite attribute nào.

### 9.1.2. Auto-add primary key

Nếu entity không có key attribute sau khi map:

```ts
{
    id: generateLid(),
    name: "id",
    nullable: false,
    unique: true,
    roles: { primaryKey: true },
}
```

Column này được unshift vào đầu table.

### 9.2. Step 2: generalizations -> class table inheritance

Với mỗi generalization:

1. Tìm parent table.
2. Tìm parent PK.
3. Với mỗi child entity:
   - Tìm child table.
   - Tìm existing child PK.

Nếu child đã có PK:

- Giữ column đó là PK.
- Thêm FK trỏ parent PK.
- Đổi tên child PK thành `parentPK.name`.

```ts
existingPK.roles = {
    ...existingPK.roles,
    primaryKey: true,
    foreignKey: {
        refTableId: parentEntityId,
        refColumnId: parentPK.id,
    },
}
existingPK.name = parentPK.name
```

Nếu child chưa có PK:

- Thêm column mới vào đầu:

```ts
{
    id: generateLid(),
    name: `${parentTable.name}_id`,
    nullable: false,
    unique: true,
    roles: {
        primaryKey: true,
        foreignKey: {
            refTableId: parentEntityId,
            refColumnId: parentPK.id,
        },
    },
}
```

Lưu ý: class table inheritance luôn dùng child PK làm FK về parent.

### 9.3. Step 3: relationships -> FK hoặc junction table

Code chỉ xử lý relationship có ít nhất 2 ends hợp lệ trong `tableMap`.

`rel.attributes` sẽ được map thành columns:

- Với N:M/N-ary: thêm vào junction table.
- Với 1:N/N:1/1:1: thêm vào table chứa FK.

### 9.3.1. N-ary relationship

Điều kiện: `ends.length > 2`.

Rule:

1. Tạo junction table.
2. `junctionId = tbl_${rel.id}`.
3. `junctionName = rel.name || participantNames.join("_")`.
4. Mỗi participant tạo 1 column:

```ts
{
    id: generateLid(),
    name: `${participantTable.name}_id`,
    nullable: false,
    unique: false,
    roles: {
        primaryKey: true,
        foreignKey: {
            refTableId: participantEntityId,
            refColumnId: participantPKId,
        },
    },
}
```

5. Relationship attributes thành nullable non-unique columns.
6. Chỉ set table nếu `cols.length > 0`.

### 9.3.2. Binary N:M

Điều kiện:

- Có đúng 2 ends.
- End A many và end B many.
- Many nghĩa là `cardinality === "N"` hoặc `"M"`.

Rule:

1. Tạo junction table `tbl_${rel.id}`.
2. Name: `rel.name || ${tableA.name}_${tableB.name}`.
3. Tạo 2 columns:
   - `${tableA.name}_id` PK+FK trỏ PK table A.
   - `${tableB.name}_id` PK+FK trỏ PK table B.
4. Relationship attributes thành nullable non-unique columns.

### 9.3.3. Binary 1:N, N:1, 1:1

Nếu không phải N:M:

1. Xác định many side:
   - A many, B not many -> FK đặt ở A.
   - B many, A not many -> FK đặt ở B.
2. Nếu 1:1:
   - Ưu tiên optional side làm FK side.
   - Nếu A optional thì A làm FK side.
   - Else nếu B optional thì B làm FK side.
   - Else fallback A làm FK side.
3. Referenced side là side còn lại.
4. FK column name:
   - Self-referential: `parent_${refTable.name}_id`.
   - Không self-ref: `${refTable.name}_id`.
5. FK column:

```ts
{
    id: generateLid(),
    name: colName,
    nullable: fkEnd.optional !== false,
    unique: !isAMany && !isBMany,
    roles: {
        foreignKey: {
            refTableId: refEnd.entityId,
            refColumnId: pkRef,
        },
    },
}
```

6. Relationship attributes thêm vào FK table.

Lưu ý:

- FK column cho relationship không được set `primaryKey`.
- 1:1 được encode bằng `unique: true` trên FK column.
- Optionality được encode bằng nullable.

### 9.4. Step 4: multi-valued attributes -> separate tables

Với mỗi entity attribute `kind === "multi_valued"`:

1. Tìm parent table.
2. Tìm parent PK.
3. Tạo table:

```ts
mvTableId = `tbl_mv_${entity.id}_${attr.id}`
mvTableName = `${entity.name}_${attr.name}`
```

4. Tạo 2 columns:

Parent FK column:

```ts
{
    id: generateLid(),
    name: `${entity.name}_id`,
    nullable: false,
    unique: false,
    roles: {
        primaryKey: true,
        foreignKey: {
            refTableId: entity.id,
            refColumnId: parentPK.id,
        },
    },
}
```

Value column:

```ts
{
    id: generateLid(),
    name: attr.name,
    nullable: false,
    unique: false,
    roles: { primaryKey: true },
}
```

### 9.5. Output

Logical output:

- `model.id`: `opts.newModelId` hoặc `generateLid()`.
- `model.name`: tên derived.
- `model.version = 1`.
- `model.notes = conceptualModel.model.notes`.
- `tables = Array.from(tableMap.values())`.

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
2. Category/union không được convert trong `convertConceptualToLogical`; output Logical không xử lý `conceptualModel.categories`.
3. Logical -> Conceptual luôn output `categories: []`, `constraints: []`.
4. Generalization reverse từ logical luôn default `disjoint + partial`.
5. Relationship dedup Logical -> Conceptual dùng pair không phân biệt hướng; nhiều FK giữa cùng 2 table chỉ còn một relationship.
6. Junction table luôn tạo ends cardinality `N`, optional `true`.
7. FK thường Logical -> Conceptual luôn suy ra relationship N:1.
8. Weak entity detection yêu cầu composite PK có một phần là FK và có non-PK columns; weak entity không có non-PK column có thể bị phân loại khác.
9. Multi-valued detection rất chặt: đúng 2 columns, cả 2 PK, đúng 1 FK, không có non-PK.
10. Conceptual derived attributes bị bỏ khi sang Logical.
11. Composite attributes bị flatten, không có metadata để reverse lại composite.
12. Conceptual -> Logical relationship attributes trong 1:N/1:1 được đặt vào table chứa FK.
13. Conceptual -> Logical self relationship dùng prefix `parent_` để tránh trùng tên FK column.
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
| Conceptual -> Logical | `convertConceptualToLogical` | Entity thành table, key attr thành PK, derived bị bỏ, composite flatten, multi-valued thành table riêng, generalization thành PK+FK, relationship thành FK hoặc junction |
| Physical -> Conceptual | `convertPhysicalToConceptual` | Chain Physical -> Logical -> Conceptual |
| Conceptual -> Physical | `convertConceptualToPhysical` | Chain Conceptual -> Logical -> Physical, truyền DBMS xuống bước Logical -> Physical nếu có |
