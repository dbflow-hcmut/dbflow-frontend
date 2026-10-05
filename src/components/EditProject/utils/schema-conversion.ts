/**
 * Schema-level conversion utilities.
 *
 * Provides deterministic, AI-free transformations between schema levels:
 *   - Logical     -> Physical   (+ DBMS-aware type inference)
 *   - Physical    -> Logical
 *   - Logical     -> Conceptual (junction table, multi-valued attr, weak entity, ISA detection)
 *   - Conceptual  -> Logical
 *   - Physical    -> Conceptual (chain: P -> L -> C)
 *   - Conceptual  -> Physical   (chain: C -> L -> P, with optional DBMS)
 */

import type { LogicalModelPayload } from "./logical-model.builder";
import type { PhysicalModelPayload } from "./physical-model.builder";
import type { ConceptualModelPayload } from "./conceptual-model.builder";
import type { DBMSType } from "./dbms-config";

/** Something the user should know about after a conversion: data that was dropped (warning) or a rule applied automatically (info). */
export type ConversionNotice = {
    level: "warning" | "info";
    message: string;
};

// ── ID generators ───────────────────────────────────────────────────────────────

const generatePid = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `pid_${crypto.randomUUID()}`;
    }
    return `pid_${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

const generateLid = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `lid_${crypto.randomUUID()}`;
    }
    return `lid_${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

const generateCid = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `cid_${crypto.randomUUID()}`;
    }
    return `cid_${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

// ── ID prefix remapping ─────────────────────────────────────────────────────────

/**
 * Stable sort that groups all PK columns (the composite key) at the top of a
 * table while keeping the relative order of the remaining columns.
 */
const pkColumnsFirst = <C extends { roles?: { primaryKey?: boolean } }>(columns: C[]): C[] => [
    ...columns.filter((c) => c.roles?.primaryKey),
    ...columns.filter((c) => !c.roles?.primaryKey),
];

/** Map a logical column-id (lid_...) to a physical column-id (pid_...). */
const remapColId = (id: string): string => id.replace(/^lid_/, "pid_");

/** Map a physical column-id (pid_...) to a logical column-id (lid_...). */
const remapColIdToLogical = (id: string): string => id.replace(/^pid_/, "lid_");

// ── DBMS-aware physical type inference ──────────────────────────────────────────

/**
 * DBMS-specific base type mappings.
 * Keys are generic canonical types; values are DBMS-native equivalents.
 */
const DBMS_TYPE_MAP: Record<string, Record<string, string>> = {
    mysql:      { int: "int",     boolean: "tinyint",  datetime: "datetime",  text: "text",     varchar: "varchar", decimal: "decimal" },
    postgresql: { int: "integer", boolean: "boolean",  datetime: "timestamp", text: "text",     varchar: "varchar", decimal: "numeric" },
    sqlserver:  { int: "int",     boolean: "bit",      datetime: "datetime2", text: "nvarchar", varchar: "nvarchar", decimal: "decimal" },
};

/**
 * Infer a physical data-type (and optional default length) from a logical
 * column's role and name heuristics, optionally mapped to a target DBMS.
 *
 * Rules (applied in order):
 *  1. PK or FK                      -> int
 *  2. Name matches date/time        -> datetime
 *  3. Name matches monetary         -> decimal(10,2)
 *  4. Name matches numeric          -> int
 *  5. Name matches boolean          -> boolean
 *  6. Name matches large-text       -> text
 *  7. Name matches email / address  -> varchar(255)
 *  8. Name matches short-string     -> varchar(100)
 *  9. Default fallback              -> varchar(255)
 */
const inferPhysicalDataType = (
    col: { name: string; roles?: { primaryKey?: boolean; foreignKey?: unknown } },
    dbms?: DBMSType,
): { dataType: string; length?: string } => {
    const map = dbms ? (DBMS_TYPE_MAP[dbms] ?? {}) : {};
    const resolve = (generic: string, length?: string) => ({
        dataType: map[generic] ?? generic,
        length,
    });

    // 1. Key columns -> integer type
    if (col.roles?.primaryKey || col.roles?.foreignKey) return resolve("int");

    const n = col.name.toLowerCase();

    // 2. Date/time patterns
    if (
        n.endsWith("_at") || n.endsWith("_date") || n.endsWith("_time") ||
        n.includes("date") || n.includes("time") ||
        n === "created" || n === "updated" ||
        n === "born" || n === "dob" || n === "birthday"
    ) {
        return resolve("datetime");
    }

    // 3. Monetary / precision decimal patterns
    if (
        n.includes("price") || n.includes("cost") || n.includes("amount") ||
        n.includes("salary") || n.includes("total") || n.includes("balance") ||
        n.includes("fee") || n.includes("tax") || n.includes("rate") ||
        n.includes("discount") || n.includes("revenue") || n.includes("budget")
    ) {
        return resolve("decimal", "10,2");
    }

    // 4. General numeric (integer)
    if (
        n.includes("count") || n.includes("_num") || n.startsWith("num_") ||
        n.includes("qty") || n.includes("quantity") ||
        n.includes("score") || n.includes("rank") ||
        n.includes("age") || n.includes("year") || n.includes("level") ||
        n.includes("priority") || n.includes("weight") ||
        n.includes("height") || n.includes("width") ||
        n.includes("duration") || n.includes("attempts") || n.includes("limit")
    ) {
        return resolve("int");
    }

    // 5. Boolean patterns
    if (
        n.startsWith("is_") || n.startsWith("has_") || n.startsWith("can_") ||
        n.startsWith("should_") || n.startsWith("allow_") ||
        n === "active" || n === "enabled" || n === "deleted" ||
        n === "verified" || n === "published" || n === "visible" ||
        n === "approved" || n === "locked" || n === "archived" ||
        n === "confirmed" || n === "featured"
    ) {
        return resolve("boolean");
    }

    // 6. Large text patterns
    if (
        n.includes("description") || n.includes("content") || n.includes("body") ||
        n.includes("notes") || n.includes("comment") || n.includes("bio") ||
        n.includes("message") || n.includes("summary") || n.includes("text") ||
        n.includes("html") || n.includes("markdown") ||
        n.includes("metadata") || n.includes("payload")
    ) {
        return resolve("text");
    }

    // 7. Email / address -> varchar(255)
    if (
        n.includes("email") || n.includes("address") ||
        n.includes("street") || n.includes("url") || n.includes("path")
    ) {
        return resolve("varchar", "255");
    }

    // 8. Short string fields -> varchar(100)
    if (
        n.includes("name") || n === "title" || n.includes("label") ||
        n.includes("code") || n.includes("slug") || n.includes("sku") ||
        n.includes("status") || n.includes("type") || n.includes("category") ||
        n.includes("role") || n.includes("gender") || n.includes("country") ||
        n.includes("city") || n.includes("state") || n.includes("zip") ||
        n.includes("phone") || n.includes("fax") ||
        n.includes("color") || n.includes("currency") || n.includes("locale") ||
        n.includes("language") || n.includes("timezone") || n.includes("extension")
    ) {
        return resolve("varchar", "100");
    }

    // 9. Default fallback
    return resolve("varchar", "255");
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGICAL -> PHYSICAL
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConvertLogicalToPhysicalOptions {
    /** Override the generated model.id (defaults to a new pid). */
    newModelId?: string;
    /** Override the model name (defaults to replacing "Logical" -> "Physical"). */
    newModelName?: string;
    /** Target DBMS -- enables DBMS-specific type mapping and auto-increment. */
    dbms?: DBMSType;
}

/**
 * Converts a `LogicalModelPayload` into a `PhysicalModelPayload`.
 *
 * Mapping rules:
 *  - Table IDs are preserved so FK references remain consistent.
 *  - Column IDs are remapped from `lid_` prefix to `pid_` prefix.
 *  - FK `refColumnId` is remapped accordingly.
 *  - FK `onDelete` / `onUpdate` default to `"NO ACTION"` (SQL standard).
 *  - A `dataType` (+ optional `length`) is inferred for every column from its
 *    role and name; when `dbms` is provided, types are DBMS-native.
 *  - Single-column integer PKs (that are not FK) get `autoIncrement: true`.
 *  - `nullable` and `unique` are carried over unchanged.
 *  - Column `notes` are preserved.
 *  - Indexes are initialised as empty (no indexes in logical model).
 *  - `showFunctionalDependencies` flag and functional dependencies are carried over.
 */
export const convertLogicalToPhysical = (
    logicalModel: LogicalModelPayload,
    opts: ConvertLogicalToPhysicalOptions = {},
): PhysicalModelPayload => {
    const derivedName = logicalModel.model.name
        .replace(/logical/gi, "Physical")
        .replace(/Logical/g, "Physical");
    const modelName =
        opts.newModelName ??
        (derivedName !== logicalModel.model.name
            ? derivedName
            : `${logicalModel.model.name} (Physical)`);

    const dbms = opts.dbms;

    return {
        model: {
            id: opts.newModelId ?? generatePid(),
            name: modelName,
            version: 1,
            ...(dbms ? { dbms } : {}),
            notes: logicalModel.model.notes,
        },
        tables: (logicalModel.tables ?? []).map((table) => {
            // Detect single-column non-FK PK -> candidate for auto-increment
            const pkCols = (table.columns ?? []).filter((c) => c.roles?.primaryKey);
            const singleNonFKPK =
                pkCols.length === 1 && !pkCols[0].roles?.foreignKey;

            return {
                id: table.id,
                name: table.name,
                notes: table.notes,
                columns: pkColumnsFirst(table.columns ?? []).map((col) => {
                    const { dataType, length } = inferPhysicalDataType(col, dbms);
                    const isPK = !!col.roles?.primaryKey;
                    // Auto-increment: single-column integer PK that is NOT also a FK
                    const isAutoIncrement =
                        singleNonFKPK &&
                        isPK &&
                        ["int", "integer", "bigint", "smallint"].includes(dataType);

                    return {
                        id: remapColId(col.id),
                        name: col.name,
                        dataType,
                        length,
                        nullable: isPK ? false : (col.nullable ?? true),
                        unique: col.unique ?? false,
                        autoIncrement: isAutoIncrement,
                        roles: col.roles
                            ? {
                                  primaryKey: col.roles.primaryKey,
                                  candidateKey: col.roles.candidateKey,
                                  foreignKey: col.roles.foreignKey
                                      ? {
                                            refTableId: col.roles.foreignKey.refTableId,
                                            refColumnId: remapColId(
                                                col.roles.foreignKey.refColumnId,
                                            ),
                                            onDelete: "NO ACTION" as const,
                                            onUpdate: "NO ACTION" as const,
                                        }
                                      : undefined,
                              }
                            : undefined,
                        notes: col.notes,
                    };
                }),
                indexes: [],
                showFunctionalDependencies: table.showFunctionalDependencies,
                functionalDependencies: (table.functionalDependencies ?? []).map(fd => ({
                    ...fd,
                    left: fd.left.map(remapColId),
                    right: fd.right.map(remapColId),
                })),
            };
        }),
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PHYSICAL -> LOGICAL
// ═══════════════════════════════════════════════════════════════════════════════

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
 *  - FK `onDelete` / `onUpdate` are dropped (logical layer is action-agnostic).
 *  - Physical-only fields (`dataType`, `length`, `autoIncrement`, `defaultValue`,
 *    `indexes`, `dbms`) are dropped; the logical layer is implementation-agnostic.
 *  - `nullable`, `unique`, and `roles` (PK, FK, candidateKey) are kept.
 *  - `comment` fields are merged into `notes` (comment takes priority).
 *  - `showFunctionalDependencies` flag and functional dependencies are carried over.
 */
export const convertPhysicalToLogicalWithNotices = (
    physicalModel: PhysicalModelPayload,
    opts: ConvertPhysicalToLogicalOptions = {},
): { model: LogicalModelPayload; notices: ConversionNotice[] } => {
    const notices: ConversionNotice[] = [];
    const warn = (message: string) => notices.push({ level: "warning", message });
    const physicalTables = physicalModel.tables ?? [];

    // Physical-only data that the logical layer cannot hold
    const indexed = physicalTables.filter((t) => (t.indexes?.length ?? 0) > 0).map((t) => t.name);
    if (indexed.length > 0) warn(`Indexes not kept — ${indexed.join(", ")}.`);
    const defaults = physicalTables.flatMap((t) =>
        (t.columns ?? []).filter((c) => c.defaultValue).map((c) => `${t.name}.${c.name}`),
    );
    if (defaults.length > 0) warn(`Default values not kept — ${defaults.join(", ")}.`);
    const fkActions = physicalTables.flatMap((t) =>
        (t.columns ?? [])
            .filter((c) => {
                const fk = c.roles?.foreignKey;
                return fk && ((fk.onDelete && fk.onDelete !== "NO ACTION") || (fk.onUpdate && fk.onUpdate !== "NO ACTION"));
            })
            .map((c) => `${t.name}.${c.name}`),
    );
    if (fkActions.length > 0) warn(`Foreign key ON DELETE / ON UPDATE actions not kept — ${fkActions.join(", ")}.`);
    // comment takes priority over notes, so a different note is overwritten
    const overwrittenNotes = physicalTables.flatMap((t) => [
        ...(t.comment && t.notes && t.comment !== t.notes ? [t.name] : []),
        ...(t.columns ?? [])
            .filter((c) => c.comment && c.notes && c.comment !== c.notes)
            .map((c) => `${t.name}.${c.name}`),
    ]);
    if (overwrittenNotes.length > 0) warn(`Notes replaced by the comment — ${overwrittenNotes.join(", ")}.`);

    const derivedName = physicalModel.model.name
        .replace(/physical/gi, "Logical")
        .replace(/Physical/g, "Logical");
    const modelName =
        opts.newModelName ??
        (derivedName !== physicalModel.model.name
            ? derivedName
            : `${physicalModel.model.name} (Logical)`);

    const logicalModel: LogicalModelPayload = {
        model: {
            id: opts.newModelId ?? generateLid(),
            name: modelName,
            version: 1,
            notes: physicalModel.model.notes,
        },
        tables: (physicalModel.tables ?? []).map((table) => ({
            id: table.id,
            name: table.name,
            notes: table.comment || table.notes,
            columns: pkColumnsFirst(table.columns ?? []).map((col) => ({
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
                                    refColumnId: remapColIdToLogical(
                                        col.roles.foreignKey.refColumnId,
                                    ),
                                }
                              : undefined,
                      }
                    : undefined,
                notes: col.comment || col.notes,
            })),
            showFunctionalDependencies: table.showFunctionalDependencies,
            functionalDependencies: (table.functionalDependencies ?? []).map(fd => ({
                ...fd,
                left: fd.left.map(remapColIdToLogical),
                right: fd.right.map(remapColIdToLogical),
            })),
        })),
    };
    return { model: logicalModel, notices };
};

/** Same conversion without the notices; see `convertPhysicalToLogicalWithNotices`. */
export const convertPhysicalToLogical = (
    physicalModel: PhysicalModelPayload,
    opts: ConvertPhysicalToLogicalOptions = {},
): LogicalModelPayload => convertPhysicalToLogicalWithNotices(physicalModel, opts).model;

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGICAL -> CONCEPTUAL   (major reverse-engineering logic)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConvertLogicalToConceptualOptions {
    newModelId?: string;
    newModelName?: string;
}

// ── Table classification (internal) ─────────────────────────────────────────

/**
 * Classification kinds for logical tables during reverse-engineering
 * to the conceptual level.
 */
type TableKind =
    /** Regular strong entity. */
    | "REGULAR"
    /** Single-col PK that is also FK -> IS-A child (class table inheritance). */
    | "ISA_CHILD"
    /** All PK cols (>= 2) are FK -> N:M or N-ary junction table. */
    | "JUNCTION"
    /** Exactly 2 cols: both PK, one FK -> multi-valued attribute on parent. */
    | "MULTI_VALUED"
    /** Composite PK with partial FK + extra non-PK cols -> weak entity. */
    | "WEAK";

type LogicalTable = NonNullable<LogicalModelPayload["tables"]>[number];
type LogicalColumn = LogicalTable["columns"][number];

type TableClassification = {
    kind: TableKind;
    table: LogicalTable;
    /** ISA_CHILD: parent table ID. */
    isaParentId?: string;
    /** MULTI_VALUED: parent table ID. */
    mvParentId?: string;
    /** MULTI_VALUED: the value column (PK non-FK). */
    mvValueCol?: LogicalColumn;
    /** WEAK: owner table IDs (from the FK PK columns; more than one when several owners identify the entity). */
    weakOwnerIds?: string[];
    /** JUNCTION: referenced table IDs (one per FK PK column). */
    junctionRefTableIds?: string[];
};

/**
 * Group FK columns into foreign keys. Columns pointing to DIFFERENT columns of the same table form one composite FK;
 * a column pointing to a column that is already in a group of that table starts a new FK (e.g. placed_by and
 * billed_to, both -> customer.id). Returns the groups per referenced table, in column order.
 */
const groupForeignKeys = <C extends LogicalTable["columns"][number]>(cols: C[]): Map<string, C[][]> => {
    const byRefTable = new Map<string, C[][]>();
    for (const col of cols) {
        const fk = col.roles?.foreignKey;
        if (!fk) continue;
        const groups = byRefTable.get(fk.refTableId) ?? [];
        const group = groups.find((g) => !g.some((c) => c.roles?.foreignKey?.refColumnId === fk.refColumnId));
        if (group) group.push(col);
        else groups.push([col]);
        byRefTable.set(fk.refTableId, groups);
    }
    return byRefTable;
};

/**
 * Classify each logical table to determine its conceptual mapping.
 *
 * Classification priority (first match wins):
 *  1. ISA_CHILD: the whole PK is one FK (single or composite) to another table.
 *  2. JUNCTION:  >= 2 PK cols, ALL are FK to existing tables.
 *  3. MULTI_VALUED: all cols are PK: one value col + one FK (single or composite) to the owner;
 *                being referenced by another table makes it a weak entity instead.
 *  4. WEAK:      composite PK (>= 2), partial FK among PKs, has non-PK cols.
 *  5. REGULAR:   everything else -> strong entity.
 */
export const classifyTables = (tables: LogicalTable[]): TableClassification[] => {
    const tableIdSet = new Set(tables.map((t) => t.id));
    // tables that some OTHER table has a FK to
    const referencedByOthers = new Set<string>();
    for (const t of tables) {
        for (const c of t.columns ?? []) {
            const refId = c.roles?.foreignKey?.refTableId;
            if (refId && refId !== t.id) referencedByOthers.add(refId);
        }
    }

    return tables.map((table): TableClassification => {
        const cols = table.columns ?? [];
        const pkCols = cols.filter((c) => c.roles?.primaryKey);
        const pkFkCols = pkCols.filter((c) => c.roles?.foreignKey);
        const pkNonFkCols = pkCols.filter((c) => !c.roles?.foreignKey);
        const nonPkCols = cols.filter((c) => !c.roles?.primaryKey);

        // ── 1. ISA: the whole PK is ONE FK (single column or composite) to another table ──
        if (pkCols.length >= 1 && pkFkCols.length === pkCols.length) {
            const pkFkGroups = Array.from(groupForeignKeys(pkFkCols));
            if (pkFkGroups.length === 1 && pkFkGroups[0][1].length === 1 && tableIdSet.has(pkFkGroups[0][0])) {
                return {
                    kind: "ISA_CHILD",
                    table,
                    isaParentId: pkFkGroups[0][0],
                };
            }
        }

        // ── 2. Junction: all PK cols (>= 2) are FK ──────────────────
        if (pkCols.length >= 2 && pkFkCols.length === pkCols.length) {
            // one end per FK: the columns of a composite FK count once
            const refIds = Array.from(groupForeignKeys(pkFkCols))
                .filter(([refTableId]) => tableIdSet.has(refTableId))
                .flatMap(([refTableId, groups]) => groups.map(() => refTableId));
            if (refIds.length >= 2) {
                return {
                    kind: "JUNCTION",
                    table,
                    junctionRefTableIds: refIds,
                };
            }
        }

        // ── 3. Multi-valued: every column is PK, one value column + one FK (single or composite) to the owner ──
        if (cols.length === pkCols.length && pkNonFkCols.length === 1 && pkFkCols.length >= 1) {
            const fkGroups = Array.from(groupForeignKeys(pkFkCols));
            const ownerId = fkGroups.length === 1 && fkGroups[0][1].length === 1 ? fkGroups[0][0] : undefined;
            if (ownerId && tableIdSet.has(ownerId)) {
                // A multi-valued attribute cannot be referenced by another table, so a referenced table is a weak entity
                if (referencedByOthers.has(table.id)) {
                    return { kind: "WEAK", table, weakOwnerIds: [ownerId] };
                }
                return {
                    kind: "MULTI_VALUED",
                    table,
                    mvParentId: ownerId,
                    mvValueCol: pkNonFkCols[0],
                };
            }
        }

        // ── 4. Weak entity: composite PK, partial FK, has extras ────
        if (
            pkCols.length >= 2 &&
            pkFkCols.length >= 1 &&
            pkFkCols.length < pkCols.length &&
            nonPkCols.length > 0
        ) {
            const ownerIds = Array.from(groupForeignKeys(pkFkCols).keys()).filter((id) => tableIdSet.has(id));
            if (ownerIds.length > 0) {
                return {
                    kind: "WEAK",
                    table,
                    weakOwnerIds: ownerIds,
                };
            }
        }

        // ── 5. Regular strong entity ─────────────────────────────────
        return { kind: "REGULAR", table };
    });
};

/**
 * Converts a `LogicalModelPayload` into a `ConceptualModelPayload`.
 *
 * Mapping rules:
 *
 *  Table classification (reverse-engineering heuristics):
 *   - REGULAR:      Strong entity with simple attributes.
 *   - ISA_CHILD:    PK-is-FK pattern -> generalization (child IS-A parent).
 *   - JUNCTION:     All-PK-are-FK pattern -> N:M or N-ary relationship,
 *                   with non-PK columns as relationship attributes.
 *   - MULTI_VALUED: 2-col all-PK (one FK) pattern -> multi_valued attribute
 *                   added to the parent entity.
 *   - WEAK:         Composite PK with partial FK + extra cols -> weak entity
 *                   with an identifying relationship to the owner.
 *
 *  Entity mapping:
 *   - REGULAR / ISA_CHILD / WEAK tables -> entities.
 *   - PK cols -> key attributes (isKey: true).
 *   - FK-only cols -> NOT added as attributes; each FK generates an N:1
 *     relationship (deduplicated per entity pair).
 *   - Candidate key cols -> key attributes.
 *
 *  Generalization:
 *   - ISA children grouped by parent -> one Generalization per parent.
 *   - Defaults: disjoint / partial (conservative; user can adjust).
 *
 *  Not recoverable from logical model:
 *   - Categories (union types): no representation in relational schema.
 *   - Exact disjointness / completeness semantics.
 */
export const convertLogicalToConceptualWithNotices = (
    logicalModel: LogicalModelPayload,
    opts: ConvertLogicalToConceptualOptions = {},
): { model: ConceptualModelPayload; notices: ConversionNotice[] } => {
    const notices: ConversionNotice[] = [];
    const warn = (message: string) => notices.push({ level: "warning", message });

    const derivedName = logicalModel.model.name
        .replace(/logical/gi, "Conceptual")
        .replace(/Logical/g, "Conceptual");
    const modelName =
        opts.newModelName ??
        (derivedName !== logicalModel.model.name
            ? derivedName
            : `${logicalModel.model.name} (Conceptual)`);

    const tables = logicalModel.tables ?? [];
    const classifications = classifyTables(tables);
    const tableIdSet = new Set(tables.map((t) => t.id));

    // Quick lookup sets by classification
    const junctionTableIds = new Set<string>();
    const mvTableIds = new Set<string>();
    const isaChildIds = new Set<string>();
    for (const cls of classifications) {
        if (cls.kind === "JUNCTION") junctionTableIds.add(cls.table.id);
        if (cls.kind === "MULTI_VALUED") mvTableIds.add(cls.table.id);
        if (cls.kind === "ISA_CHILD") isaChildIds.add(cls.table.id);
    }

    // ── 1. Generalizations (ISA) ────────────────────────────────────────
    const generalizationMap = new Map<string, string[]>();
    for (const cls of classifications) {
        if (cls.kind === "ISA_CHILD" && cls.isaParentId) {
            const children = generalizationMap.get(cls.isaParentId) ?? [];
            children.push(cls.table.id);
            generalizationMap.set(cls.isaParentId, children);
        }
    }

    const generalizations: NonNullable<ConceptualModelPayload["generalizations"]> = [];
    for (const [parentEntityId, childEntityIds] of generalizationMap.entries()) {
        generalizations.push({
            id: generateCid(),
            parentEntityIds: [parentEntityId],
            childEntityIds,
            constraints: {
                disjointness: "disjoint",
                completeness: "partial",
            },
        });
    }

    // ── 2. Entities ─────────────────────────────────────────────────────
    type AttrPayload = NonNullable<
        ConceptualModelPayload["entities"][number]["attributes"]
    >[number];
    const entities: ConceptualModelPayload["entities"] = [];

    for (const cls of classifications) {
        // Junction tables and multi-valued tables do NOT become entities
        if (cls.kind === "JUNCTION" || cls.kind === "MULTI_VALUED") continue;

        const table = cls.table;
        const isWeak = cls.kind === "WEAK";
        const attributes: AttrPayload[] = [];

        for (const col of table.columns ?? []) {
            // FK-only columns become relationships, not attributes
            const isFKOnly =
                col.roles?.foreignKey &&
                !col.roles?.primaryKey &&
                !col.roles?.candidateKey;

            // ISA PK+FK column -> generalization, not attribute
            const isISA =
                cls.kind === "ISA_CHILD" &&
                col.roles?.primaryKey &&
                col.roles?.foreignKey &&
                cls.isaParentId === col.roles.foreignKey.refTableId;

            // Weak entity identifying FK PK column -> identifying rel, not attribute
            const isWeakOwnerFK =
                isWeak &&
                col.roles?.primaryKey &&
                col.roles?.foreignKey &&
                !!cls.weakOwnerIds?.includes(col.roles.foreignKey.refTableId);

            if (isFKOnly || isISA || isWeakOwnerFK) continue;

            attributes.push({
                id: generateCid(),
                name: col.name,
                kind: "simple" as const,
                isKey: !!(col.roles?.primaryKey || col.roles?.candidateKey),
            });
        }

        // Attach multi-valued attributes from child MV tables
        for (const mvCls of classifications) {
            if (mvCls.kind !== "MULTI_VALUED") continue;
            if (mvCls.mvParentId !== table.id) continue;
            if (mvCls.mvValueCol) {
                attributes.push({
                    id: generateCid(),
                    name: mvCls.mvValueCol.name,
                    kind: "multi_valued" as const,
                    isKey: false,
                });
            }
        }

        entities.push({
            id: table.id,
            name: table.name,
            kind: isWeak ? ("weak" as const) : ("strong" as const),
            attributes,
            notes: table.notes,
        });
    }

    // ── 3. Relationships ────────────────────────────────────────────────
    type RelPayload = ConceptualModelPayload["relationships"][number];
    const relationships: RelPayload[] = [];

    // Track emitted (entityA, entityB) pairs to deduplicate
    const emittedRelPairs = new Set<string>();
    const pairKey = (a: string, b: string): string =>
        [a, b].sort().join("↔"); // arrow separator to avoid collision

    // ── 3a. Junction tables -> N:M / N-ary relationships ─────────────
    for (const cls of classifications) {
        if (cls.kind !== "JUNCTION") continue;
        const refIds = cls.junctionRefTableIds ?? [];

        // Relationship attributes = non-PK columns in the junction table
        const nonPkCols = (cls.table.columns ?? []).filter(
            (c) => !c.roles?.primaryKey,
        );
        const ends: RelPayload["ends"] = refIds.map((refId) => ({
            entityId: refId,
            cardinality: "N",
            optional: true,
        }));

        // A FK outside the PK is determined by the PK participants -> one more participant with cardinality 1
        // (the relationship becomes n-ary); its columns are no longer relationship attributes.
        const consumedFkCols = new Set<string>();
        for (const [refTableId, groups] of groupForeignKeys(nonPkCols)) {
            if (!tableIdSet.has(refTableId) || junctionTableIds.has(refTableId) || mvTableIds.has(refTableId)) {
                for (const group of groups) {
                    for (const col of group) {
                        warn(`${cls.table.name}.${col.name}: foreign key references a table that is not an entity, so it was kept as an attribute of the relationship.`);
                    }
                }
                continue;
            }
            for (const group of groups) {
                ends.push({ entityId: refTableId, cardinality: "1", optional: group.every((c) => c.nullable !== false) });
                group.forEach((c) => consumedFkCols.add(c.id));
            }
        }

        const relAttrs: AttrPayload[] = nonPkCols
            .filter((col) => !consumedFkCols.has(col.id))
            .map((col) => ({
                id: generateCid(),
                name: col.name,
                kind: "simple" as const,
                isKey: false,
            }));

        relationships.push({
            id: generateCid(),
            name: cls.table.name,
            type: "association" as const,
            ...(ends.length > 2 ? { arity: ends.length } : {}),
            ends,
            ...(relAttrs.length > 0 ? { attributes: relAttrs } : {}),
        });

        // Mark all entity pairs as emitted
        for (let i = 0; i < refIds.length; i++) {
            for (let j = i + 1; j < refIds.length; j++) {
                emittedRelPairs.add(pairKey(refIds[i], refIds[j]));
            }
        }
    }

    // ── 3b. Weak entity -> one identifying relationship per owner ────
    for (const cls of classifications) {
        if (cls.kind !== "WEAK") continue;

        for (const ownerId of cls.weakOwnerIds ?? []) {
            const pk = pairKey(cls.table.id, ownerId);
            if (emittedRelPairs.has(pk)) {
                warn(`${cls.table.name}: identifying relationship was not created because a relationship between the same entities already exists.`);
                continue;
            }
            emittedRelPairs.add(pk);

            const ownerTable = tables.find((t) => t.id === ownerId);
            const relName = `${ownerTable?.name ?? "owner"}_${cls.table.name}`;

            relationships.push({
                id: generateCid(),
                name: relName,
                type: "identifying" as const,
                ends: [
                    // the owner can exist without weak entities; the weak entity always depends on its owner
                    { entityId: ownerId, cardinality: "1", optional: true },
                    { entityId: cls.table.id, cardinality: "N", optional: false },
                ],
            });
        }
    }

    // ── 3c. Regular FK columns -> N:1 association relationships ──────
    for (const cls of classifications) {
        // Only tables that became entities (not junction/MV)
        if (cls.kind === "JUNCTION" || cls.kind === "MULTI_VALUED") continue;

        const table = cls.table;

        // Group the FK columns of this table by referenced table. Columns that point to DIFFERENT columns of that table
        // form one composite FK (one relationship); a second column pointing to a column that is already in the group
        // is a separate FK (e.g. placed_by and billed_to, both -> customer.id) and gets its own relationship.
        const eligibleFkCols: (typeof table.columns)[number][] = [];
        for (const col of table.columns ?? []) {
            if (!col.roles?.foreignKey) continue;
            const fk = col.roles.foreignKey;
            if (!tableIdSet.has(fk.refTableId)) {
                warn(`${table.name}.${col.name}: foreign key references a table that does not exist, so no relationship was created.`);
                continue;
            }

            // Skip if the referenced table is a junction/MV (not an entity)
            if (junctionTableIds.has(fk.refTableId) || mvTableIds.has(fk.refTableId)) {
                warn(`${table.name}.${col.name}: foreign key references a table that became a relationship/attribute, so no relationship was created.`);
                continue;
            }

            // Skip ISA FK (already represented as generalization)
            if (
                cls.kind === "ISA_CHILD" &&
                col.roles?.primaryKey &&
                cls.isaParentId === fk.refTableId
            )
                continue;

            // Skip weak entity owner FK (already handled above)
            if (
                cls.kind === "WEAK" &&
                col.roles?.primaryKey &&
                cls.weakOwnerIds?.includes(fk.refTableId)
            )
                continue;

            eligibleFkCols.push(col);
        }
        const fkGroups = groupForeignKeys(eligibleFkCols);

        for (const [refTableId, groups] of fkGroups) {
            const refTable = tables.find((t) => t.id === refTableId);

            groups.forEach((group) => {
                const baseName = `${table.name}_${refTable?.name ?? refTableId}`;
                // several FKs between the same tables, or a junction / identifying relationship already named like this
                const needsSuffix = groups.length > 1 || relationships.some((x) => x.name === baseName);
                const relName = needsSuffix ? `${baseName}_${group.map((c) => c.name).join("_")}` : baseName;

                // A single-column FK that is also a candidate key / unique can hold each referenced value at most once -> 1-1.
                // A column that is just one part of a composite FK does not make the relationship 1-1.
                const fkEndCardinality = group.length === 1 && (group[0].unique || group[0].roles?.candidateKey) ? "1" : "N";

                relationships.push({
                    id: generateCid(),
                    name: relName,
                    type: "association" as const,
                    ends: [
                        {
                            entityId: table.id,
                            cardinality: fkEndCardinality,
                            // a key column can never be NULL -> mandatory; otherwise follow the column's nullability
                            // (the logical diagram stores no nullability, so only PK membership is known there)
                            optional: group.every((c) => (c.roles?.primaryKey ? false : c.nullable !== false)),
                        },
                        {
                            entityId: refTableId,
                            cardinality: "1",
                            // a FK does not force the referenced entity to have referencing rows
                            optional: true,
                        },
                    ],
                });
            });
        }
    }

    // Data the conceptual layer has no place for
    const withFds = tables.filter((t) => (t.functionalDependencies?.length ?? 0) > 0).map((t) => t.name);
    if (withFds.length > 0) warn(`Functional dependencies not kept — ${withFds.join(", ")}.`);
    const withColumnNotes = tables.flatMap((t) =>
        (t.columns ?? []).filter((c) => c.notes).map((c) => `${t.name}.${c.name}`),
    );
    if (withColumnNotes.length > 0) warn(`Column notes not kept — ${withColumnNotes.join(", ")}.`);

    const conceptualModel: ConceptualModelPayload = {
        model: {
            id: opts.newModelId ?? generateCid(),
            name: modelName,
            version: 1,
            notes: logicalModel.model.notes,
        },
        entities,
        relationships,
        generalizations,
        categories: [],
        constraints: [],
    };
    return { model: conceptualModel, notices };
};

/** Same conversion without the notices; see `convertLogicalToConceptualWithNotices`. */
export const convertLogicalToConceptual = (
    logicalModel: LogicalModelPayload,
    opts: ConvertLogicalToConceptualOptions = {},
): ConceptualModelPayload => convertLogicalToConceptualWithNotices(logicalModel, opts).model;

// ═══════════════════════════════════════════════════════════════════════════════
//  CONCEPTUAL -> LOGICAL
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConvertConceptualToLogicalOptions {
    newModelId?: string;
    newModelName?: string;
}

/**
 * Converts a `ConceptualModelPayload` into a `LogicalModelPayload`.
 *
 * Follows the ER/EER-to-relational mapping of Elmasri & Navathe,
 * "Fundamentals of Database Systems", Chapter 9:
 *
 * Mapping rules:
 *  Step 1 – Regular entities -> tables (ids preserved).
 *   - isKey -> PK column (nullable: false). The columns of a composite key
 *     (several key attributes) form ONE composite PK, so they are not
 *     individually `unique`.
 *   - composite with components -> flattened into one column per leaf component.
 *   - multi_valued -> separate table (Step 6).
 *   - derived -> skipped (not stored in relational schema).
 *   - entity with no key attribute -> auto-prepend `id` PK column.
 *
 *  Step 2 – Weak entities (entity.kind = "weak" + identifying relationship):
 *   - Table gets, as FK columns, the PK column(s) of every owner entity.
 *   - PK = owner PK column(s) + partial key (own key attributes), if any.
 *   - Owners are mapped first (weak entity owned by a weak entity).
 *   - Relationship attributes of the identifying relationship -> columns.
 *
 *  Step 3 – Generalizations (ISA / class table inheritance):
 *   - Child table's PK = parent PK column(s), each also an FK -> parent.
 *
 *  Step 4/5 – Relationships (FK always includes ALL columns of the referenced PK):
 *   - N:1 / 1:N  -> FK column(s) on the N side. NOT NULL when the N-side end is
 *                   total participation (`optional === false`).
 *   - 1:1        -> FK column(s) on the mandatory side (first end as tiebreaker).
 *   - N:M        -> junction table; all FK columns of both sides form its PK.
 *   - N-ary (3+) -> junction table with the FK columns of every participant as PK.
 *   - Relationship attributes -> columns on the FK table (1:N/1:1) or
 *     junction table (N:M / N-ary).
 *
 *  Step 6 – Multi-valued attributes -> table (owner PK as FK + value column = PK).
 *
 *  Not representable:
 *   - Categories (union/category types) -> plain tables with no FK.
 */
export const convertConceptualToLogicalWithNotices = (
    conceptualModel: ConceptualModelPayload,
    opts: ConvertConceptualToLogicalOptions = {},
): { model: LogicalModelPayload; notices: ConversionNotice[] } => {
    const notices: ConversionNotice[] = [];
    const warn = (message: string) => notices.push({ level: "warning", message });

    const derivedName = conceptualModel.model.name
        .replace(/conceptual/gi, "Logical")
        .replace(/Conceptual/g, "Logical");
    const modelName =
        opts.newModelName ??
        (derivedName !== conceptualModel.model.name
            ? derivedName
            : `${conceptualModel.model.name} (Logical)`);

    // Entities and attributes without a name (empty or only spaces) get a default unique name, and the user is told.
    const isBlank = (name: string | undefined) => !name || !name.trim();
    const namesIn = (attrs: ConceptualAttribute[]): string[] =>
        attrs.flatMap((x) => [x.name, ...namesIn(x.components ?? [])]).filter((n) => !isBlank(n));
    const uniqueDefault = (base: string, taken: Set<string>) => {
        let name = base;
        for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}_${i}`;
        taken.add(name.toLowerCase());
        return name;
    };
    const entityNamesTaken = new Set((conceptualModel.entities ?? []).map((e) => e.name).filter((n) => !isBlank(n)).map((n) => n.toLowerCase()));
    const nameAttribute = (a: ConceptualAttribute, taken: Set<string>, label: string): ConceptualAttribute => {
        let name = a.name;
        if (isBlank(name)) {
            name = uniqueDefault("unnamed_attribute", taken);
            warn(`${label}: an attribute has no name, so it was named "${name}".`);
        }
        return a.components?.length ? { ...a, name, components: a.components.map((c) => nameAttribute(c, taken, label)) } : { ...a, name };
    };
    const entities = (conceptualModel.entities ?? []).map((e) => {
        let name = e.name;
        if (isBlank(name)) {
            name = uniqueDefault("unnamed_entity", entityNamesTaken);
            warn(`An entity has no name, so it was named "${name}".`);
        }
        const taken = new Set(namesIn(e.attributes ?? []).map((n) => n.toLowerCase()));
        return { ...e, name, attributes: (e.attributes ?? []).map((x) => nameAttribute(x, taken, name)) };
    });
    const relationships = conceptualModel.relationships ?? [];
    const generalizations = conceptualModel.generalizations ?? [];

    // ── Mutable helpers ──────────────────────────────────────────────────
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
    type MutTable = {
        id: string;
        name: string;
        columns: MutCol[];
        notes?: string;
    };
    const tableMap = new Map<string, MutTable>();
    type ConceptualAttribute = ConceptualModelPayload["entities"][number]["attributes"][number];
    const collectStoredAttributeLeaves = (attr: ConceptualAttribute): ConceptualAttribute[] => {
        if (
            (attr.kind === "composite" || attr.kind === "complex") &&
            attr.components &&
            attr.components.length > 0
        ) {
            return attr.components.flatMap(collectStoredAttributeLeaves);
        }

        return [attr];
    };

    const getPKCols = (tableId: string): MutCol[] =>
        tableMap.get(tableId)?.columns.filter((c) => c.roles?.primaryKey) ?? [];

    /**
     * A table name that no existing table uses (case-insensitive); appends _2, _3, ... on a clash.
     * Entity tables are all created first, so junction / multi-valued tables never reuse an entity name.
     */
    const uniqueTableName = (base: string): string => {
        const used = new Set(Array.from(tableMap.values()).map((t) => t.name.toLowerCase()));
        if (!used.has(base.toLowerCase())) return base;
        let i = 2;
        while (used.has(`${base}_${i}`.toLowerCase())) i++;
        return `${base}_${i}`;
    };

    const hasColumnName = (cols: MutCol[], name: string): boolean =>
        cols.some((c) => c.name.toLowerCase() === name.toLowerCase());

    /**
     * Columns for one attribute of a relationship or of a multi-valued attribute:
     * - derived: not stored (reported);
     * - composite / with components: one column per simple component (EER mapping steps 1, 5, 6, 7), a component whose
     *   name is already taken is prefixed with the attribute's name;
     * - anything else: one column named after the attribute.
     */
    const attributeColumns = (
        attr: ConceptualAttribute,
        label: string,
        existing: MutCol[],
        o: { nullable: boolean; primaryKey?: boolean },
    ): MutCol[] => {
        if (attr.kind === "derived") {
            warn(`${label}.${attr.name}: derived attribute is not stored.`);
            return [];
        }
        const leavesOf = (a: ConceptualAttribute): ConceptualAttribute[] =>
            a.components?.length ? a.components.flatMap(leavesOf) : [a];
        const hasComponents = Boolean(attr.components?.length);
        const built: MutCol[] = [];
        for (const leaf of hasComponents ? leavesOf(attr) : [attr]) {
            if (hasComponents && (leaf.kind === "derived" || leaf.kind === "multi_valued")) {
                warn(`${label}.${attr.name}.${leaf.name}: ${leaf.kind === "derived" ? "derived" : "multi-valued"} component is not stored.`);
                continue;
            }
            let name = leaf.name;
            if (hasComponents && hasColumnName([...existing, ...built], name)) {
                name = `${attr.name}_${leaf.name}`;
                const base = name;
                for (let i = 2; hasColumnName([...existing, ...built], name); i++) name = `${base}_${i}`;
                warn(`${label}.${attr.name}.${leaf.name}: column was renamed to "${name}" because the name is already used in the table.`);
            }
            built.push({
                id: generateLid(),
                name,
                nullable: o.nullable,
                unique: false,
                roles: o.primaryKey ? { primaryKey: true } : undefined,
            });
        }
        return built;
    };

    /**
     * Build the FK column(s) that reference ALL columns of `refTableId`'s PK
     * (Elmasri & Navathe: "include as foreign key the primary key of ...").
     *  - Single-column PK -> `<refTable>_id` (existing naming convention).
     *  - Composite PK     -> one column per PK column, keeping the PK column name.
     * Names are made unique against `existing` (and the columns built here).
     */
    const makeFkCols = (
        existing: MutCol[],
        refTableId: string,
        o: { primaryKey: boolean; nullable: boolean; unique?: boolean; selfRef?: boolean },
    ): MutCol[] => {
        const refTable = tableMap.get(refTableId);
        const refPK = getPKCols(refTableId);
        if (!refTable || refPK.length === 0) return [];

        const built: MutCol[] = [];
        for (const pk of refPK) {
            let name =
                refPK.length === 1
                    ? o.selfRef
                        ? `parent_${refTable.name}_id`
                        : `${refTable.name}_id`
                    : o.selfRef
                      ? `parent_${pk.name}`
                      : pk.name;
            if (hasColumnName([...existing, ...built], name)) {
                name = `${refTable.name}_${name}`;
            }
            const baseName = name;
            for (let i = 2; hasColumnName([...existing, ...built], name); i++) {
                name = `${baseName}_${i}`;
            }
            built.push({
                id: generateLid(),
                name,
                nullable: o.primaryKey ? false : o.nullable,
                // a UNIQUE constraint per column is only meaningful for single-column FK
                unique: refPK.length === 1 ? (o.unique ?? false) : false,
                roles: {
                    ...(o.primaryKey ? { primaryKey: true } : {}),
                    foreignKey: { refTableId, refColumnId: pk.id },
                },
            });
        }
        return built;
    };

    // ── Pre-scan: weak entities and their owners (identifying relationships) ─
    const entityById = new Map(entities.map((e) => [e.id, e]));
    const isManyEnd = (e: { cardinality?: string }) =>
        e.cardinality === "N" || e.cardinality === "M";
    const weakInfo = new Map<
        string,
        { ownerIds: string[]; relAttributes: ConceptualAttribute[] }
    >();
    const identifyingRelIds = new Set<string>();
    for (const rel of relationships) {
        if (rel.type !== "identifying") continue;
        const rEnds = (rel.ends ?? []).filter((e) => entityById.has(e.entityId));
        if (rEnds.length !== 2) continue;
        const [a, b] = rEnds;
        if (a.entityId === b.entityId) continue;
        const aWeak = entityById.get(a.entityId)?.kind === "weak";
        const bWeak = entityById.get(b.entityId)?.kind === "weak";
        let weakEnd: typeof a | undefined;
        let ownerEnd: typeof a | undefined;
        if (isManyEnd(a) && !isManyEnd(b)) {
            weakEnd = a;
            ownerEnd = b;
        } else if (!isManyEnd(a) && isManyEnd(b)) {
            weakEnd = b;
            ownerEnd = a;
        } else if (aWeak && !bWeak) {
            weakEnd = a;
            ownerEnd = b;
        } else if (bWeak && !aWeak) {
            weakEnd = b;
            ownerEnd = a;
        }
        if (!weakEnd || !ownerEnd) continue;
        if (entityById.get(weakEnd.entityId)?.kind !== "weak") continue;

        const info = weakInfo.get(weakEnd.entityId) ?? { ownerIds: [], relAttributes: [] };
        if (!info.ownerIds.includes(ownerEnd.entityId)) info.ownerIds.push(ownerEnd.entityId);
        const identTaken = new Set(namesIn(rel.attributes ?? []).map((n) => n.toLowerCase()));
        info.relAttributes.push(...(rel.attributes ?? []).map((x) => nameAttribute(x, identTaken, `Relationship ${rel.name || rel.id}`)));
        weakInfo.set(weakEnd.entityId, info);
        identifyingRelIds.add(rel.id);
    }

    for (const entity of entities) {
        if (entity.kind === "weak" && !weakInfo.has(entity.id)) {
            warn(`${entity.name}: weak entity has no usable identifying relationship, so it gets no owner key.`);
        }
    }

    // entities whose PK column was added automatically (no key attribute), see Step 1
    const autoKeyEntityIds = new Set<string>();

    // ── Step 1: Regular entities -> Tables with attribute columns ────────
    for (const entity of entities) {
        const columns: MutCol[] = [];
        const isOwnedWeak = weakInfo.has(entity.id);
        // key attributes of one entity together form ONE (composite) key; a composite attribute marked as
        // key contributes one key column per stored component
        const isStoredLeaf = (a: ConceptualAttribute) => a.kind !== "derived" && a.kind !== "multi_valued";
        const storedKeyCount = (entity.attributes ?? []).reduce((count, a) => {
            if (!a.isKey || !isStoredLeaf(a)) return count;
            if ((a.kind === "composite" || a.kind === "complex") && a.components?.length) {
                return count + collectStoredAttributeLeaves(a).filter(isStoredLeaf).length;
            }
            return count + 1;
        }, 0);

        // How often each column name would occur in this table (plain attributes + composite components).
        // A component whose name is used more than once is prefixed with its composite attribute's name.
        const leafNameCount = new Map<string, number>();
        const countLeaf = (name: string) => leafNameCount.set(name.toLowerCase(), (leafNameCount.get(name.toLowerCase()) ?? 0) + 1);
        for (const a of entity.attributes ?? []) {
            if (!isStoredLeaf(a)) continue;
            if ((a.kind === "composite" || a.kind === "complex") && a.components?.length) {
                collectStoredAttributeLeaves(a).filter(isStoredLeaf).forEach((c) => countLeaf(c.name));
            } else {
                countLeaf(a.name);
            }
        }

        for (const attr of entity.attributes ?? []) {
            // Derived attributes are not stored
            if (attr.kind === "derived") {
                warn(`${entity.name}.${attr.name}: derived attribute is not stored.`);
                continue;
            }

            // Multi-valued attributes become separate tables (handled in Step 6)
            if (attr.kind === "multi_valued") continue;

            if ((attr.kind === "composite" || attr.kind === "complex") && attr.components?.length) {
                for (const comp of collectStoredAttributeLeaves(attr)) {
                    if (comp.kind === "derived" || comp.kind === "multi_valued") {
                        warn(`${entity.name}.${attr.name}.${comp.name}: ${comp.kind === "derived" ? "derived" : "multi-valued"} component is not stored.`);
                        continue;
                    }
                    let columnName = (leafNameCount.get(comp.name.toLowerCase()) ?? 0) > 1 ? `${attr.name}_${comp.name}` : comp.name;
                    const baseName = columnName;
                    for (let i = 2; hasColumnName(columns, columnName); i++) columnName = `${baseName}_${i}`;
                    if (columnName !== comp.name) {
                        warn(`${entity.name}.${attr.name}.${comp.name}: column was renamed to "${columnName}" because the name is used more than once in the table.`);
                    }
                    columns.push({
                        id: generateLid(),
                        name: columnName,
                        // a composite attribute marked as key: its components together form the key
                        nullable: !attr.isKey,
                        unique: false,
                        roles: attr.isKey ? { primaryKey: true } : undefined,
                    });
                }
            } else {
                columns.push({
                    id: generateLid(),
                    name: attr.name,
                    nullable: attr.isKey ? false : true,
                    // partial key / composite key columns are not unique on their own
                    unique: attr.isKey && storedKeyCount === 1 && !isOwnedWeak,
                    roles: attr.isKey ? { primaryKey: true } : undefined,
                    notes: (attr as { notes?: string }).notes,
                });
            }
        }

        // Auto-add id PK if the entity has no key attribute
        // (an owned weak entity takes its PK from its owner(s), Step 2)
        if (!isOwnedWeak && !columns.some((c) => c.roles?.primaryKey)) {
            autoKeyEntityIds.add(entity.id);
            // the surrogate key is called "id" unless the entity already has a column with that name
            let keyName = "id";
            if (hasColumnName(columns, keyName)) {
                keyName = `${entity.name}_id`;
                const baseKeyName = keyName;
                for (let i = 2; hasColumnName(columns, keyName); i++) keyName = `${baseKeyName}_${i}`;
            }
            columns.unshift({
                id: generateLid(),
                name: keyName,
                nullable: false,
                unique: true,
                roles: { primaryKey: true },
            });
        }

        tableMap.set(entity.id, {
            id: entity.id,
            name: entity.name,
            columns,
            notes: entity.notes,
        });
    }

    // ── Step 2: Weak entities -> PK = owner PK(s) + partial key ──────────
    const mappedWeak = new Set<string>();
    const visitingWeak = new Set<string>();
    const mapWeakEntity = (weakId: string) => {
        if (mappedWeak.has(weakId) || visitingWeak.has(weakId)) return;
        const info = weakInfo.get(weakId);
        const weakTable = tableMap.get(weakId);
        if (!info || !weakTable) return;

        visitingWeak.add(weakId);
        // a weak entity owned by another weak entity: map the owner first
        for (const ownerId of info.ownerIds) mapWeakEntity(ownerId);
        visitingWeak.delete(weakId);

        const ownerFkCols: MutCol[] = [];
        for (const ownerId of info.ownerIds) {
            ownerFkCols.push(
                ...makeFkCols([...ownerFkCols, ...weakTable.columns], ownerId, {
                    primaryKey: true,
                    nullable: false,
                }),
            );
        }
        weakTable.columns.unshift(...ownerFkCols);
        for (const rAttr of info.relAttributes) {
            weakTable.columns.push(...attributeColumns(rAttr, weakTable.name, weakTable.columns, { nullable: true }));
        }
        mappedWeak.add(weakId);
    };
    for (const weakId of weakInfo.keys()) mapWeakEntity(weakId);

    // ── Step 3: Generalizations -> class table inheritance ──────────────
    for (const gen of generalizations) {
        const parentEntityIds = gen.parentEntityIds?.length
            ? gen.parentEntityIds
            : (gen as typeof gen & { parentEntityId?: string }).parentEntityId
              ? [(gen as typeof gen & { parentEntityId: string }).parentEntityId]
              : [];
        const parentEntityId = parentEntityIds[0];
        if (!parentEntityId) {
            warn("A generalization has no parent entity, so it was not converted.");
            continue;
        }

        const parentPKs = getPKCols(parentEntityId);
        const parentTable = tableMap.get(parentEntityId);
        if (parentPKs.length === 0 || !parentTable) {
            warn(`Generalization of ${entityById.get(parentEntityId)?.name ?? parentEntityId}: parent has no primary key, so it was not converted.`);
            continue;
        }
        if (parentEntityIds.length > 1) {
            warn(`Generalization of ${parentTable.name}: multiple parents are not supported, only the first parent was used.`);
        }

        for (const childId of gen.childEntityIds) {
            const childTable = tableMap.get(childId);
            if (!childTable) {
                warn(`Generalization of ${parentTable.name}: child entity "${childId}" does not exist, so it was ignored.`);
                continue;
            }

            const existingPK = childTable.columns.find(
                (c) => c.roles?.primaryKey,
            );
            if (existingPK && !existingPK.roles?.foreignKey && entityById.get(childId)?.attributes?.some((x) => x.isKey)) {
                warn(`${childTable.name}: own key "${existingPK.name}" was replaced by the key inherited from ${parentTable.name}.`);
            }
            if (parentPKs.length > 1) {
                // composite parent PK: child PK = all parent PK columns (each also FK)
                for (const c of childTable.columns) {
                    if (c.roles?.primaryKey) {
                        c.roles = { ...c.roles, primaryKey: false };
                    }
                }
                const inherited = makeFkCols(childTable.columns, parentEntityId, {
                    primaryKey: true,
                    nullable: false,
                });
                childTable.columns.unshift(...inherited);
            } else if (existingPK) {
                existingPK.roles = {
                    ...existingPK.roles,
                    primaryKey: true,
                    foreignKey: {
                        refTableId: parentEntityId,
                        refColumnId: parentPKs[0].id,
                    },
                };
                existingPK.name = parentPKs[0].name;
            } else {
                childTable.columns.unshift({
                    id: generateLid(),
                    name: `${parentTable.name}_id`,
                    nullable: false,
                    unique: true,
                    roles: {
                        primaryKey: true,
                        foreignKey: {
                            refTableId: parentEntityId,
                            refColumnId: parentPKs[0].id,
                        },
                    },
                });
            }
        }
    }

    // ── Step 3b: Categories (union types), EER step 9 ───────────────────
    // - superclasses with DIFFERENT keys: the category table gets a surrogate key, and every superclass
    //   table gets a FK column to it (e.g. OWNER(Owner_id) <- PERSON.Owner_id, COMPANY.Owner_id, BANK.Owner_id).
    // - superclasses sharing the SAME key: the category table is identified by that key and the key of every
    //   superclass table is also an FK to the category table (e.g. REGISTERED_VEHICLE <- CAR, TRUCK).
    for (const cat of conceptualModel.categories ?? []) {
        const catTable = cat.categoryEntityId ? tableMap.get(cat.categoryEntityId) : undefined;
        if (!catTable) {
            warn("A category has no entity of its own, so it was not converted.");
            continue;
        }
        const declared = cat.superclassEntityIds ?? [];
        const supers = declared.filter((id) => id !== catTable.id && tableMap.has(id));
        if (supers.length < declared.length) {
            warn(`Category ${catTable.name}: ${declared.length - supers.length} superclass(es) do not exist and were ignored.`);
        }
        if (supers.length === 0) {
            warn(`Category ${catTable.name}: has no superclass, so it was not linked to any table.`);
            continue;
        }

        const keySignature = (id: string) => getPKCols(id).map((c) => c.name.toLowerCase()).sort().join("|");
        const sameKey = keySignature(supers[0]) !== "" && supers.every((id) => keySignature(id) === keySignature(supers[0]));
        const autoKey = autoKeyEntityIds.has(catTable.id);

        if (!sameKey) {
            // different keys -> surrogate key on the category table, FK column on each superclass table
            if (autoKey) {
                const surrogate = getPKCols(catTable.id)[0];
                if (surrogate) surrogate.name = `${catTable.name}_id`;
            }
            for (const superId of supers) {
                const superTable = tableMap.get(superId)!;
                superTable.columns.push(...makeFkCols(superTable.columns, catTable.id, { primaryKey: false, nullable: true }));
            }
            continue;
        }

        // same key -> the category table takes the shared key; the key of each superclass also references it
        const sharedKey = getPKCols(supers[0]);
        const catKeyCols: MutCol[] = sharedKey.map((pk) => ({
            id: generateLid(),
            name: pk.name,
            nullable: false,
            unique: false,
            roles: { primaryKey: true },
        }));
        // an automatically added key is dropped; a key declared on the category entity stays as a unique column
        catTable.columns = catTable.columns
            .filter((c) => !(autoKey && c.roles?.primaryKey))
            .map((c) => (c.roles?.primaryKey ? { ...c, unique: true, roles: { ...c.roles, primaryKey: false } } : c));
        for (const keyCol of catKeyCols) {
            if (hasColumnName(catTable.columns, keyCol.name)) keyCol.name = `${catTable.name}_${keyCol.name}`;
        }
        catTable.columns.unshift(...catKeyCols);

        for (const superId of supers) {
            const superTable = tableMap.get(superId)!;
            for (const pk of getPKCols(superId)) {
                const target = catKeyCols[sharedKey.findIndex((k) => k.name.toLowerCase() === pk.name.toLowerCase())];
                if (!target) continue;
                if (pk.roles?.foreignKey) {
                    warn(`Category ${catTable.name}: the key of ${superTable.name} already references another table, so it was not linked to the category.`);
                    break;
                }
                pk.roles = { ...pk.roles, foreignKey: { refTableId: catTable.id, refColumnId: target.id } };
            }
        }
    }

    // ── Step 4/5: Relationships -> FK columns / junction tables ─────────
    for (const rel of relationships) {
        // identifying relationships were mapped in Step 2
        if (identifyingRelIds.has(rel.id)) continue;

        const relLabel = `Relationship ${rel.name || rel.id}`;
        const ends = (rel.ends ?? []).filter((e) => tableMap.has(e.entityId));
        const missingEnds = (rel.ends?.length ?? 0) - ends.length;
        if (missingEnds > 0) {
            warn(`${relLabel}: ${missingEnds} participant(s) reference an entity that does not exist and were ignored, so the relationship was converted with ${ends.length} participant(s) instead of ${rel.ends.length}.`);
        }
        if (ends.length < 2) {
            warn(`${relLabel}: connects fewer than 2 entities, so no foreign key was created.`);
            continue;
        }

        const relTaken = new Set(namesIn(rel.attributes ?? []).map((n) => n.toLowerCase()));
        const relAttributes = (rel.attributes ?? []).map((x) => nameAttribute(x, relTaken, relLabel));

        // A participant without a cardinality: tell the user how it was read
        const unsetNames = ends.filter((e) => !e.cardinality).map((e) => tableMap.get(e.entityId)!.name);
        if (unsetNames.length > 0 && ends.length > 2) {
            warn(`${relLabel}: cardinality is not set on ${unsetNames.join(", ")}, so it was read as many (N).`);
        }

        // N-ary (3+) -> junction table
        if (ends.length > 2) {
            const junctionId = `tbl_${rel.id}`;
            const wantedName = rel.name || ends.map((e) => tableMap.get(e.entityId)!.name).join("_");
            const junctionName = uniqueTableName(wantedName);
            if (rel.name && junctionName !== wantedName) {
                warn(`${relLabel}: table name "${wantedName}" is already used by another table, so the junction table was named "${junctionName}".`);
            }
            const cols: MutCol[] = [];
            // A participant with cardinality "1" is determined by the other participants, so its FK is not part of
            // the PK (textbook rule for n-ary relationships). If every participant is "1" (or a cardinality is not
            // set), all FKs stay in the PK.
            const isOneEnd = (e: (typeof ends)[number]) => e.cardinality === "1";
            const allOne = ends.every(isOneEnd);
            for (const end of ends) {
                cols.push(
                    ...makeFkCols(cols, end.entityId, { primaryKey: allOne || !isOneEnd(end), nullable: false }),
                );
            }
            for (const rAttr of relAttributes) {
                cols.push(...attributeColumns(rAttr, relLabel, cols, { nullable: true }));
            }
            if (cols.length > 0) {
                tableMap.set(junctionId, {
                    id: junctionId,
                    name: junctionName,
                    columns: cols,
                });
            } else {
                warn(`${relLabel}: participating entities have no primary key, so no junction table was created.`);
            }
            continue;
        }

        // Binary relationship
        const [endA, endB] = ends;
        const isAMany = isManyEnd(endA);
        const isBMany = isManyEnd(endB);

        if (unsetNames.length > 0) {
            warn(
                `${relLabel}: cardinality is not set on ${unsetNames.join(", ")}, so it was read as 1 and the relationship was converted as ` +
                    (isAMany || isBMany ? "one-to-many." : "one-to-one."),
            );
        }

        if (isAMany && isBMany) {
            // N:M -> junction table (FK columns of both sides form the PK)
            if (getPKCols(endA.entityId).length === 0 || getPKCols(endB.entityId).length === 0) {
                warn(`${relLabel}: a participating entity has no primary key, so no junction table was created.`);
                continue;
            }
            const tableA = tableMap.get(endA.entityId)!;
            const tableB = tableMap.get(endB.entityId)!;
            const junctionId = `tbl_${rel.id}`;
            const wantedName = rel.name || `${tableA.name}_${tableB.name}`;
            const junctionName = uniqueTableName(wantedName);
            if (rel.name && junctionName !== wantedName) {
                warn(`${relLabel}: table name "${wantedName}" is already used by another table, so the junction table was named "${junctionName}".`);
            }
            const cols: MutCol[] = [];
            cols.push(...makeFkCols(cols, endA.entityId, { primaryKey: true, nullable: false }));
            cols.push(
                ...makeFkCols(cols, endB.entityId, {
                    primaryKey: true,
                    nullable: false,
                    selfRef: endA.entityId === endB.entityId,
                }),
            );
            for (const rAttr of relAttributes) {
                cols.push(...attributeColumns(rAttr, relLabel, cols, { nullable: true }));
            }
            tableMap.set(junctionId, {
                id: junctionId,
                name: junctionName,
                columns: cols,
            });
        } else {
            // 1:N, N:1, or 1:1 -> FK on the N-side (or mandatory side for 1:1)
            let fkEnd: (typeof ends)[number];
            let refEnd: (typeof ends)[number];

            if (isAMany && !isBMany) {
                fkEnd = endA;
                refEnd = endB;
            } else if (!isAMany && isBMany) {
                fkEnd = endB;
                refEnd = endA;
            } else {
                // 1:1 -- prefer the mandatory side (optional === false); fall back to endA
                fkEnd =
                    endA.optional === false
                        ? endA
                        : endB.optional === false
                          ? endB
                          : endA;
                refEnd = fkEnd === endA ? endB : endA;
            }

            const fkTable = tableMap.get(fkEnd.entityId);
            if (!fkTable || !tableMap.get(refEnd.entityId)) continue;

            // Self-referential: use "parent_" prefix to avoid name collision
            const fkCols = makeFkCols(fkTable.columns, refEnd.entityId, {
                primaryKey: false,
                nullable: fkEnd.optional !== false,
                unique: !isAMany && !isBMany, // 1:1 -> unique
                selfRef: endA.entityId === endB.entityId,
            });
            if (fkCols.length === 0) {
                warn(`${relLabel}: ${tableMap.get(refEnd.entityId)?.name} has no primary key to reference, so no foreign key was created.`);
                continue;
            }
            fkTable.columns.push(...fkCols);
            for (const rAttr of relAttributes) {
                fkTable.columns.push(...attributeColumns(rAttr, relLabel, fkTable.columns, { nullable: true }));
            }
        }
    }

    // ── Step 6: Multi-valued attributes -> separate tables ──────────────
    for (const entity of entities) {
        for (const attr of entity.attributes ?? []) {
            if (attr.kind !== "multi_valued") continue;

            const parentTable = tableMap.get(entity.id);
            if (!parentTable) continue;

            const mvTableId = `tbl_mv_${entity.id}_${attr.id}`;
            const mvTableName = uniqueTableName(`${entity.name}_${attr.name}`);
            const cols: MutCol[] = makeFkCols([], entity.id, {
                primaryKey: true,
                nullable: false,
            });
            if (cols.length === 0) {
                warn(`${entity.name}.${attr.name}: multi-valued attribute dropped because ${entity.name} has no primary key.`);
                continue;
            }
            // the value column, or one column per simple component when the attribute is composite (slide, step 6)
            const valueCols = attributeColumns(attr, entity.name, cols, { nullable: false, primaryKey: true });
            if (valueCols.length === 0) {
                warn(`${entity.name}.${attr.name}: multi-valued attribute dropped because none of its components can be stored.`);
                continue;
            }
            cols.push(...valueCols);
            tableMap.set(mvTableId, {
                id: mvTableId,
                name: mvTableName,
                columns: cols,
            });
        }
    }

    // Names that are the same once case is ignored (most databases treat them as one name).
    // Unicode is normalised first so that "é" typed as one character or as e + accent counts as the same.
    const nameKey = (n: string) => n.normalize("NFC").trim().toLowerCase();
    const duplicateGroups = (names: string[]) => {
        const groups = new Map<string, string[]>();
        for (const n of names) groups.set(nameKey(n), [...(groups.get(nameKey(n)) ?? []), n]);
        return Array.from(groups.values()).filter((g) => g.length > 1);
    };
    const quoted = (names: string[]) => names.map((n) => `"${n}"`).join(", ");
    for (const group of duplicateGroups(Array.from(tableMap.values()).map((t) => t.name))) {
        warn(`Tables ${quoted(group)} have the same name once case is ignored; most databases treat them as one table.`);
    }
    for (const t of tableMap.values()) {
        for (const group of duplicateGroups(t.columns.map((c) => c.name))) {
            warn(`${t.name}: columns ${quoted(group)} have the same name once case is ignored; most databases treat them as one column.`);
        }
    }

    return {
        model: {
            model: {
                id: opts.newModelId ?? generateLid(),
                name: modelName,
                version: 1,
                notes: conceptualModel.model.notes,
            },
            tables: Array.from(tableMap.values()).map((t) => ({ ...t, columns: pkColumnsFirst(t.columns) })),
        },
        notices,
    };
};

