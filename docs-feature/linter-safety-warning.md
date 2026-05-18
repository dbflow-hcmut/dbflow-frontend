# Linter & Safety Warning — Rule Reference

> **File:** `src/components/EditProject/utils/schema-linter.ts`  
> **UI Component:** `src/components/EditProject/components/LinterPanel/index.tsx`

---

## Overview

DBFlow's **Linter & Safety Warning** engine automatically inspects the active schema model and surfaces potential design problems as categorised issues.

The linter runs reactively: every time the collaboration layer syncs a model change (`_conceptualModelData`, `_logicalModelData`, or `_physicalModelData`), the relevant rule set is re-executed and the results are written to `lintResult` state.

Users open the panel by clicking the <kbd>⚠</kbd> **Linter & Safety Warning** button in the top-right toolbar. The button badge shows the number of active errors + warnings at a glance.

---

## Severity Levels

| Severity | Icon | Meaning |
|---|---|---|
| **error** | 🔴 | Structural violation that will likely cause DDL generation failure or data integrity problems. Should be resolved. |
| **warning** | 🟡 | Design smell or best-practice deviation. May not break anything but indicates a risk. |
| **info** | 🔵 | Informational hint about performance, conventions, or completeness. |

---

## Conceptual Schema Rules

These rules apply when the active schema is of type `conceptual`.

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **C001** | info | Empty diagram | The diagram contains no entities or relationships. Fires only once and suppresses all other rules. |
| **C002** | warning | Entity with no attributes | A strong or weak entity has zero attribute nodes connected to it. Every entity should document at least one attribute. |
| **C003** | warning | Strong entity missing key attribute | A strong entity has attributes but none of them is marked as a key attribute (underlined in ER notation). A strong entity must have an identifier. |
| **C004** | error | Duplicate entity names | Two or more entities share the same name (case-insensitive). Entity names must be unique because they map to table names in later design phases. |
| **C005** | warning | Relationship with fewer than 2 ends | A relationship diamond is connected to fewer than 2 entity rectangles. A valid binary (or higher) relationship must involve at least 2 entity participations. |
| **C006** | error | Relationship references deleted entity | A relationship's stored `ends` list references an entity ID that no longer exists in the model. This can happen after an entity is deleted while the relationship was retained. |
| **C007** | warning | Duplicate relationship names | Two or more relationships share the same name. While not always an error, it makes the diagram ambiguous. |
| **C008** | warning | Weak entity without identifying relationship | A weak (double-border) entity is not connected to any identifying (double-diamond) relationship. By definition, a weak entity's existence depends on an owner entity through exactly one identifying relationship. |
| **C009** | info | Isolated entity | An entity participates in no relationships and is not part of any generalization hierarchy. This may be intentional but is worth reviewing. |
| **C010** | info | Missing cardinality on relationship end | A relationship participates in an entity but no cardinality label (e.g. `1`, `N`, `0..1`) is defined for that participation. |
| **C011** | info | Generalization with fewer than 2 subclasses | A generalization/specialization construct has only one child entity. A generalization typically describes a parent with at least two disjoint or overlapping subtypes. |

---

## Logical Schema Rules

These rules apply when the active schema is of type `logical`.

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **L001** | info | Empty schema | The schema contains no tables. |
| **L002** | error | Table with no columns | A table exists but has zero columns. This is structurally invalid. |
| **L003** | warning | Table with no primary key | A non-empty table does not designate any column as a primary key. Every relational table should have a PK to guarantee entity integrity. |
| **L004** | error | Duplicate table names | Two or more tables share the same name (case-insensitive). |
| **L005** | error | Duplicate column names within a table | A table contains two or more columns with the same name. |
| **L006** | error | FK references non-existent table | A column's foreign key points to a `refTableId` that no longer exists in the schema. |
| **L007** | error | FK references non-existent column | A FK's `refColumnId` does not match any column in the referenced table. |
| **L008** | warning | FK references non-key column | A foreign key points to a column that is neither a primary key nor a candidate key. Referential integrity requires the target to be a key. |
| **L009** | error | Nullable primary key | A column marked as primary key is also marked nullable. Primary key columns must be NOT NULL. |
| **L010** | warning | Functional dependency references unknown column | A functional dependency (FD) declared on a table lists a column name that does not exist in that table's column set. |
| **L011** | info | Wide composite primary key | A table's primary key spans more than 4 columns. This is a performance and usability hint — consider whether a surrogate (auto-increment) key would be simpler. |

---

## Physical Schema Rules

