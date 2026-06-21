# Logical Schema: Model, Diagram và Rule Implementation

Tài liệu này mô tả logical schema đang được hiện thực trong code: data model logical, stored diagram, mapping ReactFlow <-> stored diagram, build logical model từ canvas, build diagram từ model, FK/cardinality/FD, collaboration, và các điểm cần chú ý khi maintain. Flow UI chỉ ghi sơ lược; trọng tâm là thuật toán và rule.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Runtime chính của màn Edit Project, chọn schema logical, connect edge, convert/sync/normalization | `src/components/EditProject/index.tsx` |
| Hook collaboration cho logical schema, sync Yjs diagram/model | `src/components/EditProject/hooks/useLogicalCollaboration.ts` |
| Logical model payload và thuật toán build model từ diagram, build diagram từ model | `src/components/EditProject/utils/logical-model.builder.ts` |
| Mapping ReactFlow node/edge sang stored logical diagram và ngược lại | `src/components/EditProject/utils/logical-diagram.builder.ts` |
| Node UI của logical table | `src/components/erds-notations/logical-table/index.tsx` |
| Edge UI của logical FK/cardinality | `src/components/logical-table-edge/index.tsx` |
| Tạo logical table, sửa column, reorder column, CRUD FD | `src/components/EditProject/utils/functions.ts` |
| Properties panel cho table, column key, FD | `src/components/EditProject/components/PropertiesPanel/index.tsx` |
| Conversion logical <-> conceptual/physical | `src/components/EditProject/utils/schema-conversion.ts` |
| Linter/normalization dùng logical model | `src/components/EditProject/utils/schema-linter.ts`, `src/components/EditProject/utils/normalization.ts` |

## 2. Flow runtime sơ lược

Logical schema active khi:

```ts
selectedSchema.type === SchemaType.LOGICAL
```

Flow chính:

1. `EditProject` bật `useLogicalCollaboration`.
2. Hook đọc `diagram` và `model` từ Yjs.
3. Nếu có diagram đã lưu thì map diagram sang ReactFlow.
4. Nếu chưa có diagram nhưng có model thì generate diagram từ model.
5. User chỉnh table/column/FK/FD trên canvas hoặc properties panel.
6. Diagram edits được serialize vào Yjs `diagram`.
7. Model chỉ được ghi vào Yjs `model` khi gọi `applyModelPayload()` hoặc `mutateModel()`.

Logical schema hiện là kiến trúc hybrid:

- `diagram` vẫn là nguồn vận hành cho canvas edits, position, size, edge, annotation.
- `model` là nguồn semantic cho conversion, linter, normalization, AI/model apply.
- Khi cần mutate model, code rebuild logical model từ diagram hiện tại trước để không mất các edit đang nằm trong canvas.

## 3. LogicalModelPayload

Type chính nằm trong `logical-model.builder.ts`.

```ts
export type LogicalModelPayload = {
    model: {
        id: string;
        name: string;
        version: number;
        notes?: string;
    };
    tables: ModelTable[];
};
```

Logical model không có `dbms`, `dataType`, `length`, `index`, `autoIncrement`, `defaultValue`. Đây là schema relational ở mức DBMS-agnostic.

## 4. ModelTable, ModelColumn, FD

### 4.1. ModelTable

Mỗi logical table có:

- `id`.
- `name`.
- `columns`.
- `functionalDependencies?`.
- `notes?`.

### 4.2. ModelColumn

Mỗi logical column có:

- `id`.
- `name`.
- `nullable`.
- `unique`.
- `roles.primaryKey?`.
- `roles.foreignKey?`.
- `roles.candidateKey?`.
- `notes?`.

FK trong logical model:

```ts
{
    refTableId: string;
    refColumnId: string;
}
```

Lưu ý: UI logical hiện chỉ cho chỉnh PK/CK, chưa có control chỉnh nullable/unique. Khi build model từ diagram, `nullable` luôn là `true`, `unique` luôn là `false`.