/** Same conversion without the notices; see `convertConceptualToLogicalWithNotices`. */
export const convertConceptualToLogical = (
    conceptualModel: ConceptualModelPayload,
    opts: ConvertConceptualToLogicalOptions = {},
): LogicalModelPayload => convertConceptualToLogicalWithNotices(conceptualModel, opts).model;

// ═══════════════════════════════════════════════════════════════════════════════
//  PHYSICAL -> CONCEPTUAL (two-step chain)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConvertPhysicalToConceptualOptions {
    newModelId?: string;
    newModelName?: string;
}

/**
 * Converts a `PhysicalModelPayload` into a `ConceptualModelPayload`.
 *
 * Implemented as a two-step chain:
 *   Physical -> Logical (strip implementation details)
 *   Logical  -> Conceptual (detect ISA, junction, weak, multi-valued, FK -> Rel)
 *
 * See `convertPhysicalToLogical` and `convertLogicalToConceptual` for full rules.
 */
export const convertPhysicalToConceptualWithNotices = (
    physicalModel: PhysicalModelPayload,
    opts: ConvertPhysicalToConceptualOptions = {},
): { model: ConceptualModelPayload; notices: ConversionNotice[] } => {
    const derivedName = physicalModel.model.name
        .replace(/physical/gi, "Conceptual")
        .replace(/Physical/g, "Conceptual");
    const modelName =
        opts.newModelName ??
        (derivedName !== physicalModel.model.name
            ? derivedName
            : `${physicalModel.model.name} (Conceptual)`);

    const toLogical = convertPhysicalToLogicalWithNotices(physicalModel);
    const toConceptual = convertLogicalToConceptualWithNotices(toLogical.model, {
        newModelId: opts.newModelId,
        newModelName: modelName,
    });
    return { model: toConceptual.model, notices: [...toLogical.notices, ...toConceptual.notices] };
};

