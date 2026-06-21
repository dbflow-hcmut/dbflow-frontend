# Physical Schema: Model, Diagram và Rule Implementation

Tài liệu này mô tả physical schema đang được hiện thực như thế nào trong code: dữ liệu physical được lưu ở những lớp nào, diagram được map sang model ra sao, FK/index/FD được suy luận như thế nào, và những điểm cần chú ý khi maintain. Phần flow UI chỉ ghi ngắn; trọng tâm là rule và thuật toán.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Runtime chính của màn Edit Project, chọn schema physical, connect edge, mở DDL/import/normalization | `src/components/EditProject/index.tsx` |
| Hook collaboration cho physical schema, sync Yjs diagram/model | `src/components/EditProject/hooks/usePhysicalCollaboration.ts` |
| Physical model payload và thuật toán build model từ diagram, build diagram từ model | `src/components/EditProject/utils/physical-model.builder.ts` |
| Mapping ReactFlow node/edge sang stored physical diagram và ngược lại | `src/components/EditProject/utils/physical-diagram.builder.ts` |
| Node UI của physical table | `src/components/erds-notations/relation-table/index.tsx` |
| Edge UI của physical FK | `src/components/relation-table-edge/index.tsx` |
| Tạo table, sửa column/index/FD trong canvas state | `src/components/EditProject/utils/functions.ts` |
| Properties panel cho table, column, index, FD, FK action | `src/components/EditProject/components/PropertiesPanel/index.tsx` |
| DBMS/data type config dùng bởi physical column và DDL | `src/components/EditProject/utils/dbms-config.ts` |

## 2. Flow runtime sơ lược

Physical schema chỉ active khi `selectedSchema.type === SchemaType.PHYSICAL` trong `EditProject`.

Flow chính:

1. `EditProject` bật `usePhysicalCollaboration`.
2. Hook đọc `diagram` và `model` từ Yjs.
3. Nếu có diagram đã lưu thì map diagram sang ReactFlow node/edge để render.
4. Nếu chưa có diagram nhưng có model thì generate diagram từ model.
5. User chỉnh table/column/edge trên canvas hoặc properties panel.
6. Diagram edits được serialize lại vào Yjs `diagram`.
7. Model chỉ được ghi vào Yjs `model` khi gọi `applyModelPayload()` hoặc `mutateModel()`.

Điểm quan trọng: physical schema có 2 representation chạy song song:

- `diagram`: phục vụ canvas, vị trí node, edge, annotation.
- `model`: phục vụ DDL, migration, linter, normalization, conversion.

## 3. PhysicalModelPayload

Type chính nằm trong `physical-model.builder.ts`.

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

### 3.1. ModelTable

Mỗi physical table có:

- `id`: id ổn định của table.
- `name`: tên table.
- `columns`: danh sách column.
- `indexes?`: danh sách index physical.
- `functionalDependencies?`: danh sách FD dùng cho normalization.
- `comment?`, `notes?`: metadata.

### 3.2. ModelColumn

Mỗi physical column có:

- `id`.
- `name`.
- `dataType?`.
- `length?`.
- `nullable`.
- `unique`.
- `autoIncrement?`.
- `defaultValue?`.
- `roles.primaryKey?`.
- `roles.candidateKey?`.
- `roles.foreignKey?`.
- `comment?`, `notes?`.

FK trong model có shape:

```ts
{
    refTableId: string;
    refColumnId: string;
    onDelete?: FKAction;
    onUpdate?: FKAction;
}
```

### 3.3. Index

Index gồm:

- `id`.
- `name`.
- `type`: `BTREE`, `HASH`, `GIN`, `GIST`, `BRIN`.
- `columns`: danh sách `{ columnName, order }`.
- `isUnique`.

Index là physical-only. Khi convert Physical -> Logical, index bị bỏ.

### 3.4. Functional Dependency

FD gồm:

- `id`.
- `left`: danh sách tên column determinant.
- `right`: danh sách tên column dependent.
- `name?`, `notes?`.

FD không tạo SQL trực tiếp trong physical schema. FD chủ yếu dùng cho normalization và hiển thị trên node.

## 4. ReactFlow physical table node

