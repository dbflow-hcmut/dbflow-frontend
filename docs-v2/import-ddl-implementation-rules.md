# Import DDL: Thuật toán parser và mapping vào Physical Model

Tài liệu này mô tả luồng Import DDL hiện tại, nhưng trọng tâm là logic thuật toán: validate DDL, parse SQL thành cấu trúc trung gian, resolve PK/FK/index, rồi convert thành `PhysicalModelPayload`.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Modal Import DDL trong Edit Project | `src/components/EditProject/components/DDLImportModal/index.tsx` |
| Parser, validator, mapping DDL -> PhysicalModelPayload | `src/components/EditProject/utils/ddl-parser.ts` |
| Nơi modal được render và apply model vào diagram | `src/components/EditProject/index.tsx` |
| Shape của Physical model | `src/components/EditProject/utils/physical-model.builder.ts` |
| DBMS type và FK action type | `src/components/EditProject/utils/dbms-config.ts` |
| Modal import DDL khác, dùng chung parser | `src/components/ImportDDLModal/index.tsx` |

## 2. Flow UI sơ lược

Trong `EditProject`, `DDLImportModal` được render ở `src/components/EditProject/index.tsx:2236`.

Khi import thành công:

```tsx
onImport={(model) => {
    if (physicalMutateModel) {
        physicalMutateModel(() => model);
    }
}}
```

Vị trí: `src/components/EditProject/index.tsx:2239`.

Tức là DDL import không merge từng table vào model cũ. Nó thay model physical hiện tại bằng model mới parse được từ DDL.

Trong modal:

1. User paste DDL.
2. `validateDDLSyntax(ddlText)` chạy để tạo marker lỗi/cảnh báo trong Monaco.
3. Nếu không có syntax error, `parseDDL(ddlText)` chạy để tạo parse result.
4. Nếu parse result không có blocking error và có ít nhất 1 table, nút Import được enable.
5. Khi bấm Import, `ddlToPhysicalModel(parseResult, diagramName || "Imported Schema")` convert sang `PhysicalModelPayload`.
6. `onImport(model)` apply model vào physical collaboration state.

Vị trí:

- Validate markers trong editor: `src/components/EditProject/components/DDLImportModal/index.tsx:94`.
- Tính `syntaxErrors`: `src/components/EditProject/components/DDLImportModal/index.tsx:121`.
- Parse DDL: `src/components/EditProject/components/DDLImportModal/index.tsx:126`.
- Điều kiện `canImport`: `src/components/EditProject/components/DDLImportModal/index.tsx:136`.
- Convert và import: `src/components/EditProject/components/DDLImportModal/index.tsx:138`.

## 3. Input/Output của parser

File chính: `src/components/EditProject/utils/ddl-parser.ts`.

### 3.1. ParsedColumn

Mỗi column parse ra gồm:

- `name`.
- `dataType`.
- `length`.
- `nullable`.
- `unique`.
- `autoIncrement`.
- `defaultValue`.
- `isPrimaryKey`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:9`.

### 3.2. ParsedForeignKey

Mỗi FK parse ra gồm:

- `columns`: danh sách source columns.
- `refTable`: target table.
- `refColumns`: danh sách target columns.
- `onDelete`.
- `onUpdate`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:20`.

### 3.3. ParsedIndex

Mỗi index parse ra gồm:

- `name`.
- `columns`: danh sách `{ columnName, order }`.
- `isUnique`.
- `resolvedType`: `BTREE`, `HASH`, `GIN`, `GIST`, `BRIN`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:28`.

### 3.4. DDLParseResult

Parser trả về:

- `tables`: danh sách table parse được.
- `errors`: lỗi blocking, không cho import.
- `warnings`: cảnh báo non-blocking, vẫn cho import.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:43`.

## 4. Validation trước khi parse

Hàm: `validateDDLSyntax(sql)` tại `src/components/EditProject/utils/ddl-parser.ts:64`.

Validator này không parse SQL đầy đủ. Nó kiểm tra các lỗi cấu trúc phổ biến để feedback sớm trong editor.

### 4.1. Mask comment nhưng giữ vị trí dòng/cột

