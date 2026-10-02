/**
 * Helpers for the handles of a logical table.
 *
 * Each column of a logical table renders two handles whose ids are
 * `<columnId>-left` and `<columnId>-right`, where `columnId` is the column's own
 * `id` (`lid_<tableId>_col_<n>` for columns created by the editor).
 *
 * The `<n>` in the id is only a creation counter: once a column of the table has
 * been deleted (or the columns have been reordered) it no longer equals the
 * column's position in the `columns` array. The position must therefore be looked
 * up by id, never parsed from the id.
 */

export type HandleColumn = { id?: string };

/**
 * Position, in `columns`, of the column that owns `handle`; -1 when none does.
 * `tableId` is only needed for columns without an `id`, whose handles are named
 * `lid_<tableId>_col_<position>`.
 */
export const findColumnIndexByHandle = (
    columns: readonly HandleColumn[] | undefined,
    handle: string | null | undefined,
    tableId?: string,
): number => {
    if (!columns || !handle) return -1;
    const columnId = handle.replace(/-(left|right)$/, "");
    return columns.findIndex(
        (column, index) => (column.id ?? `lid_${tableId}_col_${index}`) === columnId,
    );
};