### 4.3. Functional Dependency

FD gồm:

- `id`.
- `left`: danh sách tên column hoặc column id tùy nguồn.
- `right`: danh sách tên column hoặc column id tùy nguồn.
- `name?`, `notes?`.

Trong UI, FD chọn bằng tên column. Khi build diagram từ model, code map FD ref từ column id sang column name nếu có thể.

## 5. ReactFlow logical table node

Logical table trên canvas là ReactFlow node:

```ts
type: "logical-table"
data: LogicalTableData
```

`LogicalTableData` nằm trong `src/components/erds-notations/logical-table/index.tsx`.

Data chính:

- `name`.
- `columns`.
- `functionalDependencies?`.
- `showFDs?`.

`LogicalColumn` gồm:

- `name`.
- `isKey?`.
- `isCandidateKey?`.

So với physical schema, logical column nhẹ hơn nhiều: không có type, length, nullable, unique, default, auto increment.

## 6. Stored logical diagram

Stored diagram nằm trong `logical-diagram.builder.ts`.

### 6.1. StoredLogicalDiagramNode

Logical table được lưu dưới dạng stored node:

- `id`.
- `type: "table"`.
- `position`.
- `size`.
- `name`.
- `tableId`.
- `columns`: bản rút gọn gồm `columnId`, `label`, `decorations`.
- `data`: full `LogicalTableData`.

Annotation node được giữ:

- `sticky-note`.
- `text-label`.
- `drawing-path`.
- `note`.

### 6.2. StoredLogicalDiagramEdge

Logical FK edge được lưu khác physical edge.

Stored edge có:

- `id`.
- `type: "fk"`.
- `source`: source column id, format `lid_${nodeId}_col_${index}`.
- `target`: target column id, format `lid_${nodeId}_col_${index}`.
- `sourceSide`: `"left"` hoặc `"right"`.
- `targetSide`: `"left"` hoặc `"right"`.
- `fkRef.tableId`: source table id.
- `fkRef.foreignKeyIndex`: index của FK column trong source table.
- `sourceCardinality?`.
- `targetCardinality?`.
- `points?`, `style?`, `labels?`.

Điểm khác với physical:

- Logical stored edge source/target là **column id**.
- Physical stored edge source/target là **table id**.

## 7. Thuật toán map ReactFlow -> stored diagram

Hàm chính:

- `mapReactNodesToStoredNodes`.
- `mapReactEdgesToStoredEdges`.

### 7.1. Node mapping

Rule:

1. Chỉ map node `type === "logical-table"` và annotation nodes.
2. Logical table được stored thành:
   - `id = node.id`.
   - `type = "table"`.
   - `tableId = node.id`.
   - `name = data.name`.
   - `position = node.position`.
   - `size = getStoredNodeSize(node)`.
   - `style` được sanitize, bỏ `width`/`height`.
   - `data` chứa full `LogicalTableData`.
3. Stored columns được tạo theo index:

```ts
{
    columnId: `lid_${node.id}_col_${idx}`,
    label: col.name,
    decorations: {
        pk: col.isKey ? true : undefined,
        ck: col.isCandidateKey ? true : undefined,
        underline: col.isKey ? true : undefined
    }
}
```

Lưu ý: `decorations.ck` đang được ghi dù type khai báo decorations không liệt kê `ck`. TypeScript có thể không bắt chặt vì object literal được assign qua structural context, nhưng đây là điểm nên chú ý nếu siết type.

### 7.2. Edge mapping

Rule:

1. Chỉ map edge `type === "logical-table-edge"`.
2. Source và target node phải đều là `logical-table`.
3. Handle format:

```ts
{columnId}-{side}
```

Ví dụ:

```ts
lid_cid_xxx_col_0-right
lid_cid_xxx_col_1-left
```

4. Nếu handle hợp lệ, code extract:
   - `columnId`.
   - `side`.