Trước khi validate, code tạo `masked`:

- Block comment `/* ... */` được thay nội dung bằng khoảng trắng, giữ newline.
- Single-line comment `-- ...` được thay bằng khoảng trắng.

Mục đích: comment không làm sai vị trí line/column của marker.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:67`.

### 4.2. Check ngoặc không cân bằng

Code duyệt từng ký tự:

- Gặp `(` thì push vào stack.
- Gặp `)` mà stack rỗng thì tạo error `Unexpected ")"`.
- Sau khi duyệt xong, stack còn phần tử thì tạo error `Unclosed "("`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:76`.

### 4.3. CREATE INDEX thiếu semicolon

Validator tìm dòng có `CREATE INDEX`, nhìn tối đa 5 dòng sau để tìm `)`.

- Nếu sau dấu `)` không có `;`, tạo warning.
- Đây là warning, không block import.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:110`.

### 4.4. CREATE TABLE thiếu semicolon

Validator tìm pattern:

```regex
CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s*\(
```

Sau đó tìm dấu `)` đóng outermost parentheses. Nếu sau `)` không có `;`, tạo error.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:138`.

### 4.5. REFERENCES thiếu column list

Validator kiểm tra `REFERENCES` phải có column list:

```sql
REFERENCES users(id)
```

Nếu chỉ có:

```sql
REFERENCES users
```

thì tạo error.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:169`.

Lưu ý: parser hiện yêu cầu FK có explicit referenced columns.

## 5. Helper preprocessing và tokenization

Các helper quan trọng:

### 5.1. stripComments

Xóa:

- `-- single line comment`.
- `/* multi line comment */`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:207`.

### 5.2. unquote

Gỡ quote identifier:

- `"name"` -> `name`.
- `` `name` `` -> `name`.
- `[name]` -> `name`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:216`.

### 5.3. stripSchemaPrefix

Gỡ schema prefix, chỉ giữ table name cuối:

- `public.users` -> `users`.
- `"public"."users"` -> `users`.
- `` `public`.`users` `` -> `users`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:232`.

### 5.4. splitTopLevelCommas

Split phần body trong `CREATE TABLE (...)` theo dấu phẩy top-level, không split dấu phẩy nằm trong ngoặc.

Mục đích:

- `DECIMAL(10,2)` không bị split thành 2 phần.
- Composite PK/FK như `PRIMARY KEY (a, b)` không làm hỏng parser.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:244`.

### 5.5. extractParenContent và parseColumnList

`extractParenContent` lấy nội dung trong cặp ngoặc ngoài cùng. `parseColumnList` dùng nó để parse danh sách column trong constraint.

Vị trí:

- `extractParenContent`: `src/components/EditProject/utils/ddl-parser.ts:263`.
- `parseColumnList`: `src/components/EditProject/utils/ddl-parser.ts:289`.

### 5.6. parseFKAction

Map text action sang `FKAction`:

- `CASCADE`.
- `SET NULL`.
- `SET DEFAULT`.
- `RESTRICT`.
- `NO ACTION`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:278`.

## 6. Thuật toán parseDDL

Hàm chính: `parseDDL(sql)` tại `src/components/EditProject/utils/ddl-parser.ts:302`.

### 6.1. Step 1: strip comments

Parser gọi `stripComments(sql)` trước khi regex.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:306`.

### 6.2. Step 2: extract CREATE TABLE statements

Parser dùng regex:

```regex
CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(([^]*?)\)\s*;
```

Ý nghĩa:

- Bắt `CREATE TABLE`.
- Cho phép `IF NOT EXISTS`.
- Capture table identifier.
- Capture body bên trong `(...)`.
- Yêu cầu kết thúc bằng `;`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:308`.

Lưu ý quan trọng: regex này là parser đơn giản, không phải SQL parser đầy đủ. Nó phù hợp với DDL CREATE TABLE phổ biến, nhưng có thể yếu với DDL phức tạp có nested syntax đặc biệt.

### 6.3. Step 3: normalize table name và detect duplicate

Table name được xử lý:

1. Gỡ schema prefix bằng `stripSchemaPrefix`.
2. Normalize key bằng lowercase.
3. Nếu cùng tên table xuất hiện nhiều lần, push warning:

```text
Duplicate table name "<name>" — only the last definition will be used.
```

Vì `tableMap` key theo lowercase name, definition sau sẽ overwrite definition trước.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:315`.

### 6.4. Step 4: split CREATE TABLE body

Body được split bằng `splitTopLevelCommas`.

Mỗi part sau split có thể là:

- Table-level `PRIMARY KEY`.
- Table-level `FOREIGN KEY`.
- Table-level `UNIQUE`.
- Column definition.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:326`.

### 6.5. Step 5: parse table-level PRIMARY KEY

Nếu part match:

```regex
^PRIMARY\s+KEY\b
```

thì parser lấy column list và push vào `primaryKeyColumns`.

Ví dụ:

```sql
PRIMARY KEY (order_id, product_id)
```

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:336`.

### 6.6. Step 6: parse table-level FOREIGN KEY

Nếu part match:

```regex
^(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\b
```

thì parser dùng regex:

```regex
FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\S+)\s*\(([^)]+)\)([^]*)?$
```

Parser lấy:

- Source columns trong `FOREIGN KEY (...)`.
- Ref table sau `REFERENCES`.
- Ref columns trong `REFERENCES table(...)`.
- `ON DELETE ...`.
- `ON UPDATE ...`.

Constraint name nếu có hiện không được lưu vào `ParsedForeignKey`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:343`.

### 6.7. Step 7: parse table-level UNIQUE

Nếu part match:

```regex
^(?:CONSTRAINT\s+\S+\s+)?UNIQUE\b
```

thì parser biến unique constraint thành `ParsedIndex` unique:

- Nếu có `CONSTRAINT <name>` thì dùng tên constraint làm index name.
- Nếu không có constraint name, tự đặt `uq_${tableName}_${cols.join("_")}`.
- Columns có order mặc định `ASC`.
- `isUnique: true`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:366`.

Lưu ý: table-level unique không được map vào `column.unique`; nó trở thành index unique trong physical model.

### 6.8. Step 8: parse column definition

Nếu part không phải table-level constraint, parser xem là column definition.

Regex:

```regex
^(\S+)\s+([\s\S]+)$
```

Capture:

- `colName`: token đầu tiên.
- `colDef`: phần còn lại.

Nếu không match thì push blocking error `Could not parse: ...`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:378`.

### 6.9. Step 9: parse data type và length

Trong column definition, parser lấy data type bằng regex:

```regex
^(\w+)(?:\s*\(([^)]+)\))?
```

Rule:

- `dataType`: token chữ đầu tiên, uppercase.
- `length`: nội dung trong ngoặc nếu có.
- Nếu không match, fallback `VARCHAR`.

Ví dụ:

- `VARCHAR(255)` -> `dataType = "VARCHAR"`, `length = "255"`.
- `DECIMAL(10,2)` -> `dataType = "DECIMAL"`, `length = "10,2"`.
- `NVARCHAR(MAX)` -> `dataType = "NVARCHAR"`, `length = "MAX"`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:388`.

Lưu ý: multi-word type như `DOUBLE PRECISION` hiện chỉ lấy token đầu `DOUBLE`.

### 6.10. Step 10: detect auto increment

Parser set `autoIncrement = true` nếu gặp một trong các pattern:

- `AUTO_INCREMENT`.
- `AUTOINCREMENT`.
- Type là `SERIAL`, `BIGSERIAL`, `SMALLSERIAL`.
- `GENERATED ALWAYS AS IDENTITY`.
- `GENERATED BY DEFAULT AS IDENTITY`.

Với serial-like type:

- `SERIAL` được normalize thành `INTEGER`.
- `BIGSERIAL` được normalize thành `BIGINT`.
- `SMALLSERIAL` được normalize thành `SMALLINT`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:393`.

Lưu ý: SQL Server sample dùng `IDENTITY(1,1)`, nhưng parser hiện không detect pattern `IDENTITY(1,1)` riêng. Nó chỉ detect `GENERATED ... AS IDENTITY`. Đây là giới hạn hiện tại.

### 6.11. Step 11: nullable, unique, inline primary key

