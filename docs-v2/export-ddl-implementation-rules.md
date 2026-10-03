# Export DDL: Thuật toán generate SQL từ Physical Model

Tài liệu này mô tả cách tính năng Export DDL hiện thực thuật toán chuyển `PhysicalModelPayload` thành SQL script. Phần UI chỉ được mô tả sơ lược; trọng tâm là các bước xử lý model, sort dependency, collect FK, build statement và assemble script.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Nơi mở modal Export DDL trong màn Edit Project | `src/components/EditProject/index.tsx` |
| Modal chọn DBMS/options và preview SQL | `src/components/EditProject/components/DDLExportModal/index.tsx` |
| Thuật toán generate SQL DDL | `src/components/EditProject/utils/ddl-generator.ts` |
| Config DBMS: quote char, serial type, IF NOT EXISTS, index USING | `src/components/EditProject/utils/dbms-config.ts` |
| Shape input `PhysicalModelPayload` | `src/components/EditProject/utils/physical-model.builder.ts` |
| DDL Diff trong Version History, dùng lại `generateDDL` | `src/components/EditProject/components/VersionHistoryDrawer/index.tsx` |
| Migration SQL, liên quan version nhưng không phải export DDL thường | `src/components/EditProject/utils/migration-generator.ts` |

## 2. Flow UI sơ lược

Export DDL chỉ mở được khi schema hiện tại là Physical:

```tsx
onExportDDL={isPhysicalSchema ? () => setIsDDLExportOpen(true) : undefined}
```

Trong modal:

1. User chọn DBMS và các option.
2. Modal gọi `generateDDL(model, options)` bằng `useMemo`.
3. SQL được preview trong Monaco read-only.
4. User copy hoặc download `.sql`.

Điểm cần nhớ: modal nhận `model={_physicalModelData}` từ collaboration hook. Nó không rebuild model trực tiếp từ `nodes/edges` ngay tại thời điểm bấm export.

## 3. Input và output của thuật toán

Hàm chính:

```ts
generateDDL(model: PhysicalModelPayload, options: DDLOptions): DDLResult
```

File: `src/components/EditProject/utils/ddl-generator.ts`.

### 3.1. Input model

Generator nhận `PhysicalModelPayload`:

```ts
export type PhysicalModelPayload = {
    model: {
        id: string;
        name: string;
        version: number;
        dbms?: DBMSType;
        description?: string;
        notes?: string;
    };
    tables: ModelTable[];
};
```

Các field generator đang dùng:

- Table: `id`, `name`, `columns`, `indexes`.
- Column: `name`, `dataType`, `length`, `nullable`, `unique`, `autoIncrement`, `defaultValue`, `roles.primaryKey`, `roles.foreignKey`.
- FK role: `refTableId`, `refColumnId`, `onDelete`, `onUpdate`.
- Index: `name`, `type`, `columns`, `isUnique`.

### 3.2. Input options

```ts
export type DDLOptions = {
    dbms: DBMSType;
    includeCreateTable: boolean;
    includeForeignKeys: boolean;
    includeIndexes: boolean;
    includeDropIfExists: boolean;
    includeIfNotExists: boolean;
};
```

Default:

```ts
{
    dbms: "postgresql",
    includeCreateTable: true,
    includeForeignKeys: true,
    includeIndexes: true,
    includeDropIfExists: false,
    includeIfNotExists: false,
}
```

Modal reset options về default mỗi lần mở, nên DBMS mặc định là PostgreSQL. `model.model.dbms` hiện không được dùng làm default.

### 3.3. Output

```ts
export type DDLResult = {
    sql: string;
    statements: DDLStatement[];
    warnings: string[];
};
```

`statements` là danh sách statement đã được build, mỗi item có:

```ts
{
    type: "DROP_TABLE" | "CREATE_TABLE" | "ALTER_TABLE_FK" | "CREATE_INDEX";
    tableName: string;
    sql: string;
}
```

`sql` là full script đã ghép header và các section.

## 4. Pipeline thuật toán tổng quát

Pseudo-code đúng với flow trong `generateDDL`:

```ts
function generateDDL(model, options) {
    config = getDBMSConfig(options.dbms)
    warnings = []
    statements = []

    tableIdToName = buildTableIdToName(model.tables)

    tables = normalizePhysicalModelToTableInfo(model.tables)

    sorted = topologicalSort(tables, tableIdToName)

    allFKs = collectForeignKeys(sorted, tables, tableIdToName, warnings)

    if options.includeIfNotExists && !config.supportsIfNotExists:
        warnings.push(...)

    if options.includeDropIfExists:
        for table in reverse(sorted):
            statements.push(buildDropTable(table))

    if options.includeCreateTable:
        for table in sorted:
            statements.push(buildCreateTable(table))

    if options.includeForeignKeys:
        for fk in allFKs:
            statements.push(buildAlterTableFK(fk))

    if options.includeIndexes:
        for table in sorted:
            for index in table.indexes:
                statements.push(buildCreateIndex(table, index))

    sql = assembleSections(statements, config)

    return { sql, statements, warnings }
}
```

Các bước quan trọng nhất là:

- Normalize model sang cấu trúc nội bộ `TableInfo[]`.
- Sort table theo FK dependency.
- Collect FK thành danh sách `FKInfo[]`.
- Build SQL theo thứ tự cố định: DROP -> CREATE TABLE -> ALTER FK -> CREATE INDEX.

## 5. DBMS config ảnh hưởng thuật toán như nào

Config nằm trong `src/components/EditProject/utils/dbms-config.ts`.

Generator dùng trực tiếp các field:

- `quoteChar`: cách quote identifier.
- `serialTypes`: mapping type `serial`, `bigserial`, `smallserial`.
- `supportsIfNotExists`: có được render `CREATE TABLE IF NOT EXISTS` không.
- `supportsIndexUsing`: có được render `USING <indexType>` không.
- `name`: ghi vào header và warning.

### 5.1. Lấy config

```ts
const config = getDBMSConfig(options.dbms);
```

Nếu `options.dbms` không hợp lệ, `getDBMSConfig` fallback PostgreSQL.

### 5.2. Quote identifier

Helper:

```ts
const quote = (name, config) => {
    const [open, close] = config.quoteChar;
    return `${open}${name}${close}`;
};
```

Rule:

- MySQL: `` `table` ``.
- PostgreSQL: `"table"`.
- SQL Server: `[table]`.

Mọi table name, column name, constraint name, index name đều đi qua helper này.

Lưu ý: helper hiện chỉ bọc quote, không escape quote char nằm bên trong identifier.

### 5.3. Serial type

Trong `buildColumnDDL`, nếu `col.dataType` lowercase có trong `config.serialTypes`, generator dùng mapping DBMS-specific.

Ví dụ:

| Logical dataType | PostgreSQL | MySQL | SQL Server |
|---|---|---|---|
| `serial` | `SERIAL` | `INT AUTO_INCREMENT` | `INT IDENTITY(1,1)` |
| `bigserial` | `BIGSERIAL` | `BIGINT AUTO_INCREMENT` | `BIGINT IDENTITY(1,1)` |

Quan trọng: field `autoIncrement` có trong `ColumnInfo`, nhưng `buildColumnDDL` hiện không dùng field này trực tiếp. Muốn export auto increment hiện tại thì column cần có `dataType` dạng serial-like.

### 5.4. IF NOT EXISTS

Nếu user bật `includeIfNotExists`:

- DBMS support thì render `CREATE TABLE IF NOT EXISTS`.
- DBMS không support thì bỏ `IF NOT EXISTS` và thêm warning.

Hiện tại:

- MySQL: support.
- PostgreSQL: support.
- SQL Server: không support.

### 5.5. Index USING

Trong `buildCreateIndex`:

- Nếu `config.supportsIndexUsing === true`.
- Và `idx.type` tồn tại.
- Và `idx.type !== "BTREE"`.
- Thì thêm `USING ${idx.type}`.

Ví dụ PostgreSQL:

```sql
CREATE INDEX "idx_docs_body" ON "docs" USING GIN ("body" ASC);
```

SQL Server không render `USING` vì `supportsIndexUsing: false`.

## 6. Normalize PhysicalModelPayload sang TableInfo

Mục đích của bước normalize là chuyển model application sang format đơn giản để generator không phụ thuộc trực tiếp vào shape lớn của physical model.

Input `model.tables` được map thành:

```ts
type TableInfo = {
    id: string;
    name: string;
    columns: ColumnInfo[];
    indexes: IndexInfo[];
};
```

Column được normalize thành:

```ts
type ColumnInfo = {
    name: string;
    dataType: string;
    length?: string;
    nullable: boolean;
    unique: boolean;
    autoIncrement?: boolean;
    defaultValue?: string;
    isPrimaryKey: boolean;
    foreignKey?: {
        refTableId: string;
        refColumnId: string;
        onDelete?: FKAction;
        onUpdate?: FKAction;
    };
};
```

Rule normalize:

- `dataType = c.dataType ?? "varchar"`.
- `nullable = c.nullable ?? true`.
- `unique = c.unique ?? false`.
- `isPrimaryKey = c.roles?.primaryKey ?? false`.
- `foreignKey = c.roles?.foreignKey` nếu có.
- `indexes = t.indexes ?? []`.

Hệ quả:

- Column thiếu type sẽ export thành `VARCHAR`.
- Column thiếu nullable sẽ được xem là nullable.
- Column thiếu unique sẽ không có unique constraint.
- FK chỉ tồn tại nếu nằm trong `roles.foreignKey`.

## 7. Thuật toán topological sort table

Hàm: `topologicalSort(tables, tableIdToName)`.

Mục đích:

- Khi `CREATE TABLE`, bảng cha phải xuất hiện trước bảng con.
- Khi `DROP TABLE`, bảng con phải bị drop trước bảng cha.

### 7.1. Build dependency graph

Với mỗi table:

1. Tạo `deps[table.name] = Set()`.
2. Duyệt từng column.
3. Nếu column có FK:
   - Lấy `refName = tableIdToName.get(fk.refTableId)`.
   - Nếu ref table tồn tại trong cùng model.
   - Và ref table không phải chính table hiện tại.
   - Thì thêm dependency: `table.name` phụ thuộc `refName`.

Nói cách khác:

```text
orders.customer_id -> customers.id
=> orders phụ thuộc customers
=> customers cần đứng trước orders khi CREATE
```

Self-FK không tạo dependency để tránh tự-cycle không cần thiết.

### 7.2. DFS sort

Code dùng DFS với 3 trạng thái:

- `visited`: đã xử lý xong.
- `visiting`: đang nằm trên recursion stack.
- `hasCycle`: phát hiện cycle.

Pseudo-code:

```ts
visit(tableName):
    if tableName in visited:
        return

    if tableName in visiting:
        hasCycle = true
        return

    visiting.add(tableName)

    for dep in deps[tableName]:
        visit(dep)
        if hasCycle:
            return

    visiting.delete(tableName)
    visited.add(tableName)
    sorted.push(table)
```

Khi table phụ thuộc vào parent, DFS sẽ visit parent trước rồi mới push child.

### 7.3. Cycle fallback

Nếu phát hiện cycle, hàm trả lại `tables` theo thứ tự gốc.

Ví dụ cycle:

```text
a.b_id -> b.id
b.a_id -> a.id
```

Với cycle, generator không cố phá cycle bằng cách tách FK thông minh hơn, vì FK vốn đã được xuất sau `CREATE TABLE`. Việc fallback thứ tự gốc giúp vẫn tạo được `CREATE TABLE`, còn FK sẽ được thêm bằng `ALTER TABLE` sau.

## 8. Thuật toán collect foreign keys

Sau khi sort table, generator tạo `allFKs: FKInfo[]`.

```ts
type FKInfo = {
    constraintName: string;
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    onDelete?: FKAction;
    onUpdate?: FKAction;
};
```

### 8.1. Rule collect FK

Với từng table trong `sorted`, từng column:

1. Nếu column không có `foreignKey`, bỏ qua.
2. Lấy target table name bằng `tableIdToName.get(fk.refTableId)`.
3. Nếu không tìm thấy target table:
   - Thêm warning.
   - Skip FK này.
4. Nhóm các column của cùng một table theo `refTableId` (ứng viên của một FK tổ hợp).
5. Với mỗi column, tìm target column bằng `refColumnId` (fallback: PK đầu tiên của target table, rồi `"id"`).
6. Nếu nhóm có >= 2 column, các target column khác nhau và **đúng bằng tập PK của target table** thì sinh **một FK tổ hợp** (cột nguồn và cột đích cùng thứ tự theo PK của bảng đích). Ngược lại mỗi column là một FK riêng.
7. Tạo constraint name: `fk_${sourceTable}_${sourceColumns.join("_")}`.
8. `onDelete/onUpdate` lấy từ column đầu tiên có khai báo.
9. Push vào `allFKs` (`FKInfo.sourceColumns/targetColumns` là mảng).

