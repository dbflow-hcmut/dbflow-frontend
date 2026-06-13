# AI Docs V2 Maintenance Guide

Tài liệu này là rule chung cho mọi AI agent khi sửa code trong repo `dbflow-frontend`.

Mục tiêu: nếu AI sửa flow, thuật toán, data model, mapping, hoặc rule của một tính năng thì phải cập nhật lại tài liệu tương ứng trong `docs-v2`.
Nếu AI implement một tính năng mới có logic thuật toán hoặc rule nghiệp vụ đáng kể thì phải tạo docs-v2 mới cho tính năng đó.

## 1. Rule bắt buộc

Khi sửa code của một tính năng đã có docs trong `docs-v2`, AI phải kiểm tra và cập nhật docs nếu thay đổi làm ảnh hưởng một trong các phần sau:

- Flow runtime.
- Data model hoặc payload shape.
- Mapping giữa ReactFlow node/edge, stored diagram, model payload.
- Rule convert/import/export/generate.
- Thuật toán linter, normalization, migration, DDL.
- DBMS-specific behavior.
- Yjs collaboration sync behavior.
- UI control làm thay đổi semantic model.
- Edge case, limitation, hoặc warning đã ghi trong docs.

Khi implement tính năng mới, AI phải tạo docs-v2 mới nếu tính năng có một trong các yếu tố sau:

- Thuật toán xử lý dữ liệu, graph, schema, SQL, parsing, diff, validation, generation.
- Data model/payload mới hoặc mapping giữa nhiều representation.
- Rule nghiệp vụ có nhiều nhánh hoặc nhiều bước.
- DBMS-specific behavior.
- Collaboration/sync behavior.
- Import/export/generate/convert/migrate/lint/normalize.
- Flow có edge cases hoặc limitation cần maintain về sau.

Tính năng CRUD/UI đơn giản có thể không cần tạo docs-v2 mới nếu không có thuật toán đáng kể, ví dụ:

- Thêm một button mở modal đơn giản.
- Đổi label/text/style.
- Thêm một field form chỉ lưu thẳng vào state/API không có mapping/rule phức tạp.
- CRUD cơ bản gọi API rồi refresh list.

Nếu bỏ qua docs cho CRUD/UI đơn giản, final response vẫn phải ghi rõ:

```text
Docs v2 checked: no update needed because this is simple CRUD/UI without algorithmic rules.
```

Nếu code thay đổi nhưng docs không cần đổi, final response phải nói rõ:

```text
Docs v2 checked: no update needed because ...
```

Nếu docs đã được cập nhật, final response phải liệt kê file docs đã sửa.

## 2. Không được làm

- Không sửa code flow mà bỏ qua docs.
- Không viết docs theo suy đoán nếu chưa đọc code liên quan.
- Không chỉ update docs-feature cũ mà bỏ qua `docs-v2`.
- Không xóa warning/limitation khỏi docs nếu code vẫn còn limitation đó.
- Không ghi "model-as-truth" tuyệt đối nếu code vẫn đang hybrid diagram/model.

## 3. Quy trình khi sửa tính năng

1. Xác định tính năng bị ảnh hưởng.
2. Đọc code implementation liên quan trước khi sửa docs.
3. Sửa code.
4. Nếu là tính năng mới có thuật toán/rule đáng kể, tạo docs-v2 mới.
5. Nếu là tính năng đã có docs, đọc lại docs-v2 tương ứng.
6. Cập nhật docs theo rule thực tế trong code.
7. Final response phải có mục docs:
   - `Docs v2 updated: ...`, hoặc
   - `Docs v2 checked: no update needed because ...`.

## 4. Quy tắc đặt tên docs-v2 mới

Khi tạo docs mới cho tính năng mới, dùng format:

```text
docs-v2/<feature-name>-implementation-rules.md
```

Tên file nên:

- viết kebab-case.
- mô tả đúng feature.
- có suffix `implementation-rules.md`.

Ví dụ:

- `docs-v2/query-optimizer-implementation-rules.md`
- `docs-v2/db-connection-introspection-implementation-rules.md`
- `docs-v2/schema-version-compare-implementation-rules.md`

Docs mới nên có tối thiểu:

- Vị trí code chính.
- Flow runtime sơ lược.
- Data model/payload.
- Thuật toán/rule chi tiết.
- Edge cases/limitations.
- Bảng tóm tắt rule hoặc bước xử lý.

## 5. Mapping tính năng -> docs-v2

| Tính năng/code area | Docs cần kiểm tra |
|---|---|
| Conceptual diagram/model, entity/relationship/attribute/ISA/category, conceptual collaboration | `docs-v2/conceptual-diagram-implementation-rules.md` |
| Logical schema/model, logical table/edge/FD, logical collaboration | `docs-v2/logical-schema-implementation-rules.md` |
| Physical schema/model, physical table/FK/index/FD, physical collaboration | `docs-v2/physical-schema-implementation-rules.md` |
| Schema conversion conceptual/logical/physical | `docs-v2/schema-conversion-implementation-rules.md` |
| Export DDL | `docs-v2/export-ddl-implementation-rules.md` |
| Import DDL | `docs-v2/import-ddl-implementation-rules.md` |
| Migration SQL / version diff migration | `docs-v2/migration-sql-implementation-rules.md` |
| Linter / safety warning | `docs-v2/linter-safety-warning-implementation-rules.md` |
| Normalization / decomposition / FD analysis | `docs-v2/schema-normalization-implementation-rules.md` |

Nếu thay đổi chạm nhiều tính năng, cập nhật tất cả docs liên quan.

## 6. Các code area thường bắt buộc update docs

### Conceptual

Kiểm tra docs conceptual nếu sửa:

- `src/components/EditProject/utils/conceptual-model.builder.ts`
- `src/components/EditProject/utils/conceptual-diagram.builder.ts`
- `src/components/EditProject/hooks/useConceptualCollaboration.ts`
- `src/components/erd-edge/index.tsx`
- `src/components/erds-notations/entity/**`
- `src/components/erds-notations/relationship/**`
- `src/components/erds-notations/attribute/**`
- `src/components/erds-notations/constraint/**`

### Logical

Kiểm tra docs logical nếu sửa:

- `src/components/EditProject/utils/logical-model.builder.ts`
- `src/components/EditProject/utils/logical-diagram.builder.ts`
- `src/components/EditProject/hooks/useLogicalCollaboration.ts`
- `src/components/erds-notations/logical-table/**`
- `src/components/logical-table-edge/**`

### Physical

Kiểm tra docs physical nếu sửa:

- `src/components/EditProject/utils/physical-model.builder.ts`
- `src/components/EditProject/utils/physical-diagram.builder.ts`
- `src/components/EditProject/hooks/usePhysicalCollaboration.ts`
- `src/components/erds-notations/relation-table/**`
- `src/components/relation-table-edge/**`

### Conversion / DDL / Import / Migration / Linter / Normalization

Kiểm tra docs tương ứng nếu sửa:

- `src/components/EditProject/utils/schema-conversion.ts`
- `src/components/EditProject/utils/ddl-generator.ts`
- `src/components/EditProject/components/DDLExportModal/**`
- `src/components/EditProject/components/DDLImportModal/**`
- `src/components/EditProject/utils/ddl-importer.ts`
- `src/components/EditProject/utils/migration-generator.ts`
- `src/components/EditProject/components/VersionHistoryDrawer/**`
- `src/components/EditProject/utils/schema-linter.ts`
- `src/components/EditProject/components/LinterPanel/**`
- `src/components/EditProject/utils/normalization.ts`
- `src/components/EditProject/components/NormalizationPanel/**`

## 7. Cách viết docs-v2

Docs-v2 nên ưu tiên:

- Thuật toán và rule implementation.
- Data structures.
- Source of truth thực tế.
- Edge cases.
- Limitations.
- File path code để tra lại.

Docs-v2 chỉ cần flow UI ngắn gọn. Không biến docs-v2 thành user manual.

## 8. Checklist trước khi final

Trước khi trả lời user, AI phải tự kiểm:

- Có sửa feature flow/rule/model/mapping không?
- Docs-v2 tương ứng đã update chưa?
- Có implement tính năng mới có thuật toán/rule đáng kể không?
- Nếu có, đã tạo docs-v2 mới chưa?
- Nếu chỉ là CRUD/UI đơn giản và không tạo docs, lý do đã rõ chưa?
- Nếu không update, có lý do rõ không?
- Final response có nhắc docs status chưa?
