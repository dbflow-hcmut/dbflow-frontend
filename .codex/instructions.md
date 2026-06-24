# Codex Instructions

Follow the repository docs maintenance guide:

`docs-v2/AI_DOCS_V2_MAINTENANCE_GUIDE.md`

When modifying feature implementation, update matching `docs-v2` documentation if behavior changed.

When changing the stored JSON structure for any schema level, also update the canonical files in `docs/`:

- `docs/<conceptual|logical|physical>/model.schema.json`
- `docs/<conceptual|logical|physical>/model-schema.md`
- `docs/<conceptual|logical|physical>/diagram.schema.json`
- `docs/<conceptual|logical|physical>/diagram-schema.md`

This applies to model payloads, diagram payloads, ReactFlow/stored mappings, persisted fields, enum values, required fields, and ID/reference conventions.

When implementing a new feature with meaningful algorithmic/business rules, create a new `docs-v2/<feature-name>-implementation-rules.md` file.

Simple CRUD/UI-only changes can skip new docs if the final response explains why.

Required final-response line:

- `Docs v2 updated: ...`, or
- `Docs v2 checked: no update needed because ...`