### 8.2. Điểm rất quan trọng về refColumnId

Physical FK role có `refColumnId`. Generator dùng `refColumnId` để tìm đúng target column (`ColumnInfo` giữ `id`):

```ts
targetTable.columns.find(c => c.id === fk.refColumnId) ?? targetPk[0]
```

Trước đây generator luôn lấy PK đầu tiên của target table và mỗi column tạo một FK riêng, nên FK tổ hợp `(journal_id, issue_number, date_issued) -> issue` bị xuất thành 3 FK cùng trỏ `issue(journal_id)` (script không chạy được). Hiện FK tổ hợp được gom thành một `FOREIGN KEY (a, b, c) REFERENCES t (a, b, c)`.

### 8.3. Vì sao FK được tách thành ALTER TABLE

Generator không inline FK trong `CREATE TABLE`.

Nó luôn xuất FK sau phần tạo bảng:

```sql
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer_id"
    FOREIGN KEY ("customer_id") REFERENCES "customers" ("id");
```

Lợi ích:

- Giảm vấn đề thứ tự tạo bảng.
- Cycle FK vẫn có khả năng tạo table trước rồi add FK sau.
- Dễ bật/tắt FK bằng option `includeForeignKeys`.

Giới hạn:

- Mỗi FK hiện là column-level FK đơn.
- Composite FK không được export thành constraint nhiều cột.

## 9. Thứ tự sinh statement

Sau khi có `sorted` và `allFKs`, generator build statement theo thứ tự cố định.

### 9.1. DROP TABLE

Điều kiện: `options.includeDropIfExists === true`.

Rule:

- Dùng `reverse(sorted)`.
- Child table drop trước parent table.
- Mỗi statement:

```sql
DROP TABLE IF EXISTS <quoted tableName>;
```

Không có `CASCADE`. Không kiểm tra DBMS support `DROP TABLE IF EXISTS`.

### 9.2. CREATE TABLE

Điều kiện: `options.includeCreateTable === true`.

Rule:

- Dùng `sorted`.
- Parent table đứng trước child table.
- Mỗi table gọi `buildCreateTable(table, config, options)`.

### 9.3. ALTER TABLE FK

Điều kiện: `options.includeForeignKeys === true`.

Rule:

- Duyệt `allFKs` theo thứ tự collect từ `sorted`.
- Mỗi FK gọi `buildAlterTableFK`.

### 9.4. CREATE INDEX

Điều kiện: `options.includeIndexes === true`.

Rule:

- Duyệt table theo `sorted`.
- Duyệt `table.indexes`.
- Mỗi index gọi `buildCreateIndex`.

### 9.5. Tóm tắt thứ tự

```text
1. DROP TABLE          reverse(sorted)
2. CREATE TABLE        sorted
3. ALTER TABLE FK      allFKs
4. CREATE INDEX        sorted + indexes
```

## 10. Rule build từng loại SQL

### 10.1. buildColumnDDL

Input: `ColumnInfo`.

Output: một dòng column trong `CREATE TABLE`.

Thuật toán:

1. Bắt đầu bằng quoted column name.
2. Resolve data type:
   - Lowercase `col.dataType`.
   - Nếu có trong `config.serialTypes`, dùng mapping serial.
   - Nếu không, dùng `col.dataType.toUpperCase()`.
   - Nếu có `col.length`, append `(${length})`.
3. Nếu `nullable === false`, thêm `NOT NULL`.
4. Nếu `defaultValue !== undefined` và khác chuỗi rỗng, thêm `DEFAULT ${defaultValue}`.

Ví dụ:

```sql
"id" SERIAL NOT NULL
"name" VARCHAR(100) NOT NULL
"created_at" TIMESTAMP DEFAULT NOW()
```

Lưu ý:

- `defaultValue` được chèn nguyên văn, không tự quote string.
- `unique` không render ở column line, mà render thành table-level constraint.
- `primaryKey` không render inline, mà render thành table-level constraint.
- `autoIncrement = true` với cột `int/integer/mediumint/bigint/smallint` được render như kiểu serial của DBMS (PostgreSQL `SERIAL/BIGSERIAL/SMALLSERIAL`, MySQL `INT AUTO_INCREMENT`/`BIGINT AUTO_INCREMENT`, SQL Server `INT IDENTITY(1,1)`/`BIGINT IDENTITY(1,1)`), giống kiểu `serial`; các kiểu khác giữ nguyên.

