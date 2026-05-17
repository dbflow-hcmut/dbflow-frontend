/**
 * Schema-level conversion utilities.
 *
 * Provides deterministic, AI-free transformations between schema levels:
 *   - Logical     → Physical
 *   - Physical    → Logical
 *   - Logical     → Conceptual
 *   - Conceptual  → Logical
 */

import type { LogicalModelPayload } from "./logical-model.builder";
import type { PhysicalModelPayload } from "./physical-model.builder";
import type { ConceptualModelPayload } from "./conceptual-model.builder";

// ── helpers ──────────────────────────────────────────────────────────────────

const generatePid = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `pid_${crypto.randomUUID()}`;
    }
    const r = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `pid_${r}`;
};

/** Map a logical column-id (lid_…) to a physical column-id (pid_…). */
const remapColId = (id: string): string => id.replace(/^lid_/, "pid_");

/**
 * Infer a physical data-type from a logical column's role / name heuristics.
 *
 * Rules (applied in order):
 *  1. Primary key or integer foreign key → 'int'
 *  2. Name contains date/time keywords  → 'datetime'
 *  3. Name contains numeric keywords    → 'int'
 *  4. Name contains boolean keywords    → 'boolean'
 *  5. Name contains large-text keywords → 'text'
 *  6. Everything else                   → 'varchar'
 */
const inferDataType = (col: {
    name: string;
    roles?: {
        primaryKey?: boolean;
        foreignKey?: unknown;
    };
}): string => {
    if (col.roles?.primaryKey || col.roles?.foreignKey) return "int";

    const n = col.name.toLowerCase();

    if (
        n.endsWith("_at") ||
        n.endsWith("_date") ||
        n.endsWith("_time") ||
        n.includes("date") ||
        n.includes("time") ||
        n === "created" ||
        n === "updated"
    ) {
        return "datetime";
    }

    if (
        n.includes("count") ||
        n.includes("_num") ||
        n.startsWith("num_") ||
        n.includes("qty") ||
        n.includes("quantity") ||
        n.includes("amount") ||
        n.includes("price") ||
        n.includes("total") ||
        n.includes("score") ||
        n.includes("rank") ||
        n.includes("age") ||
        n.includes("year")
    ) {
        return "int";
    }

    if (
        n.startsWith("is_") ||
        n.startsWith("has_") ||
        n.startsWith("can_") ||
        n === "active" ||
        n === "enabled" ||
        n === "deleted" ||
        n === "verified" ||
        n === "published"
    ) {
        return "boolean";
    }

    if (
        n.includes("description") ||
        n.includes("content") ||
        n.includes("body") ||
        n.includes("notes") ||
        n.includes("comment") ||
        n.includes("bio") ||
        n.includes("message")
    ) {
        return "text";
    }

    return "varchar";
};

// ── public API ────────────────────────────────────────────────────────────────

export interface ConvertLogicalToPhysicalOptions {
    /** Override the generated model.id (defaults to a new pid). */
    newModelId?: string;
    /** Override the model name (defaults to replacing "Logical" → "Physical"). */
    newModelName?: string;
}

/**
 * Converts a `LogicalModelPayload` into a `PhysicalModelPayload`.
 *
 * Mapping rules:
 *  - Table IDs are preserved so FK references remain consistent.
 *  - Column IDs are remapped from `lid_` prefix to `pid_` prefix.
 *  - FK `refColumnId` is remapped accordingly.
 *  - A `dataType` is inferred for every column from its role and name.
 *  - `nullable` and `unique` are carried over unchanged.
 *  - `autoIncrement` defaults to `false` (user can enable later).
 *  - Indexes are initialised as empty (no indexes in logical model).
 *  - Functional dependencies are carried over.
 */
