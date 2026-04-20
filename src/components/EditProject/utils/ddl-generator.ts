import type { PhysicalModelPayload } from "./physical-model.builder";
import type { DBMSType, DBMSConfig, FKAction } from "./dbms-config";
import { getDBMSConfig } from "./dbms-config";

// ── Types ────────────────────────────────────────────────────────────

export type DDLOptions = {
    dbms: DBMSType;
    includeCreateTable: boolean;
    includeForeignKeys: boolean;
    includeIndexes: boolean;
    includeDropIfExists: boolean;
    includeIfNotExists: boolean;
};

export type DDLStatement = {
    type: "DROP_TABLE" | "CREATE_TABLE" | "ALTER_TABLE_FK" | "CREATE_INDEX";
    tableName: string;
    sql: string;
};

export type DDLResult = {
    sql: string;
    statements: DDLStatement[];
    warnings: string[];
};

export const DEFAULT_DDL_OPTIONS: DDLOptions = {
    dbms: "postgresql",
    includeCreateTable: true,
    includeForeignKeys: true,
    includeIndexes: true,
    includeDropIfExists: false,
    includeIfNotExists: false,
};

// ── Helpers ──────────────────────────────────────────────────────────

type TableInfo = {
    id: string;
    name: string;
    columns: ColumnInfo[];
    indexes: IndexInfo[];
};

