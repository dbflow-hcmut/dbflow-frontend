/**
 * Migration SQL Generator
 *
 * Converts a SchemaDiff into UP and DOWN migration SQL scripts.
 * Reuses DDL builder helpers for DBMS-specific syntax.
 */

import type { SchemaDiff, TableChange, ColumnChange, ConstraintChange, IndexChange } from "./schema-diff";
import type { DBMSType, DBMSConfig, FKAction } from "./dbms-config";
import { getDBMSConfig } from "./dbms-config";
import type { PhysicalModelPayload } from "./physical-model.builder";

// ── Types ────────────────────────────────────────────────────────────

export type MigrationResult = {
    up: string;
    down: string;
    upStatements: string[];
    downStatements: string[];
    diff: SchemaDiff;
};

// ── Helpers ──────────────────────────────────────────────────────────

const q = (name: string, config: DBMSConfig): string => {
    const [open, close] = config.quoteChar;
    return `${open}${name}${close}`;
};

const columnTypeDDL = (
    dataType: string | undefined,
    length: string | undefined,
    config: DBMSConfig,
): string => {
    const dt = (dataType || "varchar").toLowerCase();
    const serial = config.serialTypes[dt];
    if (serial) return serial;

    let typeStr = (dataType || "VARCHAR").toUpperCase();
    if (length) typeStr += `(${length})`;
    return typeStr;
};

// Look up table name from model by table ID (for FK references)
const resolveTableName = (
    tableId: string,
    newModel?: PhysicalModelPayload,
    oldModel?: PhysicalModelPayload,
): string => {
    const allTables = [...(newModel?.tables ?? []), ...(oldModel?.tables ?? [])];
    const found = allTables.find((t) => t.id === tableId);
    return found?.name ?? tableId;
};

const resolvePKColumnName = (
    tableId: string,
    newModel?: PhysicalModelPayload,
    oldModel?: PhysicalModelPayload,
): string => {
    const allTables = [...(newModel?.tables ?? []), ...(oldModel?.tables ?? [])];
    const table = allTables.find((t) => t.id === tableId);
    const pk = table?.columns?.find((c) => c.roles?.primaryKey);
    return pk?.name ?? "id";
};

// ── UP generators ────────────────────────────────────────────────────

const generateTableUp = (
    change: TableChange,
    config: DBMSConfig,
    newModel?: PhysicalModelPayload,
): string[] => {
    if (change.type === "CREATE_TABLE") {
        const t = change.table;
        const colLines = t.columns.map((col) => {
            const parts = [q(col.name, config), columnTypeDDL(col.dataType, col.length, config)];
            if (!col.nullable) parts.push("NOT NULL");
            if (col.defaultValue) parts.push(`DEFAULT ${col.defaultValue}`);
            return `    ${parts.join(" ")}`;
        });

        const pkCols = t.columns.filter((c) => c.isPrimaryKey);
        if (pkCols.length > 0) {
            colLines.push(`    CONSTRAINT ${q(`pk_${t.name}`, config)} PRIMARY KEY (${pkCols.map((c) => q(c.name, config)).join(", ")})`);
        }

        for (const col of t.columns) {
            if (col.unique && !col.isPrimaryKey) {
                colLines.push(`    CONSTRAINT ${q(`uq_${t.name}_${col.name}`, config)} UNIQUE (${q(col.name, config)})`);
            }
        }

        const stmts = [`CREATE TABLE ${q(t.name, config)} (\n${colLines.join(",\n")}\n);`];

        // FKs as ALTER TABLE
        for (const col of t.columns) {
            if (!col.foreignKey) continue;
            const refTable = resolveTableName(col.foreignKey.refTableId, newModel);
            const refCol = resolvePKColumnName(col.foreignKey.refTableId, newModel);
            let fkSql = `ALTER TABLE ${q(t.name, config)} ADD CONSTRAINT ${q(`fk_${t.name}_${col.name}`, config)}\n`;
            fkSql += `    FOREIGN KEY (${q(col.name, config)}) REFERENCES ${q(refTable, config)} (${q(refCol, config)})`;
            const actions: string[] = [];
            if (col.foreignKey.onDelete && col.foreignKey.onDelete !== "NO ACTION") actions.push(`ON DELETE ${col.foreignKey.onDelete}`);
            if (col.foreignKey.onUpdate && col.foreignKey.onUpdate !== "NO ACTION") actions.push(`ON UPDATE ${col.foreignKey.onUpdate}`);
            if (actions.length > 0) fkSql += ` ${actions.join(" ")}`;
            stmts.push(`${fkSql};`);
        }

        // Indexes
        for (const idx of t.indexes) {
            const unique = idx.isUnique ? "UNIQUE " : "";
            const cols = idx.columns.map((c) => `${q(c.columnName, config)} ${c.order}`).join(", ");
            let using = "";
            if (config.supportsIndexUsing && idx.type && idx.type !== "BTREE") using = ` USING ${idx.type}`;
            stmts.push(`CREATE ${unique}INDEX ${q(idx.name, config)} ON ${q(t.name, config)}${using} (${cols});`);
        }

        return stmts;
    }

    // DROP_TABLE
    return [`DROP TABLE IF EXISTS ${q(change.table.name, config)};`];
};