Physical table trên canvas là ReactFlow node có:

```ts
type: "relation"
data: RelationTableData
```

`RelationTableData` nằm trong `src/components/erds-notations/relation-table/index.tsx`.

Data chính:

- `name`: tên table.
- `columns`: danh sách `RelationColumn`.
- `indexes?`.
- `functionalDependencies?`.
- `showFDs?`.

`RelationColumn` là shape UI, khác với `ModelColumn`:

- UI dùng `type`, model dùng `dataType`.
- UI dùng `isPrimary`, model dùng `roles.primaryKey`.
- UI dùng `isCandidateKey`, model dùng `roles.candidateKey`.
- UI dùng `isNullable`, model dùng `nullable`.
- UI dùng `isUnique`, model dùng `unique`.
- UI dùng `isAutoIncrement`, model dùng `autoIncrement`.

## 5. Stored physical diagram

Stored diagram nằm trong `physical-diagram.builder.ts`.

### 5.1. StoredPhysicalDiagramNode

Table node được lưu với:

- `id`.
- `type: "table"`.
- `position`.
- `size`.
- `name`.
- `tableId`.
- `columns`: bản rút gọn để lưu label/decorations.
- `data`: dữ liệu đầy đủ của node, gồm column type/index/FD.

Annotation node cũng được lưu:

- `sticky-note`.
- `text-label`.
- `drawing-path`.
- `note`.

### 5.2. StoredPhysicalDiagramEdge

Physical FK edge được lưu với:

- `id`.
- `type: "fk"`.
- `source`: table chứa FK column.
- `target`: table được tham chiếu.
- `points?`.
- `style?`.
- `fkRef`.
- `labels?`.

`fkRef` là phần quan trọng:

```ts
{
    tableId: string;
    foreignKeyIndex: number;
    sourceColumnName?: string;
    targetColumnName?: string;
    onDelete?: FKAction;
    onUpdate?: FKAction;
}
```

`foreignKeyIndex` là index của column phía source trong mảng columns. Vì vậy nếu đổi thứ tự column mà edge không được cập nhật tương ứng thì FK có thể trỏ nhầm column.

## 6. Thuật toán map ReactFlow -> stored diagram

Hàm chính:

- `mapReactNodesToStoredNodes`.
- `mapReactEdgesToStoredEdges`.

### 6.1. Node mapping

Rule:

1. Chỉ map node `type === "relation"` và annotation nodes.
2. Với relation node:
   - Stored `id = node.id`.
   - Stored `type = "table"`.
   - Stored `tableId = node.id`.
   - Stored `name = data.name`.
   - Stored `position = node.position`.
   - Width/height được tách ra thành `size`.
   - `style` được sanitize, bỏ `width`/`height`.
   - Full `RelationTableData` được giữ trong `data`.
3. Stored column rút gọn được tạo từ UI columns:
   - `columnId = pid_${node.id}_col_${idx}`.
   - `label = col.name`.
   - `decorations.pk = col.isPrimary`.
   - `decorations.underline = col.isPrimary`.

Lưu ý: stored column rút gọn không chứa đầy đủ `type`, `length`, `nullable`, `index`, `defaultValue`. Các field đó nằm trong `storedNode.data`.

### 6.2. Edge mapping

Rule:

1. Chỉ map edge `type === "relation-table-edge"`.
2. Chỉ map nếu source và target đều là node `type === "relation"`.
3. `sourceHandle` và `targetHandle` là tên column.
4. Code tìm `sourceColumnIndex` bằng cách match `sourceHandle` với `sourceData.columns[].name`.
5. Code tìm `targetColumnIndex` bằng cách match `targetHandle` với `targetData.columns[].name`.
6. Nếu không tìm được source hoặc target column thì edge bị bỏ.
7. Stored edge có:
   - `source` = table chứa FK.
   - `target` = table được tham chiếu.
   - `fkRef.foreignKeyIndex = sourceColumnIndex`.
   - `fkRef.sourceColumnName = sourceHandle`.
   - `fkRef.targetColumnName = targetHandle`.
   - `fkRef.onDelete/onUpdate = edge.data.onDelete/onUpdate`.

