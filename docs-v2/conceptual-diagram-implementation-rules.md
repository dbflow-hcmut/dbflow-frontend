# Conceptual Diagram: Model, Diagram và Rule Implementation

Tài liệu này mô tả conceptual diagram đang được hiện thực trong code: data model conceptual, stored diagram, rule map ReactFlow <-> stored diagram, thuật toán build conceptual model từ ER diagram, thuật toán build diagram từ model, edge classification, attribute hierarchy, ISA/category, collaboration, và các điểm cần chú ý khi maintain. Flow UI chỉ ghi ngắn; trọng tâm là thuật toán và rule.

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Runtime chính của màn Edit Project, chọn schema conceptual, connect edge, convert/sync/linter | `src/components/EditProject/index.tsx` |
| Hook collaboration cho conceptual diagram, sync Yjs diagram/model | `src/components/EditProject/hooks/useConceptualCollaboration.ts` |
| Conceptual model payload, build model từ diagram, build diagram từ model | `src/components/EditProject/utils/conceptual-model.builder.ts` |
| Mapping ReactFlow node/edge sang stored conceptual diagram và ngược lại | `src/components/EditProject/utils/conceptual-diagram.builder.ts` |
| Auto-layout skeleton conceptual bằng ELK | `src/components/EditProject/utils/conceptual-elk-layout.ts` |
| Entity node UI | `src/components/erds-notations/entity/index.tsx` |
| Relationship node UI | `src/components/erds-notations/relationship/index.tsx` |
| Attribute node UI | `src/components/erds-notations/attribute/index.tsx` |
| Constraint node UI, dùng cho ISA/category | `src/components/erds-notations/constraint/index.tsx` |
| Conceptual ER edge UI | `src/components/erd-edge/index.tsx` |
| Tạo entity/relationship/attribute/constraint | `src/components/EditProject/utils/functions.ts` |
| Properties panel cho name, attribute key, relationship cardinality, edge style/label | `src/components/EditProject/components/PropertiesPanel/index.tsx` |
| Convert conceptual <-> logical/physical | `src/components/EditProject/utils/schema-conversion.ts` |
| Linter conceptual | `src/components/EditProject/utils/schema-linter.ts` |

## 2. Flow runtime sơ lược

Conceptual schema active khi:

```ts
selectedSchema.type === SchemaType.CONCEPTUAL
```

Flow chính:

1. `EditProject` bật `useConceptualCollaboration`.
2. Hook đọc `diagram` và `model` từ Yjs.
3. Nếu có diagram đã lưu thì map stored diagram sang ReactFlow.
4. Nếu không có diagram nhưng có model thì generate diagram từ model.
5. User chỉnh entity/relationship/attribute/constraint/edge trên canvas.
6. Diagram edits được serialize vào Yjs `diagram`.
7. Model chỉ được ghi vào Yjs `model` khi gọi `applyModelPayload()` hoặc `mutateModel()`.

Conceptual hiện là kiến trúc hybrid:

- `diagram` là nguồn vận hành cho canvas edits, position, size, edge labels, annotation/unmodeled nodes.
- `model` là nguồn semantic cho AI apply, conversion, linter.
- Khi `mutateModel()` chạy, hook rebuild model từ diagram hiện tại trước để capture các edit đang nằm trong canvas.

## 3. ConceptualModelPayload

Type chính nằm trong `conceptual-model.builder.ts`.

```ts
export type ConceptualModelPayload = {
    model: {
        id: string;
        name: string;
        version: number;
        notes?: string;
    };
    entities: ModelEntity[];
    relationships: ModelRelationship[];
    generalizations?: ModelGeneralization[];
    categories?: ModelCategory[];
    constraints?: unknown[];
    notes?: string;
    tags?: string[];
};
```

Conceptual model là EER-level model. Nó không chứa table/column relational trực tiếp.

## 4. Conceptual model types

### 4.1. Entity

`ModelEntity` gồm:

- `id`.
- `name`.
- `kind`: `"strong"` hoặc `"weak"`.
- `attributes`.
- `notes?`.

Weak entity được biểu diễn trên diagram bằng entity double stroke hoặc metadata variant `"double"`.

### 4.2. Attribute

`ModelAttribute` gồm:

- `id`.
- `name`.
- `kind`: `"simple"`, `"composite"`, `"multi_valued"`, `"complex"`, `"derived"`.
- `isKey`.
- `semantics?`.
- `components?`.
- `derivation?`.
- `notes?`.

Mapping visual:

- Single ellipse -> `simple`.
- Double ellipse -> `multi_valued`.
- Dashed ellipse -> `derived`.
- Underline -> `isKey = true`.
- Attribute có children -> `composite`.
- Attribute có children và child cũng có children -> `complex`.