const generateColumnUp = (change: ColumnChange, config: DBMSConfig): string[] => {
    const tn = q(change.tableName, config);

    if (change.type === "ADD_COLUMN") {
        const col = change.column;
        const parts = [q(col.name, config), columnTypeDDL(col.dataType, col.length, config)];
        if (!col.nullable) parts.push("NOT NULL");
        if (col.defaultValue) parts.push(`DEFAULT ${col.defaultValue}`);
        return [`ALTER TABLE ${tn} ADD COLUMN ${parts.join(" ")};`];
    }

    if (change.type === "DROP_COLUMN") {
        return [`ALTER TABLE ${tn} DROP COLUMN ${q(change.column.name, config)};`];
    }

    // MODIFY_COLUMN
    const stmts: string[] = [];
    const cn = q(change.columnName, config);

    for (const mod of change.changes) {
        if (mod.field === "dataType" || mod.field === "length") {
            const newType = columnTypeDDL(
                change.changes.find((m) => m.field === "dataType")?.newValue as string | undefined ?? (mod.field === "dataType" ? mod.newValue as string : undefined),
                change.changes.find((m) => m.field === "length")?.newValue as string | undefined,
                config,
            );
            stmts.push(`ALTER TABLE ${tn} ALTER COLUMN ${cn} TYPE ${newType};`);
            break; // type + length handled together
        }
        if (mod.field === "nullable") {
            stmts.push(
                mod.newValue
                    ? `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP NOT NULL;`
                    : `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET NOT NULL;`,
            );
        }
        if (mod.field === "defaultValue") {
            stmts.push(
                mod.newValue
                    ? `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET DEFAULT ${mod.newValue};`
                    : `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP DEFAULT;`,
            );
        }
    }

    return stmts;
};