5. Nếu handle thiếu hoặc sai format, fallback:
   - `columnId = lid_${fallbackNodeId}_col_0`.
   - `side = "right"`.
6. `foreignKeyIndex` được extract từ source column id.
7. Stored edge lưu:
   - `source = sourceColumnId`.
   - `target = targetColumnId`.
   - `sourceSide`, `targetSide`.
   - `fkRef.tableId = sourceNode.id`.
   - `fkRef.foreignKeyIndex = sourceColumnIndex`.
   - `sourceCardinality`, `targetCardinality`.

Điểm cần chú ý: source side của stored edge luôn được hiểu là FK column side, target side là referenced column side. Khi user kéo edge giữa 2 columns, UI chuẩn hoá hướng edge theo rule:

- PK/CK -> Normal: Normal trở thành FK, PK/CK là referenced column.
- Normal -> PK/CK: Normal trở thành FK, PK/CK là referenced column.
- PK/CK -> PK/CK: target user kéo tới trở thành FK, source là referenced column; dùng cho 1-1.
- Normal -> Normal: mở dialog chọn column nào là FK; referenced column còn lại được set `isCandidateKey = true`.
- Properties panel không cho chỉnh cardinality/FK direction sau khi tạo edge.

## 8. Thuật toán map stored diagram -> ReactFlow

Hàm chính:

- `mapStoredNodesToReactNodes`.
- `mapStoredEdgesToReactEdges`.

### 8.1. Stored node -> logical-table node

Rule:

1. Stored node có `type === "table"` hoặc có `tableId` mà thiếu type thì map thành `logical-table`.
2. React node id ưu tiên `tableId`, fallback `id`.
3. Columns ưu tiên `stored.data.columns`.
4. Nếu thiếu `data.columns`, fallback từ stored columns:
   - `name = col.label || col.columnId`.
   - `isKey = col.decorations.pk || false`.
5. `functionalDependencies`, `showFDs` lấy từ `stored.data`.
6. `size` map về `style.width/height`.

### 8.2. Stored edge -> logical-table-edge

Rule:

1. Stored edge hợp lệ nếu `type === "fk"` hoặc `"noteLink"` và có string `source`, `target`.
2. Code extract source/target node id từ column id bằng regex:

```ts
^lid_(.+)_col_\d+$
```

3. Nếu không extract được node id, edge bị bỏ.
4. Nếu source/target node không tồn tại hoặc không phải logical table, edge bị bỏ.
5. ReactFlow edge dùng:
   - `source = sourceNodeId`.
   - `target = targetNodeId`.
   - `sourceHandle = ${edge.source}-${edge.sourceSide}` nếu có side.
   - `targetHandle = ${edge.target}-${edge.targetSide}` nếu có side.
   - `type = "logical-table-edge"`.
6. `edge.data` gồm:
   - `label`.
   - `controlPoints`.
   - `sourceCardinality`, fallback `"N"`.
   - `targetCardinality`, fallback `"1"`.

Legacy React edge format vẫn được support bằng cách ép `type = "logical-table-edge"` và giữ `data`.

## 9. Thuật toán build logical model từ diagram

Hàm chính: `buildLogicalModel` trong `logical-model.builder.ts`.

Đây là bước chuyển từ stored diagram sang `LogicalModelPayload`.

### 9.1. Step 1: tạo model metadata

Rule:

1. `model.id = schemaId ?? generateLid()`.
2. `model.name = schemaName ?? diagramName ?? "Untitled logical model"`.
3. `model.version = 1`.
4. Nếu không có stored node thì trả empty logical model.

### 9.2. Step 2: lọc table nodes

Code chỉ lấy:

```ts
node.type === "table" && node.tableId
```

Annotation nodes không vào logical model.

### 9.3. Step 3: build tableNodeMap

Map:

```ts
tableId -> stored table node
```

