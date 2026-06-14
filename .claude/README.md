# Claude Local Guide

Claude should follow the root `CLAUDE.md` and the canonical guide:

`docs-v2/AI_DOCS_V2_MAINTENANCE_GUIDE.md`

Any feature implementation change must be reflected in `docs-v2` when it changes flow, algorithm, data model, mapping, or rule behavior.

Any change to the stored JSON structure for conceptual/logical/physical schemas must also update the matching canonical files in `docs/<level>/`: `model.schema.json`, `model-schema.md`, `diagram.schema.json`, and/or `diagram-schema.md`.

Stored JSON structure includes model payloads, diagram payloads, ReactFlow/stored mappings, persisted fields, enum values, required fields, and ID/reference conventions.

If Claude implements a new feature with meaningful algorithmic/business rules, it must create a new docs file in `docs-v2`.

Simple CRUD/UI-only changes can skip new docs only when the final response explains why.
