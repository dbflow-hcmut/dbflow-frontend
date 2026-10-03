/**
 * Helpers that keep a table's functional dependencies (FD) consistent when its columns change.
 *
 * Logical FDs reference column ids, physical FDs reference column names, so callers pass the
 * reference that identifies the column in their level.
 */

export type FDLike = { id: string; left: string[]; right: string[] };

const sameRef = (a: string, b: string, caseInsensitive: boolean) =>
    caseInsensitive ? a.trim().toLowerCase() === b.trim().toLowerCase() : a === b;

/**
 * Removes a deleted column from every FD. An FD that loses its whole determinant or its whole
 * dependent side no longer says anything and is dropped; FDs that never referenced the column are
 * returned untouched (so FDs still being edited, with an empty side, are kept).
 */
export const removeColumnFromFDs = <T extends FDLike>(
    fds: readonly T[] | undefined,
    columnRef: string,
    caseInsensitive = false,
): T[] => {
    const result: T[] = [];
    for (const fd of fds ?? []) {
        const touches = [...fd.left, ...fd.right].some((ref) => sameRef(ref, columnRef, caseInsensitive));
        if (!touches) {
            result.push(fd);
            continue;
        }
        const left = fd.left.filter((ref) => !sameRef(ref, columnRef, caseInsensitive));
        const right = fd.right.filter((ref) => !sameRef(ref, columnRef, caseInsensitive));
        if (left.length === 0 || right.length === 0) continue;
        result.push({ ...fd, left, right });
    }
    return result;
};

/** Renames a column in every FD (physical FDs reference columns by name). */
export const renameColumnInFDs = <T extends FDLike>(
    fds: readonly T[] | undefined,
    oldName: string,
    newName: string,
): T[] => {
    const rename = (refs: string[]) => refs.map((ref) => (sameRef(ref, oldName, true) ? newName : ref));
    return (fds ?? []).map((fd) => ({ ...fd, left: rename(fd.left), right: rename(fd.right) }));
};

/**
 * Chooses which sub-table "owns" a column after a normalization decomposition, i.e. the table other
 * sub-tables must reference. Candidates are the sub-tables where the column is a primary key.
 *
 * A table whose primary key is exactly that column is the real owner (a foreign key may only reference
 * a unique column); a table where it is just one part of a composite key is only a fallback. Ties are
 * broken by the fewest columns (the dimension table, not the join table), then by order.
 */
export const choosePkOwner = <T extends { columns: ReadonlyArray<{ roles?: { primaryKey?: boolean } }> }>(
    candidates: readonly T[],
): T | null => {
    if (candidates.length === 0) return null;
    const pkSize = (t: T) => t.columns.filter((c) => c.roles?.primaryKey).length;
    return candidates.reduce((best, next) => {
        const bestSingle = pkSize(best) === 1;
        const nextSingle = pkSize(next) === 1;
        if (bestSingle !== nextSingle) return bestSingle ? best : next;
        return next.columns.length < best.columns.length ? next : best;
    });
};