### 4.3. Relationship

`ModelRelationship` gồm:

- `id`.
- `name`.
- `type`: `"association"` hoặc `"identifying"`.
- `arity?`.
- `ends`.
- `attributes?`.
- `semantics?`, `notes?`.

Identifying relationship được biểu diễn bằng relationship double stroke hoặc relationship metadata variant `"double"`.

### 4.4. Relationship end

`RelationshipEnd` gồm:

- `entityId`.
- `role?`.
- `cardinality?`.
- `optional?`.

Rule:

- `optional: false` khi participation edge có double line.
- `optional: true` khi không có double line.
- `role` lấy từ center label của edge hoặc tự sinh `role_1`, `role_2` cho recursive relationship.

### 4.5. Generalization

`ModelGeneralization` gồm:

- `id`.
- `parentEntityId`.
- `childEntityIds`.
- `categoryBy?`.
- `constraints.disjointness`: `"disjoint"` hoặc `"overlap"`.
- `constraints.completeness`: `"total"` hoặc `"partial"`.

ISA circle `d` -> disjoint. ISA circle `o` -> overlap.

### 4.6. Category / Union

`ModelCategory` gồm:

- `id`.
- `categoryEntityId`.
- `superclassEntityIds`.
- `completeness`: `"total"` hoặc `"partial"`.
- `notes?`.

Category dùng union circle symbol `U`.

## 5. Stored conceptual diagram

Stored diagram nằm trong `conceptual-diagram.builder.ts`.

### 5.1. StoredDiagramNode

Stored node có các field chung:

- `id`.
- `type`.
- `position`.
- `size`.
- `zIndex?`.
- `style?`.
- `name?`.

Các id semantic:

- `entityId?`.
- `relationshipId?`.
- `attributeId?`.

Các render metadata:

- `entityRender.doubleStroke`.
- `relationshipRender.doubleStroke`.
- `attributeRender.doubleEllipse`.
- `attributeRender.dashed`.
- `attributeRender.underline`.
- `isaCircle.symbol`.
- `unionCircle.symbol`, `unionCircle.categoryId`.

`style.meta` cũng có thể lưu metadata bổ sung:

- Entity variant/fields.
- Relationship variant/cardinalities.
- Attribute variant/isKey.

### 5.2. StoredDiagramEdge

Stored edge có:

- `id`.
- `type`.
- `from: { nodeId, portId? }`.
- `to: { nodeId, portId? }`.
- `relationshipId?`.
- `generalizationId?`.
- `categoryId?`.
- `labels?`.
- `endStyle?`.

Edge types:

- `participation`: relationship - entity.
- `identifying`: identifying relationship - entity.
- `attrOf`: attribute - entity/relationship.
- `componentOf`: attribute - attribute.
- `isaParent`: entity -> ISA circle.
- `isaChild`: ISA circle -> entity.
- `categoryLink`: category entity -> union circle.
- `categoryMember`: union circle -> superclass entity.

Labels:

- `nearFrom`: multiplicity/cardinality gần source.
- `nearTo`: multiplicity/cardinality gần target.
- `center`: label giữa edge, dùng cho role/relationship label.

End style:

- `doubleLine`: total participation hoặc total completeness.
- `bracket`: identifying/category bracket.

## 6. Thuật toán map ReactFlow node -> stored node

Hàm chính: `mapReactNodesToStoredNodes`.

### 6.1. Entity node

ReactFlow:

```ts
type: "entity"
data: { name, fields, variant }
```

Stored rule:

- `type = "entity"`.
- `entityId = node.id`.
- `name = data.name`.
- `position`, `size`, `zIndex` được preserve.
- Nếu `variant === "double"` thì set `entityRender.doubleStroke = true`.
- Nếu `variant === "dashed"` thì lưu vào `style.meta.entity.variant`.
- Nếu có `fields` thì lưu vào `style.meta.entity.fields`.

### 6.2. Relationship node

ReactFlow:

```ts
type: "relationship"
data: { name, variant, cardinalities }
```

Stored rule:

- `type = "relationship"`.
- `relationshipId = node.id`.
- `name = data.name`.
- Nếu `variant === "double"` thì set `relationshipRender.doubleStroke = true`.
- Nếu `variant === "dashed"` thì lưu vào `style.meta.relationship.variant`.
- Nếu có `cardinalities` thì lưu vào `style.meta.relationship.cardinalities`.

### 6.3. Attribute node

ReactFlow:

```ts
type: "attribute"
data: { name, variant, isKey }
```

Stored rule:

- `type = "attribute"`.
- `attributeId = node.id`.
- `name = data.name`.
- `variant === "double"` -> `attributeRender.doubleEllipse = true`.
- `variant === "dashed"` -> `attributeRender.dashed = true`.
- `isKey === true` -> `attributeRender.underline = true`, `underlineStyle = "solid"`.