const generateConstraintUp = (
    change: ConstraintChange,
    config: DBMSConfig,
    newModel?: PhysicalModelPayload,
    oldModel?: PhysicalModelPayload,
): string[] => {
    const tn = q(change.tableName, config);

    switch (change.type) {
        case "ADD_PK": {
            const cols = change.columns.map((c) => q(c, config)).join(", ");
            return [`ALTER TABLE ${tn} ADD CONSTRAINT ${q(`pk_${change.tableName}`, config)} PRIMARY KEY (${cols});`];
        }
        case "DROP_PK":
            return [`ALTER TABLE ${tn} DROP CONSTRAINT ${q(`pk_${change.tableName}`, config)};`];
        case "ADD_FK": {
            const refTable = resolveTableName(change.fk.refTableId, newModel, oldModel);
            const refCol = resolvePKColumnName(change.fk.refTableId, newModel, oldModel);
            let sql = `ALTER TABLE ${tn} ADD CONSTRAINT ${q(`fk_${change.tableName}_${change.fk.columnName}`, config)}\n`;
            sql += `    FOREIGN KEY (${q(change.fk.columnName, config)}) REFERENCES ${q(refTable, config)} (${q(refCol, config)})`;
            const actions: string[] = [];
            if (change.fk.onDelete && change.fk.onDelete !== "NO ACTION") actions.push(`ON DELETE ${change.fk.onDelete}`);
            if (change.fk.onUpdate && change.fk.onUpdate !== "NO ACTION") actions.push(`ON UPDATE ${change.fk.onUpdate}`);
            if (actions.length > 0) sql += ` ${actions.join(" ")}`;
            return [`${sql};`];
        }
        case "DROP_FK":
            return [`ALTER TABLE ${tn} DROP CONSTRAINT ${q(`fk_${change.tableName}_${change.fk.columnName}`, config)};`];
        case "MODIFY_FK": {
            // Drop old FK, add new one
            const dropSql = `ALTER TABLE ${tn} DROP CONSTRAINT ${q(`fk_${change.tableName}_${change.columnName}`, config)};`;
            // Find new FK details from newModel
            const table = newModel?.tables?.find((t) => t.name === change.tableName);
            const col = table?.columns?.find((c) => c.name === change.columnName);
            if (!col?.roles?.foreignKey) return [dropSql];
            const fk = col.roles.foreignKey;
            const refTable = resolveTableName(fk.refTableId, newModel, oldModel);
            const refCol = resolvePKColumnName(fk.refTableId, newModel, oldModel);
            let addSql = `ALTER TABLE ${tn} ADD CONSTRAINT ${q(`fk_${change.tableName}_${change.columnName}`, config)}\n`;
            addSql += `    FOREIGN KEY (${q(change.columnName, config)}) REFERENCES ${q(refTable, config)} (${q(refCol, config)})`;
            const acts: string[] = [];
            if (fk.onDelete && fk.onDelete !== "NO ACTION") acts.push(`ON DELETE ${fk.onDelete}`);
            if (fk.onUpdate && fk.onUpdate !== "NO ACTION") acts.push(`ON UPDATE ${fk.onUpdate}`);
            if (acts.length > 0) addSql += ` ${acts.join(" ")}`;
            return [dropSql, `${addSql};`];
        }
        case "ADD_UNIQUE":
            return [`ALTER TABLE ${tn} ADD CONSTRAINT ${q(`uq_${change.tableName}_${change.columnName}`, config)} UNIQUE (${q(change.columnName, config)});`];
        case "DROP_UNIQUE":
            return [`ALTER TABLE ${tn} DROP CONSTRAINT ${q(`uq_${change.tableName}_${change.columnName}`, config)};`];
    }
};

const generateIndexUp = (change: IndexChange, config: DBMSConfig): string[] => {
    if (change.type === "CREATE_INDEX") {
        const idx = change.index;
        const unique = idx.isUnique ? "UNIQUE " : "";
        const cols = idx.columns.map((c) => `${q(c.columnName, config)} ${c.order}`).join(", ");
        let using = "";
        if (config.supportsIndexUsing && idx.type && idx.type !== "BTREE") using = ` USING ${idx.type}`;
        return [`CREATE ${unique}INDEX ${q(idx.name, config)} ON ${q(change.tableName, config)}${using} (${cols});`];
    }
    if (change.type === "DROP_INDEX") {
        return [`DROP INDEX ${q(change.index.name, config)};`];
    }
    // MODIFY_INDEX → drop + create
    const dropSql = `DROP INDEX ${q(change.oldIndex.name, config)};`;
    const idx = change.newIndex;
    const unique = idx.isUnique ? "UNIQUE " : "";
    const cols = idx.columns.map((c) => `${q(c.columnName, config)} ${c.order}`).join(", ");
    let using = "";
    if (config.supportsIndexUsing && idx.type && idx.type !== "BTREE") using = ` USING ${idx.type}`;
    const createSql = `CREATE ${unique}INDEX ${q(idx.name, config)} ON ${q(change.tableName, config)}${using} (${cols});`;
    return [dropSql, createSql];
};

// ── DOWN generators (reverse of UP) ─────────────────────────────────

