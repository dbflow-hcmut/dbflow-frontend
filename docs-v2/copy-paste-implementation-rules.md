# Copy/Paste: Ctrl+C / Ctrl+V giữa các schema cùng loại

Tài liệu này mô tả tính năng copy/paste node+edge trong canvas (EditProject), bao gồm cả copy ở 1 schema rồi paste sang schema khác (miễn cùng loại: Conceptual/Logical/Physical).

## 1. Vị trí code chính

| Phần | File |
|---|---|
| Hook chứa toàn bộ logic copy/paste + listener cho native `copy`/`paste` event | `src/components/EditProject/hooks/useCopyPasteSchema.ts` |
| Nơi gọi hook, truyền `nodes/edges/setNodes/setEdges/schemaType/canEdit` | `src/components/EditProject/index.tsx` |
| Sinh id mới cho node/edge được paste | `generateDiagramId` trong `src/components/EditProject/utils/functions.ts` |

## 2. Clipboard lưu ở đâu

Dùng **clipboard thật của OS**, qua native browser event `copy`/`paste` (`document.addEventListener("copy"/"paste", ...)`), KHÔNG dùng `localStorage` và KHÔNG dùng `navigator.clipboard.readText/writeText`. Lý do:

- `localStorage` scope theo **origin** — copy ở domain A rồi paste ở domain B (ví dụ staging vs production, hoặc domain nội bộ khác) sẽ không đọc được. Clipboard thật của OS thì không bị giới hạn này, xuyên domain/tab/app bình thường như copy-paste text thông thường.
- `navigator.clipboard.readText()` (Async Clipboard API) có thể bị browser yêu cầu permission "clipboard-read" — riêng native `paste` event (`ClipboardEvent.clipboardData.getData(...)`) thì không cần permission gì, vì nó chạy trong đúng lifecycle mà browser tự cấp quyền khi user chủ động Ctrl+V/Ctrl+C.
- Cách làm: trong handler của event `copy`, gọi `event.preventDefault()` rồi `event.clipboardData.setData("text/plain", JSON.stringify(payload))` — ghi thẳng vào OS clipboard dưới dạng text/plain (payload là JSON có field đánh dấu `kind: "dbflow-schema-clipboard"` để lúc paste phân biệt được đây là clipboard của app, không phải text ngẫu nhiên). Paste thì đọc ngược lại bằng `event.clipboardData.getData("text/plain")`.
- `clipboardMemory` (biến module-level, in-memory) chỉ là fallback phòng khi trình duyệt cho ghi nhưng không cho đọc lại `clipboardData` (hiếm) — phạm vi tác dụng chỉ trong 1 tab, không xuyên domain được.

## 3. Flow Copy (Ctrl+C → event `copy`)

1. Handler `copy` bỏ qua nếu target đang là `input`/`textarea`/`contentEditable` (để không phá copy text bình thường khi user đang gõ, ví dụ đổi tên bảng).
2. Lấy `selectedNodes = nodes.filter(n => n.selected)`. Nếu rỗng → return false, KHÔNG gọi `preventDefault()` (để trình duyệt tự xử lý copy như thường, không có gì bị chặn).
3. Lấy `relatedEdges`: edge được copy nếu **cả 2 đầu (source & target) đều nằm trong selectedNodes**, hoặc edge tự nó đang được select. Edge có 1 đầu ngoài selection bị bỏ (tránh FK "lửng").
4. Deep-clone bằng `JSON.parse(JSON.stringify(...))`, đóng gói cùng `kind` và `schemaType` hiện tại (giá trị `SchemaType` — `conceptual`/`logical`/`physical`), ghi vào `event.clipboardData` (và `clipboardMemory`), rồi `event.preventDefault()`.

## 4. Flow Paste (Ctrl+V → event `paste`)