Map này dùng để resolve FK target table từ target column id.

### 9.4. Step 4: build FK map từ stored edges

Code duyệt stored edges có:

```ts
edge.type === "fk" && edge.fkRef
```

Với mỗi edge:

1. `sourceTableId = edge.fkRef.tableId`.
2. `columnIndex = edge.fkRef.foreignKeyIndex`.
3. Target node id được extract từ `edge.target` bằng regex `^lid_(.+)_col_\d+$`.
4. Tìm target table node trong `tableNodeMap`.
5. Tìm key column đầu tiên trong target stored columns có `decorations.pk`.
6. Extract target column index từ `edge.target`.
7. `targetColId = keyColumn?.columnId ?? lid_${targetNodeId}_col_${targetColIdx}`.
8. Lưu vào `fkMap[sourceTableId][columnIndex]`:

```ts
{
    refTableId: targetNodeId,
    refColumnId: targetColId
}
```

Điểm quan trọng: `refColumnId` dùng đúng stored edge `target` column id. UI chuẩn hoá edge target thành referenced column khi user kéo edge.

### 9.5. Step 5: build tableDataMap từ node.data

Với mỗi table node có `data.columns`, code lưu:

- `name`.
- `columns`.
- `functionalDependencies`.

Đây là nguồn đầy đủ cho logical column name/key/candidate key.

### 9.6. Step 6: build columns từ actual data

Nếu có `tableData.columns`, mỗi UI column được map sang model column:

```ts
{
    id: `lid_${tableId}_col_${idx}`,
    name: actualCol.name || `column_${idx}`,
    nullable: true,
    unique: false,
    roles: {
        primaryKey: actualCol.isKey ?? false,
        candidateKey: actualCol.isCandidateKey ? true : undefined,
        foreignKey: fkMap[tableId][idx] || undefined
    }
}
```

Rule đáng chú ý:

- Column id được generate theo index.
- Logical nullability hiện luôn `true`.
- Logical unique hiện luôn `false`.
- FK lấy từ edge-derived `fkMap`, không nằm trực tiếp trong column data.
- Candidate key được preserve nếu UI column có `isCandidateKey`.

### 9.7. Step 7: fallback columns từ stored columns

Nếu không có `tableData.columns`, code fallback sang `storedNode.columns`.

Rule:

- `id = storedCol.columnId || lid_${tableId}_col_${idx}`.
- `name = storedCol.label || storedCol.columnId || column_${idx}`.
- `nullable = true`.
- `unique = false`.
- `roles.primaryKey` theo `decorations.pk`.
- `roles.foreignKey` theo `fkMap`.

Fallback này không preserve candidate key vì code không đọc `decorations.ck` ở nhánh fallback.

### 9.8. Step 8: build FDs

FDs lấy từ `tableData.functionalDependencies`.

Rule:

- Giữ `id`.
- Giữ `left`.
- Giữ `right`.
- Nếu không có FD thì field `functionalDependencies` không set.

FD trong build model hiện là column names vì UI lưu FD theo tên column.

## 10. Thuật toán build diagram từ logical model

Hàm chính: `buildDiagramFromLogicalModel`.

Được dùng khi:

- AI/generated model apply.
- Convert sang logical.
- Import/sync model.
- Yjs model thay đổi từ ngoài.

### 10.1. Preserve position và size

Code tạo lookup:

- `tableId/id -> position`.
- `tableId/id -> size`.

Nếu table đã có trên canvas, giữ position và size cũ.

### 10.2. Auto layout cho table mới

Với table chưa có position:

1. Tính size bằng `computeTableSize(columnCount)`.
2. Build layout tables gồm:
   - `id`.
   - `size`.
   - `refIds`: các table được FK tham chiếu.
3. Gọi `computeELKTableLayout`.
4. Nếu đã có table cũ, table mới được offset xuống dưới vùng table cũ.

### 10.3. Build stored table node