### 6.4. Constraint node

ReactFlow:

```ts
type: "constraint"
data: { symbol: "d" | "o" | "u" }
```

Stored rule:

- `symbol === "u"` -> `type = "unionCircle"`, `unionCircle.symbol = "U"`, `categoryId = node.id`.
- `symbol === "d"` hoặc `"o"` -> `type = "isaCircle"`, `isaCircle.symbol = symbol`.

### 6.5. Relation table node trong conceptual diagram

Nếu conceptual diagram có node `type === "relation"`, code lưu thành stored node `type = "note"` với `text` prefix:

```ts
RELATION_NOTE_PREFIX + JSON.stringify({ name, columns })
```

Khi load lại, nếu note có prefix này thì map lại thành relation table node.

Đây là compatibility path, không phải conceptual semantic model chính.

## 7. Thuật toán classify ReactFlow edge -> stored edge

Hàm chính: `classifyEdge` trong `conceptual-diagram.builder.ts`.

### 7.1. Attribute - attribute

Nếu source và target đều là `attribute`:

```ts
type = "componentOf"
```

Ý nghĩa: attribute con thuộc composite/complex attribute cha.

### 7.2. Attribute hoặc relation table liên quan

Nếu một phía là `attribute`, hoặc một phía là `relation`:

```ts
type = "attrOf"
```

Ý nghĩa: attribute thuộc entity/relationship, hoặc relation compatibility node được nối như attribute-owner edge.

### 7.3. Constraint edge

Nếu một phía là `constraint`:

#### Union/category

Nếu constraint symbol là `u`:

- Constraint là source -> `categoryMember`.
- Constraint là target -> `categoryLink`.
- `categoryId = constraint.id`.

#### ISA

Nếu constraint symbol là `d` hoặc `o` và phía còn lại là entity:

- Constraint là source -> `isaChild`.
- Constraint là target -> `isaParent`.
- `generalizationId = constraint.id`.

### 7.4. Relationship - entity

Nếu relationship nối entity:

- Nếu edge `data.lineStyle === "bracket"` -> `identifying`.
- Ngược lại -> `participation`.
- `relationshipId` là id của relationship node.

### 7.5. Fallback

Nếu không match rule nào:

```ts
type = "attrOf"
```

## 8. Thuật toán map ReactFlow edge -> stored edge

Hàm chính: `mapReactEdgeToStoredEdge`.

Rule:

1. Lấy source/target node từ node map.
2. Classify edge bằng `classifyEdge`.
3. Build labels:
   - `data.fromMult -> labels.nearFrom`.
   - `data.toMult -> labels.nearTo`.
   - `data.label` hoặc `edge.label` -> `labels.center`.
4. Build end style:
   - `lineStyle === "double"` -> double line cả hai đầu.
   - `lineStyle === "bracket"` -> bracket ở `from` hoặc `to` theo `bracketDirection`, default `to`.
5. Extract port id từ handle:
   - chỉ nhận `top`, `bottom`, `left`, `right`.
   - sourceHandle `left-source` -> `portId = "left"`.
6. Stored edge gồm:
   - `from.nodeId = edge.source`.
   - `to.nodeId = edge.target`.
   - optional `from.portId`, `to.portId`.
   - classification metadata.
7. Riêng `categoryLink` luôn ép bracket ở phía `to`.

## 9. Thuật toán map stored diagram -> ReactFlow

Hàm chính:

- `mapStoredNodesToReactNodes`.
- `mapStoredEdgesToReactEdges`.

### 9.1. Stored node -> ReactFlow node

Rule:

- Stored entity -> `type = "entity"`.
- Stored relationship -> `type = "relationship"`.
- Stored attribute -> `type = "attribute"`.
- `isaCircle` hoặc `unionCircle` -> `type = "constraint"`.
- `note` có relation prefix -> `type = "relation"`.
- Annotation `sticky-note`, `text-label`, `drawing-path` giữ nguyên.
- Unknown fallback thành entity node.

Variant restore:

- Entity double stroke -> `data.variant = "double"`.
- Relationship double stroke -> `data.variant = "double"`.
- Attribute double ellipse -> `data.variant = "double"`.
- Attribute dashed -> `data.variant = "dashed"`.
- Attribute underline -> `data.isKey = true`.
- ISA `o` -> constraint symbol `"o"`.
- ISA default -> `"d"`.
- Union circle -> constraint symbol `"u"`.

### 9.2. Stored edge -> ReactFlow edge

Rule:

1. Nếu `from.nodeId` hoặc `to.nodeId` không tồn tại trong node map thì edge bị bỏ.
2. Build `data.lineStyle`:
   - Có bracket -> `"bracket"`.
   - Có double line ở from/to -> `"double"`.
   - Ngược lại -> `"single"`.
