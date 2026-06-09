/**
 * schema-linter.ts
 * Linter & Safety Warning engine for all three schema levels:
 * Conceptual, Logical, and Physical.
 *
 * Rules are organized per schema type. Each rule emits one or more
 * LintIssue entries that the UI renders in the LinterPanel.
 */

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
    parentEntityId: string;
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
                    g.parentEntityId === entity.id ||
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
            const parentName =
                entities.find((e) => e.id === gen.parentEntityId)?.name ??
                gen.parentEntityId;
            issues.push({
                ruleId: "C011",
                severity: "info",
                message: `Generalization from "${parentName}" has fewer than 2 subclasses. A generalization usually involves at least 2 child entities.`,
                target: parentName,
                targetId: gen.parentEntityId,
            });
        }
    }

    return issues;
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
        const colNames = new Set((table.columns ?? []).map((c) => c.name.trim().toLowerCase()));
        for (const fd of table.functionalDependencies ?? []) {
            const allRefs = [...(fd.left ?? []), ...(fd.right ?? [])];
            for (const ref of allRefs) {
                if (!colNames.has(ref.trim().toLowerCase())) {
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
                if (!fk.onDelete) {
                    issues.push({
                        ruleId: "P011",
                        severity: "info",
                        message: `Table "${table.name}", column "${col.name}": foreign key has no ON DELETE action specified (defaults to NO ACTION).`,
                        target: table.name,
                        targetId: table.id,
                    });
                }
                if (!fk.onUpdate) {
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
        const colNames = new Set((table.columns ?? []).map((c) => c.name.trim().toLowerCase()));
        for (const fd of table.functionalDependencies ?? []) {
            for (const ref of [...(fd.left ?? []), ...(fd.right ?? [])]) {
                if (!colNames.has(ref.trim().toLowerCase())) {
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