const generateTableDown = (
    change: TableChange,
    config: DBMSConfig,
    oldModel?: PhysicalModelPayload,
): string[] => {
    if (change.type === "CREATE_TABLE") {
        // Reverse of CREATE → DROP
        return [`DROP TABLE IF EXISTS ${q(change.table.name, config)};`];
    }
    // Reverse of DROP → CREATE (recreate the old table)
    return generateTableUp({ type: "CREATE_TABLE", table: change.table }, config, oldModel);
};

const generateColumnDown = (change: ColumnChange, config: DBMSConfig): string[] => {
    if (change.type === "ADD_COLUMN") {
        // Reverse: drop the added column
        return [`ALTER TABLE ${q(change.tableName, config)} DROP COLUMN ${q(change.column.name, config)};`];
    }
    if (change.type === "DROP_COLUMN") {
        // Reverse: add the dropped column back
        const col = change.column;
        const parts = [q(col.name, config), columnTypeDDL(col.dataType, col.length, config)];
        if (!col.nullable) parts.push("NOT NULL");
        if (col.defaultValue) parts.push(`DEFAULT ${col.defaultValue}`);
        return [`ALTER TABLE ${q(change.tableName, config)} ADD COLUMN ${parts.join(" ")};`];
    }
    // MODIFY_COLUMN: reverse each modification
    const stmts: string[] = [];
    const tn = q(change.tableName, config);
    const cn = q(change.columnName, config);

    for (const mod of change.changes) {
        if (mod.field === "dataType" || mod.field === "length") {
            const oldType = columnTypeDDL(
                change.changes.find((m) => m.field === "dataType")?.oldValue as string | undefined,
                change.changes.find((m) => m.field === "length")?.oldValue as string | undefined,
                config,
            );
            stmts.push(`ALTER TABLE ${tn} ALTER COLUMN ${cn} TYPE ${oldType};`);
            break;
        }
        if (mod.field === "nullable") {
            stmts.push(
                mod.oldValue
                    ? `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP NOT NULL;`
                    : `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET NOT NULL;`,
            );
        }
        if (mod.field === "defaultValue") {
            stmts.push(
                mod.oldValue
                    ? `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET DEFAULT ${mod.oldValue};`
                    : `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP DEFAULT;`,
            );
        }
    }

    return stmts;
};

// ── Main Generator ───────────────────────────────────────────────────

