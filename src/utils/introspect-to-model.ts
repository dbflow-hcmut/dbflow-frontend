/**
 * Convert introspect result (IntrospectedTable[]) → PhysicalModelPayload
 * Follows the same pattern as ddlToPhysicalModel in ddl-parser.ts
 */
import type { PhysicalModelPayload } from "@/components/EditProject/utils/physical-model.builder";
import type { FKAction } from "@/components/EditProject/utils/dbms-config";
import type { IntrospectedTable } from "@/api/db-connections/client";

const generateId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `pid_${crypto.randomUUID()}`;
    }
    return `pid_${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

function parseFKAction(rule: string): FKAction | undefined {
    const upper = rule?.toUpperCase().trim();
    if (!upper) return undefined;
    if (upper === "CASCADE") return "CASCADE";
    if (upper === "SET NULL") return "SET NULL";
    if (upper === "SET DEFAULT") return "SET DEFAULT";
    if (upper === "RESTRICT") return "RESTRICT";
    if (upper === "NO ACTION") return "NO ACTION";
    return undefined;
}

export function introspectToPhysicalModel(
    tables: IntrospectedTable[],
    modelName: string = "Imported Schema",
): PhysicalModelPayload {
    const tableIdMap = new Map<string, string>(); // tableName → tableId
    const columnIdMap = new Map<string, Map<string, string>>(); // tableName → (colName → colId)

    // First pass: assign IDs
    for (const t of tables) {
        const tableId = generateId();
        tableIdMap.set(t.name.toLowerCase(), tableId);
        const colMap = new Map<string, string>();
        for (const c of t.columns) {
            colMap.set(c.name.toLowerCase(), generateId());
        }
        columnIdMap.set(t.name.toLowerCase(), colMap);
    }

    // Second pass: build model tables
    const modelTables = tables.map((t) => {
        const tableId = tableIdMap.get(t.name.toLowerCase())!;
        const colMap = columnIdMap.get(t.name.toLowerCase())!;

        const columns = t.columns.map((c) => {
            const colId = colMap.get(c.name.toLowerCase())!;

            // Find FK for this column (single-column FK)
            const fk = t.foreignKeys.find(
                (fk) =>
                    fk.columns.length === 1 &&
                    fk.columns[0].toLowerCase() === c.name.toLowerCase(),
            );

            let foreignKey:
                | {
                      refTableId: string;
                      refColumnId: string;
                      onDelete?: FKAction;
                      onUpdate?: FKAction;
                  }
                | undefined;

            if (fk) {
                const refTableId = tableIdMap.get(fk.refTable.toLowerCase());
                const refColMap = columnIdMap.get(fk.refTable.toLowerCase());
                const refColId = refColMap?.get(fk.refColumns[0].toLowerCase());
                if (refTableId && refColId) {
                    foreignKey = {
                        refTableId,
                        refColumnId: refColId,
                        onDelete: parseFKAction(fk.onDelete),
                        onUpdate: parseFKAction(fk.onUpdate),
                    };
                }
            }

            return {
                id: colId,
                name: c.name,
                dataType: c.dataType,
                length: c.length,
                nullable: c.isPrimaryKey ? false : c.nullable,
                unique: c.isUnique,
                autoIncrement: c.autoIncrement || undefined,
                defaultValue: c.defaultValue,
                roles: {
                    ...(c.isPrimaryKey ? { primaryKey: true } : {}),
                    ...(foreignKey ? { foreignKey } : {}),
                },
            };
        });

        // Handle composite FKs (multi-column)
        for (const fk of t.foreignKeys) {
            if (fk.columns.length <= 1) continue;
            const refTableId = tableIdMap.get(fk.refTable.toLowerCase());
            const refColMap = columnIdMap.get(fk.refTable.toLowerCase());
            if (!refTableId || !refColMap) continue;

            for (let i = 0; i < fk.columns.length; i++) {
                const col = columns.find(
                    (c) => c.name.toLowerCase() === fk.columns[i].toLowerCase(),
                );
                const refColId = refColMap.get(fk.refColumns[i]?.toLowerCase());
                if (col && refColId && !col.roles?.foreignKey) {
                    col.roles = {
                        ...col.roles,
                        foreignKey: {
                            refTableId,
                            refColumnId: refColId,
                            onDelete: parseFKAction(fk.onDelete),
                            onUpdate: parseFKAction(fk.onUpdate),
                        },
                    };
                }
            }
        }

        const indexes = t.indexes.map((idx) => ({
            id: generateId(),
            name: idx.name,
            type: (idx.type || "BTREE") as "BTREE" | "HASH" | "GIN" | "GIST" | "BRIN",
            columns: idx.columns,
            isUnique: idx.isUnique,
        }));

        return {
            id: tableId,
            name: t.name,
            columns,
            ...(indexes.length > 0 ? { indexes } : {}),
        };
    });

    return {
        model: {
            id: generateId(),
            name: modelName,
            version: 1,
        },
        tables: modelTables,
    };
}
