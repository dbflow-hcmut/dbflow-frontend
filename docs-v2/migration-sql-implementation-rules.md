# Migration SQL: Thuật toán sinh UP/DOWN migration từ schema diff

Tài liệu này mô tả implementation hiện tại của tính năng Migration SQL trong Version History. Phần UI flow chỉ tóm tắt ngắn; trọng tâm là thuật toán `schema-diff.ts` và `migration-generator.ts`: cách so sánh hai physical model, phân loại change, sinh UP/DOWN statements, DBMS quoting/type mapping, và các giới hạn hiện tại.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Diff hai physical model thành structured changes | `src/components/EditProject/utils/schema-diff.ts` |
| Generate UP/DOWN migration SQL từ `SchemaDiff` | `src/components/EditProject/utils/migration-generator.ts` |
| UI Version History gọi migration và copy/download | `src/components/EditProject/components/VersionHistoryDrawer/index.tsx` |
| DBMS config cho quote/serial/index using | `src/components/EditProject/utils/dbms-config.ts` |
| Physical model shape | `src/components/EditProject/utils/physical-model.builder.ts` |
| DDL generator liên quan nhưng không phải migration | `src/components/EditProject/utils/ddl-generator.ts` |

## 2. Flow runtime sơ lược

Migration SQL nằm trong Version History.

Flow:

1. User mở Version History.
2. User chọn hai versions để compare.
3. Drawer load detail của hai versions.
4. Code lấy `oldModel` và `newModel`.
5. Gọi `diffSchemas(oldModel, newModel)` để tạo `SchemaDiff`.
6. Khi tab là Migration, gọi:

```ts
generateMigration(diffResult.diff, {
    dbms,
    oldModel: diffResult.oldModel,
    newModel: diffResult.newModel,
    versionFrom: diffResult.fromVersion.version,
    versionTo: diffResult.toVersion.version,
})
```

7. UI hiển thị UP và DOWN bằng Monaco DiffEditor:
   - `original = migrationResult.up`.
   - `modified = migrationResult.down`.
8. User có thể copy/download từng script.

Tính năng này hiện chỉ có ý nghĩa đầy đủ với Physical schema vì `SchemaDiff` nhận `PhysicalModelPayload`.

## 3. Data model

### 3.1. MigrationResult

```ts
export type MigrationResult = {
    up: string;
    down: string;
    upStatements: string[];
    downStatements: string[];
    diff: SchemaDiff;
};
```

- `up`: SQL migrate từ version cũ sang version mới.
- `down`: SQL rollback từ version mới về version cũ.
- `upStatements`, `downStatements`: statement thô trước khi ghép header.
- `diff`: giữ lại structured diff đầu vào.

### 3.2. SchemaDiff

```ts
export type SchemaDiff = {
    tableChanges: TableChange[];
    columnChanges: ColumnChange[];
    constraintChanges: ConstraintChange[];
    indexChanges: IndexChange[];
    hasChanges: boolean;
    summary: string;
};
```

Diff được chia thành 4 nhóm:

- Table-level.
- Column-level.
- Constraint-level.
- Index-level.

## 4. Pipeline tổng quát

```ts
oldSnapshot = normalize oldModel
newSnapshot = normalize newModel
diff = diffSchemas(oldModel, newModel)

migration = generateMigration(diff, {
    dbms,
    oldModel,
    newModel,
    versionFrom,
    versionTo,
})
```

`diffSchemas` chịu trách nhiệm phát hiện thay đổi.

`generateMigration` chịu trách nhiệm biến thay đổi thành SQL.

## 5. Schema Diff Engine

File: `src/components/EditProject/utils/schema-diff.ts`.

### 5.1. Normalize table snapshot

Mỗi physical table được normalize thành `TableSnapshot`:

```ts
{
    id,
    name,
    columns: [
        {
            name,
            dataType,
            length,
            nullable,
            unique,
            autoIncrement,
            defaultValue,
            isPrimaryKey,
            foreignKey,
        }
    ],
    indexes,
}
```

Column normalize rule:

