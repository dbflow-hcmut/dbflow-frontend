/**
 * schema-linter.ts
 * Linter & Safety Warning engine for all three schema levels:
 * Conceptual, Logical, and Physical.
 *
 * Rules are organized per schema type. Each rule emits one or more
 * LintIssue entries that the UI renders in the LinterPanel.
 */

import { isValidTypeLength } from "./physical-column-type";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LintSeverity = "error" | "warning" | "info";

export type LintIssue = {
    /** Unique rule identifier, e.g. "C001" */
    ruleId: string;
    severity: LintSeverity;
    /** Human-readable message */
    message: string;
    /** Optional display name of the offending element (table name, entity name …) */
    target?: string;
    /** Node/element ID – used by the UI to focus the corresponding canvas node */
    targetId?: string;
};

export type LintResult = {
    issues: LintIssue[];
    /** Total counts per severity */
    counts: { error: number; warning: number; info: number };
};

// ─── Minimal payload types (mirrors builder types) ────────────────────────────

type ConceptualAttribute = {
    id: string;
    name: string;
    kind: string;
    isKey: boolean;
};

type ConceptualEntity = {
    id: string;
    name: string;
    kind: "strong" | "weak";
    attributes: ConceptualAttribute[];
};

type RelationshipEnd = {
    entityId: string;
    cardinality?: string;
    optional?: boolean;
};

type ConceptualRelationship = {
    id: string;
    name: string;
    type: string;
    ends: RelationshipEnd[];
    attributes?: ConceptualAttribute[];
};

type ConceptualGeneralization = {
    id: string;
    parentEntityIds?: string[];
    childEntityIds: string[];
    constraints: {
        disjointness: string;
        completeness: string;
    };
};

export type ConceptualLintPayload = {
    entities?: ConceptualEntity[];
    relationships?: ConceptualRelationship[];
    generalizations?: ConceptualGeneralization[];
};

const getGeneralizationParentIds = (gen: ConceptualGeneralization): string[] =>
    gen.parentEntityIds?.length
        ? gen.parentEntityIds
        : (gen as ConceptualGeneralization & { parentEntityId?: string }).parentEntityId
          ? [(gen as ConceptualGeneralization & { parentEntityId: string }).parentEntityId]
          : [];

// ─── Logical ──────────────────────────────────────────────────────────────────

type LogicalColumn = {
    id: string;
    name: string;
    nullable: boolean;
    unique: boolean;
    roles?: {
        primaryKey?: boolean;
        foreignKey?: {
            refTableId: string;
            refColumnId: string;
        };
        candidateKey?: boolean;
    };
};

type LogicalFunctionalDependency = {
    id: string;
    left: string[];
    right: string[];
};

type LogicalTable = {
    id: string;
    name: string;
    columns: LogicalColumn[];
    functionalDependencies?: LogicalFunctionalDependency[];
};

export type LogicalLintPayload = {
    tables?: LogicalTable[];
};

// ─── Physical ─────────────────────────────────────────────────────────────────

type PhysicalColumn = {
    id: string;
    name: string;
    dataType?: string;
    length?: string;
    nullable: boolean;
    unique: boolean;
    autoIncrement?: boolean;
    defaultValue?: string;
    roles?: {
        primaryKey?: boolean;
        foreignKey?: {
            refTableId: string;
            refColumnId: string;
            onDelete?: string;
            onUpdate?: string;
        };
        candidateKey?: boolean;
    };
};

type PhysicalIndex = {
    id: string;
    name: string;
    type: string;
    columns: Array<{ columnName: string; order: string }>;
    isUnique: boolean;
};

type PhysicalTable = {
    id: string;
    name: string;
    columns: PhysicalColumn[];
    indexes?: PhysicalIndex[];
    functionalDependencies?: LogicalFunctionalDependency[];
};

export type PhysicalLintPayload = {
    tables?: PhysicalTable[];
};

// ─── CONCEPTUAL RULES ─────────────────────────────────────────────────────────

/** Letters (any language), digits, spaces, underscore and hyphen. */
const VALID_NAME_PATTERN = /^[\p{L}\p{N}_ -]+$/u;