Rule:

- `nullable = true` nếu không có `NOT NULL`.
- `unique = true` nếu có keyword `UNIQUE`.
- `isPrimaryKey = true` nếu có `PRIMARY KEY`.
- Nếu là inline primary key thì column `nullable` bị ép `false`.
- Inline PK cũng được push vào `primaryKeyColumns`.

Vị trí:

- Detect nullable/unique/PK: `src/components/EditProject/utils/ddl-parser.ts:407`.
- Push inline PK vào `primaryKeyColumns`: `src/components/EditProject/utils/ddl-parser.ts:435`.
- Push parsed column: `src/components/EditProject/utils/ddl-parser.ts:439`.

### 6.12. Step 12: parse default value

Regex:

```regex
\bDEFAULT\s+('(?:[^'\\]|\\.)*'|\S+)
```

Rule:

- Nếu default là quoted string, parser bỏ quote ngoài cùng.
- Nếu default là token không có space, giữ nguyên.

Ví dụ:

- `DEFAULT 'active'` -> `active`.
- `DEFAULT CURRENT_TIMESTAMP` -> `CURRENT_TIMESTAMP`.
- `DEFAULT GETDATE()` -> `GETDATE()`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:411`.

Lưu ý: default expression có space phức tạp có thể không parse đầy đủ.

### 6.13. Step 13: parse inline REFERENCES

Parser support inline single-column FK:

```sql
user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
```

Regex:

```regex
\bREFERENCES\s+(\S+)\s*\(([^)]+)\)([^]*)?$
```

Parser lấy:

- `refTable`.
- `refCol`.
- `ON DELETE`.
- `ON UPDATE`.

Sau đó push vào `foreignKeys` với `columns: [colName]`.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:418`.

### 6.14. Step 14: parse standalone CREATE INDEX

Sau khi parse tất cả `CREATE TABLE`, parser scan standalone `CREATE INDEX`.

Regex:

```regex
CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)\s+ON\s+(\S+)\s*\(([^)]+)\)(?:\s+USING\s+(\w+))?\s*;?
```

Rule:

- Có `UNIQUE` thì `isUnique = true`.
- Lấy `indexName`.
- Lấy `tableName`, gỡ schema prefix.
- Lấy columns trong `(...)`.
- Nếu thiếu semicolon, push warning.
- `USING` được map sang `BTREE`, `HASH`, `GIN`, `GIST`, `BRIN`; nếu không có hoặc không support thì fallback `BTREE`.
- Column order:
  - Nếu token thứ 2 là `DESC` thì `DESC`.
  - Ngược lại `ASC`.
- Chỉ attach index nếu table đã được parse trong input.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:456`.

Lưu ý: syntax PostgreSQL chuẩn thường là `CREATE INDEX ... ON table USING GIN (col)`, nhưng regex hiện đặt `USING` sau column list: `ON table (col) USING GIN`. Đây là giới hạn implementation hiện tại.

### 6.15. Step 15: blocking error nếu không có table

Nếu không parse được `CREATE TABLE` nào, push error:

```text
No CREATE TABLE statements found in the input.
```

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:495`.

### 6.16. Step 16: FK cross-reference warning

Sau khi parse xong, parser kiểm tra mỗi FK có ref table tồn tại trong input không.

Nếu không có, push warning:

```text
Table "<table>": FK references "<refTable>" which was not found in the input — this relationship will be skipped.
```

Đây là warning, không block import. Khi convert sang physical model, FK đó sẽ không resolve được id và bị bỏ.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:499`.

## 7. Thuật toán ddlToPhysicalModel

Hàm: `ddlToPhysicalModel(parseResult, modelName)` tại `src/components/EditProject/utils/ddl-parser.ts:516`.

Mục đích:

- Convert parse result trung gian sang `PhysicalModelPayload`.
- Sinh id `pid_...` cho model, table, column, index.
- Resolve FK từ tên table/column sang id table/column.

Điểm quan trọng: `parseDDL` chỉ giữ quan hệ bằng tên, ví dụ `posts.user_id -> users.id`. Đến `ddlToPhysicalModel` mới resolve tên đó thành `refTableId` và `refColumnId`, vì physical model không lưu FK bằng tên bảng/cột mà lưu bằng id nội bộ.

### 7.1. Step 1: assign IDs

Pass đầu tiên:

- Mỗi parsed table được gán một `tableId`.
- Mỗi parsed column được gán một `columnId`.
- Lưu vào:
  - `tableIdMap`: lowercase table name -> table id.
  - `columnIdMap`: lowercase table name -> lowercase column name -> column id.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:523`.