Với mỗi logical table:

- `id = table.id`.
- `type = "table"`.
- `position`.
- `size`.
- `name = table.name`.
- `tableId = table.id`.
- `columns`: stored columns với `pk`, `ck`, `fk`, `underline`.
- `data`: `LogicalTableData`.

Mapping model -> UI data:

- `table.name -> data.name`.
- `col.name -> data.columns[].name`.
- `roles.primaryKey -> isKey`.
- `roles.candidateKey -> isCandidateKey`.
- `functionalDependencies -> functionalDependencies`.
- `showFDs` preserve từ existing node data nếu có.

### 10.4. Build FDs cho node

Khi model FD có `left/right`, code tạo `colIdToName`:

- map `col.id -> col.name`.
- map `col.name -> col.name`.

Sau đó convert:

- `left = fd.left.map(ref => colIdToName.get(ref) ?? ref)`.
- `right = fd.right.map(ref => colIdToName.get(ref) ?? ref)`.

Nhờ vậy FD vẫn hiển thị đúng nếu model lưu bằng column id hoặc column name.

### 10.5. Build FK edges từ model

Với mỗi column có `roles.foreignKey`:

1. Source column id luôn dùng standardized format:

```ts
lid_${table.id}_col_${colIdx}
```

2. Tìm target table bằng `fk.refTableId`.
3. Tìm target column index trong target table bằng `c.id === fk.refColumnId`.
4. Nếu không tìm thấy target column thì fallback index `0`.
5. Target column id:

```ts
lid_${fk.refTableId}_col_${targetColIdx}
```

6. Tạo stored edge:

```ts
{
    id: `e_fk_${table.id}_${colIdx}`,
    type: "fk",
    source: sourceColumnId,
    target: targetColumnId,
    sourceSide: "right",
    targetSide: "left",
    fkRef: {
        tableId: table.id,
        foreignKeyIndex: colIdx
    }
}
```

Edge id deterministic theo source table id và column index.

### 10.6. Preserve existing edges và unmodeled nodes

Sau khi generate model edges:

- Existing edges có id không trùng generated model edge id được giữ lại.
- Nếu `preserveUnmodeledNodes = true`, annotation/drawing nodes được giữ lại.
- Table nodes không còn trong model bị loại.

## 11. Logical table node UI

Component: `src/components/erds-notations/logical-table/index.tsx`.

Rule render:

- Header là table name, double-click để edit inline.
- Mỗi row là một column.
- Column id render handle theo format `lid_${nodeId}_col_${idx}`.
- Mỗi column có 2 handle:
  - `${columnId}-left`.
  - `${columnId}-right`.
- PK hiển thị icon key màu vàng.
- Candidate key hiển thị icon key màu tím nếu không phải PK.
- FK icon được derive từ edges: column là FK nếu nó là source handle của `logical-table-edge`.
- Node tự đo width/height theo content và update node style.
- `showFDs` bật thì render các FD dạng `left -> right`.

Điểm cần chú ý: FK icon trên node không đọc từ `data.columns`, mà derive từ current ReactFlow edges.

## 12. Logical edge UI và cardinality

Component: `src/components/logical-table-edge/index.tsx`.

Rule render:

- Edge dùng smooth step path.
- Source cardinality fallback `"N"`.
- Target cardinality fallback `"1"`.
- Nếu cardinality là `"N"` thì render crow's foot.
- Nếu cardinality là `"1"` thì render one bar.
- Khi selected, line dày hơn và có animation dots.
- Label được render nếu `data.label` tồn tại.

PropertiesPanel cho phép chọn:

- `N:1`.
- `1:1`.
- `1:N`.
- `N:N`.

Cardinality được lưu trong `edge.data.sourceCardinality` và `edge.data.targetCardinality`, rồi stored vào `StoredLogicalDiagramEdge`. Tuy nhiên `buildLogicalModel` hiện không dùng cardinality để set FK semantics; model chỉ dùng FK direction/source column.