function lintConceptual(payload: ConceptualLintPayload): LintIssue[] {
    const issues: LintIssue[] = [];
    const entities = payload.entities ?? [];
    const relationships = payload.relationships ?? [];
    const generalizations = payload.generalizations ?? [];

    // C001 — Empty diagram
    if (entities.length === 0 && relationships.length === 0) {
        issues.push({
            ruleId: "C001",
            severity: "info",
            message: "Diagram is empty. Add entities and relationships to model your domain.",
        });
        return issues; // No point running other rules on an empty diagram
    }

    // C002 — Entity with no attributes
    for (const entity of entities) {
        if (!entity.attributes || entity.attributes.length === 0) {
            issues.push({
                ruleId: "C002",
                severity: "warning",
                message: `Entity "${entity.name}" has no attributes defined.`,
                target: entity.name,
                targetId: entity.id,
            });
        }
    }

    // C003 — Entity with no key attribute
    for (const entity of entities) {
        if (entity.kind === "strong") {
            const hasKey = entity.attributes?.some((a) => a.isKey);
            if (!hasKey && entity.attributes && entity.attributes.length > 0) {
                issues.push({
                    ruleId: "C003",
                    severity: "warning",
                    message: `Strong entity "${entity.name}" has no key attribute (underlined).`,
                    target: entity.name,
                    targetId: entity.id,
                });
            }
        }
    }

    // C004 — Duplicate entity names
    const entityNames = entities.map((e) => e.name.trim().toLowerCase());
    const seenEntityNames = new Set<string>();
    for (const entity of entities) {
        const key = entity.name.trim().toLowerCase();
        if (seenEntityNames.has(key)) {
            issues.push({
                ruleId: "C004",
                severity: "error",
                message: `Duplicate entity name "${entity.name}". Entity names must be unique.`,
                target: entity.name,
                targetId: entity.id,
            });
        }
        seenEntityNames.add(key);
    }
    void entityNames;

    // C005 — Relationship with fewer than 2 participating entities
    for (const rel of relationships) {
        if (!rel.ends || rel.ends.length < 2) {
            issues.push({
                ruleId: "C005",
                severity: "warning",
                message: `Relationship "${rel.name}" participates in fewer than 2 entities. Connect it to at least 2 entities.`,
                target: rel.name,
                targetId: rel.id,
            });
        }
    }

    // C006 — Relationship ends referencing non-existent entity
    const entityIdSet = new Set(entities.map((e) => e.id));
    for (const rel of relationships) {
        for (const end of rel.ends ?? []) {
            if (!entityIdSet.has(end.entityId)) {
                issues.push({
                    ruleId: "C006",
                    severity: "error",
                    message: `Relationship "${rel.name}" references an entity that no longer exists (id: ${end.entityId}).`,
                    target: rel.name,
                    targetId: rel.id,
                });
            }
        }
    }

    // C007 — Duplicate relationship names
    const seenRelNames = new Set<string>();
    for (const rel of relationships) {
        const key = rel.name.trim().toLowerCase();
        if (seenRelNames.has(key)) {
            issues.push({
                ruleId: "C007",
                severity: "warning",
                message: `Duplicate relationship name "${rel.name}". Consider using distinct names for clarity.`,
                target: rel.name,
                targetId: rel.id,
            });
        }
        seenRelNames.add(key);
    }

    // C008 — Weak entity without an identifying (double-border) relationship
    const weakEntities = entities.filter((e) => e.kind === "weak");
    for (const we of weakEntities) {
        const hasIdentifyingRel = relationships.some(
            (r) =>
                r.type === "identifying" &&
                r.ends.some((end) => end.entityId === we.id),
        );
        if (!hasIdentifyingRel) {
            issues.push({
                ruleId: "C008",
                severity: "warning",
                message: `Weak entity "${we.name}" is not connected to an identifying relationship (double-line diamond).`,
                target: we.name,
                targetId: we.id,
            });
        }
    }

    // C009 — Isolated entity (no relationships)
    for (const entity of entities) {
        const isConnected = relationships.some((r) =>
            r.ends.some((end) => end.entityId === entity.id),
        );
        // Also count generalizations
        const inGeneralization =
            generalizations.some(
                (g) =>
                    getGeneralizationParentIds(g).includes(entity.id) ||
                    g.childEntityIds.includes(entity.id),
            );
        if (!isConnected && !inGeneralization) {
            issues.push({
                ruleId: "C009",
                severity: "info",
                message: `Entity "${entity.name}" is not connected to any relationship or generalization.`,
                target: entity.name,
                targetId: entity.id,
            });
        }
    }

    // C010 — Relationship with missing cardinality on ends
    for (const rel of relationships) {
        for (const end of rel.ends ?? []) {
            if (!end.cardinality || end.cardinality.trim() === "") {
                const entityName =
                    entities.find((e) => e.id === end.entityId)?.name ?? end.entityId;
                issues.push({
                    ruleId: "C010",
                    severity: "info",
                    message: `Relationship "${rel.name}" has no cardinality specified for its participation with entity "${entityName}".`,
                    target: rel.name,
                    targetId: rel.id,
                });
            }
        }
    }

    // C011 — Generalization with single child
    for (const gen of generalizations) {
        if (!gen.childEntityIds || gen.childEntityIds.length < 2) {
            const parentIds = getGeneralizationParentIds(gen);
            const parentName = parentIds
                .map((id) => entities.find((e) => e.id === id)?.name ?? id)
                .join(", ");
            issues.push({
                ruleId: "C011",
                severity: "info",
                message: `Generalization from "${parentName}" has fewer than 2 subclasses. A generalization usually involves at least 2 child entities.`,
                target: parentName,
                targetId: parentIds[0],
            });
        }
    }

    // C012 — Duplicate attribute names within an entity
    for (const entity of entities) {
        const seenAttrNames = new Set<string>();
        for (const attr of entity.attributes ?? []) {
            const key = attr.name.trim().toLowerCase();
            if (seenAttrNames.has(key)) {
                issues.push({
                    ruleId: "C012",
                    severity: "error",
                    message: `Entity "${entity.name}" has duplicate attribute name "${attr.name}".`,
                    target: entity.name,
                    targetId: entity.id,
                });
            }
            seenAttrNames.add(key);
        }
    }

    // C015 — Entity, relationship or attribute with an empty name
    const pushEmptyName = (kind: string, id: string) => {
        issues.push({
            ruleId: "C015",
            severity: "error",
            message: `A ${kind} has an empty name. Give it a name.`,
            targetId: id,
        });
    };
    for (const entity of entities) {
        if (!entity.name?.trim()) pushEmptyName("entity", entity.id);
        for (const attr of entity.attributes ?? []) {
            if (!attr.name?.trim()) pushEmptyName("attribute", attr.id);
        }
    }
    for (const rel of relationships) {
        if (!rel.name?.trim()) pushEmptyName("relationship", rel.id);
    }

    // C016 — Entity name with characters that cannot become a table name
    for (const entity of entities) {
        const name = entity.name?.trim();
        if (name && !VALID_NAME_PATTERN.test(name)) {
            issues.push({
                ruleId: "C016",
                severity: "warning",
                message: `Entity name "${entity.name}" contains special characters. Use only letters, digits, spaces, "_" or "-".`,
                target: entity.name,
                targetId: entity.id,
            });
        }
    }

    // C013 — Generalization references a non-existent parent entity
    for (const gen of generalizations) {
        for (const parentId of getGeneralizationParentIds(gen)) {
            if (!entityIdSet.has(parentId)) {
                issues.push({
                    ruleId: "C013",
                    severity: "error",
                    message: `Generalization references a parent entity that no longer exists (id: ${parentId}).`,
                    targetId: parentId,
                });
            }
        }
    }

    // C014 — Generalization references a non-existent child entity
    for (const gen of generalizations) {
        for (const childId of gen.childEntityIds ?? []) {
            if (!entityIdSet.has(childId)) {
                issues.push({
                    ruleId: "C014",
                    severity: "error",
                    message: `Generalization references a child entity that no longer exists (id: ${childId}).`,
                    targetId: childId,
                });
            }
        }
    }

    return issues;
}

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────