type ColumnInfo = {
    name: string;
    dataType: string;
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

type IndexInfo = {
    name: string;
    type: string;
    columns: Array<{ columnName: string; order: string }>;
    isUnique: boolean;
};

type FKInfo = {
    constraintName: string;
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    onDelete?: FKAction;
    onUpdate?: FKAction;
};

const quote = (name: string, config: DBMSConfig): string => {
    const [open, close] = config.quoteChar;
    return `${open}${name}${close}`;
};

/** Check if a dataType is a serial/auto-increment type that shouldn't get length */
const isSerialType = (dataType: string): boolean =>
    ["serial", "bigserial", "smallserial"].includes(dataType.toLowerCase());

// ── Topological Sort ─────────────────────────────────────────────────

/**
 * Sort tables so that referenced tables come before referencing tables.
 * Falls back to original order on circular dependencies.
 */
const topologicalSort = (tables: TableInfo[], tableIdToName: Map<string, string>): TableInfo[] => {
    const nameSet = new Set(tables.map((t) => t.name));
    // Build adjacency: table depends on the tables its FKs point to
    const deps = new Map<string, Set<string>>();
    for (const t of tables) {
        deps.set(t.name, new Set());
    }
    for (const t of tables) {
        for (const col of t.columns) {
            if (col.foreignKey) {
                const refName = tableIdToName.get(col.foreignKey.refTableId);
                if (refName && nameSet.has(refName) && refName !== t.name) {
                    deps.get(t.name)!.add(refName);
                }
            }
        }
    }

    const sorted: TableInfo[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    let hasCycle = false;

    const visit = (name: string) => {
        if (visited.has(name)) return;
        if (visiting.has(name)) {
            hasCycle = true;
            return;
        }
        visiting.add(name);
        for (const dep of deps.get(name) ?? []) {
            visit(dep);
            if (hasCycle) return;
        }
        visiting.delete(name);
        visited.add(name);
        sorted.push(tables.find((t) => t.name === name)!);
    };

    for (const t of tables) {
        visit(t.name);
        if (hasCycle) return tables; // fallback to original order
    }
    return sorted;
};

// ── Column DDL ───────────────────────────────────────────────────────

const buildColumnDDL = (col: ColumnInfo, config: DBMSConfig): string => {
    const parts: string[] = [quote(col.name, config)];

    // Data type
    const dtLower = (col.dataType || "varchar").toLowerCase();
    const serialMapping = config.serialTypes[dtLower];

    if (serialMapping) {
        // Serial types: use DBMS-specific expansion (e.g. SERIAL, INT AUTO_INCREMENT)
        parts.push(serialMapping);
    } else {
        let typeStr = col.dataType?.toUpperCase() || "VARCHAR";
        if (col.length) {
            typeStr += `(${col.length})`;
        }
        parts.push(typeStr);
    }

    // NOT NULL
    if (!col.nullable) {
        parts.push("NOT NULL");
    }

    // DEFAULT
    if (col.defaultValue !== undefined && col.defaultValue !== "") {
        parts.push(`DEFAULT ${col.defaultValue}`);
    }

    return parts.join(" ");
};

// ── CREATE TABLE ─────────────────────────────────────────────────────

const buildCreateTable = (
    table: TableInfo,
    config: DBMSConfig,
    options: DDLOptions,
): string => {
    const lines: string[] = [];

    // Column definitions
    for (const col of table.columns) {
        lines.push(`    ${buildColumnDDL(col, config)}`);
    }

    // PRIMARY KEY constraint
    const pkColumns = table.columns.filter((c) => c.isPrimaryKey);
    if (pkColumns.length > 0) {
        const pkCols = pkColumns.map((c) => quote(c.name, config)).join(", ");
        lines.push(`    CONSTRAINT ${quote(`pk_${table.name}`, config)} PRIMARY KEY (${pkCols})`);
    }

    // UNIQUE constraints (for non-PK unique columns)
    for (const col of table.columns) {
        if (col.unique && !col.isPrimaryKey) {
            lines.push(
                `    CONSTRAINT ${quote(`uq_${table.name}_${col.name}`, config)} UNIQUE (${quote(col.name, config)})`,
            );
        }
    }

    const ifNotExists = options.includeIfNotExists && config.supportsIfNotExists ? " IF NOT EXISTS" : "";
    const header = `CREATE TABLE${ifNotExists} ${quote(table.name, config)}`;

    return `${header} (\n${lines.join(",\n")}\n);`;
};

// ── ALTER TABLE FK ───────────────────────────────────────────────────

const buildAlterTableFK = (fk: FKInfo, config: DBMSConfig): string => {
    let sql = `ALTER TABLE ${quote(fk.sourceTable, config)} ADD CONSTRAINT ${quote(fk.constraintName, config)}\n`;
    sql += `    FOREIGN KEY (${quote(fk.sourceColumn, config)}) REFERENCES ${quote(fk.targetTable, config)} (${quote(fk.targetColumn, config)})`;

    const actions: string[] = [];
    if (fk.onDelete && fk.onDelete !== "NO ACTION") {
        actions.push(`ON DELETE ${fk.onDelete}`);
    }
    if (fk.onUpdate && fk.onUpdate !== "NO ACTION") {
        actions.push(`ON UPDATE ${fk.onUpdate}`);
    }
    if (actions.length > 0) {
        sql += ` ${actions.join(" ")}`;
    }

    return `${sql};`;
};

// ── CREATE INDEX ─────────────────────────────────────────────────────

const buildCreateIndex = (
    tableName: string,
    idx: IndexInfo,
    config: DBMSConfig,
): string => {
    const uniqueStr = idx.isUnique ? "UNIQUE " : "";
    const cols = idx.columns
        .map((c) => `${quote(c.columnName, config)} ${c.order || "ASC"}`)
        .join(", ");

    let using = "";
    if (config.supportsIndexUsing && idx.type && idx.type !== "BTREE") {
        // BTREE is default for most DBMS, only specify non-default
        using = ` USING ${idx.type}`;
    }

    return `CREATE ${uniqueStr}INDEX ${quote(idx.name, config)} ON ${quote(tableName, config)}${using} (${cols});`;
};

// ── DROP TABLE ───────────────────────────────────────────────────────

const buildDropTable = (tableName: string, config: DBMSConfig): string => {
    return `DROP TABLE IF EXISTS ${quote(tableName, config)};`;
};

// ── Main Generator ───────────────────────────────────────────────────

export const generateDDL = (
    model: PhysicalModelPayload,
    options: DDLOptions = DEFAULT_DDL_OPTIONS,
): DDLResult => {
    const config = getDBMSConfig(options.dbms);
    const warnings: string[] = [];
    const statements: DDLStatement[] = [];

    // Build lookup: tableId → tableName
    const tableIdToName = new Map<string, string>();
    for (const t of model.tables ?? []) {
        tableIdToName.set(t.id, t.name);
    }

    // Normalize model tables into internal TableInfo
    const tables: TableInfo[] = (model.tables ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        columns: (t.columns ?? []).map((c) => ({
            name: c.name,
            dataType: c.dataType ?? "varchar",
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
            name: idx.name,
            type: idx.type,
            columns: idx.columns,
            isUnique: idx.isUnique,
        })),
    }));

    // Topological sort
    const sorted = topologicalSort(tables, tableIdToName);

    // Collect FKs
    const allFKs: FKInfo[] = [];
    for (const table of sorted) {
        for (const col of table.columns) {
            if (!col.foreignKey) continue;
            const targetName = tableIdToName.get(col.foreignKey.refTableId);
            if (!targetName) {
                warnings.push(`FK on ${table.name}.${col.name}: target table ID "${col.foreignKey.refTableId}" not found, skipping.`);
                continue;
            }
            // Resolve target column name
            const targetTable = tables.find((t) => t.id === col.foreignKey!.refTableId);
            const targetCol = targetTable?.columns.find((c) => c.isPrimaryKey);
            const targetColName = targetCol?.name ?? "id";

            allFKs.push({
                constraintName: `fk_${table.name}_${col.name}`,
                sourceTable: table.name,
                sourceColumn: col.name,
                targetTable: targetName,
                targetColumn: targetColName,
                onDelete: col.foreignKey.onDelete,
                onUpdate: col.foreignKey.onUpdate,
            });
        }
    }

    if (!config.supportsIfNotExists && options.includeIfNotExists) {
        warnings.push(`${config.name} does not support IF NOT EXISTS for CREATE TABLE.`);
    }

    // ── Generate statements ──────────────────────────────────────

    // 1) DROP TABLE (reverse order so dependents drop first)
    if (options.includeDropIfExists) {
        const reversed = [...sorted].reverse();
        for (const table of reversed) {
            const sql = buildDropTable(table.name, config);
            statements.push({ type: "DROP_TABLE", tableName: table.name, sql });
        }
    }

    // 2) CREATE TABLE
    if (options.includeCreateTable) {
        for (const table of sorted) {
            const sql = buildCreateTable(table, config, options);
            statements.push({ type: "CREATE_TABLE", tableName: table.name, sql });
        }
    }

    // 3) ALTER TABLE ... ADD FOREIGN KEY
    if (options.includeForeignKeys) {
        for (const fk of allFKs) {
            const sql = buildAlterTableFK(fk, config);
            statements.push({ type: "ALTER_TABLE_FK", tableName: fk.sourceTable, sql });
        }
    }

    // 4) CREATE INDEX
    if (options.includeIndexes) {
        for (const table of sorted) {
            for (const idx of table.indexes) {
                const sql = buildCreateIndex(table.name, idx, config);
                statements.push({ type: "CREATE_INDEX", tableName: table.name, sql });
            }
        }
    }

    // ── Assemble full script ─────────────────────────────────────

    const header = [
        `-- Generated by DBFlow`,
        `-- DBMS: ${config.name}`,
        `-- Date: ${new Date().toISOString().split("T")[0]}`,
        ``,
    ].join("\n");

    const sections: string[] = [header];

    const dropStmts = statements.filter((s) => s.type === "DROP_TABLE");
    const createStmts = statements.filter((s) => s.type === "CREATE_TABLE");
    const fkStmts = statements.filter((s) => s.type === "ALTER_TABLE_FK");
    const indexStmts = statements.filter((s) => s.type === "CREATE_INDEX");

    if (dropStmts.length > 0) {
        sections.push(`-- Drop Tables\n${dropStmts.map((s) => s.sql).join("\n")}`);
    }

    if (createStmts.length > 0) {
        sections.push(`-- Tables\n${createStmts.map((s) => s.sql).join("\n\n")}`);
    }

    if (fkStmts.length > 0) {
        sections.push(`-- Foreign Keys\n${fkStmts.map((s) => s.sql).join("\n\n")}`);
    }

    if (indexStmts.length > 0) {
        sections.push(`-- Indexes\n${indexStmts.map((s) => s.sql).join("\n")}`);
    }

    const sql = sections.join("\n\n");

    return { sql, statements, warnings };
};