### 7.2. Step 2: build columns

Với mỗi parsed table:

- Lấy `pkSet` từ `primaryKeyColumns`.
- Với mỗi parsed column:
  - `isPK = c.isPrimaryKey || pkSet.has(c.name.toLowerCase())`.
  - Tìm single-column FK mà `fk.columns.length === 1` và source column trùng tên column hiện tại.
  - Nếu FK resolve được ref table id và ref column id thì tạo `roles.foreignKey`.

Physical column output:

- `id`: generated column id.
- `name`: giữ từ DDL.
- `dataType`: giữ từ parser.
- `length`: giữ từ parser.
- `nullable`: nếu PK thì ép `false`, ngược lại giữ parsed nullable.
- `unique`: giữ parsed unique.
- `autoIncrement`: nếu true thì set true, nếu false thì `undefined`.
- `defaultValue`: giữ parsed default.
- `roles.primaryKey`: set nếu là PK.
- `roles.foreignKey`: set nếu resolve được FK.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:534`.

### 7.3. Step 3: resolve composite foreign keys

Sau khi map columns lần đầu, code xử lý FK nhiều column:

- Chỉ xét FK có `fk.columns.length > 1`.
- Resolve `refTableId` và `refColMap`.
- Với mỗi source column trong composite FK:
  - Tìm physical column cùng tên.
  - Tìm target ref column id theo vị trí tương ứng trong `fk.refColumns`.
  - Nếu column chưa có `roles.foreignKey`, set foreign key vào column đó.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:580`.

Lưu ý: physical model hiện biểu diễn FK ở từng column riêng lẻ, không lưu một object composite FK ở table-level. Vì vậy composite FK được “trải” thành FK trên từng column.

### 7.4. Step 4: map indexes

Mỗi parsed index được map thành physical model index:

- `id`: generated id.
- `name`: giữ tên index/constraint.
- `type`: `idx.resolvedType ?? "BTREE"`.
- `columns`: giữ `{ columnName, order }`.
- `isUnique`: giữ từ parsed index.

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:604`.

### 7.5. Step 5: build final PhysicalModelPayload

Output:

```ts
{
    model: {
        id: generateId(),
        name: modelName,
        version: 1,
    },
    tables,
}
```

Vị trí: `src/components/EditProject/utils/ddl-parser.ts:620`.

Lưu ý: import DDL hiện không set `model.dbms`, dù modal có state chọn DBMS. State DBMS hiện chủ yếu dùng để chọn sample text/label, không truyền vào parser.

### 7.6. Pseudo-code tổng quát của mapping

```ts
function ddlToPhysicalModel(parseResult, modelName) {
    tableIdMap = new Map()
    columnIdMap = new Map()

    // Pass 1: sinh id trước để FK có thể trỏ tới bảng/cột xuất hiện sau.
    for each parsedTable:
        tableId = generateId()
        tableIdMap[lower(parsedTable.name)] = tableId

        colMap = new Map()
        for each parsedColumn:
            colMap[lower(parsedColumn.name)] = generateId()
        columnIdMap[lower(parsedTable.name)] = colMap

    // Pass 2: build table/column thật.
    tables = parseResult.tables.map(parsedTable => {
        pkSet = lower(parsedTable.primaryKeyColumns)

        columns = parsedTable.columns.map(parsedColumn => {
            isPK = parsedColumn.isPrimaryKey || pkSet.has(lower(parsedColumn.name))
            inlineOrSingleFK = find FK with exactly one source column == parsedColumn.name

            roles = {
                primaryKey: isPK || undefined,
                foreignKey: resolveFK(inlineOrSingleFK) || undefined,
            }

            return physicalColumn(parsedColumn, roles)
        })

        // Pass 2.5: composite FK được gắn lại vào từng column.
        for each fk where fk.columns.length > 1:
            for each sourceColumn at index i:
                refColumn = fk.refColumns[i]
                sourcePhysicalColumn.roles.foreignKey = resolve(refTable, refColumn)

        indexes = parsedTable.indexes.map(toPhysicalIndex)

        return physicalTable(tableId, columns, indexes)
    })

    return { model: { id, name: modelName, version: 1 }, tables }
}
```

Lý do cần 2 pass: FK có thể trỏ tới bảng được khai báo sau. Nếu vừa đọc vừa resolve ngay, những FK kiểu `posts -> users` sẽ fail khi `users` xuất hiện sau `posts`. Pass 1 tạo toàn bộ id trước, pass 2 mới gắn quan hệ.

## 8. Ví dụ mapping chi tiết

Input DDL:

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE posts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) DEFAULT 'Untitled'
);

CREATE INDEX idx_posts_user_id ON posts(user_id DESC);
```