export const convertLogicalToPhysical = (
    logicalModel: LogicalModelPayload,
    opts: ConvertLogicalToPhysicalOptions = {},
): PhysicalModelPayload => {
    const derivedName = logicalModel.model.name
        .replace(/logical/gi, "Physical")
        .replace(/Logical/g, "Physical");
    const modelName = opts.newModelName ?? (derivedName !== logicalModel.model.name ? derivedName : `${logicalModel.model.name} (Physical)`);

    return {
        model: {
            id: opts.newModelId ?? generatePid(),
            name: modelName,
            version: 1,
            notes: logicalModel.model.notes,
        },
        tables: (logicalModel.tables ?? []).map((table) => ({
            id: table.id,
            name: table.name,
            notes: table.notes,
            columns: (table.columns ?? []).map((col) => ({
                id: remapColId(col.id),
                name: col.name,
                dataType: inferDataType(col),
                nullable: col.roles?.primaryKey ? false : (col.nullable ?? true),
                unique: col.unique ?? false,
                autoIncrement: false,
                roles: col.roles
                    ? {
                          primaryKey: col.roles.primaryKey,
                          candidateKey: col.roles.candidateKey,
                          foreignKey: col.roles.foreignKey
                              ? {
                                    refTableId: col.roles.foreignKey.refTableId,
                                    refColumnId: remapColId(col.roles.foreignKey.refColumnId),
                                }
                              : undefined,
                      }
                    : undefined,
            })),
            indexes: [],
            functionalDependencies: table.functionalDependencies,
        })),
    };
};

// ── Physical → Logical ────────────────────────────────────────────────────────

const generateLid = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `lid_${crypto.randomUUID()}`;
    }
    const r = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `lid_${r}`;
};

/** Remap a physical column-id (pid_…) to a logical column-id (lid_…). */
const remapColIdToLogical = (id: string): string => id.replace(/^pid_/, "lid_");

export interface ConvertPhysicalToLogicalOptions {
    newModelId?: string;
    newModelName?: string;
}

/**
 * Converts a `PhysicalModelPayload` into a `LogicalModelPayload`.
 *
 * Mapping rules:
 *  - Table IDs are preserved so FK references remain consistent.
 *  - Column IDs are remapped from `pid_` prefix to `lid_` prefix.
 *  - FK `refColumnId` is remapped accordingly.
 *  - Physical-only fields (`dataType`, `length`, `autoIncrement`, `defaultValue`,
 *    `indexes`) are dropped; the logical layer is implementation-agnostic.
 *  - `nullable`, `unique`, and `roles` (PK, FK, candidateKey) are kept.
 *  - `functionalDependencies` are carried over.
 */
export const convertPhysicalToLogical = (
    physicalModel: PhysicalModelPayload,
    opts: ConvertPhysicalToLogicalOptions = {},
): LogicalModelPayload => {
    const derivedName = physicalModel.model.name
        .replace(/physical/gi, "Logical")
        .replace(/Physical/g, "Logical");
    const modelName =
        opts.newModelName ??
        (derivedName !== physicalModel.model.name
            ? derivedName
            : `${physicalModel.model.name} (Logical)`);

    return {
        model: {
            id: opts.newModelId ?? generateLid(),
            name: modelName,
            version: 1,
            notes: physicalModel.model.notes,
        },
        tables: (physicalModel.tables ?? []).map((table) => ({
            id: table.id,
            name: table.name,
            notes: table.notes,
            columns: (table.columns ?? []).map((col) => ({
                id: remapColIdToLogical(col.id),
                name: col.name,
                nullable: col.nullable ?? true,
                unique: col.unique ?? false,
                roles: col.roles
                    ? {
                          primaryKey: col.roles.primaryKey,
                          candidateKey: col.roles.candidateKey,
                          foreignKey: col.roles.foreignKey
                              ? {
                                    refTableId: col.roles.foreignKey.refTableId,
                                    refColumnId: remapColIdToLogical(col.roles.foreignKey.refColumnId),
                                }
                              : undefined,
                      }
                    : undefined,
            })),
            functionalDependencies: table.functionalDependencies,
        })),
    };
};

// ── Logical → Conceptual ──────────────────────────────────────────────────────

const generateCid = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `cid_${crypto.randomUUID()}`;
    }
    const r = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    return `cid_${r}`;
};

export interface ConvertLogicalToConceptualOptions {
    newModelId?: string;
    newModelName?: string;
}

