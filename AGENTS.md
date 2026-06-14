# Agent Instructions

Khi làm việc trong repo `dbflow-frontend`, mọi AI coding agent phải tuân thủ guide:

`docs-v2/AI_DOCS_V2_MAINTENANCE_GUIDE.md`

Rule quan trọng:

- Nếu sửa flow, thuật toán, data model, mapping, hoặc rule của một tính năng thì phải cập nhật docs tương ứng trong `docs-v2`.
- Nếu sửa cấu trúc JSON lưu trữ của schema conceptual/logical/physical thì phải cập nhật contract tương ứng trong `docs/<level>/`: `model.schema.json`, `model-schema.md`, `diagram.schema.json`, và/hoặc `diagram-schema.md`.
- Cấu trúc JSON lưu trữ bao gồm model payload, diagram payload, ReactFlow/stored mapping, persisted fields, enum values, required fields, và quy ước ID/reference.
- Nếu implement tính năng mới có thuật toán/rule đáng kể thì phải tạo docs mới trong `docs-v2`.
- CRUD/UI đơn giản có thể không cần docs mới, nhưng final response phải giải thích lý do.
- Nếu docs không cần đổi, final response phải ghi rõ: `Docs v2 checked: no update needed because ...`.
- Nếu docs đã đổi, final response phải liệt kê file docs đã sửa.

Không được sửa code tính năng rồi bỏ qua docs-v2.