## 13. Tạo và chỉnh logical table

### 13.1. Tạo table bằng model-first path

Khi đang ở logical schema và `logicalMutateModel` tồn tại, `addLogicalTable` đi qua model trước.

Rule tạo table:

- `id = generateDiagramId()`.
- `name = table_${model.tables.length + 1}`.
- Tạo 1 column:

```ts
{
    id: `lid_${id}_col_0`,
    name: "column_1",
    nullable: true,
    unique: false,
    roles: {}
}
```

Sau đó hook build lại diagram từ model và select table mới.

### 13.2. Fallback tạo table trực tiếp trên nodes

Nếu không có `mutateLogicalModel`, code tạo ReactFlow node trực tiếp:

- `type = "logical-table"`.
- `name = table_${count + 1}`.
- column mặc định:

```ts
{ name: "column_1", isKey: false }
```

### 13.3. Chỉnh column

PropertiesPanel cho:

- Add column.
- Remove column.
- Rename column.
- Toggle PK.
- Toggle candidate key.
- Reorder column bằng drag/drop.

Các update này mutate ReactFlow node data trước. Khi gọi `mutateModel`, hook rebuild model từ diagram để capture các diagram-only edits.

### 13.4. Chỉnh FD

PropertiesPanel cho:

- Add/remove FD.
- Chọn determinant `left`.
- Chọn dependent `right`.
- Toggle `showFDs`.

FD lưu bằng tên column.

## 14. Tạo FK edge

Entry point connect nằm trong `EditProject/index.tsx`.

Rule chọn edge type:

1. Nếu source hoặc target là logical table thì edge type là `logical-table-edge`.
2. Nếu source hoặc target là relation/physical table thì edge type là `relation-table-edge`.
3. Còn lại là `erd-edge`.

Với logical edge:

- `onConnect` tạo edge type `logical-table-edge`.
- Nếu source/target column đều là key thì default cardinality là `1:1`.
- FK direction được quyết định lúc kéo edge theo rule PK/CK/Normal. Properties panel không còn selector đổi cardinality/direction.

## 15. Collaboration và hybrid model/diagram

Hook `useLogicalCollaboration` quản lý:

- `diagramMap = ydoc.getMap("diagram")`.
- `modelMap = ydoc.getMap("model")`.

### 15.1. Initial sync

Khi provider synced:

1. Load model trước.
2. Load diagram sau.
3. Nếu diagram có content thì dùng diagram.
4. Nếu không có diagram nhưng có model thì generate diagram từ model.
5. Nếu không có cả hai thì canvas rỗng.

### 15.2. Diagram change

Khi diagram từ Yjs thay đổi:

1. Parse JSON.
2. Detect stored format.
3. Map stored nodes/edges sang ReactFlow.
4. Set nodes/edges.
5. Set flag sync để tránh write-back loop.

### 15.3. Local diagram save

Khi local `nodes` hoặc `edges` đổi:

1. Map ReactFlow nodes -> stored nodes.
2. Map ReactFlow edges -> stored edges.
3. Serialize:

```ts
{ diagram: { nodes, edges } }
```

4. Ghi vào Yjs `diagram`.

Code comment ghi rõ: effect này chỉ save diagram, không save model.

### 15.4. Model change

Khi model từ Yjs thay đổi bên ngoài:

1. Parse `LogicalModelPayload`.
2. Update `modelDataRef`.
3. Nếu initial sync đã xong và change không phải cùng batch diagram sync, regenerate diagram từ model.

### 15.5. applyModelPayload

Dùng khi nhận full logical model mới, ví dụ conversion hoặc AI.

Rule:

1. Build stored diagram từ model.
2. Preserve existing annotation nodes.
3. Map stored diagram sang ReactFlow.
4. Set nodes/edges.
5. Ghi model vào Yjs `model`.

### 15.6. mutateModel