Điểm cần chú ý: source side của stored edge luôn được hiểu là FK column side, target side là referenced column side. Khi user kéo edge giữa 2 columns, UI chuẩn hoá hướng edge theo rule:

- PK/CK/Unique -> Normal: Normal trở thành FK, PK/CK/Unique là referenced column.
- Normal -> PK/CK/Unique: Normal trở thành FK, PK/CK/Unique là referenced column.
- PK/CK/Unique -> PK/CK/Unique: target user kéo tới trở thành FK, source là referenced column; dùng cho 1-1.
- Normal -> Normal: mở dialog chọn column nào là FK; referenced column còn lại được set `isUnique = true`.
- Properties panel không cho chỉnh cardinality/FK direction sau khi tạo edge; physical edge panel chỉ giữ FK actions.
- Nếu column đã tham gia `relation-table-edge`, thao tác đổi PK/CK/Unique trong Properties panel phải hiện confirm modal trước khi apply. Nếu column đó là target/referenced side và sau update không còn PK/CK/Unique, các FK edge invalid trỏ tới column đó bị xoá.

## 7. Thuật toán map stored diagram -> ReactFlow

Hàm chính:

- `mapStoredNodesToReactNodes`.
- `mapStoredEdgesToReactEdges`.

### 7.1. Stored node -> relation node

Rule:

1. Stored node `type === "table"` được map thành ReactFlow node `type === "relation"`.
2. React node id ưu tiên `tableId`, fallback `id`.
3. `data` ưu tiên lấy từ `stored.data`.
4. Tên table lấy theo thứ tự:
   - `stored.name`.
   - `stored.data.name`.
   - `stored.tableId`.
   - `stored.id`.
5. `columns`, `indexes`, `functionalDependencies`, `showFDs` lấy từ `stored.data`.
6. `size` được map ngược vào `style.width` và `style.height`.

Nếu stored node chỉ còn `columns` rút gọn mà mất `data`, UI sẽ không đủ thông tin physical như type/nullable/index.

### 7.2. Stored edge -> relation-table-edge

Rule:

1. Edge chỉ được map nếu source/target node tồn tại và đều là relation node.
2. Source handle:
   - Ưu tiên `fkRef.sourceColumnName`.
   - Nếu không có thì fallback bằng `foreignKeyIndex`.
3. Target handle:
   - Ưu tiên `fkRef.targetColumnName`.
   - Nếu không có thì fallback bằng primary key đầu tiên của target node.
4. `onDelete`, `onUpdate`, `label`, `controlPoints` được đưa vào `edge.data`.

Legacy edge format vẫn được hỗ trợ bằng cách giữ lại source/target và ép `type = "relation-table-edge"`.

## 8. Thuật toán build physical model từ diagram

Hàm chính: `buildPhysicalModel` trong `physical-model.builder.ts`.

Đây là bước chuyển từ canvas/stored diagram sang `PhysicalModelPayload`.

### 8.1. Step 1: tạo model metadata

Rule:

1. `model.id = schemaId ?? generatePid()`.
2. `model.name = schemaName ?? diagramName ?? "Untitled physical model"`.
3. `model.version = 1`.
4. Nếu không có stored node thì trả về empty physical model.

`buildPhysicalModel` không tự khôi phục `model.dbms`, `description`, `notes`. Khi mutate model, `usePhysicalCollaboration` có logic preserve metadata cũ.

### 8.2. Step 2: lọc table nodes

Code chỉ lấy stored node:

```ts
node.type === "table" && node.tableId
```

Annotation node không vào physical model.

### 8.3. Step 3: build FK map từ stored edges

Code duyệt `storedEdges` và chỉ xét edge:

```ts
edge.type === "fk" && edge.fkRef
```

Với mỗi edge:

1. Source table id lấy từ `edge.fkRef.tableId`.
2. Source column index lấy từ `edge.fkRef.foreignKeyIndex`.
3. Target table node lấy từ `edge.target`.
4. Target PK column là column đầu tiên của target stored node có `decorations.pk`.
5. Nếu không có target table hoặc không resolve được target column thì fallback về PK đầu tiên hoặc column đầu tiên của target table.
6. FK map được lưu theo key:
   - `tableId`.
   - `columnIndex`.
