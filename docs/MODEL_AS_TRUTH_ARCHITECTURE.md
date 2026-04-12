# Model-as-Truth Architecture — Conceptual ERD

> Tài liệu kỹ thuật mô tả kiến trúc **model-as-truth** đã áp dụng cho Conceptual schema.  
> Dùng tài liệu này để áp dụng tương tự cho **Logical** và **Physical** schema.

---

## 1. Tổng quan kiến trúc

### Trước (diagram-as-truth)
```
User edit trên canvas → ReactFlow nodes/edges (diagram)
                       → serialize → Yjs diagram map → backend (S3)
                       → derive model từ diagram (1 chiều)
```
- Diagram là source of truth
- Model chỉ được derive 1 chiều từ diagram
- AI không thể push model ngược lại canvas

### Sau (model-as-truth) — chỉ Conceptual đã áp dụng
```
User edit / AI push → Model (semantic)
                    → buildDiagramFromModel() → diagram (layout)
                    → ReactFlow render
                    → Yjs sync → backend (S3)

User drag/drop      → Chỉ cập nhật position trong diagram
                    → Không thay đổi model
```
- **Model** là source of truth cho cấu trúc (entity, relationship, attribute, generalization, category)
- **Diagram** là layout cache (vị trí, kích thước node)
- Thay đổi cấu trúc (thêm/xóa entity) → qua model trước → regenerate diagram
- Thay đổi layout (kéo thả) → chỉ cập nhật diagram

---

## 2. Các file đã sửa (Conceptual)

### 2.1 `utils/conceptual-model.builder.ts`
**Vai trò:** Chuyển đổi 2 chiều giữa model và diagram

- `buildConceptualModel()` — diagram → model (đã có sẵn)
- `buildDiagramFromModel()` — **MỚI** — model → diagram
  - Nhận `existingNodes`/`existingEdges` để giữ position cũ
  - `preserveUnmodeledNodes: true` giữ lại node user tạo thủ công
  - Auto-layout thông minh cho node mới (grid + fan arc cho attribute)

**Type mới:**
```typescript
export type BuildDiagramFromModelParams = {
    model: ConceptualModelPayload;
    existingNodes?: StoredDiagramNode[];
    existingEdges?: StoredDiagramEdge[];
    preserveUnmodeledNodes?: boolean;
};

export type MutateModelFn = (
    mutator: (model: ConceptualModelPayload) => ConceptualModelPayload,
    opts?: { selectedNodeId?: string; positionHint?: { x: number; y: number } },
) => void;
```

### 2.2 `hooks/useConceptualCollaboration.ts`
**Vai trò:** Hook chính quản lý sync giữa React ↔ Yjs ↔ Backend

**Luồng load dữ liệu (sync handler):**
```
provider.on('synced') →
  1. loadModelFromYjs()     — load model vào ref
  2. loadDiagramFromYjs()   — load diagram, return boolean
  3. Nếu không có diagram + có model →
     applyModelToDiagramInternal() →
       buildDiagramFromModel() → storedNodes/Edges
       JSON.stringify → write to Yjs diagram map
       loadDiagramFromYjs() → JSON.parse → applyDiagramFromYjs → setNodes/setEdges
```

**Luồng save (2nd useEffect watching `[nodes, edges]`):**
```
nodes/edges thay đổi →
  guard: isSyncingFromYjsRef? skip
  guard: !hasLoadedInitialData && empty? skip
  mapReactNodesToStoredNodes() → storedNodes
  mapReactEdgesToStoredEdges() → storedEdges
  buildConceptualModel()       → derive model từ diagram
  commitDiagramUpdate()        → write diagram JSON to Yjs
  commitModelUpdate()          → write model JSON to Yjs
```

**Hàm mới export:**
- `applyModelPayload(model)` — Thay thế model hoàn toàn, regenerate diagram (cho AI)
- `mutateModel(mutator, opts)` — Thay đổi model increment (cho sidebar add entity/relationship)
- `modelData` — Model hiện tại (ref)

### 2.3 `utils/functions.ts`
**Vai trò:** Hàm tạo node từ sidebar

- `createNodeCreators()` nhận thêm optional `mutateModel`
- Khi có `mutateModel`: `addEntity`, `addRelationship` đi qua model trước → model regenerate diagram
- Khi không có `mutateModel`: fallback về `setNodes` trực tiếp (luồng cũ)

### 2.4 `index.tsx`
**Vai trò:** Wire mọi thứ lại

- Destructure `{ applyModelPayload, mutateModel, modelData }` từ `useConceptualCollaboration`
- Tạo `modelAwareCreators` useMemo → pass `effectiveAdd*` vào `NotationsSidebar`

---

## 3. Các bug đã fix & bài học

### 3.1 Event name: `'sync'` → `'synced'`
**Hocuspocus provider** emit event `"synced"` chứ **không phải** `"sync"`.  
Callback nhận `({ state }: { state: boolean })` chứ không phải `(isSynced: boolean)`.

```typescript
// ❌ SAI — handler không bao giờ fire
provider.on('sync', (isSynced: boolean) => { ... });

// ✅ ĐÚNG
provider.on('synced', ({ state: isSynced }: { state: boolean }) => { ... });
```

> **Đã fix cho cả 3 hook**: conceptual, logical, physical.

### 3.2 Recursive relationship (self-referencing)
Khi 1 relationship có 2 ends cùng trỏ về 1 entity (VD: Employee "supervises" Employee):