These rules apply when the active schema is of type `physical`.

### Structural Rules

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **P001** | info | Empty schema | The physical schema contains no tables. |
| **P002** | error | Table with no columns | A table exists but has zero columns. |
| **P003** | warning | Table with no primary key | A non-empty table has no primary key column. |
| **P004** | error | Duplicate table names | Two or more tables share the same name (case-insensitive). |
| **P005** | error | Duplicate column names within a table | A table has two or more columns with the same name. |
| **P006** | error | Column with no data type | A column has no data type specified. DDL generation will fail. |

### Data Integrity Rules

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **P007** | error | Nullable primary key | A primary key column is marked as nullable. |
| **P008** | error | TEXT/BLOB as primary key | A primary key column uses a TEXT or BLOB family type (`TEXT`, `LONGTEXT`, `BLOB`, `BYTEA`, `IMAGE`, etc.). Most DBMS engines do not allow these types as primary keys without a length prefix. |
| **P009** | warning | FLOAT/DOUBLE as primary key | A primary key column uses a floating-point type. Floating-point arithmetic is imprecise, which can cause equality comparisons (central to key lookups) to behave unexpectedly. |

### Column Attribute Rules

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **P010** | warning | AUTO_INCREMENT on non-integer column | A column has `AUTO_INCREMENT` / `SERIAL` enabled but is not an integer type (`INT`, `BIGINT`, `SMALLINT`, etc.). Auto-increment is only meaningful on integer columns. |

### Foreign Key Rules

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **P011** | info | FK missing ON DELETE / ON UPDATE action | A foreign key does not specify an explicit `ON DELETE` or `ON UPDATE` action. The engine will default to `NO ACTION` but it is best practice to be explicit about cascade behaviour. |
| **P012** | error | FK references non-existent table | A column's FK `refTableId` does not match any table in the schema. |
| **P013** | error | FK references non-existent column | A FK's `refColumnId` does not match any column in the referenced table. |
| **P014** | warning | FK references non-unique column | A FK points to a column that is neither a PK, candidate key, nor unique. Most DBMS engines will reject this constraint at DDL execution time. |

### Index Rules

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **P015** | error | Index references non-existent column | An index definition lists a column name that does not exist in the table. |
| **P018** | error | Duplicate index names within a table | A table has two or more indexes with the same name. |

### Performance Hints

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **P016** | info | Very large VARCHAR without index | A `VARCHAR` column has a declared length > 1000 and is not covered by any index. Consider using `TEXT` for unbounded strings or adding an index if the column is used in WHERE clauses. |
| **P017** | info | Wide composite primary key | A primary key spans more than 4 columns, which can harm write performance. Consider a surrogate key. |

### Security Rules

| Rule ID | Severity | Title | Description |
|---|---|---|---|
| **P019** | warning | Short password column | A column named `password`, `passwd`, or `pwd` uses `VARCHAR` with a length shorter than 60 characters. Securely hashed passwords (e.g. bcrypt) produce strings of at least 60 characters. A shorter column suggests plain-text or weakly hashed storage. |
| **P020** | warning | Functional dependency references unknown column | A FD declared on a table references a column that does not exist. |

---

## Architecture

```
schema-linter.ts          Pure TypeScript — no React dependencies
  ├── ConceptualLintPayload  (subset of ConceptualModelPayload)
  ├── LogicalLintPayload     (subset of LogicalModelPayload)
  ├── PhysicalLintPayload    (subset of PhysicalModelPayload)
  ├── runConceptualLinter()
  ├── runLogicalLinter()
  └── runPhysicalLinter()

EditProject/index.tsx
  └── useEffect on model data → calls appropriate runner → setLintResult()

LinterPanel/index.tsx
  ├── Filter bar (All / Error / Warning / Info)
  ├── Collapsible severity groups
  ├── Per-issue row: icon · message · rule ID badge · target label
  └── Footer summary bar
```

## Adding New Rules

1. Open `src/components/EditProject/utils/schema-linter.ts`.
2. Choose the appropriate `lintConceptual` / `lintLogical` / `lintPhysical` function.
3. Append a new rule block following the pattern:

```ts
// RXXX — Rule title
for (const table of tables) {
    if (/* condition */) {
        issues.push({
            ruleId: "PXXX",
            severity: "warning",           // or "error" | "info"
            message: `Describe the problem clearly with "${table.name}".`,
            target: table.name,            // optional: used as a secondary label in the UI
        });
    }
}
```

4. Document the rule in this file under the appropriate table.