- `nullable = c.nullable ?? true`.
- `unique = c.unique ?? false`.
- `isPrimaryKey = c.roles?.primaryKey ?? false`.
- `foreignKey` lấy từ `c.roles?.foreignKey`.

Index normalize giữ:

- `id`.
- `name`.
- `type`.
- `columns`.
- `isUnique`.

### 5.2. Identity matching rule

Diff matching hiện dựa theo **name**, không phải id:

- Table map key: `table.name`.
- Column map key: `column.name`.
- Index map key: `index.name`.
- FK map key: source `column.name`.

Hệ quả:

- Rename table bị hiểu là drop table cũ + create table mới.
- Rename column bị hiểu là drop column cũ + add column mới.
- Rename index bị hiểu là drop index cũ + create index mới.
- FK đổi source column name cũng thành drop/add theo column changes hoặc FK map.

### 5.3. Table changes

Rule:

- Table có trong new, không có trong old -> `CREATE_TABLE`.
- Table có trong old, không có trong new -> `DROP_TABLE`.

```ts
type TableChange =
    | { type: "CREATE_TABLE"; table: TableSnapshot }
    | { type: "DROP_TABLE"; table: TableSnapshot };
```

### 5.4. Column changes

Với các table tồn tại ở cả old và new:

- Column có trong new, không có trong old -> `ADD_COLUMN`.
- Column có trong old, không có trong new -> `DROP_COLUMN`.
- Column có cả hai bên -> so sánh field.

Fields được so sánh:

- `dataType`.
- `length`.
- `nullable`.
- `unique`.
- `defaultValue`.
- `autoIncrement`.

String/boolean normalize bằng:

```ts
norm(val) = val === undefined || val === "" ? "" : String(val).toLowerCase()
```

Nếu có ít nhất 1 field khác, tạo:

```ts
{
    type: "MODIFY_COLUMN",
    tableName,
    columnName,
    changes: ColumnModification[],
}
```

Lưu ý: `unique` và `autoIncrement` được detect trong columnChanges, nhưng migration SQL hiện chỉ xử lý một phần field này.

### 5.5. Primary key changes

Với table có ở cả hai version:

1. Lấy old PK column names.
2. Lấy new PK column names.
3. Sort rồi join bằng `,`.
4. Nếu khác:
   - Old có PK -> `DROP_PK`.
   - New có PK -> `ADD_PK`.

Constraint name convention:

```text
pk_<tableName>
```

### 5.6. Foreign key changes

FK map key là source column name.

Rule:

- New FK column có, old không có -> `ADD_FK`.
- Old FK column có, new không có -> `DROP_FK`.
- FK có cả hai bên -> so sánh:
  - `refTableId`.
  - `refColumnId`.
  - `onDelete`.
  - `onUpdate`.
- Nếu khác -> `MODIFY_FK`.

Constraint name convention:

```text
fk_<tableName>_<columnName>
```

### 5.7. Unique changes

Chỉ xét non-PK unique:

- Old column không unique, new column unique, new không phải PK -> `ADD_UNIQUE`.
- Old column unique, new column không unique, old không phải PK -> `DROP_UNIQUE`.

Constraint name convention:

```text
uq_<tableName>_<columnName>
```

### 5.8. Index changes

Index map key là index name.

Rule:

- New index có, old không có -> `CREATE_INDEX`.
- Old index có, new không có -> `DROP_INDEX`.
- Có cả hai bên -> nếu một trong các field sau khác thì `MODIFY_INDEX`:
  - `columns` so sánh bằng `JSON.stringify`.
  - `type`.
  - `isUnique`.

### 5.9. Summary

`summary` được build từ counts:

- table created/dropped.
- column added/removed/modified.
- constraint changes count.
- index changes count.

Nếu không có change:

```text
No changes
```

## 6. Migration Generator

File: `src/components/EditProject/utils/migration-generator.ts`.

Hàm chính:

```ts
generateMigration(diff, options): MigrationResult
```

Options:

```ts
{
    dbms: DBMSType;
    oldModel?: PhysicalModelPayload;
    newModel?: PhysicalModelPayload;
    versionFrom?: number;
    versionTo?: number;
}
```

### 6.1. DBMS config và quote

Generator lấy config:

```ts
config = getDBMSConfig(options.dbms)
```

Quote helper:

```ts
q(name, config):
    [open, close] = config.quoteChar
    return open + name + close
```

Helper này chỉ bọc quote, không escape quote char bên trong name.

### 6.2. columnTypeDDL

```ts
columnTypeDDL(dataType, length, config)
```

Rule:

1. Lowercase `dataType || "varchar"`.
2. Nếu type nằm trong `config.serialTypes`, return mapping serial.
3. Nếu không:
   - `typeStr = (dataType || "VARCHAR").toUpperCase()`.
   - Nếu có `length`, append `(${length})`.

Ví dụ:

- PostgreSQL `serial` -> `SERIAL`.
- MySQL `serial` -> `INT AUTO_INCREMENT`.
- `varchar` + `255` -> `VARCHAR(255)`.

### 6.3. Resolve FK target

Migration cần resolve FK target table/column name từ id.

`resolveTableName(tableId, newModel, oldModel)`:

- Ghép tables từ newModel trước rồi oldModel.
- Tìm table có `id === tableId`.
- Nếu không thấy, fallback trả `tableId`.

`resolvePKColumnName(tableId, newModel, oldModel)`:

- Ghép tables từ newModel trước rồi oldModel.
- Tìm table có `id === tableId`.
- Lấy primary key column đầu tiên.
- Nếu không thấy, fallback `"id"`.

Lưu ý quan trọng: migration generator không dùng `refColumnId` để resolve đúng referenced column. Nó luôn dùng PK đầu tiên của referenced table, giống một số logic export DDL hiện tại.

## 7. UP migration ordering

`generateMigration` sinh UP statements theo thứ tự cố định:

```text
1. DROP_TABLE
2. CREATE_TABLE
3. Column changes
4. Constraint changes
   4.1 DROP*
   4.2 MODIFY_FK
   4.3 ADD*
5. Index changes
```

### 7.1. Table UP

`CREATE_TABLE`:

1. Render `CREATE TABLE`.
2. Render column definitions.
3. Thêm PK constraint nếu có PK.
4. Thêm unique constraints cho non-PK unique columns.
5. Sau create table, thêm FK bằng `ALTER TABLE`.
6. Sau FK, tạo indexes.

`DROP_TABLE`:

```sql
DROP TABLE IF EXISTS <table>;
```

Lưu ý: DROP table chạy trước CREATE table trong UP. Code comment nói dropped tables không còn dependents trong new schema, nhưng generator không topological sort/drop FK trước.

### 7.2. Column UP

`ADD_COLUMN`:

```sql
ALTER TABLE <table> ADD COLUMN <column> <type> [NOT NULL] [DEFAULT ...];
```

`DROP_COLUMN`:

```sql
ALTER TABLE <table> DROP COLUMN <column>;
```

`MODIFY_COLUMN`:

- Nếu có change `dataType` hoặc `length`, sinh một statement:

```sql
ALTER TABLE <table> ALTER COLUMN <column> TYPE <newType>;
```

- Nếu change `nullable`:

```sql
ALTER TABLE <table> ALTER COLUMN <column> DROP NOT NULL;
ALTER TABLE <table> ALTER COLUMN <column> SET NOT NULL;
```

- Nếu change `defaultValue`:

```sql
ALTER TABLE <table> ALTER COLUMN <column> SET DEFAULT <newValue>;
ALTER TABLE <table> ALTER COLUMN <column> DROP DEFAULT;
```

Lưu ý:

- `unique` và `autoIncrement` có thể nằm trong `ColumnModification`, nhưng `generateColumnUp` hiện không sinh SQL cho hai field này.
- Unique changes được xử lý riêng bởi constraint changes.
- Auto increment change hiện chưa có SQL migration riêng.

### 7.3. Constraint UP

`ADD_PK`:

```sql
ALTER TABLE <table> ADD CONSTRAINT <pk_table> PRIMARY KEY (<cols>);
```

`DROP_PK`:

```sql
ALTER TABLE <table> DROP CONSTRAINT <pk_table>;
```

`ADD_FK`:

```sql
ALTER TABLE <table> ADD CONSTRAINT <fk_table_column>
    FOREIGN KEY (<column>) REFERENCES <refTable> (<refPK>) [ON DELETE ...] [ON UPDATE ...];
```

`DROP_FK`:

```sql
ALTER TABLE <table> DROP CONSTRAINT <fk_table_column>;
```

`MODIFY_FK`:

1. Drop old FK constraint.
2. Tìm FK mới trong `newModel` bằng table name + column name.
3. Nếu tìm được, add lại FK mới.
4. Nếu không tìm được, chỉ return drop statement.

`ADD_UNIQUE`:

```sql
ALTER TABLE <table> ADD CONSTRAINT <uq_table_column> UNIQUE (<column>);
```

`DROP_UNIQUE`:

```sql
ALTER TABLE <table> DROP CONSTRAINT <uq_table_column>;
```

### 7.4. Index UP

`CREATE_INDEX`:

```sql
CREATE [UNIQUE] INDEX <index> ON <table> [USING type] (<cols>);
```

`USING type` chỉ render khi:

- `config.supportsIndexUsing`.
- `idx.type` tồn tại.
- `idx.type !== "BTREE"`.

`DROP_INDEX`:

```sql
DROP INDEX <index>;
```

`MODIFY_INDEX`:

1. Drop old index.
2. Create new index.

## 8. DOWN migration ordering

DOWN script đảo ngược UP theo thứ tự:

```text
1. Reverse index changes
2. Reverse constraint changes
3. Reverse column changes
4. Reverse table changes
```

### 8.1. Reverse indexes

- `CREATE_INDEX` -> `DROP INDEX`.
- `DROP_INDEX` -> `CREATE INDEX`.
- `MODIFY_INDEX` -> gọi `generateIndexUp` nhưng swap `oldIndex` và `newIndex`.

Lưu ý: reverse `DROP_INDEX` hiện tạo `CREATE INDEX` nhưng không render `USING` dù index type non-BTREE, vì đoạn này viết SQL inline và không dùng logic `supportsIndexUsing`.

### 8.2. Reverse constraints

Rule:

- `ADD_PK` -> drop PK.
- `DROP_PK` -> add PK lại.
- `ADD_FK` -> drop FK.
- `DROP_FK` -> add FK lại.
- `ADD_UNIQUE` -> drop unique.
- `DROP_UNIQUE` -> add unique lại.

Lưu ý: reverse constraint switch hiện không có case `MODIFY_FK`. Vì vậy DOWN cho `MODIFY_FK` không được sinh đầy đủ ở đoạn reverse constraint hiện tại.

### 8.3. Reverse columns

`ADD_COLUMN` -> `DROP COLUMN`.

`DROP_COLUMN` -> `ADD COLUMN` lại với type/null/default cũ.

`MODIFY_COLUMN`:

- Type/length -> `ALTER COLUMN TYPE <oldType>`.
- Nullable -> set/drop not null theo `oldValue`.
- Default -> set/drop default theo `oldValue`.

Giống UP, reverse modify không xử lý `unique`/`autoIncrement` trực tiếp.

### 8.4. Reverse tables

`CREATE_TABLE` -> `DROP TABLE IF EXISTS`.

`DROP_TABLE` -> recreate old table bằng `generateTableUp({ type: "CREATE_TABLE", table: oldTable })`.

Khi recreate table cũ:

- Render columns.
- Render PK/unique.
- Render FKs.
- Render indexes.

## 9. Assemble SQL script

Header:

```sql
-- Migration: v<from> → v<to>
-- DBMS: <config.name>
-- Generated: <YYYY-MM-DD>
```

UP:

```sql
<header>

-- UP
<up statements joined by blank lines>
```

DOWN:

```sql
<header>

-- DOWN (rollback v<to> → v<from>)
<down statements joined by blank lines>
```

Nếu không có statement:

```sql
-- No changes
```

## 10. UI trong Version History

Migration tab dùng `migrationResult`.

Action bar:

- Copy UP.
- Copy DOWN.
- Download UP: `migration_up_v<from>_to_v<to>.sql`.
- Download DOWN: `migration_down_v<to>_to_v<from>.sql`.

Preview:

- Dùng `LazyDiffEditor`.
- `original = migrationResult.up`.
- `modified = migrationResult.down`.
- Language `sql`.

DBMS selector nằm trong Version History diff panel và được truyền vào `generateMigration`.

## 11. Ví dụ flow

Old model:

```text
users(id PK, name varchar(100))
```

New model:

```text
users(id PK, name varchar(150), email varchar(255) unique)
posts(id PK, user_id FK -> users.id)
```

Diff:

```text
CREATE_TABLE posts
MODIFY_COLUMN users.name length 100 -> 150
ADD_COLUMN users.email
ADD_UNIQUE users.email
```

UP gần đúng:

```sql
ALTER TABLE "users" ALTER COLUMN "name" TYPE VARCHAR(150);

ALTER TABLE "users" ADD COLUMN "email" VARCHAR(255);

ALTER TABLE "users" ADD CONSTRAINT "uq_users_email" UNIQUE ("email");

CREATE TABLE "posts" (...);
ALTER TABLE "posts" ADD CONSTRAINT "fk_posts_user_id"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id");
```

DOWN gần đúng:

```sql
ALTER TABLE "users" DROP CONSTRAINT "uq_users_email";

ALTER TABLE "users" DROP COLUMN "email";

ALTER TABLE "users" ALTER COLUMN "name" TYPE VARCHAR(100);

DROP TABLE IF EXISTS "posts";
```

Thứ tự thực tế phụ thuộc thứ tự arrays trong `diff`.

## 12. Những giới hạn và điểm cần chú ý

1. Diff matching dựa trên name, không dựa trên id. Rename table/column/index bị hiểu thành drop + create.
2. Migration chỉ hỗ trợ Physical model.
3. Generator dùng cú pháp `ALTER TABLE ... ALTER COLUMN ... TYPE ...`, gần PostgreSQL hơn; MySQL/SQL Server có thể cần syntax khác.
4. `DROP CONSTRAINT` cũng không branch theo DBMS; MySQL cần syntax riêng cho FK/index/unique trong nhiều trường hợp.
5. FK referenced column resolve bằng primary key đầu tiên của target table, không dùng `refColumnId`.
6. Column modifications detect `unique` và `autoIncrement`, nhưng migration column generator không sinh SQL trực tiếp cho hai field này.
7. Unique được xử lý qua constraint changes cho non-PK unique columns.
8. Auto increment changes hiện không có SQL migration.
9. Reverse DOWN chưa xử lý `MODIFY_FK` trong switch constraint reverse.
10. Reverse `DROP_INDEX` không render `USING type`.
11. DROP table không drop FK constraints trước và không topological sort.
12. CREATE table tự render FK và indexes trong `generateTableUp`; ngoài ra constraint/index changes cũng có thể sinh thêm nếu diff chứa thay đổi tương ứng.
13. Default value được append nguyên văn, không quote/escape theo DBMS.
14. Quote helper chỉ bọc identifier, không escape quote char bên trong tên.
15. No transaction wrapper (`BEGIN/COMMIT`) và không có safety guard.
16. Không có data migration/backfill cho NOT NULL column mới hoặc type conversion phức tạp.

## 13. Bảng tóm tắt thuật toán

| Bước | Hàm/code | Kết quả |
|---|---|---|
| Normalize model | `normalizeTable` | Physical model -> table/column/index snapshot |
| Diff tables | `diffSchemas` table-level | CREATE_TABLE / DROP_TABLE |
| Diff columns | `diffSchemas` column-level | ADD/DROP/MODIFY_COLUMN |
| Diff constraints | `diffSchemas` constraint-level | PK/FK/unique changes |
| Diff indexes | `diffSchemas` index-level | CREATE/DROP/MODIFY_INDEX |
| Resolve DBMS | `getDBMSConfig` | quote char, serial type, index using |
| Column type SQL | `columnTypeDDL` | data type + length/serial mapping |
| Generate UP | `generateMigration` UP section | Drop/create tables, columns, constraints, indexes |
| Generate DOWN | reverse logic | Rollback SQL |
| Assemble | header + `-- UP`/`-- DOWN` | Final SQL scripts |