### 10.2. buildCreateTable

Input: `TableInfo`, `DBMSConfig`, `DDLOptions`.

Thuật toán:

1. Tạo `lines = []`.
2. Với mỗi column, push dòng `buildColumnDDL`.
3. Tìm `pkColumns = table.columns.filter(c => c.isPrimaryKey)`.
4. Nếu có PK, push table-level constraint:

```sql
CONSTRAINT <quoted pk_tableName> PRIMARY KEY (<quoted pk cols>)
```

5. Với mỗi column `unique === true` và không phải PK, push unique constraint:

```sql
CONSTRAINT <quoted uq_table_column> UNIQUE (<quoted column>)
```

6. Build header:

```sql
CREATE TABLE[ IF NOT EXISTS] <quoted tableName>
```

7. Join lines bằng `,\n`.

Ví dụ:

```sql
CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    CONSTRAINT "pk_users" PRIMARY KEY ("id"),
    CONSTRAINT "uq_users_email" UNIQUE ("email")
);
```

### 10.3. buildAlterTableFK

Input: `FKInfo`.

Thuật toán:

1. Render header:

```sql
ALTER TABLE <sourceTable> ADD CONSTRAINT <constraintName>
```

2. Render FK clause:

```sql
FOREIGN KEY (<sourceColumns>) REFERENCES <targetTable> (<targetColumns>)
```

(danh sách cột phân tách bằng dấu phẩy; một cột với FK đơn, nhiều cột với FK tổ hợp)

3. Nếu `onDelete` tồn tại và khác `"NO ACTION"`, append:

```sql
ON DELETE <action>
```

4. Nếu `onUpdate` tồn tại và khác `"NO ACTION"`, append:

```sql
ON UPDATE <action>
```

Ví dụ:

```sql
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer_id"
    FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE CASCADE;
```

### 10.4. buildCreateIndex

Input: table name và `IndexInfo`.

Thuật toán:

1. Nếu `idx.isUnique`, dùng `CREATE UNIQUE INDEX`; ngược lại `CREATE INDEX`.
2. Quote index name và table name.
3. Render từng column:

```sql
<quoted columnName> <order || "ASC">
```

4. Nếu DBMS support `USING` và `idx.type !== "BTREE"`, thêm:

```sql
USING <idx.type>
```

Ví dụ:

```sql
CREATE INDEX "idx_orders_created_at" ON "orders" ("created_at" DESC);
CREATE INDEX "idx_docs_body" ON "docs" USING GIN ("body" ASC);
```

Lưu ý: MySQL config hiện `supportsIndexUsing: true`, nên non-BTREE index type có thể được render bằng `USING`. SQL Server không render `USING`.

### 10.5. buildDropTable

Rule hiện tại:

```sql
DROP TABLE IF EXISTS <quoted tableName>;
```

Không có `CASCADE`, không có `DROP CONSTRAINT`, không branch theo DBMS.

## 11. Assemble full SQL script

Sau khi đã có `statements`, generator build full script.

Header:

```sql
-- Generated by DBFlow
-- DBMS: <config.name>
-- Date: <YYYY-MM-DD>
```

Sau đó tách statements thành 4 nhóm:

- `DROP_TABLE`.
- `CREATE_TABLE`.
- `ALTER_TABLE_FK`.
- `CREATE_INDEX`.

Nếu nhóm nào có statement thì tạo section:

```sql
-- Drop Tables
...

-- Tables
...

-- Foreign Keys
...

-- Indexes
...
```

Join rule:

- Tables và FK cách nhau bằng dòng trống giữa statements.
- Indexes join liền từng dòng.
- Header luôn tồn tại dù không có statement.

## 12. Ví dụ thuật toán end-to-end

Giả sử model có:

```text
customers(id PK)
orders(id PK, customer_id FK -> customers.id)
idx_orders_created_at on orders(created_at DESC)
```

### 12.1. Normalize

```ts
tables = [
    {
        name: "customers",
        columns: [{ name: "id", isPrimaryKey: true }],
    },
    {
        name: "orders",
        columns: [
            { name: "id", isPrimaryKey: true },
            {
                name: "customer_id",
                foreignKey: { refTableId: "customers_id", refColumnId: "customers_id_col" },
            },
        ],
        indexes: [{ name: "idx_orders_created_at", columns: [{ columnName: "created_at", order: "DESC" }] }],
    },
]
```