3. `data.fromMult = labels.nearFrom`.
4. `data.toMult = labels.nearTo`.
5. `data.label = labels.center`.
6. `data.storedType = edge.type`.
7. `data.bracketDirection` lấy từ bracket ở from/to.
8. React edge:
   - `source = edge.from.nodeId`.
   - `target = edge.to.nodeId`.
   - `type = "erd-edge"`.
   - sourceHandle/targetHandle restore từ port id.
9. Dedup edge theo id để tránh stale Yjs data duplicate.

## 10. Thuật toán build conceptual model từ diagram

Hàm chính: `buildConceptualModel`.

Đây là bước chuyển stored diagram thành `ConceptualModelPayload`.

### 10.1. Step 1: model metadata

Rule:

1. `model.id = schemaId ?? generateCid()`.
2. `model.name = schemaName ?? diagramName ?? "Untitled model"`.
3. `model.version = 1`.
4. Nếu không có stored nodes thì trả empty conceptual model.

### 10.2. Step 2: collect attribute hierarchy

Hàm: `collectAttributeHierarchy`.

Code duyệt stored edges:

```ts
edge.type === "componentOf"
```

Rule:

- `parentId = edge.from.nodeId`.
- `childId = edge.to.nodeId`.
- `parentMap[childId] = parentId`.
- `childrenMap[parentId].push(childId)`.

Ý nghĩa: attribute source là parent composite attribute, target là child component.

### 10.3. Step 3: build attribute factory

Hàm: `buildAttributeFactory`.

Rule build attribute:

1. Node phải tồn tại và `type === "attribute"`.
2. Lấy children từ `childrenMap`.
3. Children được map thành `components` với:
   - `id`.
   - `name`.
   - `kind = "simple"`.
4. Determine attribute kind:
   - Có children và child cũng có children -> `complex`.
   - Có children -> `composite`.
   - `attributeRender.doubleEllipse` -> `multi_valued`.
   - `attributeRender.dashed` -> `derived`.
   - Fallback -> `simple`.
5. `isKey = Boolean(attributeRender.underline)`.
6. Nếu dashed thì set `derivation = "derived"`.
7. Cache attribute theo node id để tránh build trùng.

Lưu ý: nested components sâu hơn 1 tầng chỉ ảnh hưởng `kind = complex`; components list chỉ chứa direct children dưới dạng simple components.

### 10.4. Step 4: collect owner attributes

Hàm: `collectOwnerAttributes`.

Code duyệt edge:

```ts
edge.type === "attrOf"
```

Rule:

1. Xác định phía nào là attribute node.
2. Phía còn lại phải là entity hoặc relationship.
3. Nếu attribute có parent trong hierarchy thì skip, vì nested attribute được biểu diễn qua parent component.
4. Build attribute bằng factory.
5. Nếu owner là entity -> đưa vào `entityAttributes[entityId]`.
6. Nếu owner là relationship -> đưa vào `relationshipAttributes[relationshipId]`.
7. Dedup attribute theo id trong cùng owner.

### 10.5. Step 5: build entities

Code lấy stored nodes:

```ts
node.type === "entity"
```

Mỗi entity:

- `id = entityId ?? node.id`.
- `name = node.name ?? id`.
- `kind = weak` nếu double stroke hoặc style meta variant double, ngược lại strong.
- `attributes = entityAttributes[entityId] ?? []`.

### 10.6. Step 6: build relationship ends

Hàm: `buildRelationshipEnds`.

Code chỉ xét edge:

```ts
edge.type === "participation" || edge.type === "identifying"
```

Và:

```ts
edge.relationshipId === relationshipId
```

Rule cho mỗi end:

1. Tìm entity node trong from/to.
2. `entityId = entityId ?? node.id`.
3. Xác định entity nằm ở from hay to.
4. Cardinality lấy theo thứ tự:
   - Nếu entity là from: `labels.nearTo`.
   - Nếu entity là to: `labels.nearFrom`.
   - `relationshipMetaCardinality[edge.id]`.
   - `relationshipMetaCardinality[entityId]`.
5. `optional = false` nếu end phía entity có double line.
6. `optional = true` nếu không có double line.
7. Role:
   - lấy từ `labels.center`.
   - nếu recursive relationship và entity xuất hiện nhiều lần thì tự sinh `role_${count}` cho lần sau.

Cardinality direction hơi ngược trực giác vì label nearFrom/nearTo là vị trí label trên edge, không nhất thiết là semantic side. Code đang map theo entity position để lấy label gần phía đối diện.

### 10.7. Step 7: build relationships

Code lấy stored nodes:

```ts
node.type === "relationship"
```

