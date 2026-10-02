/**
 * Helpers for the data type of a physical-table column: validation of the length/precision
 * input and propagation of a type change to the foreign-key columns that reference the column.
 */

// auto-incrementing pseudo types hold an integer in the referencing column
const SERIAL_TO_BASE_TYPE: Record<string, string> = {
    smallserial: "smallint",
    serial: "integer",
    bigserial: "bigint",
};

/** Type a foreign-key column must use to reference a column of `type` (serial -> integer, ...). */
export const getReferencingColumnType = (type: string | undefined): string | undefined => {
    if (!type) return type;
    return SERIAL_TO_BASE_TYPE[type.trim().toLowerCase()] ?? type;
};

/**
 * Whether `value` can still become a valid length while the user types:
 * digits (`255`), `max` (SQL Server), and for precision types `10,2`.
 */
export const isTypingValidLength = (value: string, hasPrecision: boolean): boolean => {
    if (value === "") return true;
    if (/^[0-9]+$/.test(value)) return true;
    if (/^m(a(x)?)?$/i.test(value)) return !hasPrecision;
    return hasPrecision && /^[0-9]+,[0-9]*$/.test(value);
};

/** Whether a stored length is complete and valid: positive integer, `max`, or `p,s` for precision types. */
export const isValidTypeLength = (value: string | undefined, hasPrecision = false): boolean => {
    if (value === undefined || value === "") return true;
    const text = String(value).trim();
    if (/^max$/i.test(text)) return !hasPrecision;
    if (/^[0-9]+$/.test(text)) return parseInt(text, 10) > 0;
    if (hasPrecision) {
        const match = text.match(/^([0-9]+),([0-9]+)$/);
        return Boolean(match) && parseInt(match![1], 10) > 0 && parseInt(match![2], 10) <= parseInt(match![1], 10);
    }
    return false;
};

type FkEdge = {
    type?: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
};

const handleToColumnName = (handle?: string | null) => (handle ?? "").replace(/-(source|target)$/, "");

/**
 * Columns that (directly or through a chain of foreign keys) reference `tableId.columnName`.
 * In a physical edge the source is the FK column and the target is the referenced column.
 */
export const collectReferencingColumns = (
    edges: readonly FkEdge[],
    tableId: string,
    columnName: string,
): Array<{ tableId: string; columnName: string }> => {
    const result: Array<{ tableId: string; columnName: string }> = [];
    const visited = new Set<string>([`${tableId}\u0000${columnName}`]);
    const queue = [{ tableId, columnName }];

    while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of edges) {
            if (edge.type !== "relation-table-edge") continue;
            if (edge.target !== current.tableId || handleToColumnName(edge.targetHandle) !== current.columnName) continue;
            const next = { tableId: edge.source, columnName: handleToColumnName(edge.sourceHandle) };
            const key = `${next.tableId}\u0000${next.columnName}`;
            if (visited.has(key)) continue;
            visited.add(key);
            result.push(next);
            queue.push(next);
        }
    }

    return result;
};