1. Handler `paste` bỏ qua nếu `!canEdit` hoặc target đang là `input`/`textarea`/`contentEditable`.
2. Đọc `event.clipboardData.getData("text/plain")`, `JSON.parse`, kiểm tra `kind === "dbflow-schema-clipboard"` — nếu không parse được hoặc không có `kind` đúng (user paste text/nội dung khác từ ngoài vào) → fallback `clipboardMemory`, nếu vẫn không có gì → return false, để trình duyệt xử lý paste như thường (ví dụ paste text vào ô đang gõ).
3. **Chặn paste khác loại schema**: nếu `payload.schemaType !== schemaType hiện tại` → `notificationProvider.open({ type: "error", message: "You can only paste into a schema of the same type (Conceptual / Logical / Physical)." })` (tiếng Anh), return true (đã "xử lý" — vẫn preventDefault để tránh browser paste chuỗi JSON thô vào đâu đó). Đây là rule chính mà user yêu cầu ("cùng loại mới paste được").
3. Sinh id mới cho từng node (`nodeIdMap: oldId -> newId`) và từng edge (`edgeIdMap: oldId -> newId`) bằng `generateDiagramId()` — id có prefix `cid_` + UUID, unique toàn cục, không phân biệt schema nào.
4. Với mỗi node: gán id mới, offset `position` +48/+48 (để không đè lên node gốc khi paste cùng schema), set `selected: true`.
5. Remap id nhúng trong `data` bằng cách stringify `data`, `.split(oldId).join(newId)`, rồi parse lại — xem mục 5 để hiểu tại sao cách này đúng cho cả 3 loại schema mà không cần code riêng theo từng loại.
6. Với mỗi edge: remap `source`/`target` theo `nodeIdMap`; remap `sourceHandle`/`targetHandle` bằng cách thay chuỗi `oldSourceId` → `newSourceId` (và tương tự cho target) — vì handle của Logical nhúng luôn table id (`lid_<tableId>_col_<n>-left|right`).
7. Riêng node `type === 'relationship'` (Conceptual): `data.cardinalities` là map keyed theo **edge id** (không phải node id) — phải remap key theo `edgeIdMap` riêng, key nào không có trong `edgeIdMap` (vì edge đó không được copy) thì bị drop.
8. `setNodes`/`setEdges` append node/edge mới vào cuối, đồng thời `deselect` hết phần tử cũ để chỉ phần vừa paste được highlight.
9. Không cần gọi `saveState` thủ công — `EditProject/index.tsx` có `useEffect` debounce 300ms theo dõi `[nodes, edges]` tự động lưu undo history mỗi khi state đổi.

## 5. Vì sao 1 rule remap chung lại đúng cho cả 3 loại schema

| Loại | Cột/field có id riêng? | Id đó có nhúng node id không? | Cần remap gì khi paste |
|---|---|---|---|
| Conceptual | `EntityField.id` không bị tham chiếu ở đâu khác | Không | Không cần remap field id (giữ nguyên, không sai) |
| Logical | `LogicalColumn.id` optional; nếu bỏ trống thì handle id được **derive tại render time** = `` lid_${nodeId}_col_${idx} `` (xem `logical-table/index.tsx`) | Có, khi col.id trống (case phổ biến) | Không cần sửa `data.columns` gì cả — id tự đúng vì derive lại theo `nodeId` MỚI lúc render. Chỉ cần sửa **edge.sourceHandle/targetHandle** (đang lưu chuỗi cũ) và `functionalDependencies[].left/right` nếu chúng tham chiếu id dạng derive |
| Physical | `RelationColumn` không có field `id` — định danh bằng `name` | Không áp dụng | Không cần remap gì cho cột; `PhysicalFD.left/right` là tên cột, giữ nguyên tên là đúng |

→ Vì vậy `remapEmbeddedId` (string-replace `oldNodeId` → `newNodeId` trên toàn bộ `JSON.stringify(data)`) là đủ cho cả 3 loại:
- Conceptual/Physical: replace này gần như no-op (id cũ của node không xuất hiện trong data cột/tên cột) → data giữ nguyên, đúng.
- Logical: bất cứ chỗ nào trong `data` (functional dependency `left/right`, hoặc `col.id` nếu ai đó từng set explicit theo format derive) có chứa substring id cũ của node sẽ được thay bằng id mới → khớp lại với handle mới được derive theo `nodeId` mới.

`TableIndex.id`/`PhysicalFD.id`/`LogicalFD.id` (id của riêng index/FD, không phải id cột) **không** được regenerate khi paste — các id này chỉ dùng làm key nội bộ trong danh sách của riêng node đó, không bị đọc bởi node khác, nên giữ nguyên giữa bản gốc và bản copy không gây xung đột.

## 6. Giới hạn hiện tại

- Chỉ paste được vào schema **cùng loại** với lúc copy (theo yêu cầu). Muốn paste sang loại khác phải dùng tính năng Convert schema có sẵn, không phải copy/paste.
- Copy/paste không đi qua model layer (`*-model.builder.ts`) — chỉ thao tác trực tiếp trên `nodes`/`edges` runtime của ReactFlow. Nếu sau này có logic build model đọc field mới trong `data` mà không thông qua edge, cần rà lại `remapEmbeddedId` có che được field đó không.
- Chỉ ghi `text/plain` lên clipboard — nếu user paste sang nơi khác (Notepad, Slack...) sẽ thấy 1 chuỗi JSON thô, không phải dữ liệu người-đọc-được; đây là đánh đổi hợp lý vì mục tiêu là paste lại vào chính app, không phải để chia sẻ nội dung ra ngoài.
- Native `copy`/`paste` event có thể không bắn ra trong một số context hiếm (ví dụ trang không có focus, hoặc bị extension khác can thiệp clipboard) — không có cơ chế polling/retry cho case này, chỉ có `clipboardMemory` làm fallback trong đúng tab vừa copy.