/**
 * Converts a `LogicalModelPayload` into a `ConceptualModelPayload`.
 *
 * Mapping rules:
 *  - Each table → one strong Entity.
 *  - PK columns → key Attributes (isKey: true, kind: "simple").
 *  - Candidate key columns → key Attributes.
 *  - FK-only columns (not also PK) → NOT added as attributes; each FK
 *    generates one Relationship between source and referenced entity (N:1).
 *  - If the same (sourceTable, refTable) pair appears multiple times,
 *    only one relationship is emitted (deduplication).
 *  - Table IDs are reused as Entity IDs so FK references resolve correctly.
 *
 * ISA (Generalization) detection — class table inheritance pattern:
 *  - If a table's PK column is ALSO a FK to another table, that FK represents
 *    an IS-A relationship (child entity inherits parent). The column is NOT
 *    added as an attribute, and the FK is NOT added as a regular relationship.
 *    Instead a Generalization entry is created with the parent→children mapping.
 *    Default constraints: disjoint / partial (conservative; user can adjust).
 *
 * Not recoverable from logical model:
 *  - Categories (union types): no representation in logical schema.
 *  - Disjointness / completeness metadata: not stored in logical model.
 *    (defaults are set on generated generalizations, see above.)
 */
export const convertLogicalToConceptual = (
    logicalModel: LogicalModelPayload,
    opts: ConvertLogicalToConceptualOptions = {},
): ConceptualModelPayload => {
    const derivedName = logicalModel.model.name
        .replace(/logical/gi, "Conceptual")
        .replace(/Logical/g, "Conceptual");
    const modelName =
        opts.newModelName ??
        (derivedName !== logicalModel.model.name
            ? derivedName
            : `${logicalModel.model.name} (Conceptual)`);

    const tables = logicalModel.tables ?? [];
    const tableIdSet = new Set(tables.map((t) => t.id));

    // ── Detect ISA via class table inheritance pattern ─────────────────
    // A table whose PK column is also a FK → child entity IS-A parent entity.
    // isaMap: childTableId → parentTableId (one direct parent only)
    const isaMap = new Map<string, string>();
    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (col.roles?.primaryKey && col.roles?.foreignKey) {
                const refTableId = col.roles.foreignKey.refTableId;
                if (tableIdSet.has(refTableId) && !isaMap.has(table.id)) {
                    isaMap.set(table.id, refTableId);
                }
            }
        }
    }

    // Group children by parent → one Generalization per parent
    const generalizationMap = new Map<string, string[]>();
    for (const [childId, parentId] of isaMap.entries()) {
        const children = generalizationMap.get(parentId) ?? [];
        children.push(childId);
        generalizationMap.set(parentId, children);
    }

    const generalizations: NonNullable<ConceptualModelPayload["generalizations"]> = [];
    for (const [parentEntityId, childEntityIds] of generalizationMap.entries()) {
        generalizations.push({
            id: generateCid(),
            parentEntityId,
            childEntityIds,
            constraints: {
                // Conservative defaults — user can refine after conversion
                disjointness: "disjoint",
                completeness: "partial",
            },
        });
    }

    // ── Entities ─────────────────────────────────────────────────────
    const entities: ConceptualModelPayload["entities"] = tables.map((table) => {
        const attributes: NonNullable<ConceptualModelPayload["entities"][number]["attributes"]> = [];

        for (const col of table.columns ?? []) {
            const isFKOnly = col.roles?.foreignKey && !col.roles?.primaryKey && !col.roles?.candidateKey;
            // ISA PK+FK column becomes a generalization edge, not an attribute
            const isISA =
                col.roles?.primaryKey &&
                col.roles?.foreignKey &&
                isaMap.get(table.id) === col.roles.foreignKey.refTableId;

            if (isFKOnly || isISA) continue;

            attributes.push({
                id: generateCid(),
                name: col.name,
                kind: "simple" as const,
                isKey: !!(col.roles?.primaryKey || col.roles?.candidateKey),
            });
        }

        return {
            id: table.id,
            name: table.name,
            kind: "strong" as const,
            attributes,
            notes: table.notes,
        };
    });

    // ── Relationships from regular FK columns ─────────────────────────
    const relationships: ConceptualModelPayload["relationships"] = [];

    for (const table of tables) {
        for (const col of table.columns ?? []) {
            if (!col.roles?.foreignKey) continue;
            const fk = col.roles.foreignKey;
            if (!tableIdSet.has(fk.refTableId)) continue;

            // Skip ISA FK — already represented as a generalization
            if (col.roles?.primaryKey && isaMap.get(table.id) === fk.refTableId) continue;

            // Deduplicate: one relationship per (source, ref) pair
            const alreadyExists = relationships.some(
                (r) =>
                    r.ends.length === 2 &&
                    r.ends.some((e) => e.entityId === table.id) &&
                    r.ends.some((e) => e.entityId === fk.refTableId),
            );
            if (alreadyExists) continue;

            const refTable = tables.find((t) => t.id === fk.refTableId);
            const relName = `${table.name}_${refTable?.name ?? fk.refTableId}`;

            relationships.push({
                id: generateCid(),
                name: relName,
                type: "association" as const,
                ends: [
                    { entityId: table.id,      cardinality: "N", optional: true },
                    { entityId: fk.refTableId,  cardinality: "1", optional: false },
                ],
            });
        }
    }

    return {
        model: {
            id: opts.newModelId ?? generateCid(),
            name: modelName,
            version: 1,
            notes: logicalModel.model.notes,
        },
        entities,
        relationships,
        generalizations,
        // Categories (union types) cannot be inferred from the logical model —
        // there is no representation of union/category entities in a relational schema.
        categories: [],
        // Top-level constraints array (separate from generalization constraints) —
        // not recoverable; disjointness/completeness are set per-generalization above.
        constraints: [],
    };
};