### 8.1. Parse result trung gian

Sau `parseDDL`, dữ liệu vẫn chủ yếu là name-based:

```ts
{
    tables: [
        {
            name: "users",
            columns: [
                {
                    name: "id",
                    dataType: "INTEGER",
                    autoIncrement: true,
                    isPrimaryKey: true,
                    nullable: false,
                },
                {
                    name: "email",
                    dataType: "VARCHAR",
                    length: "255",
                    unique: true,
                    nullable: false,
                },
            ],
            primaryKeyColumns: ["id"],
            foreignKeys: [],
            indexes: [],
        },
        {
            name: "posts",
            columns: [
                { name: "id", dataType: "INTEGER", isPrimaryKey: true },
                { name: "user_id", dataType: "INTEGER", nullable: false },
                { name: "title", dataType: "VARCHAR", length: "200", defaultValue: "Untitled" },
            ],
            foreignKeys: [
                {
                    columns: ["user_id"],
                    refTable: "users",
                    refColumns: ["id"],
                    onDelete: "CASCADE",
                },
            ],
            indexes: [
                {
                    name: "idx_posts_user_id",
                    columns: [{ columnName: "user_id", order: "DESC" }],
                    isUnique: false,
                    resolvedType: "BTREE",
                },
            ],
        },
    ],
}
```

### 8.2. Physical model sau mapping

Sau `ddlToPhysicalModel`, các quan hệ được đổi sang id:

```ts
{
    model: {
        id: "pid_...",
        name: "Imported Schema",
        version: 1,
    },
    tables: [
        {
            id: "pid_users",
            name: "users",
            columns: [
                {
                    id: "pid_users_id",
                    name: "id",
                    dataType: "INTEGER",
                    nullable: false,
                    autoIncrement: true,
                    roles: { primaryKey: true },
                },
            ],
        },
        {
            id: "pid_posts",
            name: "posts",
            columns: [
                {
                    id: "pid_posts_user_id",
                    name: "user_id",
                    dataType: "INTEGER",
                    nullable: false,
                    roles: {
                        foreignKey: {
                            refTableId: "pid_users",
                            refColumnId: "pid_users_id",
                            onDelete: "CASCADE",
                        },
                    },
                },
            ],
            indexes: [
                {
                    id: "pid_...",
                    name: "idx_posts_user_id",
                    type: "BTREE",
                    columns: [{ columnName: "user_id", order: "DESC" }],
                    isUnique: false,
                },
            ],
        },
    ],
}
```

Id thực tế không có dạng cố định như ví dụ trên; code sinh bằng `crypto.randomUUID()` qua `generateId`.

## 9. Các loại DDL đang support

Theo code hiện tại, parser support tốt các pattern sau:

- `CREATE TABLE ... (...);`
- `CREATE TABLE IF NOT EXISTS ... (...);`
- Inline column:
  - `PRIMARY KEY`.
  - `UNIQUE`.
  - `NOT NULL`.
  - `DEFAULT <token>` hoặc `DEFAULT '<string>'`.
  - `REFERENCES table(column)`.
  - `ON DELETE ...`.
  - `ON UPDATE ...`.
