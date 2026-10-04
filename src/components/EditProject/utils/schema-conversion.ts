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
                columns: (table.columns ?? []).map((col) => {
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
    /** WEAK: owner table ID (from the FK PK column). */
    weakOwnerId?: string;
    /** JUNCTION: referenced table IDs (one per FK PK column). */
    junctionRefTableIds?: string[];
};

/**
 * Classify each logical table to determine its conceptual mapping.
 *
 * Classification priority (first match wins):
 *  1. ISA_CHILD: single PK col that is also FK to another table.
 *  2. JUNCTION:  >= 2 PK cols, ALL are FK to existing tables.
 *  3. MULTI_VALUED: exactly 2 cols, both PK, exactly one FK.
 *  4. WEAK:      composite PK (>= 2), partial FK among PKs, has non-PK cols.
 *  5. REGULAR:   everything else -> strong entity.
 */
export const classifyTables = (tables: LogicalTable[]): TableClassification[] => {
    const tableIdSet = new Set(tables.map((t) => t.id));

    return tables.map((table): TableClassification => {
        const cols = table.columns ?? [];
        const pkCols = cols.filter((c) => c.roles?.primaryKey);
        const pkFkCols = pkCols.filter((c) => c.roles?.foreignKey);
        const pkNonFkCols = pkCols.filter((c) => !c.roles?.foreignKey);
        const nonPkCols = cols.filter((c) => !c.roles?.primaryKey);

        // ── 1. ISA: single PK that is also FK ───────────────────────
        if (
            pkCols.length === 1 &&
            pkFkCols.length === 1 &&
            tableIdSet.has(pkFkCols[0].roles!.foreignKey!.refTableId)
        ) {
            return {
                kind: "ISA_CHILD",
                table,
                isaParentId: pkFkCols[0].roles!.foreignKey!.refTableId,
            };
        }

        // ── 2. Junction: all PK cols (>= 2) are FK ──────────────────
        if (pkCols.length >= 2 && pkFkCols.length === pkCols.length) {
            const refIds = pkFkCols
                .map((c) => c.roles!.foreignKey!.refTableId)
                .filter((id) => tableIdSet.has(id));
            if (refIds.length >= 2) {
                return {
                    kind: "JUNCTION",
                    table,
                    junctionRefTableIds: refIds,
                };
            }
        }

        // ── 3. Multi-valued: 2 PK cols, 1 FK, 0 non-PK cols ────────
        if (
            cols.length === 2 &&
            pkCols.length === 2 &&
            pkFkCols.length === 1 &&
            pkNonFkCols.length === 1 &&
            nonPkCols.length === 0 &&
            tableIdSet.has(pkFkCols[0].roles!.foreignKey!.refTableId)
        ) {
            return {
                kind: "MULTI_VALUED",
                table,
                mvParentId: pkFkCols[0].roles!.foreignKey!.refTableId,
                mvValueCol: pkNonFkCols[0],
            };
        }

        // ── 4. Weak entity: composite PK, partial FK, has extras ────
        if (
            pkCols.length >= 2 &&
            pkFkCols.length >= 1 &&
            pkFkCols.length < pkCols.length &&
            nonPkCols.length > 0
        ) {
            const ownerId = pkFkCols[0].roles!.foreignKey!.refTableId;
            if (tableIdSet.has(ownerId)) {
                return {
                    kind: "WEAK",
                    table,
                    weakOwnerId: ownerId,
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
                cls.weakOwnerId === col.roles.foreignKey?.refTableId;

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
        const relAttrs: AttrPayload[] = nonPkCols.map((col) => ({
            id: generateCid(),
            name: col.name,
            kind: "simple" as const,
            isKey: false,
        }));

        const ends: RelPayload["ends"] = refIds.map((refId) => ({
            entityId: refId,
            cardinality: "N",
            optional: true,
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

    // ── 3b. Weak entity -> identifying relationship to owner ─────────
    for (const cls of classifications) {
        if (cls.kind !== "WEAK" || !cls.weakOwnerId) continue;

        const pk = pairKey(cls.table.id, cls.weakOwnerId);
        if (emittedRelPairs.has(pk)) {
            warn(`${cls.table.name}: identifying relationship was not created because a relationship between the same entities already exists.`);
            continue;
        }
        emittedRelPairs.add(pk);

        const ownerTable = tables.find((t) => t.id === cls.weakOwnerId);
        const relName = `${ownerTable?.name ?? "owner"}_${cls.table.name}`;

        relationships.push({
            id: generateCid(),
            name: relName,
            type: "identifying" as const,
            ends: [
                // the owner can exist without weak entities; the weak entity always depends on its owner
                { entityId: cls.weakOwnerId, cardinality: "1", optional: true },
                { entityId: cls.table.id,     cardinality: "N", optional: false },
            ],
        });
    }

    // ── 3c. Regular FK columns -> N:1 association relationships ──────
    for (const cls of classifications) {
        // Only tables that became entities (not junction/MV)
        if (cls.kind === "JUNCTION" || cls.kind === "MULTI_VALUED") continue;

        const table = cls.table;
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
                cls.weakOwnerId === fk.refTableId
            )
                continue;

            // Deduplicate by entity pair
            const pk = pairKey(table.id, fk.refTableId);
            const refTable = tables.find((t) => t.id === fk.refTableId);
            if (emittedRelPairs.has(pk)) {
                warn(`${table.name}.${col.name}: foreign key to ${refTable?.name ?? fk.refTableId} was merged into an existing relationship between the same entities.`);
                continue;
            }
            emittedRelPairs.add(pk);

            const relName = `${table.name}_${refTable?.name ?? fk.refTableId}`;

            relationships.push({
                id: generateCid(),
                name: relName,
                type: "association" as const,
                ends: [
                    {
                        entityId: table.id,
                        cardinality: "N",
                        // a key column can never be NULL -> mandatory; otherwise follow the column's nullability
                        // (the logical diagram stores no nullability, so only PK membership is known there)
                        optional: col.roles?.primaryKey ? false : col.nullable !== false,
                    },
                    {
                        entityId: fk.refTableId,
                        cardinality: "1",
                        // a FK does not force the referenced entity to have referencing rows
                        optional: true,
                    },
                ],
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

    const entities = conceptualModel.entities ?? [];
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

    const hasColumnName = (cols: MutCol[], name: string): boolean =>
        cols.some((c) => c.name.toLowerCase() === name.toLowerCase());

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
        info.relAttributes.push(...(rel.attributes ?? []));
        weakInfo.set(weakEnd.entityId, info);
        identifyingRelIds.add(rel.id);
    }

    for (const entity of entities) {
        if (entity.kind === "weak" && !weakInfo.has(entity.id)) {
            warn(`${entity.name}: weak entity has no usable identifying relationship, so it gets no owner key.`);
        }
    }

    // ── Step 1: Regular entities -> Tables with attribute columns ────────
    for (const entity of entities) {
        const columns: MutCol[] = [];
        const isOwnedWeak = weakInfo.has(entity.id);
        // key attributes of one entity together form ONE (composite) key
        const storedKeyCount = (entity.attributes ?? []).filter(
            (a) =>
                a.isKey &&
                a.kind !== "derived" &&
                a.kind !== "multi_valued" &&
                !((a.kind === "composite" || a.kind === "complex") && a.components?.length),
        ).length;

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
                    columns.push({
                        id: generateLid(),
                        name: comp.name,
                        nullable: true,
                        unique: false,
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
            columns.unshift({
                id: generateLid(),
                name: "id",
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
            weakTable.columns.push({
                id: generateLid(),
                name: rAttr.name,
                nullable: true,
                unique: false,
            });
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
            if (!childTable) continue;

            const existingPK = childTable.columns.find(
                (c) => c.roles?.primaryKey,
            );
            if (existingPK && !existingPK.roles?.foreignKey) {
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

        const relAttributes = rel.attributes ?? [];

        // N-ary (3+) -> junction table
        if (ends.length > 2) {
            const junctionId = `tbl_${rel.id}`;
            const junctionName =
                rel.name ||
                ends.map((e) => tableMap.get(e.entityId)!.name).join("_");
            const cols: MutCol[] = [];
            for (const end of ends) {
                cols.push(
                    ...makeFkCols(cols, end.entityId, { primaryKey: true, nullable: false }),
                );
            }
            for (const rAttr of relAttributes) {
                cols.push({
                    id: generateLid(),
                    name: rAttr.name,
                    nullable: true,
                    unique: false,
                });
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

        if (isAMany && isBMany) {
            // N:M -> junction table (FK columns of both sides form the PK)
            if (getPKCols(endA.entityId).length === 0 || getPKCols(endB.entityId).length === 0) {
                warn(`${relLabel}: a participating entity has no primary key, so no junction table was created.`);
                continue;
            }
            const tableA = tableMap.get(endA.entityId)!;
            const tableB = tableMap.get(endB.entityId)!;
            const junctionId = `tbl_${rel.id}`;
            const junctionName =
                rel.name || `${tableA.name}_${tableB.name}`;
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
                cols.push({
                    id: generateLid(),
                    name: rAttr.name,
                    nullable: true,
                    unique: false,
                });
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
                fkTable.columns.push({
                    id: generateLid(),
                    name: rAttr.name,
                    nullable: true,
                    unique: false,
                });
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
            const mvTableName = `${entity.name}_${attr.name}`;
            const cols: MutCol[] = makeFkCols([], entity.id, {
                primaryKey: true,
                nullable: false,
            });
            if (cols.length === 0) {
                warn(`${entity.name}.${attr.name}: multi-valued attribute dropped because ${entity.name} has no primary key.`);
                continue;
            }
            cols.push({
                id: generateLid(),
                name: attr.name,
                nullable: false,
                unique: false,
                roles: { primaryKey: true },
            });
            tableMap.set(mvTableId, {
                id: mvTableId,
                name: mvTableName,
                columns: cols,
            });
        }
    }

    if ((conceptualModel.categories?.length ?? 0) > 0) {
        warn("Categories (union types) cannot be represented: they were not converted.");
    }

    return {
        model: {
            model: {
                id: opts.newModelId ?? generateLid(),
                name: modelName,
                version: 1,
                notes: conceptualModel.model.notes,
            },
            tables: Array.from(tableMap.values()),
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