// ── Conceptual → Logical ──────────────────────────────────────────────────────

export interface ConvertConceptualToLogicalOptions {
    newModelId?: string;
    newModelName?: string;
}

/**
 * Converts a `ConceptualModelPayload` into a `LogicalModelPayload`.
 *
 * Mapping rules:
 *  Entities → Tables (ids preserved).
 *  Attributes:
 *   - isKey → PK column (nullable: false, unique: true).
 *   - composite with components → flattened into one column per leaf component.
 *   - derived → skipped (not stored in relational schema).
 *   - all others → regular column.
 *   - entity with no key attribute → auto-prepend `id` PK column.
 *
 *  Generalizations (ISA / class table inheritance):
 *   - Child entity's existing PK column gets an additional FK → parent PK; or
 *     a new PK+FK column is prepended if the child has no PK of its own.
 *
 *  Relationships:
 *   - N:1 / 1:N  → FK column on the N side.
 *   - 1:1        → FK column on the optional side (first end used as tiebreaker).
 *   - N:M        → junction table with two composite PK+FK columns.
 *   - N-ary (3+) → junction table with one PK+FK column per participant.
 *   - Relationship attributes → columns on the FK table (1:N/1:1) or
 *     junction table (N:M / N-ary).
 *
 *  Not representable:
 *   - Categories (union/category types) → plain tables with no FK.
 */