Mỗi relationship:

- `id = relationshipId ?? node.id`.
- `name = node.name ?? id`.
- `type = identifying` nếu double stroke hoặc meta variant double, ngược lại association.
- `ends = buildRelationshipEnds(...)`.
- `arity = ends.length || undefined`.
- `attributes = relationshipAttributes[relationshipId]`.

### 10.8. Step 8: build generalizations

Hàm: `buildGeneralizations`.

Rule:

1. Lấy nodes `type === "isaCircle"`.
2. Với mỗi circle:
   - Tìm edge `type === "isaParent"` cùng `generalizationId`.
   - Tìm các edge `type === "isaChild"` cùng `generalizationId`.
3. Parent:
   - Với `isaParent`, entity parent là entity ở edge from hoặc to.
   - Comment code kỳ vọng entity -> isaCircle, nhưng vẫn fallback tìm entity ở cả hai đầu.
4. Children:
   - Với `isaChild`, child entity là entity ở edge to hoặc from.
5. Nếu không có parent hoặc không có child thì bỏ qua.
6. Disjointness:
   - circle symbol `"o"` -> `overlap`.
   - còn lại -> `disjoint`.
7. Completeness:
   - parent edge có double line ở from hoặc to -> `total`.
   - ngược lại -> `partial`.

### 10.9. Step 9: build categories

Hàm: `buildCategories`.

Rule:

1. Lấy nodes `type === "unionCircle"`.
2. `categoryId = unionCircle.categoryId ?? node.id`.
3. Tìm `categoryLink` cùng category id.
4. Category entity là entity ở categoryLink from hoặc to.
5. Tìm các `categoryMember` cùng category id.
6. Superclass entity là entity ở categoryMember to hoặc from.
7. Nếu không có category entity hoặc superclass list rỗng thì bỏ qua.
8. Completeness:
   - categoryLink có double line ở from hoặc to -> `total`.
   - ngược lại -> `partial`.

### 10.10. Output model

Output:

- `model`.
- `entities`.
- `relationships`.
- `generalizations` nếu có.
- `categories` nếu có.
- `constraints: []`.

## 11. normalizeConceptualModel

Hàm `normalizeConceptualModel` dùng để normalize raw/legacy model JSON, đặc biệt từ AI.

Rule:

1. Entity attributes:
   - `kind` thiếu -> `"simple"`.
   - `identifier: true` hoặc `isKey: true` -> `isKey: true`.
   - Preserve `semantics`, `components`, `derivation`, `notes`.
2. Entity:
   - `kind` thiếu -> `"strong"`.
3. Relationship:
   - Nếu có `ends` thì dùng trực tiếp.
   - Nếu legacy flat format có `fromEntity`, `toEntity`, `fromCardinality`, `toCardinality` thì convert thành `ends`.
   - `type` thiếu -> `"association"`.
4. Model metadata:
   - Nếu thiếu `raw.model`, tạo `{ id: generateCid(), name: "Imported model", version: 1 }`.
5. Preserve `generalizations`, `categories`, `notes`, `tags` nếu có.

## 12. Thuật toán build diagram từ conceptual model

Hàm chính: `buildDiagramFromModel`.

Đây là chiều model -> stored diagram. Được dùng khi AI apply model, convert sang conceptual, hoặc model Yjs thay đổi từ ngoài.

### 12.1. Phase 1: collect skeleton layout items

Skeleton gồm:

- Entities.
- Relationships.
- ISA circles.
- Union circles.

Attributes không đưa vào ELK skeleton. Attributes được đặt bằng fan layout sau khi skeleton đã có position.

Mỗi skeleton item có:

- `id`.
- `width`.
- `height`.
- `fixed` nếu existing node đã có position.

Layout edges:

- Relationship -> connected entities.
- Parent entity -> ISA circle.
- ISA circle -> child entities.
- Category entity -> union circle.
- Union circle -> superclass entities.

### 12.2. Phase 2: run ELK layout

Nếu có node cần layout:

```ts
computeELKLayout(layoutItems, layoutEdges)
```

Position priority:

1. Existing user-placed position.
2. ELK-computed position.
3. Fallback `{ x: 0, y: 0 }`.

Size priority:

1. Existing user-resized size.
2. Computed text-based size.

### 12.3. Phase 3a: emit entity nodes

For each entity:

- `id = entity.id`.
- `type = "entity"`.
- `position = getPos(entity.id)`.
- `size = entityNodeSize(entity.name)` hoặc existing size.
- `name = entity.name`.
- `entityId = entity.id`.
- `entityRender.doubleStroke = true` nếu `entity.kind === "weak"`.

### 12.4. Phase 3b: emit relationship nodes và participation edges

For each relationship:

- Tạo relationship node:
  - `id = rel.id`.
  - `type = "relationship"`.
  - `name = rel.name`.
  - double stroke nếu `rel.type === "identifying"`.
  - style meta relationship chứa cardinalities map và variant double nếu cần.

Cardinalities map:

- Key theo generated edge id:

```ts
e_${rel.id}_${end.entityId}_${endIdx}
```

- Value là `end.cardinality`.

Participation edge:

- `id = e_${rel.id}_${end.entityId}_${endIdx}`.
- `type = "participation"`.
- `from = relationship`.
- `to = entity`.
- `relationshipId = rel.id`.
- Nếu `end.cardinality` có thì set `labels.nearFrom = end.cardinality`.
- Nếu recursive và `end.role` có thì set `labels.center = end.role`.
- Nếu `end.optional === false` thì set `endStyle.to.doubleLine = true`.

Recursive relationship:

- Nếu relationship có ít nhất 2 ends và 2 end đầu trỏ cùng entity, code gán port:
  - end 0 -> `left`.
  - end 1 -> `right`.

### 12.5. Phase 3c: attribute fan-arc placement

Attributes không chạy ELK. Code đặt attribute quanh owner bằng fan-arc.

Rule:

1. Build neighbor map từ skeleton layout edges.
2. Với mỗi owner entity/relationship:
   - Tính base angle mặc định:
     - entity: top-center.
     - relationship: bottom.
   - Nếu owner có skeleton neighbors, tính vector trung bình tới neighbors.
   - Base angle mới là hướng ngược lại vector trung bình, tức đặt attributes tránh hướng có edges.
3. Gọi `emitAttributeNodes`.

### 12.6. emitAttributeNodes

Với mỗi attribute:

1. Tính size theo text width.
2. Tính arc span dựa vào số lượng attributes, radius, width, min gap.
3. Position:
   - Existing position nếu có.
   - Nếu không thì fan position quanh owner.
4. Emit attribute node:
   - `type = "attribute"`.
   - `attributeId = attr.id`.
   - `attributeRender` theo kind/key.
5. Emit edge:

```ts
type = "attrOf"
from = attribute
to = owner
```

Composite components:

1. Nếu `attr.components` có dữ liệu, đặt components thành fan nhỏ quanh attribute cha.
2. Emit component node `type = "attribute"`.
3. Emit edge:

```ts
type = "componentOf"
from = parent attribute
to = component attribute
```

### 12.7. Phase 3d: generalizations

For each generalization:

1. Tạo ISA circle node:
   - `id = gen.id`.
   - `type = "isaCircle"`.
   - symbol `"o"` nếu overlap, `"d"` nếu disjoint.
2. Tạo parent edge:
   - `id = e_isa_p_${gen.id}`.
   - `type = "isaParent"`.
   - `from = parentEntityId`.
   - `to = gen.id`.
   - Nếu completeness total thì `endStyle.from.doubleLine = true`.
3. Tạo child edges:
   - `id = e_isa_c_${gen.id}_${childId}`.
   - `type = "isaChild"`.
   - `from = gen.id`.
   - `to = childId`.

### 12.8. Phase 3e: categories

For each category:

1. Tạo union circle:
   - `id = cat.id`.
   - `type = "unionCircle"`.
   - `unionCircle.symbol = "U"`.
   - `categoryId = cat.id`.
2. Tạo category link edge:
   - `id = e_catl_${cat.id}`.
   - `type = "categoryLink"`.
   - `from = categoryEntityId`.
   - `to = cat.id`.
   - Luôn có bracket ở `to`.
   - Nếu completeness total thì `from.doubleLine = true`.
3. Tạo member edges:
   - `id = e_catm_${cat.id}_${superclassId}`.
   - `type = "categoryMember"`.
   - `from = union circle`.
   - `to = superclass entity`.

### 12.9. Phase 3f: preserve unmodeled nodes

Nếu `preserveUnmodeledNodes = true`:

- Existing node không có trong generated model nodes được giữ lại.
- Existing edge không trùng id generated edge và nối tới ít nhất một unmodeled node cũng được giữ.

Điểm khác logical/physical: conceptual preserve tất cả unmodeled nodes, không chỉ annotation. Điều này giúp giữ floating attributes hoặc nodes chưa nối vào model.

## 13. Conceptual node UI

### 13.1. Entity

Component: `erds-notations/entity`.

Rule visual:

- Rectangle.
- `variant = "double"` -> double rectangle, dùng cho weak entity.
- `variant = "dashed"` -> dashed rectangle.
- Inline edit name bằng double click.
- Auto-resize khi text overflow.
- NodeResizer khi selected.

### 13.2. Relationship

Component: `erds-notations/relationship`.

Rule visual:

- Diamond.
- `variant = "double"` -> double diamond, dùng cho identifying relationship.
- `variant = "dashed"` -> dashed diamond.
- Inline edit name.
- Auto-resize khi text overflow.

### 13.3. Attribute

Component: `erds-notations/attribute`.

Rule visual theo data:

- `variant = "single"` -> ellipse thường.
- `variant = "double"` -> double ellipse, multi-valued attribute.
- `variant = "dashed"` -> dashed ellipse, derived attribute.
- `isKey` -> underline.

### 13.4. Constraint

Component: `erds-notations/constraint`.

Rule:

- `d` / `o` dùng cho ISA disjoint/overlap.
- `u` dùng cho category/union.

## 14. Conceptual edge UI

Component: `src/components/erd-edge/index.tsx`.

Rule render:

- Edge là straight path.
- `lineStyle = "single"` -> một đường.
- `lineStyle = "double"` -> vẽ thêm parallel line.
- `lineStyle = "bracket"` -> vẽ bracket ở phía `from` hoặc `to`.
- `data.label` render ở center.
- `data.fromMult` render gần source.
- `data.toMult` render gần target.

PropertiesPanel cho conceptual edge:

- Chọn edge line style: single, double, identifying/bracket.
- Nếu bracket thì chọn direction `from` hoặc `to`.
- Nếu edge là participation/identifying thì có label.
- Relationship cardinality update ghi vào relationship node `data.cardinalities` và edge `fromMult` hoặc `toMult`.

## 15. Tạo và chỉnh conceptual diagram

### 15.1. Tạo entity/relationship bằng model-first path

Khi đang ở conceptual schema và có `conceptualMutateModel`, các creator sau đi qua model trước:

- `addEntity`.
- `addDoubleEntity`.
- `addRelationship`.
- `addDoubleRelationship`.

Rule:

- Strong entity:

```ts
{ id, name: `ent_${model.entities.length + 1}`, kind: "strong", attributes: [] }
```

- Weak entity:

```ts
{ id, name: `ent_${model.entities.length + 1}`, kind: "weak", attributes: [] }
```

- Association relationship:

```ts
{ id, name: `rel_${model.relationships.length + 1}`, type: "association", ends: [] }
```

- Identifying relationship:

```ts
{ id, name: `rel_${model.relationships.length + 1}`, type: "identifying", ends: [] }
```

Sau mutation, hook regenerate diagram từ model và select node mới.

### 15.2. Attribute/constraint vẫn là diagram-first

Các creator sau hiện mutate ReactFlow nodes trực tiếp:

- `addAttribute`.
- `addMultivaluedAttribute`.
- `addDashedAttribute`.
- `addConstraint`.

Ý nghĩa:

- Attribute và constraint được đưa vào model sau khi có diagram edges và `buildConceptualModel()` chạy.
- Đây là dấu hiệu conceptual schema vẫn hybrid, chưa pure model-as-truth.

### 15.3. Drag/drop từ sidebar

Trong `handleDrop`, conceptual model-first path cũng chỉ áp dụng cho:

- `entity`.
- `double-entity`.
- `relationship`.
- `double-relationship`.

Các node type khác đi fallback direct node creation.

## 16. Collaboration và hybrid model/diagram

Hook `useConceptualCollaboration` quản lý:

- `diagramMap = ydoc.getMap("diagram")`.
- `modelMap = ydoc.getMap("model")`.

### 16.1. Initial sync

Khi provider synced:

1. Load model trước bằng `loadModelFromYjs()`.
2. Load diagram sau bằng `loadDiagramFromYjs()`.
3. Nếu diagram có content thì diagram được ưu tiên để giữ positions/layout.
4. Nếu diagram không có content nhưng model có entities/tables thì generate diagram từ model.
5. Nếu không có cả hai thì canvas rỗng.

### 16.2. Diagram change

Khi Yjs diagram thay đổi:

1. Parse JSON.
2. Detect stored format bằng `size` hoặc semantic ids `entityId/attributeId/relationshipId`.
3. Nếu stored format thì map stored nodes/edges sang ReactFlow.
4. Nếu React format legacy thì chỉ set selected false.
5. Set nodes/edges.
6. Set flag sync để tránh write-back loop.

### 16.3. Local diagram save

Khi local `nodes` hoặc `edges` đổi:

1. Map ReactFlow nodes -> stored nodes.
2. Map ReactFlow edges -> stored edges.
3. Serialize:

```ts
{ diagram: { nodes, edges } }
```

4. Ghi vào Yjs `diagram`.

Code comment ghi rõ: effect này không ghi model vào Yjs. Model chỉ cập nhật qua `applyModelPayload()` hoặc `mutateModel()`.

### 16.4. Model change

Khi model từ Yjs thay đổi bên ngoài:

1. Parse model.
2. Lưu vào `modelDataRef`.
3. Nếu initial sync đã hoàn tất và change không phải cùng batch diagram sync, regenerate diagram từ model.
4. Trong initial sync, model change chỉ được lưu ref, không regenerate ngay để tránh overwrite saved positions.

### 16.5. applyModelPayload

Dùng cho full replace model, ví dụ AI apply model.

Rule:

1. Normalize model bằng `normalizeConceptualModel`.
2. Build diagram từ model, preserve existing nodes/edges khi có thể.
3. Map stored diagram sang ReactFlow.
4. Set nodes/edges.
5. Ghi normalized model vào Yjs `model`.

### 16.6. mutateModel

Dùng cho structural edit model-first.

Rule:

1. Rebuild model từ diagram hiện tại bằng `buildConceptualModel`.
2. Nếu không có diagram thì fallback `modelDataRef` hoặc empty model.
3. Chạy mutator.
4. Build diagram từ model mới.
5. Preserve unmodeled nodes.
6. Set nodes/edges.
7. Ghi model mới vào Yjs `model`.

## 17. Tích hợp với tính năng khác

Conceptual model là input/output cho:

- Convert Conceptual -> Logical.
- Convert Conceptual -> Physical.
- Convert Logical -> Conceptual.
- Convert Physical -> Conceptual.
- Linter conceptual.
- ChatBox AI apply model.
- Sync schema.
- HTML docs export.

Conceptual không export DDL trực tiếp. Muốn DDL cần convert sang physical.

## 18. Những điểm cần chú ý khi maintain

1. Conceptual schema vẫn hybrid, không phải pure model-as-truth.
2. Diagram local save không ghi model.
3. Entity/relationship add có model-first path; attribute/constraint add vẫn diagram-first.
4. `buildConceptualModel` suy semantic model từ stored nodes/edges.
5. Attribute ownership phụ thuộc edge `attrOf`.
6. Composite/complex attribute phụ thuộc edge `componentOf`.
7. `componentOf` hiện hiểu `from` là parent attribute, `to` là child attribute.
8. Relationship ends phụ thuộc edge `participation`/`identifying` và `relationshipId`.
9. Cardinality có thể nằm trong edge labels hoặc relationship style meta cardinalities.
10. Total participation phụ thuộc double line ở end phía entity.
11. ISA disjoint/overlap phụ thuộc symbol `d/o`.
12. ISA total/partial phụ thuộc double line trên parent edge.
13. Category total/partial phụ thuộc double line trên categoryLink edge.
14. CategoryLink luôn ép bracket ở phía union circle khi map React edge sang stored edge.
15. Recursive relationship dùng ports left/right cho 2 end đầu cùng entity.
16. Build diagram từ model preserve unmodeled nodes, nên floating attribute/constraint có thể còn trên canvas dù không vào model.
17. Attribute components trong model chỉ preserve direct children; nested deeper chủ yếu được biểu diễn bằng `kind = complex`.
18. Stored note relation table là compatibility path, không phải conceptual semantic chính.
19. `normalizeConceptualModel` hỗ trợ AI/legacy JSON, nên model nhập vào có thể không đúng shape ban đầu nhưng được normalize.
20. Một số `console.log` còn trong conceptual mapping/collaboration code; nếu cần clean production logs thì đây là nơi nên rà soát.

## 19. Bảng tóm tắt thuật toán

| Thuật toán | Input | Output | Rule chính |
|---|---|---|---|
| `mapReactNodesToStoredNodes` | ReactFlow nodes | Stored nodes | Entity/relationship/attribute/constraint thành stored semantic nodes |
| `mapReactEdgesToStoredEdges` | ReactFlow edges + nodes | Stored conceptual edges | Classify edge theo node types, lưu labels/endStyle/ids |
| `mapStoredNodesToReactNodes` | Stored nodes | ReactFlow nodes | Restore node type, variant, render metadata |
| `mapStoredEdgesToReactEdges` | Stored edges + nodes | ReactFlow erd-edge | Restore lineStyle, labels, bracket, handles, storedType |
| `buildConceptualModel` | Stored diagram | `ConceptualModelPayload` | Build entities, relationships, attributes, generalizations, categories |
| `buildDiagramFromModel` | `ConceptualModelPayload` | Stored diagram | ELK skeleton layout, fan-arc attributes, generate semantic edges |
| `normalizeConceptualModel` | Raw model JSON | Normalized conceptual model | Support legacy AI fields, defaults, relationship flat format |
| `applyModelPayload` | Full model mới | ReactFlow + Yjs model | Normalize, replace model, regenerate diagram |
| `mutateModel` | Mutator function | Model mới + diagram mới | Rebuild model từ diagram trước, mutate, regenerate |