7. FK value gồm:
   - `refTableId = targetTableNode.tableId`.
   - `refColumnId = pkColumn.columnId`.
   - `onDelete = edge.fkRef.onDelete`.
   - `onUpdate = edge.fkRef.onUpdate`.

Điểm quan trọng: `buildPhysicalModel` ưu tiên `fkRef.targetColumnName` để resolve đúng referenced column, nên FK có thể trỏ tới PK/CK/Unique theo edge user tạo.

### 8.4. Step 4: build table data map

Với mỗi table node, code lấy `node.data` làm nguồn dữ liệu đầy đủ:

- `name`.
- `columns`.
- `indexes`.
- `functionalDependencies`.

Nếu `node.data` không có, code fallback sang `storedNode.columns`, nhưng fallback này chỉ đủ tên và PK decoration, không đủ type/index/default.

### 8.5. Step 5: build columns từ actual data

Nếu có `tableData.columns`, mỗi UI column được map sang model column:

```ts
{
    id: `pid_${tableId}_col_${idx}`,
    name: actualCol.name || `column_${idx}`,
    dataType: actualCol.type,
    length: actualCol.length,
    nullable: actualCol.isNullable ?? true,
    unique: actualCol.isUnique ?? false,
    autoIncrement: actualCol.isAutoIncrement,
    defaultValue: actualCol.defaultValue,
    roles: {
        primaryKey: actualCol.isPrimary || undefined,
        candidateKey: actualCol.isCandidateKey || undefined,
        foreignKey: fkMap[tableId][idx] || undefined
    }
}
```

Rule đáng chú ý:

- Column id được generate lại theo index, không lấy id cũ từ UI column.
- PK và candidate key nằm trong `roles`.
- FK không lấy từ column data, mà lấy từ edge-derived `fkMap`.
- Nếu thiếu `nullable`, mặc định là `true`.
- Nếu thiếu `unique`, mặc định là `false`.

### 8.6. Step 6: fallback columns từ stored columns

Nếu không có `tableData.columns`, code dùng `storedNode.columns`.

Rule fallback:

- `id = storedCol.columnId || pid_${tableId}_col_${idx}`.
- `name = storedCol.label || storedCol.columnId || column_${idx}`.
- `nullable = !isPrimaryKey`.
- `unique = false`.
- `roles.primaryKey` theo `decorations.pk`.
- `roles.foreignKey` theo `fkMap`.

Fallback này chủ yếu để đọc legacy/minimal stored diagram. Không nên xem nó là nguồn đầy đủ của physical schema.

### 8.7. Step 7: build indexes và FDs

Indexes lấy từ `tableData.indexes`.

Rule:

- Giữ `id`, `name`, `type`, `columns`, `isUnique`.
- Nếu table không có indexes thì field `indexes` có thể không được set.

FDs lấy từ `tableData.functionalDependencies`.

Rule:

- Giữ `id`, `left`, `right`.
- Nếu table không có FDs thì field `functionalDependencies` có thể không được set.

## 9. Thuật toán build diagram từ physical model

Hàm chính: `buildDiagramFromPhysicalModel`.

Đây là chiều ngược lại: model -> stored diagram. Được dùng khi import DDL, AI apply model, conversion sang physical, hoặc model Yjs thay đổi từ ngoài.

### 9.1. Preserve position và size

Code tạo lookup từ `existingNodes`:

- table id -> position.
- table id -> size.

Nếu table đã tồn tại trên canvas, nó giữ position/size cũ.

### 9.2. Auto layout cho table mới

Với table chưa có position:

1. Tính size ước lượng bằng `computeTableSize`.
2. Build danh sách layout table gồm:
   - `id`.
   - `size`.
   - `refIds`: các table được FK tham chiếu.
3. Gọi `computeELKTableLayout`.
4. Nếu đã có table cũ, table mới được offset xuống dưới vùng table cũ.
5. Nếu chưa có table cũ, layout bắt đầu từ vùng mặc định.

### 9.3. Build stored table node

Với mỗi `ModelTable`, code tạo stored node:

- `id = table.id`.
- `type = "table"`.
- `position`.
- `size`.
- `name = table.name`.
- `tableId = table.id`.
- `columns`: bản rút gọn có `columnId`, `label`, `decorations.pk/fk/underline`.
- `data`: `RelationTableData`.

Mapping model -> UI data:

- `name -> name`.
- `dataType -> type`, fallback `"varchar"`.
- `length -> length`.
- `roles.primaryKey -> isPrimary`.
- `roles.candidateKey -> isCandidateKey`.
- `nullable -> isNullable`, fallback `true`.
- `unique -> isUnique`, fallback `false`.
- `autoIncrement -> isAutoIncrement`, fallback `false`.
- `defaultValue -> defaultValue`.
- `indexes -> indexes`.
- `functionalDependencies -> functionalDependencies`.

`showFDs` được preserve từ existing node data nếu trước đó user đã bật/tắt hiển thị FD.

### 9.4. Build FK edges từ model

Với mỗi column có `roles.foreignKey`:

1. Tìm target table bằng `fk.refTableId`.
2. Tìm target column bằng `fk.refColumnId`.
3. `targetColumnName = targetCol.name ?? fk.refColumnId`.
4. Tạo edge:

```ts
{
    id: `e_fk_${table.id}_${colIdx}`,
    type: "fk",
    source: table.id,
    target: fk.refTableId,
    fkRef: {
        tableId: table.id,
        foreignKeyIndex: colIdx,
        sourceColumnName: col.name,
        targetColumnName,
        onDelete,
        onUpdate
    }
}
```

Edge id deterministic theo table id và column index. Nếu một table có nhiều FK columns, mỗi FK có id khác nhau theo index.

### 9.5. Preserve existing edges và unmodeled nodes

Sau khi generate model edges:

- Existing edges có id không trùng model edge id được giữ lại.
- Nếu `preserveUnmodeledNodes = true`, annotation/drawing nodes ngoài model được giữ lại.
- Table node không còn trong model sẽ bị loại bỏ.

## 10. Physical edge và cardinality

UI edge nằm trong `src/components/relation-table-edge/index.tsx`.

Rule render:

- Edge dùng smooth step path.
- Source side mặc định là `N`.
- Target side mặc định là `1`.
- Source marker là crow's foot.
- Target marker là one bar.
- Nếu selected thì line dày hơn và có animation dots.

PropertiesPanel cho phép override cardinality:

- `N:1`.
- `1:1`.
- `1:N`.
- `N:N`.

Nhưng cardinality override hiện nằm trong `edge.data.sourceCardinality/targetCardinality`. Khi map sang stored edge, các field này không được lưu trong `fkRef`. Vì vậy cardinality visual là metadata UI của edge, không phải nguồn chính để build FK model hoặc DDL.

## 11. Tạo và chỉnh physical table

### 11.1. Tạo table bằng model-first path

Khi đang ở physical schema và `physicalMutateModel` tồn tại, `addRelationTable` đi qua model trước.

Rule tạo table:

- `id = generateDiagramId()`.
- `name = table_${model.tables.length + 1}`.
- Tạo 1 column mặc định:

```ts
{
    id: `pid_${id}_col_0`,
    name: "column_1",
    dataType: "varchar",
    nullable: true,
    unique: false,
    roles: {}
}
```

Sau đó `mutatePhysicalModel` build lại diagram từ model và select table mới.

### 11.2. Fallback tạo table trực tiếp trên nodes

Nếu không có `mutatePhysicalModel`, code tạo ReactFlow node trực tiếp:

- `type = "relation"`.
- `name = table_${count + 1}`.
- column mặc định:

```ts
{ name: "column_1", type: "varchar", isPrimary: false, isNullable: true }
```

Path fallback chủ yếu để tương thích khi model-first không bật.

### 11.3. Chỉnh column

PropertiesPanel cho chỉnh:

- Column name.
- Type.
- Length/precision nếu data type config yêu cầu.
- PK.
- Candidate key.
- Nullable.
- Unique.
- Auto increment.
- Default value.

