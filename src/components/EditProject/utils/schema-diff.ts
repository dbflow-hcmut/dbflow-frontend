/**
 * Schema Diff Engine
 *
 * Compares two PhysicalModelPayload snapshots and produces a list of
 * structured changes (table-level, column-level, constraint-level, index-level).
 */

import type { PhysicalModelPayload } from "./physical-model.builder";
import type { ModelIndex } from "./physical-model.builder";
import type { FKAction } from "./dbms-config";

// ── Change Types ─────────────────────────────────────────────────────

export type TableChange =
    | { type: "CREATE_TABLE"; table: TableSnapshot }
    | { type: "DROP_TABLE"; table: TableSnapshot };

export type ColumnChange =
    | { type: "ADD_COLUMN"; tableName: string; column: ColumnSnapshot }
    | { type: "DROP_COLUMN"; tableName: string; column: ColumnSnapshot }
    | { type: "MODIFY_COLUMN"; tableName: string; columnName: string; changes: ColumnModification[] };

export type ColumnModification = {
    field: "dataType" | "length" | "nullable" | "unique" | "defaultValue" | "autoIncrement";
    oldValue: string | boolean | undefined;
    newValue: string | boolean | undefined;
};

export type ConstraintChange =
    | { type: "ADD_PK"; tableName: string; columns: string[] }
    | { type: "DROP_PK"; tableName: string; columns: string[] }
    | { type: "ADD_FK"; tableName: string; fk: FKSnapshot }
    | { type: "DROP_FK"; tableName: string; fk: FKSnapshot }
    | { type: "MODIFY_FK"; tableName: string; columnName: string; changes: FKModification[] }
    | { type: "ADD_UNIQUE"; tableName: string; columnName: string }
    | { type: "DROP_UNIQUE"; tableName: string; columnName: string };

export type FKModification = {
    field: "refTableId" | "refColumnId" | "onDelete" | "onUpdate";
    oldValue: string | undefined;
    newValue: string | undefined;
};

export type IndexChange =
    | { type: "CREATE_INDEX"; tableName: string; index: IndexSnapshot }
    | { type: "DROP_INDEX"; tableName: string; index: IndexSnapshot }
    | { type: "MODIFY_INDEX"; tableName: string; indexName: string; oldIndex: IndexSnapshot; newIndex: IndexSnapshot };

export type SchemaDiff = {
    tableChanges: TableChange[];
    columnChanges: ColumnChange[];
    constraintChanges: ConstraintChange[];
    indexChanges: IndexChange[];
    hasChanges: boolean;
    summary: string;
};

// ── Internal Snapshot Types ──────────────────────────────────────────

type ColumnSnapshot = {
    name: string;
    dataType?: string;
    length?: string;
    nullable: boolean;
    unique: boolean;
    autoIncrement?: boolean;
    defaultValue?: string;
    isPrimaryKey: boolean;
    foreignKey?: {
        refTableId: string;
        refColumnId: string;
        onDelete?: FKAction;
        onUpdate?: FKAction;
    };
};

type TableSnapshot = {
    id: string;
    name: string;
    columns: ColumnSnapshot[];
    indexes: IndexSnapshot[];
};

type FKSnapshot = {
    columnName: string;
    refTableId: string;
    refColumnId: string;
    onDelete?: FKAction;
    onUpdate?: FKAction;
};

type IndexSnapshot = {
    id: string;
    name: string;
    type: string;
    columns: Array<{ columnName: string; order: string }>;
    isUnique: boolean;
};

// ── Normalize ────────────────────────────────────────────────────────

const normalizeTable = (t: PhysicalModelPayload["tables"][number]): TableSnapshot => ({
    id: t.id,
    name: t.name,
    columns: (t.columns ?? []).map((c) => ({
        name: c.name,
        dataType: c.dataType,
        length: c.length,
        nullable: c.nullable ?? true,
        unique: c.unique ?? false,
        autoIncrement: c.autoIncrement,
        defaultValue: c.defaultValue,
        isPrimaryKey: c.roles?.primaryKey ?? false,
        foreignKey: c.roles?.foreignKey
            ? {
                  refTableId: c.roles.foreignKey.refTableId,
                  refColumnId: c.roles.foreignKey.refColumnId,
                  onDelete: c.roles.foreignKey.onDelete,
                  onUpdate: c.roles.foreignKey.onUpdate,
              }
            : undefined,
    })),
    indexes: (t.indexes ?? []).map((idx) => ({
        id: idx.id,
        name: idx.name,
        type: idx.type,
        columns: idx.columns.map((c) => ({ columnName: c.columnName, order: c.order })),
        isUnique: idx.isUnique,
    })),
});