type FKGraphTable = {
    id: string;
    columns: Array<{ roles?: { foreignKey?: { refTableId: string } } }>;
};

/** Detects cycles in the foreign-key reference graph between tables (self-loops excluded). */
function findForeignKeyCycles(tables: FKGraphTable[]): string[][] {
    const graph = new Map<string, Set<string>>();
    for (const t of tables) {
        const targets = new Set<string>();
        for (const col of t.columns ?? []) {
            const refId = col.roles?.foreignKey?.refTableId;
            if (refId && refId !== t.id) targets.add(refId);
        }
        graph.set(t.id, targets);
    }

    const UNVISITED = 0;
    const IN_PROGRESS = 1;
    const DONE = 2;
    const state = new Map<string, number>(tables.map((t) => [t.id, UNVISITED]));
    const path: string[] = [];
    const cycles: string[][] = [];
    const seenCycleKeys = new Set<string>();

    function visit(nodeId: string) {
        state.set(nodeId, IN_PROGRESS);
        path.push(nodeId);
        for (const next of graph.get(nodeId) ?? []) {
            if (!graph.has(next)) continue;
            const nextState = state.get(next);
            if (nextState === IN_PROGRESS) {
                const idx = path.indexOf(next);
                const cycle = path.slice(idx);
                const minIdx = cycle.reduce((mi, id, i) => (id < cycle[mi] ? i : mi), 0);
                const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
                const key = rotated.join(">");
                if (!seenCycleKeys.has(key)) {
                    seenCycleKeys.add(key);
                    cycles.push(rotated);
                }
            } else if (nextState === UNVISITED) {
                visit(next);
            }
        }
        path.pop();
        state.set(nodeId, DONE);
    }

    for (const t of tables) {
        if (state.get(t.id) === UNVISITED) visit(t.id);
    }
    return cycles;
}

