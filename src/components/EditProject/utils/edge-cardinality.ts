/**
 * Cardinality of an FK edge in the logical / physical diagram.
 *
 * An FK edge goes from the FK column (source) to the referenced key (target).
 * The target side is always "1". The source side is "1" (i.e. a 1–1 edge) only
 * when the FK column ALONE identifies at most one row of its table:
 *   - it is UNIQUE, or a candidate key, or
 *   - it is the ONLY column of the table's primary key (e.g. ISA child PK = FK).
 *
 * A column that is merely PART of a composite primary key (e.g. `journal_id` in
 * `issue(journal_id, issue_number, date_issued)`) does not make the FK unique:
 * many issues share the same journal, so the edge stays 1–N.
 */

export type KeyFlags = {
    /** logical PK */
    isKey?: boolean;
    /** physical PK */
    isPrimary?: boolean;
    isCandidateKey?: boolean;
    isUnique?: boolean;
};

const isPrimaryColumn = (column: KeyFlags): boolean =>
    Boolean(column.isKey || column.isPrimary);

/** True when `columns[index]` alone uniquely identifies a row of its table. */
export const isColumnAloneUnique = (
    columns: readonly KeyFlags[] | undefined,
    index: number,
): boolean => {
    const column = columns?.[index];
    if (!columns || !column) return false;
    if (column.isUnique || column.isCandidateKey) return true;
    return isPrimaryColumn(column) && columns.filter(isPrimaryColumn).length === 1;
};

/** True when the column takes part in any key (PK / candidate key / unique). */
export const isKeyColumn = (column: KeyFlags | undefined): boolean =>
    Boolean(column && (isPrimaryColumn(column) || column.isCandidateKey || column.isUnique));

/**
 * Cardinality of the FK (source) end of an FK edge: "1" for a 1–1 edge,
 * otherwise "N". The referenced (target) key must be a key column.
 */
export const getFkSourceCardinality = (
    fkColumns: readonly KeyFlags[] | undefined,
    fkColumnIndex: number,
    referencedColumn: KeyFlags | undefined,
): "1" | "N" =>
    isColumnAloneUnique(fkColumns, fkColumnIndex) && isKeyColumn(referencedColumn)
        ? "1"
        : "N";
