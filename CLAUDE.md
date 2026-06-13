# Claude Instructions

Before and after changing feature implementation, read:

`docs-v2/AI_DOCS_V2_MAINTENANCE_GUIDE.md`

Mandatory rule:

- If a change affects feature flow, algorithm, data model, ReactFlow/stored/model mapping, DBMS behavior, collaboration behavior, import/export/conversion/migration/linter/normalization rules, update the matching file in `docs-v2`.
- If implementing a new feature with meaningful algorithmic/business rules, create a new `docs-v2/<feature-name>-implementation-rules.md` file.
- Simple CRUD/UI changes can skip new docs only if the final response explains why.
- If no docs update is needed, explicitly say why in the final response.

Do not treat `model-as-truth` as absolute unless the code is actually pure model-as-truth. Several schema flows are hybrid diagram/model.