export const convertConceptualToLogical = (
    conceptualModel: ConceptualModelPayload,
    opts: ConvertConceptualToLogicalOptions = {},
): LogicalModelPayload => {
    const derivedName = conceptualModel.model.name
        .replace(/conceptual/gi, "Logical")
        .replace(/Conceptual/g, "Logical");
    const modelName =
        opts.newModelName ??
        (derivedName !== conceptualModel.model.name
            ? derivedName
            : `${conceptualModel.model.name} (Logical)`);

    const entities = conceptualModel.entities ?? [];
    const relationships = conceptualModel.relationships ?? [];
    const generalizations = conceptualModel.generalizations ?? [];

    // ── Mutable helpers ──────────────────────────────────────────────────────
    type MutCol = {
        id: string;
        name: string;
        nullable: boolean;
        unique: boolean;
        roles?: {
            primaryKey?: boolean;
            foreignKey?: { refTableId: string; refColumnId: string };
            candidateKey?: boolean;
        };
        notes?: string;
    };
    type MutTable = { id: string; name: string; columns: MutCol[]; notes?: string };
    const tableMap = new Map<string, MutTable>();

    // ── Step 1: Entities → Tables with attribute columns ─────────────────────
    for (const entity of entities) {
        const columns: MutCol[] = [];

        for (const attr of entity.attributes ?? []) {
            if (attr.kind === "derived") continue;

            if (attr.kind === "composite" && attr.components && attr.components.length > 0) {
                for (const comp of attr.components) {
                    columns.push({ id: generateLid(), name: comp.name, nullable: true, unique: false });
                }
            } else {
                columns.push({
                    id: generateLid(),
                    name: attr.name,
                    nullable: attr.isKey ? false : true,
                    unique: attr.isKey ? true : false,
                    roles: attr.isKey ? { primaryKey: true } : undefined,
                    notes: (attr as { notes?: string }).notes,
                });
            }
        }

        // Auto-add id PK if the entity has no key attribute
        if (!columns.some((c) => c.roles?.primaryKey)) {
            columns.unshift({
                id: generateLid(),
                name: "id",
                nullable: false,
                unique: true,
                roles: { primaryKey: true },
            });
        }

        tableMap.set(entity.id, { id: entity.id, name: entity.name, columns, notes: entity.notes });
    }

    // ── Step 2: Generalizations → class table inheritance ────────────────────
    const getPKCol = (tableId: string): MutCol | undefined =>
        tableMap.get(tableId)?.columns.find((c) => c.roles?.primaryKey);

    for (const gen of generalizations) {
        const parentPK = getPKCol(gen.parentEntityId);
        const parentTable = tableMap.get(gen.parentEntityId);
        if (!parentPK || !parentTable) continue;

        for (const childId of gen.childEntityIds) {
            const childTable = tableMap.get(childId);
            if (!childTable) continue;

            const existingPK = childTable.columns.find((c) => c.roles?.primaryKey);
            if (existingPK) {
                // Augment existing PK: also make it a FK → parent PK
                existingPK.roles = {
                    ...existingPK.roles,
                    primaryKey: true,
                    foreignKey: { refTableId: gen.parentEntityId, refColumnId: parentPK.id },
                };
                existingPK.name = parentPK.name; // align name with parent's PK
            } else {
                // Prepend new PK+FK column
                childTable.columns.unshift({
                    id: generateLid(),
                    name: `${parentTable.name}_id`,
                    nullable: false,
                    unique: true,
                    roles: {
                        primaryKey: true,
                        foreignKey: { refTableId: gen.parentEntityId, refColumnId: parentPK.id },
                    },
                });
            }
        }
    }

    // ── Step 3: Relationships → FK columns / junction tables ─────────────────
    const getPKColId = (tableId: string): string | undefined => getPKCol(tableId)?.id;

    for (const rel of relationships) {
        const ends = (rel.ends ?? []).filter((e) => tableMap.has(e.entityId));
        if (ends.length < 2) continue;

        const relAttributes = rel.attributes ?? [];

        // N-ary (3+) → junction table
        if (ends.length > 2) {
            const junctionId = `tbl_${rel.id}`;
            const junctionName = rel.name || ends.map((e) => tableMap.get(e.entityId)!.name).join("_");
            const cols: MutCol[] = [];
            for (const end of ends) {
                const pkId = getPKColId(end.entityId);
                if (!pkId) continue;
                cols.push({
                    id: generateLid(),
                    name: `${tableMap.get(end.entityId)!.name}_id`,
                    nullable: false,
                    unique: false,
                    roles: { primaryKey: true, foreignKey: { refTableId: end.entityId, refColumnId: pkId } },
                });
            }
            for (const rAttr of relAttributes) {
                cols.push({ id: generateLid(), name: rAttr.name, nullable: true, unique: false });
            }
            if (cols.length > 0) tableMap.set(junctionId, { id: junctionId, name: junctionName, columns: cols });
            continue;
        }

        // Binary relationship
        const [endA, endB] = ends;
        const isAMany = endA.cardinality === "N" || endA.cardinality === "M";
        const isBMany = endB.cardinality === "N" || endB.cardinality === "M";

        if (isAMany && isBMany) {
            // N:M → junction table
            const pkA = getPKColId(endA.entityId);
            const pkB = getPKColId(endB.entityId);
            if (!pkA || !pkB) continue;
            const tableA = tableMap.get(endA.entityId)!;
            const tableB = tableMap.get(endB.entityId)!;
            const junctionId = `tbl_${rel.id}`;
            const junctionName = rel.name || `${tableA.name}_${tableB.name}`;
            const cols: MutCol[] = [
                {
                    id: generateLid(), name: `${tableA.name}_id`, nullable: false, unique: false,
                    roles: { primaryKey: true, foreignKey: { refTableId: endA.entityId, refColumnId: pkA } },
                },
                {
                    id: generateLid(), name: `${tableB.name}_id`, nullable: false, unique: false,
                    roles: { primaryKey: true, foreignKey: { refTableId: endB.entityId, refColumnId: pkB } },
                },
            ];
            for (const rAttr of relAttributes) {
                cols.push({ id: generateLid(), name: rAttr.name, nullable: true, unique: false });
            }
            tableMap.set(junctionId, { id: junctionId, name: junctionName, columns: cols });
        } else {
            // 1:N, N:1, or 1:1 → FK on the N-side (or optional side for 1:1)
            let fkEnd: (typeof ends)[number];
            let refEnd: (typeof ends)[number];

            if (isAMany && !isBMany) {
                fkEnd = endA; refEnd = endB;
            } else if (!isAMany && isBMany) {
                fkEnd = endB; refEnd = endA;
            } else {
                // 1:1 — prefer the optional side; fall back to endA
                fkEnd = (endA.optional !== false) ? endA : (endB.optional !== false ? endB : endA);
                refEnd = fkEnd === endA ? endB : endA;
            }

            const pkRef = getPKColId(refEnd.entityId);
            const refTable = tableMap.get(refEnd.entityId);
            const fkTable = tableMap.get(fkEnd.entityId);
            if (!pkRef || !refTable || !fkTable) continue;

            // Self-referential: use "parent_" prefix to avoid name collision
            const colName =
                endA.entityId === endB.entityId
                    ? `parent_${refTable.name}_id`
                    : `${refTable.name}_id`;

            fkTable.columns.push({
                id: generateLid(),
                name: colName,
                nullable: fkEnd.optional !== false,
                unique: !isAMany && !isBMany, // 1:1 → unique
                roles: { foreignKey: { refTableId: refEnd.entityId, refColumnId: pkRef } },
            });
            for (const rAttr of relAttributes) {
                fkTable.columns.push({ id: generateLid(), name: rAttr.name, nullable: true, unique: false });
            }
        }
    }

    return {
        model: {
            id: opts.newModelId ?? generateLid(),
            name: modelName,
            version: 1,
            notes: conceptualModel.model.notes,
        },
        tables: Array.from(tableMap.values()),
    };
};