// ─── LOGICAL RULES ────────────────────────────────────────────────────────────

function lintLogical(payload: LogicalLintPayload): LintIssue[] {
    const issues: LintIssue[] = [];
    const tables = payload.tables ?? [];

    // L001 — Empty schema
    if (tables.length === 0) {
        issues.push({
            ruleId: "L001",
            severity: "info",
            message: "Schema is empty. Add tables to define your logical data model.",
        });
        return issues;
    }

    const tableIdToName = new Map(tables.map((t) => [t.id, t.name]));
    const tableIdToColumns = new Map(tables.map((t) => [t.id, t.columns]));

    // L002 — Table with no columns
    for (const table of tables) {
        if (!table.columns || table.columns.length === 0) {
            issues.push({
                ruleId: "L002",
                severity: "error",
                message: `Table "${table.name}" has no columns.`,
                target: table.name,
                targetId: table.id,
            });
        }
    }

    // L003 — Table with no primary key
    for (const table of tables) {
        const hasPK = table.columns?.some((c) => c.roles?.primaryKey);
        if (!hasPK && table.columns && table.columns.length > 0) {
            issues.push({
                ruleId: "L003",
                severity: "warning",
                message: `Table "${table.name}" has no primary key defined. Every table should have a primary key.`,
                target: table.name,
                targetId: table.id,
            });
        }
    }

    // L004 — Duplicate table names
    const seenTableNames = new Set<string>();
    for (const table of tables) {
        const key = table.name.trim().toLowerCase();
        if (seenTableNames.has(key)) {
            issues.push({
                ruleId: "L004",
                severity: "error",
                message: `Duplicate table name "${table.name}". Table names must be unique within a schema.`,
                target: table.name,
                targetId: table.id,
            });
        }
        seenTableNames.add(key);
    }

    // L005 — Duplicate column names within a table
    for (const table of tables) {
        const seenColNames = new Set<string>();
        for (const col of table.columns ?? []) {
            const key = col.name.trim().toLowerCase();
            if (seenColNames.has(key)) {
                issues.push({
                    ruleId: "L005",
                    severity: "error",
                    message: `Table "${table.name}" has duplicate column name "${col.name}".`,
                    target: table.name,
                    targetId: table.id,
                });
            }
            seenColNames.add(key);
        }
    }

    // L006 — FK references non-existent table
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk) {
                if (!tableIdToName.has(fk.refTableId)) {
                    issues.push({
                        ruleId: "L006",
                        severity: "error",
                        message: `Table "${table.name}", column "${col.name}": foreign key references a table that does not exist (id: ${fk.refTableId}).`,
                        target: table.name,
                        targetId: table.id,
                    });
                } else {
                    // L007 — FK references non-existent column
                    const refCols = tableIdToColumns.get(fk.refTableId) ?? [];
                    if (!refCols.some((c) => c.id === fk.refColumnId)) {
                        const refTableName = tableIdToName.get(fk.refTableId) ?? fk.refTableId;
                        issues.push({
                            ruleId: "L007",
                            severity: "error",
                            message: `Table "${table.name}", column "${col.name}": foreign key references column "${fk.refColumnId}" which does not exist in table "${refTableName}".`,
                            target: table.name,
                            targetId: table.id,
                        });
                    }
                }
            }
        }
    }

    // L008 — FK referencing a non-primary-key column
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk && tableIdToColumns.has(fk.refTableId)) {
                const refCols = tableIdToColumns.get(fk.refTableId)!;
                const refCol = refCols.find((c) => c.id === fk.refColumnId);
                if (refCol && !refCol.roles?.primaryKey && !refCol.roles?.candidateKey) {
                    const refTableName = tableIdToName.get(fk.refTableId) ?? fk.refTableId;
                    issues.push({
                        ruleId: "L008",
                        severity: "warning",
                        message: `Table "${table.name}", column "${col.name}": foreign key points to "${refTableName}.${refCol.name}" which is not a primary key or candidate key.`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // L009 — (Removed) Nullability is a physical-level concern, not checked at logical level.

    // L010 — Functional dependency references non-existent column
    for (const table of tables) {
        const colRefs = new Set(
            (table.columns ?? []).flatMap((c) => [
                c.id.trim().toLowerCase(),
                c.name.trim().toLowerCase(),
            ]),
        );
        for (const fd of table.functionalDependencies ?? []) {
            const allRefs = [...(fd.left ?? []), ...(fd.right ?? [])];
            for (const ref of allRefs) {
                if (!colRefs.has(ref.trim().toLowerCase())) {
                    issues.push({
                        ruleId: "L010",
                        severity: "warning",
                        message: `Table "${table.name}": functional dependency references column "${ref}" which does not exist in this table.`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // L011 — Composite primary key with more than 4 columns (performance hint)
    for (const table of tables) {
        const pkCols = (table.columns ?? []).filter((c) => c.roles?.primaryKey);
        if (pkCols.length > 4) {
            issues.push({
                ruleId: "L011",
                severity: "info",
                message: `Table "${table.name}" has a composite primary key of ${pkCols.length} columns. Consider whether a surrogate key would be simpler.`,
                target: table.name,
                targetId: table.id,
            });
        }
    }

    // L012 — FK column referencing itself
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk && fk.refTableId === table.id && fk.refColumnId === col.id) {
                issues.push({
                    ruleId: "L012",
                    severity: "error",
                    message: `Table "${table.name}", column "${col.name}": a foreign key cannot reference itself.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    // L013 — Circular foreign key reference between tables
    for (const cycle of findForeignKeyCycles(tables)) {
        const chain = [...cycle, cycle[0]].map((id) => tableIdToName.get(id) ?? id).join(" → ");
        issues.push({
            ruleId: "L013",
            severity: "info",
            message: `Circular foreign key reference detected: ${chain}. This may complicate data insertion and deletion order.`,
            target: tableIdToName.get(cycle[0]),
            targetId: cycle[0],
        });
    }

    // L014 — Candidate key column not marked unique
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.roles?.candidateKey && !col.roles?.primaryKey && !col.unique) {
                issues.push({
                    ruleId: "L014",
                    severity: "warning",
                    message: `Table "${table.name}", column "${col.name}": candidate key should typically also be marked unique.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    return issues;
}

// ─── PHYSICAL RULES ───────────────────────────────────────────────────────────

const BLOB_TYPES = new Set([
    "blob", "mediumblob", "longblob", "tinyblob",
    "bytea", "image", "varbinary", "binary",
]);

const TEXT_TYPES = new Set([
    "text", "tinytext", "mediumtext", "longtext",
    "clob", "ntext", "nvarchar(max)", "varchar(max)",
]);

const FLOAT_TYPES = new Set([
    "float", "real", "double", "double precision",
]);

const RESERVED_SQL_KEYWORDS = new Set([
    "select", "insert", "update", "delete", "from", "where", "join", "inner", "outer",
    "left", "right", "full", "cross", "on", "using", "group", "order", "by", "having",
    "limit", "offset", "union", "all", "distinct", "as", "into", "values", "set",
    "table", "database", "schema", "index", "key", "primary", "foreign", "references",
    "constraint", "check", "default", "null", "not", "and", "or", "in", "like",
    "between", "exists", "case", "when", "then", "else", "end", "create", "alter",
    "drop", "column", "view", "trigger", "procedure", "function", "grant", "revoke",
    "user", "role", "with", "recursive", "cast", "true", "false", "is", "asc", "desc",
]);

function lintPhysical(payload: PhysicalLintPayload): LintIssue[] {
    const issues: LintIssue[] = [];
    const tables = payload.tables ?? [];

    // P001 — Empty schema
    if (tables.length === 0) {
        issues.push({
            ruleId: "P001",
            severity: "info",
            message: "Physical schema is empty. Add tables to define your database structure.",
        });
        return issues;
    }

    const tableIdToName = new Map(tables.map((t) => [t.id, t.name]));
    const tableIdToColumns = new Map(tables.map((t) => [t.id, t.columns]));

    // P002 — Table with no columns
    for (const table of tables) {
        if (!table.columns || table.columns.length === 0) {
            issues.push({
                ruleId: "P002",
                severity: "error",
                message: `Table "${table.name}" has no columns.`,
                target: table.name,
                targetId: table.id,
            });
        }
    }

    // P003 — Table with no primary key
    for (const table of tables) {
        const hasPK = table.columns?.some((c) => c.roles?.primaryKey);
        if (!hasPK && table.columns && table.columns.length > 0) {
            issues.push({
                ruleId: "P003",
                severity: "warning",
                message: `Table "${table.name}" has no primary key. Every table should have a primary key for data integrity.`,
                target: table.name,
                targetId: table.id,
            });
        }
    }

    // P004 — Duplicate table names
    const seenTableNames = new Set<string>();
    for (const table of tables) {
        const key = table.name.trim().toLowerCase();
        if (seenTableNames.has(key)) {
            issues.push({
                ruleId: "P004",
                severity: "error",
                message: `Duplicate table name "${table.name}". Table names must be unique in the same schema.`,
                target: table.name,
                targetId: table.id,
            });
        }
        seenTableNames.add(key);
    }

    // P005 — Duplicate column names within a table
    for (const table of tables) {
        const seenColNames = new Set<string>();
        for (const col of table.columns ?? []) {
            const key = col.name.trim().toLowerCase();
            if (seenColNames.has(key)) {
                issues.push({
                    ruleId: "P005",
                    severity: "error",
                    message: `Table "${table.name}" has duplicate column name "${col.name}".`,
                    target: table.name,
                    targetId: table.id,
                });
            }
            seenColNames.add(key);
        }
    }

    // P006 — Column with no data type
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (!col.dataType || col.dataType.trim() === "") {
                issues.push({
                    ruleId: "P006",
                    severity: "error",
                    message: `Table "${table.name}", column "${col.name}": no data type specified.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    // P007 — Nullable primary key
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.roles?.primaryKey && col.nullable) {
                issues.push({
                    ruleId: "P007",
                    severity: "error",
                    message: `Table "${table.name}", column "${col.name}": primary key column must be NOT NULL.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    // P008 — TEXT/BLOB type used as primary key
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.roles?.primaryKey && col.dataType) {
                const dt = col.dataType.trim().toLowerCase();
                if (BLOB_TYPES.has(dt) || TEXT_TYPES.has(dt)) {
                    issues.push({
                        ruleId: "P008",
                        severity: "error",
                        message: `Table "${table.name}", column "${col.name}": TEXT/BLOB types cannot be used as a primary key.`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P009 — FLOAT/DOUBLE used as primary key (precision risk)
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.roles?.primaryKey && col.dataType) {
                const dt = col.dataType.trim().toLowerCase();
                if (FLOAT_TYPES.has(dt)) {
                    issues.push({
                        ruleId: "P009",
                        severity: "warning",
                        message: `Table "${table.name}", column "${col.name}": using FLOAT/DOUBLE as a primary key is risky due to floating-point precision issues.`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P010 — AutoIncrement on non-integer column
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.autoIncrement && col.dataType) {
                const dt = col.dataType.trim().toLowerCase();
                const integerTypes = new Set(["int", "integer", "bigint", "smallint", "mediumint", "tinyint", "serial", "bigserial", "smallserial"]);
                if (!integerTypes.has(dt)) {
                    issues.push({
                        ruleId: "P010",
                        severity: "warning",
                        message: `Table "${table.name}", column "${col.name}": AUTO_INCREMENT/SERIAL is only meaningful on integer types (current type: ${col.dataType}).`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P011 — FK without ON DELETE / ON UPDATE action
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk) {
                if (!fk.onDelete || fk.onDelete.trim().toUpperCase() === "NO ACTION") {
                    issues.push({
                        ruleId: "P011",
                        severity: "info",
                        message: `Table "${table.name}", column "${col.name}": foreign key has no ON DELETE action specified (defaults to NO ACTION).`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
                if (!fk.onUpdate || fk.onUpdate.trim().toUpperCase() === "NO ACTION") {
                    issues.push({
                        ruleId: "P011",
                        severity: "info",
                        message: `Table "${table.name}", column "${col.name}": foreign key has no ON UPDATE action specified (defaults to NO ACTION).`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P012 — FK references non-existent table
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk) {
                if (!tableIdToName.has(fk.refTableId)) {
                    issues.push({
                        ruleId: "P012",
                        severity: "error",
                        message: `Table "${table.name}", column "${col.name}": foreign key references a table that does not exist (id: ${fk.refTableId}).`,
                        target: table.name,
                        targetId: table.id,
                    });
                } else {
                    // P013 — FK references non-existent column
                    const refCols = tableIdToColumns.get(fk.refTableId) ?? [];
                    if (!refCols.some((c) => c.id === fk.refColumnId)) {
                        const refTableName = tableIdToName.get(fk.refTableId) ?? fk.refTableId;
                        issues.push({
                            ruleId: "P013",
                            severity: "error",
                            message: `Table "${table.name}", column "${col.name}": foreign key references column that does not exist in table "${refTableName}".`,
                            target: table.name,
                            targetId: table.id,
                        });
                    }
                }
            }
        }
    }

    // P014 — FK references non-PK / non-unique column
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk && tableIdToColumns.has(fk.refTableId)) {
                const refCols = tableIdToColumns.get(fk.refTableId)!;
                const refCol = refCols.find((c) => c.id === fk.refColumnId);
                if (refCol && !refCol.roles?.primaryKey && !refCol.roles?.candidateKey && !refCol.unique) {
                    const refTableName = tableIdToName.get(fk.refTableId) ?? fk.refTableId;
                    issues.push({
                        ruleId: "P014",
                        severity: "warning",
                        message: `Table "${table.name}", column "${col.name}": foreign key references "${refTableName}.${refCol.name}" which is not a primary key, candidate key, or unique column.`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P015 — Index references non-existent column
    for (const table of tables) {
        const colNameSet = new Set(
            (table.columns ?? []).map((c) => c.name.trim().toLowerCase()),
        );
        for (const idx of table.indexes ?? []) {
            for (const idxCol of idx.columns ?? []) {
                if (!colNameSet.has(idxCol.columnName.trim().toLowerCase())) {
                    issues.push({
                        ruleId: "P015",
                        severity: "error",
                        message: `Table "${table.name}", index "${idx.name}": references column "${idxCol.columnName}" which does not exist in this table.`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P016 — Large VARCHAR (> 1000) without an index may hurt performance
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.dataType?.trim().toLowerCase() === "varchar" && col.length) {
                const len = parseInt(col.length, 10);
                if (!isNaN(len) && len > 1000) {
                    // Check if this column is indexed
                    const isIndexed = (table.indexes ?? []).some((idx) =>
                        idx.columns.some(
                            (ic) => ic.columnName.trim().toLowerCase() === col.name.trim().toLowerCase(),
                        ),
                    );
                    if (!isIndexed) {
                        issues.push({
                            ruleId: "P016",
                            severity: "info",
                            message: `Table "${table.name}", column "${col.name}": VARCHAR(${len}) is very large. Consider using TEXT or adding an index if this column is frequently queried.`,
                            target: table.name,
                            targetId: table.id,
                        });
                    }
                }
            }
        }
    }

    // P017 — Composite primary key with more than 4 columns
    for (const table of tables) {
        const pkCols = (table.columns ?? []).filter((c) => c.roles?.primaryKey);
        if (pkCols.length > 4) {
            issues.push({
                ruleId: "P017",
                severity: "info",
                message: `Table "${table.name}" has a composite primary key spanning ${pkCols.length} columns. This may impact write performance. Consider a surrogate key.`,
                target: table.name,
                targetId: table.id,
            });
        }
    }

    // P018 — Duplicate index names within a table
    for (const table of tables) {
        const seenIdxNames = new Set<string>();
        for (const idx of table.indexes ?? []) {
            const key = idx.name.trim().toLowerCase();
            if (seenIdxNames.has(key)) {
                issues.push({
                    ruleId: "P018",
                    severity: "error",
                    message: `Table "${table.name}" has duplicate index name "${idx.name}".`,
                    target: table.name,
                    targetId: table.id,
                });
            }
            seenIdxNames.add(key);
        }
    }

    // P019 — Column named "password" / "passwd" stored without indication of hashing
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const lname = col.name.trim().toLowerCase();
            if (lname === "password" || lname === "passwd" || lname === "pwd") {
                const dt = col.dataType?.trim().toLowerCase() ?? "";
                // Warn if it's a short varchar (potential plain-text storage)
                if (dt === "varchar" && col.length) {
                    const len = parseInt(col.length, 10);
                    if (!isNaN(len) && len < 60) {
                        issues.push({
                            ruleId: "P019",
                            severity: "warning",
                            message: `Table "${table.name}", column "${col.name}": password column has a short length (${len}). Hashed passwords (e.g. bcrypt) require at least 60 characters.`,
                            target: table.name,
                            targetId: table.id,
                        });
                    }
                }
            }
        }
    }

    // P020 — Functional dependency references non-existent column
    for (const table of tables) {
        const colRefs = new Set(
            (table.columns ?? []).flatMap((c) => [
                c.id.trim().toLowerCase(),
                c.name.trim().toLowerCase(),
            ]),
        );
        for (const fd of table.functionalDependencies ?? []) {
            for (const ref of [...(fd.left ?? []), ...(fd.right ?? [])]) {
                if (!colRefs.has(ref.trim().toLowerCase())) {
                    issues.push({
                        ruleId: "P020",
                        severity: "warning",
                        message: `Table "${table.name}": functional dependency references column "${ref}" which does not exist.`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P021 — FK column data type does not match referenced column's data type
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk && col.dataType && tableIdToColumns.has(fk.refTableId)) {
                const refCols = tableIdToColumns.get(fk.refTableId)!;
                const refCol = refCols.find((c) => c.id === fk.refColumnId);
                if (refCol?.dataType && refCol.dataType.trim().toLowerCase() !== col.dataType.trim().toLowerCase()) {
                    const refTableName = tableIdToName.get(fk.refTableId) ?? fk.refTableId;
                    issues.push({
                        ruleId: "P021",
                        severity: "warning",
                        message: `Table "${table.name}", column "${col.name}" (${col.dataType}): foreign key type does not match referenced column "${refTableName}.${refCol.name}" (${refCol.dataType}).`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
            }
        }
    }

    // P022 — More than one AUTO_INCREMENT column in the same table
    for (const table of tables) {
        const autoIncCols = (table.columns ?? []).filter((c) => c.autoIncrement);
        if (autoIncCols.length > 1) {
            issues.push({
                ruleId: "P022",
                severity: "error",
                message: `Table "${table.name}" has ${autoIncCols.length} AUTO_INCREMENT/SERIAL columns. Most databases allow only one per table.`,
                target: table.name,
                targetId: table.id,
            });
        }
    }

    // P023 — Table or column name is a reserved SQL keyword
    for (const table of tables) {
        if (RESERVED_SQL_KEYWORDS.has(table.name.trim().toLowerCase())) {
            issues.push({
                ruleId: "P023",
                severity: "warning",
                message: `Table name "${table.name}" is a reserved SQL keyword and may require quoting in queries.`,
                target: table.name,
                targetId: table.id,
            });
        }
        for (const col of table.columns ?? []) {
            if (RESERVED_SQL_KEYWORDS.has(col.name.trim().toLowerCase())) {
                issues.push({
                    ruleId: "P023",
                    severity: "warning",
                    message: `Table "${table.name}", column "${col.name}": name is a reserved SQL keyword and may require quoting in queries.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    // P024 — FK column referencing itself
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const fk = col.roles?.foreignKey;
            if (fk && fk.refTableId === table.id && fk.refColumnId === col.id) {
                issues.push({
                    ruleId: "P024",
                    severity: "error",
                    message: `Table "${table.name}", column "${col.name}": a foreign key cannot reference itself.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    // P025 — Circular foreign key reference between tables
    for (const cycle of findForeignKeyCycles(tables)) {
        const chain = [...cycle, cycle[0]].map((id) => tableIdToName.get(id) ?? id).join(" → ");
        issues.push({
            ruleId: "P025",
            severity: "warning",
            message: `Circular foreign key reference detected: ${chain}. This can complicate insert order and cascading deletes.`,
            target: tableIdToName.get(cycle[0]),
            targetId: cycle[0],
        });
    }

    // P026 — Candidate key column not marked unique
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.roles?.candidateKey && !col.roles?.primaryKey && !col.unique) {
                issues.push({
                    ruleId: "P026",
                    severity: "warning",
                    message: `Table "${table.name}", column "${col.name}": candidate key should typically also be marked unique.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    // P027 — Invalid length/precision (not a positive integer, `max`, or `p,s` for DECIMAL/NUMERIC)
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            const dt = col.dataType?.trim().toLowerCase() ?? "";
            const hasPrecision = dt === "decimal" || dt === "numeric";
            if (col.length && !isValidTypeLength(col.length, hasPrecision)) {
                issues.push({
                    ruleId: "P027",
                    severity: "error",
                    message: `Table "${table.name}", column "${col.name}": length "${col.length}" of ${col.dataType} is invalid. Use a positive integer${hasPrecision ? " or precision,scale (e.g. 10,2)" : " (or MAX where supported)"}.`,
                    target: table.name,
                    targetId: table.id,
                });
            }
        }
    }

    return issues;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function runConceptualLinter(payload: ConceptualLintPayload): LintResult {
    const issues = lintConceptual(payload);
    return {
        issues,
        counts: {
            error: issues.filter((i) => i.severity === "error").length,
            warning: issues.filter((i) => i.severity === "warning").length,
            info: issues.filter((i) => i.severity === "info").length,
        },
    };
}

export function runLogicalLinter(payload: LogicalLintPayload): LintResult {
    const issues = lintLogical(payload);
    return {
        issues,
        counts: {
            error: issues.filter((i) => i.severity === "error").length,
            warning: issues.filter((i) => i.severity === "warning").length,
            info: issues.filter((i) => i.severity === "info").length,
        },
    };
}

export function runPhysicalLinter(payload: PhysicalLintPayload): LintResult {
    const issues = lintPhysical(payload);
    return {
        issues,
        counts: {
            error: issues.filter((i) => i.severity === "error").length,
            warning: issues.filter((i) => i.severity === "warning").length,
            info: issues.filter((i) => i.severity === "info").length,
        },
    };
}