/** Same conversion without the notices; see `convertPhysicalToConceptualWithNotices`. */
export const convertPhysicalToConceptual = (
    physicalModel: PhysicalModelPayload,
    opts: ConvertPhysicalToConceptualOptions = {},
): ConceptualModelPayload => convertPhysicalToConceptualWithNotices(physicalModel, opts).model;

// ═══════════════════════════════════════════════════════════════════════════════
//  CONCEPTUAL -> PHYSICAL (two-step chain)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ConvertConceptualToPhysicalOptions {
    newModelId?: string;
    newModelName?: string;
    /** Target DBMS -- passed through to Logical -> Physical for type mapping. */
    dbms?: DBMSType;
}

/**
 * Converts a `ConceptualModelPayload` into a `PhysicalModelPayload`.
 *
 * Implemented as a two-step chain:
 *   Conceptual -> Logical (map Entity/Relationship/Generalization -> tables + FKs)
 *   Logical    -> Physical (infer data types per DBMS, set auto-increment)
 *
 * See `convertConceptualToLogical` and `convertLogicalToPhysical` for full rules.
 */
export const convertConceptualToPhysicalWithNotices = (
    conceptualModel: ConceptualModelPayload,
    opts: ConvertConceptualToPhysicalOptions = {},
): { model: PhysicalModelPayload; notices: ConversionNotice[] } => {
    const derivedName = conceptualModel.model.name
        .replace(/conceptual/gi, "Physical")
        .replace(/Conceptual/g, "Physical");
    const modelName =
        opts.newModelName ??
        (derivedName !== conceptualModel.model.name
            ? derivedName
            : `${conceptualModel.model.name} (Physical)`);

    // Logical -> Physical loses nothing, so only the first step contributes notices
    const toLogical = convertConceptualToLogicalWithNotices(conceptualModel);
    const physical = convertLogicalToPhysical(toLogical.model, {
        newModelId: opts.newModelId,
        newModelName: modelName,
        dbms: opts.dbms,
    });
    return { model: physical, notices: toLogical.notices };
};

/** Same conversion without the notices; see `convertConceptualToPhysicalWithNotices`. */
export const convertConceptualToPhysical = (
    conceptualModel: ConceptualModelPayload,
    opts: ConvertConceptualToPhysicalOptions = {},
): PhysicalModelPayload => convertConceptualToPhysicalWithNotices(conceptualModel, opts).model;