Các update này hiện mutate ReactFlow node data trước. Khi cần mutate model, `usePhysicalCollaboration.mutateModel` sẽ rebuild model từ diagram hiện tại để không làm mất diagram-only edits.

### 11.4. Chỉnh index

PropertiesPanel cho:

- Add/remove index.
- Đổi index name.
- Chọn index type.
- Chọn unique.
- Chọn nhiều columns.
- Chọn order `ASC`/`DESC` cho từng index column.

Index được lưu trong `RelationTableData.indexes`, rồi build sang `ModelTable.indexes`.

### 11.5. Chỉnh FD

PropertiesPanel cho:

- Add/remove FD.
- Chọn left columns.
- Chọn right columns.
- Toggle `showFDs` để hiển thị FD trên node.

FD được lưu bằng tên column, không bằng column id.

## 12. Tạo FK edge

Entry point connect nằm trong `EditProject/index.tsx`.

Rule chọn edge type:

1. Nếu source hoặc target là logical table thì dùng `logical-table-edge`.
2. Nếu source hoặc target là relation table thì dùng `relation-table-edge`.
3. Còn lại dùng `erd-edge`.

Với physical edge:

- `onConnect` tạo ReactFlow edge type `relation-table-edge` với source là FK column side.
- FK role trong model được merge từ stored edge source/target column.
- FK action `onDelete`/`onUpdate` được chỉnh trong PropertiesPanel và lưu vào `edge.data`.
- Đổi PK/CK/Unique của column đã nối FK edge không được apply thẳng; UI confirm trước để tránh user vô tình làm sai FK/reference rule. Nếu referenced column mất PK/CK/Unique, edge liên quan bị xoá sau khi user confirm.

FK action options:

- `NO ACTION`.
- `CASCADE`.
- `SET NULL`.
- `SET DEFAULT`.
- `RESTRICT`.

## 13. Collaboration và model-as-truth

Hook `usePhysicalCollaboration` quản lý 2 Yjs maps:

- `diagramMap = ydoc.getMap("diagram")`.
- `modelMap = ydoc.getMap("model")`.

### 13.1. Initial sync

Khi provider synced:

1. Load model từ Yjs nếu có.
2. Load diagram từ Yjs nếu có.
3. Nếu diagram có content thì dùng diagram để render.
4. Nếu không có diagram nhưng có model thì generate diagram từ model.
5. Nếu không có cả hai thì canvas rỗng.

### 13.2. Diagram change

Khi Yjs diagram thay đổi từ collaborator:

1. Parse JSON.
2. Detect stored format.
3. Map stored nodes/edges sang ReactFlow.
4. Set nodes/edges.
5. Đánh dấu đang sync để tránh ghi ngược lại ngay lập tức.

### 13.3. Local diagram save

Khi local `nodes` hoặc `edges` đổi:

1. Map ReactFlow nodes -> stored nodes.
2. Map ReactFlow edges -> stored edges.
3. Serialize thành:

```ts
{ diagram: { nodes, edges } }
```

4. Ghi vào Yjs `diagram`.

Lưu ý trong code: effect này chỉ save diagram, không save model.

### 13.4. Model change

Khi Yjs model thay đổi từ ngoài:

1. Parse `PhysicalModelPayload`.
2. Update `modelDataState`.
3. Nếu initial sync đã xong và change không phải cùng batch diagram sync, regenerate diagram từ model.

### 13.5. applyModelPayload

Dùng khi có full physical model mới, ví dụ import DDL hoặc AI generated model.

Rule:

1. Build stored diagram từ model.
2. Preserve existing annotation nodes.
3. Map stored diagram sang ReactFlow.
4. Set nodes/edges.
5. Ghi full model vào Yjs `model`.

### 13.6. mutateModel

Dùng khi thay đổi model incremental, ví dụ thêm physical table model-first.

Rule quan trọng:

1. Trước khi mutate, hook rebuild model từ diagram hiện tại bằng `buildPhysicalModel`.
2. Nếu model cũ có metadata `dbms`, `description`, `notes`, hook preserve các field này.
3. Chạy `mutator(current)`.
4. Build diagram từ model mới.
5. Preserve annotation nodes.
6. Set nodes/edges.
7. Ghi model mới vào Yjs `model`.

