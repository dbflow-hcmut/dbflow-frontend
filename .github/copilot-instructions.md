# GitHub Copilot Instructions

This project keeps implementation rules in `docs-v2`.

Before completing any feature-level code change, check:

`docs-v2/AI_DOCS_V2_MAINTENANCE_GUIDE.md`

Update the relevant docs-v2 file if the code change affects:

- runtime flow
- algorithm or rule behavior
- data model or payload shape
- ReactFlow/stored diagram/model mapping
- DBMS-specific behavior
- Yjs collaboration behavior
- DDL import/export
- schema conversion
- migration SQL
- linter/safety warning
- normalization

If implementing a new feature with meaningful algorithmic/business rules, create a new docs file:

`docs-v2/<feature-name>-implementation-rules.md`

Simple CRUD/UI-only changes can skip new docs if the response or PR summary explains why.

Final responses or PR summaries should mention whether docs-v2 was updated or checked.