Dùng cho incremental model mutation.

Rule:

1. Rebuild logical model từ diagram hiện tại bằng `buildLogicalModel`.
2. Nếu không có diagram thì fallback `modelDataRef` hoặc empty model.
3. Chạy `mutator(current)`.
4. Build diagram từ model mới.
5. Preserve annotation nodes.
6. Set nodes/edges.
7. Ghi model mới vào Yjs `model`.

Điểm khác physical: logical hook không có `modelDataState` React state riêng; return `modelData: modelDataRef.current`. Vì vậy thay đổi model ref không nhất thiết tự trigger render như state.

## 16. Tích hợp với tính năng khác

Logical schema là input/output chính cho:

- Convert Conceptual -> Logical.
- Convert Logical -> Conceptual.
- Convert Logical -> Physical.
- Convert Physical -> Logical.
- Normalization.
- Linter.
- ChatBox AI apply model.
- Sync schema.

Logical không export DDL trực tiếp. Muốn export DDL phải convert sang physical hoặc sync sang physical.

## 17. Những điểm cần chú ý khi maintain

1. Logical schema là DBMS-agnostic, không lưu DBMS/data type/index/default/auto increment.
2. Logical hiện vẫn là hybrid: diagram lưu canvas edits, model phục vụ semantic feature.
3. Local diagram save không ghi model.
4. Model chỉ được ghi qua `applyModelPayload` hoặc `mutateModel`.
5. `buildLogicalModel` suy FK từ edge, không từ column data.
6. Source side của edge là FK column side.
7. Stored logical edge source/target là column id, không phải table id.
8. Column id được generate theo index: `lid_${tableId}_col_${idx}`.
9. Reorder/delete column có thể ảnh hưởng FK vì `fkRef.foreignKeyIndex` dựa trên index.
10. `buildLogicalModel` luôn set `nullable: true`, `unique: false`.
11. Candidate key có thể mất nếu chỉ còn fallback stored columns, vì fallback không đọc `decorations.ck`.
12. Khi build FK map từ diagram, target `refColumnId` là đúng column id ở stored edge target.
13. Cardinality visual được lưu trên stored edge nhưng không ảnh hưởng `LogicalModelPayload`.
14. FD lưu bằng tên column trong UI; build diagram có helper map column id -> name để hiển thị.
15. `showFDs` là UI state, không phải semantic rule của model.
16. Existing non-model edges được preserve khi build diagram từ model nếu id không trùng generated FK edge id.
17. Annotation nodes được preserve khi `preserveUnmodeledNodes = true`, table nodes không còn trong model bị xóa.

## 18. Bảng tóm tắt thuật toán

| Thuật toán | Input | Output | Rule chính |
|---|---|---|---|
| `mapReactNodesToStoredNodes` | ReactFlow nodes | Stored nodes | Logical table thành table node, full data nằm trong `data`, annotation được giữ |
| `mapReactEdgesToStoredEdges` | ReactFlow edges + nodes | Stored FK edges | Handle `{columnId}-{side}`, source column là FK side |
| `mapStoredNodesToReactNodes` | Stored nodes | ReactFlow nodes | Table node thành `logical-table`, ưu tiên `stored.data` |
| `mapStoredEdgesToReactEdges` | Stored edges + nodes | ReactFlow edges | Extract node id từ column id, restore handle và cardinality |
| `buildLogicalModel` | Stored diagram | `LogicalModelPayload` | Table data từ node data, FK từ edges, FD từ node data |
| `buildDiagramFromLogicalModel` | `LogicalModelPayload` | Stored diagram | Preserve layout, auto-layout table mới, tạo FK edge từ column roles |
| `applyModelPayload` | Full model mới | ReactFlow + Yjs model | Replace model, regenerate diagram |
| `mutateModel` | Mutator function | Model mới + diagram mới | Rebuild model từ diagram trước, mutate, regenerate |