### 12.2. Dependency graph

```text
customers -> []
orders -> [customers]
```

Sorted:

```text
customers, orders
```

### 12.3. Statements

Với default options:

```text
CREATE_TABLE customers
CREATE_TABLE orders
ALTER_TABLE_FK orders.customer_id
CREATE_INDEX idx_orders_created_at
```

SQL PostgreSQL gần đúng:

```sql
-- Generated by DBFlow
-- DBMS: PostgreSQL
-- Date: 2026-06-14

-- Tables
CREATE TABLE "customers" (
    "id" VARCHAR NOT NULL,
    CONSTRAINT "pk_customers" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" VARCHAR NOT NULL,
    "customer_id" VARCHAR,
    CONSTRAINT "pk_orders" PRIMARY KEY ("id")
);

-- Foreign Keys
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer_id"
    FOREIGN KEY ("customer_id") REFERENCES "customers" ("id");

-- Indexes
CREATE INDEX "idx_orders_created_at" ON "orders" ("created_at" DESC);
```

## 13. DDL Diff trong Version History

Version History có tab `DDL Diff` cho physical schema. Tính năng này không phải Export DDL thường, nhưng dùng cùng thuật toán `generateDDL`.

Flow sơ lược:

1. User chọn hai version.
2. Code có `diffResult.oldModel` và `diffResult.newModel`.
3. Khi tab là DDL Diff:

```ts
const opts = { ...DEFAULT_DDL_OPTIONS, dbms };
const oldDDL = generateDDL(diffResult.oldModel, opts);
const newDDL = generateDDL(diffResult.newModel, opts);
```

Kết quả là diff giữa hai full generated DDL script. Migration tab dùng `generateMigration`, không dùng `generateDDL`, nhưng vẫn dùng DBMS config.

## 14. Những điểm cần chú ý khi maintain

1. Export DDL chỉ khả dụng cho Physical schema.
2. Modal reset DBMS về PostgreSQL mỗi lần mở.
3. `generateDDL` dùng `options.dbms`, không dùng trực tiếp `model.model.dbms`.
4. `autoIncrement` chưa được render trực tiếp; hiện phụ thuộc serial-like `dataType`.
5. Helper `isSerialType` đang khai báo nhưng chưa được dùng.
6. FK target column hiện resolve bằng PK đầu tiên của target table, không dùng `foreignKey.refColumnId`.
7. Composite FK không được export đúng dạng multi-column constraint.
8. FK luôn được tách thành `ALTER TABLE` sau `CREATE TABLE`.
9. Topological sort fallback thứ tự gốc nếu có cycle.
10. `DROP TABLE IF EXISTS` luôn render `IF EXISTS`, không kiểm tra DBMS support.
11. `DEFAULT` được append nguyên chuỗi, không normalize quote/function theo DBMS.
12. `includeIfNotExists` với SQL Server sinh warning và không thêm `IF NOT EXISTS`.
13. SQL Server không render index type vì `supportsIndexUsing: false`.
14. Quote helper chưa escape identifier chứa quote char.
15. Unique column được render thành table-level unique constraint, không render inline.

## 15. Bảng tóm tắt thuật toán

| Bước | Code | Kết quả |
|---|---|---|
| Lấy DBMS config | `getDBMSConfig(options.dbms)` | Có quote char, serial mapping, feature flags |
| Build lookup | `tableIdToName` | Resolve FK target table id -> name |
| Normalize model | map `PhysicalModelPayload.tables` -> `TableInfo[]` | Dữ liệu gọn cho generator |
| Sort dependency | `topologicalSort` | Parent trước child khi create |
| Collect FK | loop columns có `foreignKey` | Tạo `FKInfo[]` |
| Warning IF NOT EXISTS | check `supportsIfNotExists` | Cảnh báo DBMS không support |
| Build DROP | `reverse(sorted)` + `buildDropTable` | Drop child trước parent |
| Build CREATE TABLE | `sorted` + `buildCreateTable` | Tạo bảng, PK, unique |
| Build FK | `allFKs` + `buildAlterTableFK` | Tạo `ALTER TABLE ADD CONSTRAINT` |
| Build INDEX | `sorted.table.indexes` + `buildCreateIndex` | Tạo index |
| Assemble script | group statement by type | Header + sections SQL |