- Table-level:
  - `PRIMARY KEY (...)`.
  - `CONSTRAINT name FOREIGN KEY (...) REFERENCES table(...)`.
  - `FOREIGN KEY (...) REFERENCES table(...)`.
  - `CONSTRAINT name UNIQUE (...)`.
  - `UNIQUE (...)`.
- Standalone:
  - `CREATE INDEX name ON table(col ASC, col2 DESC);`
  - `CREATE UNIQUE INDEX name ON table(col);`
  - `CREATE INDEX IF NOT EXISTS name ON table(col);`

## 10. Những giới hạn thuật toán hiện tại

1. Parser dùng regex, không phải SQL AST parser đầy đủ.
2. `CREATE TABLE` regex yêu cầu statement kết thúc bằng `;`.
3. Validator yêu cầu `REFERENCES table(column)`, không support `REFERENCES table` implicit PK.
4. Column data type chỉ lấy token đầu tiên bằng `^(\w+)`, nên type nhiều từ như `DOUBLE PRECISION` sẽ không preserve đầy đủ.
5. SQL Server `IDENTITY(1,1)` hiện chưa được detect thành `autoIncrement`; chỉ detect `GENERATED ... AS IDENTITY`.
6. Default value có biểu thức phức tạp có space có thể bị cắt vì regex chỉ lấy quoted string hoặc một token.
7. Constraint name của FK không được lưu vào physical model.
8. Table-level unique được map thành unique index, không phải `column.unique`.
9. Composite FK được map thành nhiều column-level FK riêng, không giữ nguyên một composite FK object.
10. Standalone `CREATE INDEX` chỉ attach nếu table đã nằm trong DDL input.
11. Regex `CREATE INDEX` hiện parse `USING` sau column list, chưa đúng với cú pháp PostgreSQL phổ biến `ON table USING GIN (col)`.
12. DBMS selector trong modal không ảnh hưởng parser/mapping, ngoài sample text và label.
13. Import sẽ replace model physical hiện tại bằng model import, không merge với diagram hiện có.
14. `ALTER TABLE ... ADD CONSTRAINT`, `ALTER TABLE ... ADD COLUMN`, `CREATE TYPE`, `CREATE VIEW`, trigger, sequence rời, check constraint và enum definition chưa được parse thành model.
15. Identifier có khoảng trắng bên trong quote, ví dụ `"user profile"`, có thể fail vì column parser lấy column name bằng token đầu tiên `^(\S+)`.

## 11. Bảng tóm tắt thuật toán

| Bước | Hàm/code | Kết quả |
|---|---|---|
| Validate editor | `validateDDLSyntax` | Marker lỗi/cảnh báo trong Monaco |
| Check ngoặc | `ddl-parser.ts:76` | Error nếu thừa/thiếu ngoặc |
| Check semicolon CREATE TABLE | `ddl-parser.ts:138` | Error nếu thiếu `;` |
| Check REFERENCES column list | `ddl-parser.ts:169` | Error nếu thiếu `(column)` |
| Strip comments | `stripComments` | Xóa comment trước khi parse regex |
| Extract CREATE TABLE | `parseDDL`, regex tại `ddl-parser.ts:308` | Parse table body |
| Split body | `splitTopLevelCommas` | Tách column/constraint an toàn với nested parentheses |
| Parse table PK/FK/UNIQUE | `ddl-parser.ts:336` | Lưu constraints vào parse result |
| Parse column | `ddl-parser.ts:378` | Lấy name, type, length, nullable, unique, PK, default, inline FK |
| Parse index | `ddl-parser.ts:456` | Attach index vào parsed table |
| Convert IDs | `ddlToPhysicalModel`, pass 1 | Sinh table/column ids |
| Build physical columns | `ddl-parser.ts:534` | Map parsed columns sang physical columns |
| Resolve composite FK | `ddl-parser.ts:580` | Gắn FK vào từng column liên quan |
| Build indexes | `ddl-parser.ts:604` | Map parsed indexes sang physical indexes |
| Apply model | `EditProject/index.tsx:2239` | `physicalMutateModel(() => model)` |