**Edge ID phải unique** — thêm `endIdx`:
```typescript
// ❌ Trùng ID khi cùng entityId
id: `e_${rel.id}_${end.entityId}`

// ✅ Unique
id: `e_${rel.id}_${end.entityId}_${endIdx}`
```

**Port khác nhau** để 2 edge không trùng nhau trên canvas:
```typescript
const isRecursive = rel.ends.length >= 2 && rel.ends[0].entityId === rel.ends[1].entityId;
const recursiveEntityPorts = isRecursive ? ['left', 'right'] : [];
// Chỉ cần khác port ở phía ENTITY (target), không cần khác ở phía relationship (source)
```

**Role tracking** khi đọc ngược (diagram → model):
```typescript
const entityEndCounts = new Map<string, number>();
// Khi cùng entityId xuất hiện > 1 lần → gán role: "role_1", "role_2"...
```

### 3.3 Duplicate React key
`mapStoredEdgesToReactEdges` cần dedup edge theo ID (dùng `Set`) để tránh stale data từ Yjs cũ gây duplicate key error.

### 3.4 Model→Diagram render không hiện
**Nguyên nhân gốc:** Bug `'sync'` → `'synced'` (mục 3.1). Sync handler không fire → `initialSyncDoneRef` không bao giờ `true` → `handleModelChange` chỉ store model mà không generate diagram.

**Luồng đúng sau fix:**
```
synced event fire → loadModel → loadDiagram (fail) →
  applyModelToDiagramInternal →
    buildDiagramFromModel → JSON.stringify → write Yjs →
    loadDiagramFromYjs → JSON.parse → applyDiagramFromYjs → setNodes/setEdges
```

Quan trọng: data phải đi qua **cùng pipeline** `JSON.stringify → Yjs → JSON.parse → applyDiagramFromYjs` giống như khi load diagram đã có sẵn. Không được pass raw object trực tiếp vào `applyDiagramFromYjs`.

### 3.5 `useDiagramViewport` — fitView delay
Khi diagram mới được generate (chưa có saved viewport), `fitView()` cần delay qua `requestAnimationFrame` + `setTimeout(200ms)` để ReactFlow kịp measure DOM nodes trước khi tính viewport bounds.

---

## 4. Hướng dẫn áp dụng cho Logical / Physical

### Bước 1: Tạo model builder
Tạo file tương tự `conceptual-model.builder.ts` cho logical/physical:
- Define payload type (`LogicalModelPayload`, `PhysicalModelPayload`)
- Implement `buildLogicalModel()` (diagram → model)
- Implement `buildDiagramFromLogicalModel()` (model → diagram)

### Bước 2: Sửa collaboration hook
Trong `useLogicalCollaboration.ts` / `usePhysicalCollaboration.ts`:

1. Import builder functions
2. Thêm các ref: `modelDataRef`, `lastAppliedModelStringRef`, `lastSyncedModelStringRef`, `initialSyncDoneRef`, `nodesRef`, `edgesRef`
3. Thêm `applyModelToDiagramInternal()` — copy logic từ conceptual
4. Sửa sync handler (`'synced'` event — đã fix):
   ```
   loadModel → loadDiagram → nếu không có diagram + có model → applyModelToDiagramInternal
   ```
5. Sửa save useEffect: derive model từ diagram + write cả 2 vào Yjs
6. Thêm `handleModelChange` observer
7. Export `applyModelPayload`, `mutateModel`, `modelData`

### Bước 3: Sửa functions.ts
Thêm `mutateModel` option vào `createNodeCreators` cho logical/physical node types.

### Bước 4: Wire trong index.tsx
Destructure return values mới từ collab hooks, pass vào sidebar.

---

## 5. Kiến trúc data flow tổng thể

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   AI Agent   │────▶│  applyModelPayload  │     │   Sidebar    │
│  (Python)    │     │  (full replace)     │     │ (add entity) │
└──────────────┘     └─────────┬───────────┘     └──────┬───────┘
                               │                        │
                               ▼                        ▼
                    ┌─────────────────────┐    ┌────────────────┐
                    │   Model (semantic)  │◀───│  mutateModel() │
                    │ ConceptualPayload   │    │  (increment)   │
                    └─────────┬───────────┘    └────────────────┘
                              │
                    buildDiagramFromModel()
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Diagram (layout)   │◀──── User drag/drop
                    │ StoredNodes/Edges   │      (position only)
                    └─────────┬───────────┘
                              │
               mapStoredNodesToReactNodes()
                              │
                              ▼
                    ┌─────────────────────┐
                    │    ReactFlow        │
                    │  nodes[] / edges[]  │
                    └─────────┬───────────┘
                              │
                    Save useEffect (auto)
                              │
                              ▼
                    ┌─────────────────────┐
                    │      Yjs Y.Map      │
                    │ diagram + model     │
                    └─────────┬───────────┘
                              │
                    HocuspocusProvider
                              │
                              ▼
                    ┌─────────────────────┐
                    │   Backend (NestJS)  │
                    │  Redis → S3         │
                    └─────────────────────┘
```

---

## 6. File reference nhanh

| File | Vai trò |
|------|---------|
| `utils/conceptual-model.builder.ts` | Bidirectional model↔diagram converter |
| `utils/conceptual-diagram.builder.ts` | Bidirectional stored↔react node/edge mapper |
| `hooks/useConceptualCollaboration.ts` | Core sync hook (React ↔ Yjs ↔ Backend) |
| `utils/functions.ts` | Node creators (sidebar) |
| `hooks/useDiagramViewport.ts` | Viewport management + fitView |
| `index.tsx` | Wire everything together |