export const generateMigration = (
    diff: SchemaDiff,
    options: {
        dbms: DBMSType;
        oldModel?: PhysicalModelPayload;
        newModel?: PhysicalModelPayload;
        versionFrom?: number;
        versionTo?: number;
    },
): MigrationResult => {
    const config = getDBMSConfig(options.dbms);
    const upStatements: string[] = [];
    const downStatements: string[] = [];

    // ── UP script ────────────────────────────────────────────────

    // 1. Drop tables (topological consideration: dropped tables have no dependents in new schema)
    for (const tc of diff.tableChanges.filter((c) => c.type === "DROP_TABLE")) {
        upStatements.push(...generateTableUp(tc, config, options.newModel));
    }

    // 2. Create tables
    for (const tc of diff.tableChanges.filter((c) => c.type === "CREATE_TABLE")) {
        upStatements.push(...generateTableUp(tc, config, options.newModel));
    }

    // 3. Column changes
    for (const cc of diff.columnChanges) {
        upStatements.push(...generateColumnUp(cc, config));
    }

    // 4. Constraint changes
    // Drop constraints first, then add
    for (const cc of diff.constraintChanges.filter((c) => c.type.startsWith("DROP"))) {
        upStatements.push(...generateConstraintUp(cc, config, options.newModel, options.oldModel));
    }
    for (const cc of diff.constraintChanges.filter((c) => c.type === "MODIFY_FK")) {
        upStatements.push(...generateConstraintUp(cc, config, options.newModel, options.oldModel));
    }
    for (const cc of diff.constraintChanges.filter((c) => c.type.startsWith("ADD"))) {
        upStatements.push(...generateConstraintUp(cc, config, options.newModel, options.oldModel));
    }

    // 5. Index changes
    for (const ic of diff.indexChanges) {
        upStatements.push(...generateIndexUp(ic, config));
    }

    // ── DOWN script (reverse order) ──────────────────────────────

    // Reverse index changes
    for (const ic of [...diff.indexChanges].reverse()) {
        if (ic.type === "CREATE_INDEX") {
            downStatements.push(`DROP INDEX ${q(ic.index.name, config)};`);
        } else if (ic.type === "DROP_INDEX") {
            const idx = ic.index;
            const unique = idx.isUnique ? "UNIQUE " : "";
            const cols = idx.columns.map((c) => `${q(c.columnName, config)} ${c.order}`).join(", ");
            downStatements.push(`CREATE ${unique}INDEX ${q(idx.name, config)} ON ${q(ic.tableName, config)} (${cols});`);
        } else if (ic.type === "MODIFY_INDEX") {
            downStatements.push(...generateIndexUp({ ...ic, oldIndex: ic.newIndex, newIndex: ic.oldIndex }, config));
        }
    }

    // Reverse constraint changes
    for (const cc of [...diff.constraintChanges].reverse()) {
        switch (cc.type) {
            case "ADD_PK":
                downStatements.push(`ALTER TABLE ${q(cc.tableName, config)} DROP CONSTRAINT ${q(`pk_${cc.tableName}`, config)};`);
                break;
            case "DROP_PK":
                downStatements.push(`ALTER TABLE ${q(cc.tableName, config)} ADD CONSTRAINT ${q(`pk_${cc.tableName}`, config)} PRIMARY KEY (${cc.columns.map((c) => q(c, config)).join(", ")});`);
                break;
            case "ADD_FK":
                downStatements.push(`ALTER TABLE ${q(cc.tableName, config)} DROP CONSTRAINT ${q(`fk_${cc.tableName}_${cc.fk.columnName}`, config)};`);
                break;
            case "DROP_FK": {
                const refTable = resolveTableName(cc.fk.refTableId, options.newModel, options.oldModel);
                const refCol = resolvePKColumnName(cc.fk.refTableId, options.newModel, options.oldModel);
                let addSql = `ALTER TABLE ${q(cc.tableName, config)} ADD CONSTRAINT ${q(`fk_${cc.tableName}_${cc.fk.columnName}`, config)}\n`;
                addSql += `    FOREIGN KEY (${q(cc.fk.columnName, config)}) REFERENCES ${q(refTable, config)} (${q(refCol, config)})`;
                downStatements.push(`${addSql};`);
                break;
            }
            case "ADD_UNIQUE":
                downStatements.push(`ALTER TABLE ${q(cc.tableName, config)} DROP CONSTRAINT ${q(`uq_${cc.tableName}_${cc.columnName}`, config)};`);
                break;
            case "DROP_UNIQUE":
                downStatements.push(`ALTER TABLE ${q(cc.tableName, config)} ADD CONSTRAINT ${q(`uq_${cc.tableName}_${cc.columnName}`, config)} UNIQUE (${q(cc.columnName, config)});`);
                break;
        }
    }

    // Reverse column changes
    for (const cc of [...diff.columnChanges].reverse()) {
        downStatements.push(...generateColumnDown(cc, config));
    }

    // Reverse table changes
    for (const tc of [...diff.tableChanges].reverse()) {
        downStatements.push(...generateTableDown(tc, config, options.oldModel));
    }

    // ── Assemble ─────────────────────────────────────────────────

    const vFrom = options.versionFrom ?? "?";
    const vTo = options.versionTo ?? "?";

    const fileHeader = [
        `-- Migration: v${vFrom} → v${vTo}`,
        `-- DBMS: ${config.name}`,
        `-- Generated: ${new Date().toISOString().split("T")[0]}`,
    ].join("\n");

    const upBody = upStatements.length > 0
        ? upStatements.join("\n\n")
        : "-- No changes";

    const downBody = downStatements.length > 0
        ? downStatements.join("\n\n")
        : "-- No changes";

    const up = `${fileHeader}\n\n-- UP\n${upBody}`;
    const down = `${fileHeader}\n\n-- DOWN (rollback v${vTo} → v${vFrom})\n${downBody}`;

    return {
        up,
        down,
        upStatements,
        downStatements,
        diff,
    };
};