Lý do phải rebuild model từ diagram trước khi mutate: nhiều edit như column add/delete, index, FD, FK edge đang sống trong diagram state. Nếu dùng `modelDataRef` cũ trực tiếp, các edit đó có thể bị overwrite khi regenerate diagram.

## 14. Tích hợp với các tính năng khác

Physical schema là input chính cho:

- Export DDL: dùng `_physicalModelData`.
- Import DDL: parse SQL thành `PhysicalModelPayload`, rồi apply vào physical diagram.
- Migration SQL: diff 2 `PhysicalModelPayload`.
- Linter safety warning: chạy `runPhysicalLinter`.
- Normalization: dùng physical model và FDs.
- Schema conversion:
  - Logical -> Physical tạo `PhysicalModelPayload`.
  - Physical -> Logical bỏ DBMS/index/data type physical-only.

Các tính năng trên không đọc trực tiếp ReactFlow nodes khi đã có `_physicalModelData`, trừ một số flow trong `EditProject` có rebuild fresh model từ canvas trước khi convert/normalize/lint.

## 15. Những điểm cần chú ý khi maintain

1. Physical schema có 2 nguồn dữ liệu: diagram và model. Cần biết feature đang đọc nguồn nào.
2. Diagram local save không ghi model. Model chỉ được ghi qua `applyModelPayload` hoặc `mutateModel`.
3. `buildPhysicalModel` suy FK từ edge, không lấy FK trực tiếp từ column data.
4. FK source là source side của edge; target là referenced table.
5. Khi build model từ edge, target column ưu tiên `fkRef.targetColumnName`, fallback PK đầu tiên hoặc column đầu tiên.
6. Column id trong model build từ UI data được generate theo index: `pid_${tableId}_col_${idx}`.
7. Reorder/delete column có thể ảnh hưởng FK vì stored edge dùng `foreignKeyIndex`.
8. Index và FD lưu bằng tên column, không bằng column id.
9. `autoIncrement` được lưu trong model nhưng DDL generator hiện chỉ render auto increment chắc chắn khi data type là serial-like, không render trực tiếp từ boolean này.
10. Physical model `model.dbms` là optional. Physical schema tạo thủ công có thể không có DBMS.
11. `showFDs` là UI state, được preserve khi build diagram từ model nhưng không thuộc semantic model chính.
12. Cardinality override trên physical edge là visual metadata, không quyết định FK trong model.
13. Stored node cần `data` đầy đủ; nếu chỉ còn stored `columns` rút gọn thì mất nhiều thông tin physical.
14. Existing non-model edges được preserve khi build diagram từ model nếu id không trùng generated FK edge id.
15. Annotation nodes được preserve nếu `preserveUnmodeledNodes = true`, nhưng table node không còn trong model sẽ bị xóa.

## 16. Bảng tóm tắt thuật toán

| Thuật toán | Input | Output | Rule chính |
|---|---|---|---|
| `mapReactNodesToStoredNodes` | ReactFlow nodes | Stored nodes | Relation node thành table node, annotation được giữ, full data nằm trong `data` |
| `mapReactEdgesToStoredEdges` | ReactFlow edges + nodes | Stored FK edges | Source handle là FK column, target handle là referenced column, lưu `foreignKeyIndex` |
| `mapStoredNodesToReactNodes` | Stored nodes | ReactFlow nodes | Table node thành `relation`, ưu tiên `stored.data` |
| `mapStoredEdgesToReactEdges` | Stored edges + nodes | ReactFlow edges | Ưu tiên source/target column name, fallback index/PK |
| `buildPhysicalModel` | Stored diagram | `PhysicalModelPayload` | Table data từ node data, FK từ edges, index/FD từ node data |
| `buildDiagramFromPhysicalModel` | `PhysicalModelPayload` | Stored diagram | Preserve position/size, auto-layout table mới, tạo FK edge từ column roles |
| `applyModelPayload` | Full model mới | ReactFlow + Yjs model | Replace model, regenerate diagram |
| `mutateModel` | Mutator function | Model mới + diagram mới | Rebuild model từ diagram trước, preserve metadata, mutate, regenerate |