// ── Diff Engine ──────────────────────────────────────────────────────

export const diffSchemas = (
    oldModel: PhysicalModelPayload,
    newModel: PhysicalModelPayload,
): SchemaDiff => {
    const tableChanges: TableChange[] = [];
    const columnChanges: ColumnChange[] = [];
    const constraintChanges: ConstraintChange[] = [];
    const indexChanges: IndexChange[] = [];

    const oldTables = new Map((oldModel.tables ?? []).map((t) => [t.name, normalizeTable(t)]));
    const newTables = new Map((newModel.tables ?? []).map((t) => [t.name, normalizeTable(t)]));

    // ── Table-level: created / dropped ───────────────────────────

    for (const [name, table] of newTables) {
        if (!oldTables.has(name)) {
            tableChanges.push({ type: "CREATE_TABLE", table });
        }
    }
    for (const [name, table] of oldTables) {
        if (!newTables.has(name)) {
            tableChanges.push({ type: "DROP_TABLE", table });
        }
    }

    // ── Per-table comparison (tables that exist in both) ─────────

    for (const [name, newTable] of newTables) {
        const oldTable = oldTables.get(name);
        if (!oldTable) continue; // Already handled as CREATE_TABLE

        const oldColMap = new Map(oldTable.columns.map((c) => [c.name, c]));
        const newColMap = new Map(newTable.columns.map((c) => [c.name, c]));

        // ── Column-level ─────────────────────────────────────────

        // Added columns
        for (const [colName, col] of newColMap) {
            if (!oldColMap.has(colName)) {
                columnChanges.push({ type: "ADD_COLUMN", tableName: name, column: col });
            }
        }

        // Dropped columns
        for (const [colName, col] of oldColMap) {
            if (!newColMap.has(colName)) {
                columnChanges.push({ type: "DROP_COLUMN", tableName: name, column: col });
            }
        }

        // Modified columns
        for (const [colName, newCol] of newColMap) {
            const oldCol = oldColMap.get(colName);
            if (!oldCol) continue;

            const modifications: ColumnModification[] = [];

            if (norm(oldCol.dataType) !== norm(newCol.dataType)) {
                modifications.push({ field: "dataType", oldValue: oldCol.dataType, newValue: newCol.dataType });
            }
            if (norm(oldCol.length) !== norm(newCol.length)) {
                modifications.push({ field: "length", oldValue: oldCol.length, newValue: newCol.length });
            }
            if (oldCol.nullable !== newCol.nullable) {
                modifications.push({ field: "nullable", oldValue: oldCol.nullable, newValue: newCol.nullable });
            }
            if (oldCol.unique !== newCol.unique) {
                modifications.push({ field: "unique", oldValue: oldCol.unique, newValue: newCol.unique });
            }
            if (norm(oldCol.defaultValue) !== norm(newCol.defaultValue)) {
                modifications.push({ field: "defaultValue", oldValue: oldCol.defaultValue, newValue: newCol.defaultValue });
            }
            if (Boolean(oldCol.autoIncrement) !== Boolean(newCol.autoIncrement)) {
                modifications.push({ field: "autoIncrement", oldValue: oldCol.autoIncrement, newValue: newCol.autoIncrement });
            }

            if (modifications.length > 0) {
                columnChanges.push({ type: "MODIFY_COLUMN", tableName: name, columnName: colName, changes: modifications });
            }
        }

        // ── Constraint-level ─────────────────────────────────────

        // PK changes
        const oldPKs = oldTable.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        const newPKs = newTable.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        const oldPKKey = oldPKs.sort().join(",");
        const newPKKey = newPKs.sort().join(",");

        if (oldPKKey !== newPKKey) {
            if (oldPKs.length > 0) {
                constraintChanges.push({ type: "DROP_PK", tableName: name, columns: oldPKs });
            }
            if (newPKs.length > 0) {
                constraintChanges.push({ type: "ADD_PK", tableName: name, columns: newPKs });
            }
        }

        // FK changes
        const oldFKs = new Map(
            oldTable.columns
                .filter((c) => c.foreignKey)
                .map((c) => [c.name, { columnName: c.name, ...c.foreignKey! }]),
        );
        const newFKs = new Map(
            newTable.columns
                .filter((c) => c.foreignKey)
                .map((c) => [c.name, { columnName: c.name, ...c.foreignKey! }]),
        );

        for (const [colName, fk] of newFKs) {
            if (!oldFKs.has(colName)) {
                constraintChanges.push({ type: "ADD_FK", tableName: name, fk });
            }
        }
        for (const [colName, fk] of oldFKs) {
            if (!newFKs.has(colName)) {
                constraintChanges.push({ type: "DROP_FK", tableName: name, fk });
            }
        }
        // Modified FKs (same column, different target/actions)
        for (const [colName, newFK] of newFKs) {
            const oldFK = oldFKs.get(colName);
            if (!oldFK) continue;

            const fkMods: FKModification[] = [];
            if (oldFK.refTableId !== newFK.refTableId) {
                fkMods.push({ field: "refTableId", oldValue: oldFK.refTableId, newValue: newFK.refTableId });
            }
            if (oldFK.refColumnId !== newFK.refColumnId) {
                fkMods.push({ field: "refColumnId", oldValue: oldFK.refColumnId, newValue: newFK.refColumnId });
            }
            if (norm(oldFK.onDelete) !== norm(newFK.onDelete)) {
                fkMods.push({ field: "onDelete", oldValue: oldFK.onDelete, newValue: newFK.onDelete });
            }
            if (norm(oldFK.onUpdate) !== norm(newFK.onUpdate)) {
                fkMods.push({ field: "onUpdate", oldValue: oldFK.onUpdate, newValue: newFK.onUpdate });
            }
            if (fkMods.length > 0) {
                constraintChanges.push({ type: "MODIFY_FK", tableName: name, columnName: colName, changes: fkMods });
            }
        }

        // Unique constraint changes (non-PK unique)
        for (const [colName, newCol] of newColMap) {
            const oldCol = oldColMap.get(colName);
            if (!oldCol) continue;
            if (!oldCol.unique && newCol.unique && !newCol.isPrimaryKey) {
                constraintChanges.push({ type: "ADD_UNIQUE", tableName: name, columnName: colName });
            }
            if (oldCol.unique && !newCol.unique && !oldCol.isPrimaryKey) {
                constraintChanges.push({ type: "DROP_UNIQUE", tableName: name, columnName: colName });
            }
        }

        // ── Index-level ──────────────────────────────────────────

        const oldIdxMap = new Map(oldTable.indexes.map((idx) => [idx.name, idx]));
        const newIdxMap = new Map(newTable.indexes.map((idx) => [idx.name, idx]));

        for (const [idxName, idx] of newIdxMap) {
            if (!oldIdxMap.has(idxName)) {
                indexChanges.push({ type: "CREATE_INDEX", tableName: name, index: idx });
            }
        }
        for (const [idxName, idx] of oldIdxMap) {
            if (!newIdxMap.has(idxName)) {
                indexChanges.push({ type: "DROP_INDEX", tableName: name, index: idx });
            }
        }
        // Modified indexes
        for (const [idxName, newIdx] of newIdxMap) {
            const oldIdx = oldIdxMap.get(idxName);
            if (!oldIdx) continue;

            const colsChanged =
                JSON.stringify(oldIdx.columns) !== JSON.stringify(newIdx.columns) ||
                oldIdx.type !== newIdx.type ||
                oldIdx.isUnique !== newIdx.isUnique;

            if (colsChanged) {
                indexChanges.push({
                    type: "MODIFY_INDEX",
                    tableName: name,
                    indexName: idxName,
                    oldIndex: oldIdx,
                    newIndex: newIdx,
                });
            }
        }
    }

    const totalChanges =
        tableChanges.length + columnChanges.length + constraintChanges.length + indexChanges.length;

    // ── Summary ──────────────────────────────────────────────────

    const parts: string[] = [];
    const created = tableChanges.filter((c) => c.type === "CREATE_TABLE").length;
    const dropped = tableChanges.filter((c) => c.type === "DROP_TABLE").length;
    if (created > 0) parts.push(`${created} table(s) created`);
    if (dropped > 0) parts.push(`${dropped} table(s) dropped`);

    const added = columnChanges.filter((c) => c.type === "ADD_COLUMN").length;
    const removed = columnChanges.filter((c) => c.type === "DROP_COLUMN").length;
    const modified = columnChanges.filter((c) => c.type === "MODIFY_COLUMN").length;
    if (added > 0) parts.push(`${added} column(s) added`);
    if (removed > 0) parts.push(`${removed} column(s) removed`);
    if (modified > 0) parts.push(`${modified} column(s) modified`);

    if (constraintChanges.length > 0) parts.push(`${constraintChanges.length} constraint change(s)`);
    if (indexChanges.length > 0) parts.push(`${indexChanges.length} index change(s)`);

    return {
        tableChanges,
        columnChanges,
        constraintChanges,
        indexChanges,
        hasChanges: totalChanges > 0,
        summary: parts.length > 0 ? parts.join(", ") : "No changes",
    };
};

/** Normalize undefined / empty string for comparison */
const norm = (val: string | boolean | undefined): string =>
    val === undefined || val === "" ? "" : String(val).toLowerCase();