// ── Physical → Conceptual ─────────────────────────────────────────────────────

export interface ConvertPhysicalToConceptualOptions {
    newModelId?: string;
    newModelName?: string;
}

/**
 * Converts a `PhysicalModelPayload` into a `ConceptualModelPayload`.
 *
 * Implemented as a two-step chain:
 *   Physical → Logical (strip implementation details)
 *   Logical  → Conceptual (detect ISA, map FK → Relationship)
 *
 * See `convertPhysicalToLogical` and `convertLogicalToConceptual` for full rules.
 */
export const convertPhysicalToConceptual = (
    physicalModel: PhysicalModelPayload,
    opts: ConvertPhysicalToConceptualOptions = {},
): ConceptualModelPayload => {
    const derivedName = physicalModel.model.name
        .replace(/physical/gi, "Conceptual")
        .replace(/Physical/g, "Conceptual");
    const modelName =
        opts.newModelName ??
        (derivedName !== physicalModel.model.name
            ? derivedName
            : `${physicalModel.model.name} (Conceptual)`);

    const logicalModel = convertPhysicalToLogical(physicalModel);
    return convertLogicalToConceptual(logicalModel, {
        newModelId: opts.newModelId,
        newModelName: modelName,
    });
};

// ── Conceptual → Physical ─────────────────────────────────────────────────────

export interface ConvertConceptualToPhysicalOptions {
    newModelId?: string;
    newModelName?: string;
}

/**
 * Converts a `ConceptualModelPayload` into a `PhysicalModelPayload`.
 *
 * Implemented as a two-step chain:
 *   Conceptual → Logical (map Entity/Relationship/Generalization → tables + FKs)
 *   Logical    → Physical (infer data types, add indexes)
 *
 * See `convertConceptualToLogical` and `convertLogicalToPhysical` for full rules.
 */
export const convertConceptualToPhysical = (
    conceptualModel: ConceptualModelPayload,
    opts: ConvertConceptualToPhysicalOptions = {},
): PhysicalModelPayload => {
    const derivedName = conceptualModel.model.name
        .replace(/conceptual/gi, "Physical")
        .replace(/Conceptual/g, "Physical");
    const modelName =
        opts.newModelName ??
        (derivedName !== conceptualModel.model.name
            ? derivedName
            : `${conceptualModel.model.name} (Physical)`);

    const logicalModel = convertConceptualToLogical(conceptualModel);
    return convertLogicalToPhysical(logicalModel, {
        newModelId: opts.newModelId,
        newModelName: modelName,
    });
};
