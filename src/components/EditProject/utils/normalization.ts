/**
 * normalization.ts
 *
 * Pure-logic normalization engine for relational schemas.
 * Analyses functional dependencies (FDs) against a table's columns and keys
 * to determine the current normal form (1NF / 2NF / 3NF / BCNF) and
 * produce lossless decompositions when violations are found.
 *
 * Works on both logical and physical schema levels.
 *
 * Terminology:
 *  - Attribute   = column name (string)
 *  - FD          = { left: Set<string>, right: Set<string> }
 *  - Superkey    = attribute set whose closure equals all attributes
 *  - Candidate key = minimal superkey (no proper subset is a superkey)
 *  - Prime attribute = attribute that is part of at least one candidate key
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════════════════════

export type FD = {
    left: string[];
    right: string[];
};

/** A single violation found during normalization analysis. */
export type NormalizationViolation = {
    /** Which normal form is violated */
    normalForm: "1NF" | "2NF" | "3NF" | "BCNF";
    /** The offending FD */
    fd: FD;
    /** Human-readable explanation */
    message: string;
    /** For 2NF: which part of the key causes partial dependency */
    partialKeySubset?: string[];
    /** For 3NF: the transitive non-prime determinant */
    transitiveDeterminant?: string[];
};

/** Result of analysing a single table. */
export type NormalizationResult = {
    tableName: string;
    /** All columns in the table */
    attributes: string[];
    /** FDs as provided by the user */
    originalFDs: FD[];
    /** Minimal cover (canonical cover) of the FDs */
    minimalCover: FD[];
    /** All candidate keys found */
    candidateKeys: string[][];
    /** Set of prime attributes (union of all candidate keys) */
    primeAttributes: string[];
    /** Highest normal form the table satisfies: "1NF" | "2NF" | "3NF" | "BCNF" */
    currentNF: "1NF" | "2NF" | "3NF" | "BCNF";
    /** All violations found (empty if BCNF) */
    violations: NormalizationViolation[];
    /** Suggested decomposition tables (only if violations exist) */
    decomposition: DecomposedTable[];
};

/** A table produced by decomposition. */
export type DecomposedTable = {
    /** Suggested name */
    name: string;
    /** Column names */
    attributes: string[];
    /** Primary key columns */
    primaryKey: string[];
    /** FDs that belong to this sub-table */
    fds: FD[];
    /** Whether this is a "key preservation" table added to ensure lossless join */
    isKeyPreservation?: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Set utilities (using sorted-string arrays for determinism)
// ═══════════════════════════════════════════════════════════════════════════════

/** Normalise to lowercase-trimmed sorted unique array. */
const norm = (attrs: string[]): string[] =>
    [...new Set(attrs.map((a) => a.trim().toLowerCase()))].sort();

const setEq = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);

const isSubset = (sub: string[], sup: string[]): boolean => {
    const supSet = new Set(sup);
    return sub.every((s) => supSet.has(s));
};

const isProperSubset = (sub: string[], sup: string[]): boolean =>
    sub.length < sup.length && isSubset(sub, sup);

const union = (...sets: string[][]): string[] =>
    norm(sets.flat());

const difference = (a: string[], b: string[]): string[] => {
    const bSet = new Set(b);
    return a.filter((x) => !bSet.has(x));
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Core algorithms
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute the attribute closure X⁺ under a set of FDs.
 *
 * Algorithm (standard textbook):
 *   result = X
 *   repeat
 *     for each FD (Y → Z) in fds
 *       if Y ⊆ result then result = result ∪ Z
 *   until result does not change
 */
export const attributeClosure = (x: string[], fds: FD[]): string[] => {
    let result = norm(x);
    let changed = true;
    while (changed) {
        changed = false;
        for (const fd of fds) {
            const left = norm(fd.left);
            const right = norm(fd.right);
            if (isSubset(left, result)) {
                const merged = union(result, right);
                if (merged.length > result.length) {
                    result = merged;
                    changed = true;
                }
            }
        }
    }
    return result;
};

/**
 * Check whether a set of attributes is a superkey.
 */
export const isSuperkey = (attrs: string[], allAttributes: string[], fds: FD[]): boolean => {
    const closure = attributeClosure(attrs, fds);
    return isSubset(norm(allAttributes), closure);
};

/**
 * Find all candidate keys of a relation.
 *
 * Strategy:
 *  1. Classify attributes as:
 *     - L-only: appear only on LHS of some FD, never on RHS → must be in every key
 *     - R-only: appear only on RHS, never on LHS → never in any key
 *     - Both: appear on both sides
 *     - Neither: not in any FD → must be in every key (cannot be determined)
 *  2. Start with "must-be-in-key" = L-only ∪ Neither
 *  3. If that set is already a superkey → it's the only candidate key
 *  4. Otherwise, try adding subsets of "Both" attributes incrementally (BFS by size)
 */
export const findCandidateKeys = (allAttributes: string[], fds: FD[]): string[][] => {
    const all = norm(allAttributes);
    if (all.length === 0) return [[]];

    // If no FDs, the only candidate key is all attributes
    if (fds.length === 0) return [all];

    // Classify attributes
    const onLeft = new Set<string>();
    const onRight = new Set<string>();
    for (const fd of fds) {
        for (const a of norm(fd.left)) onLeft.add(a);
        for (const a of norm(fd.right)) onRight.add(a);
    }

    const mustBeInKey: string[] = []; // L-only + Neither
    const neverInKey: string[] = [];  // R-only
    const maybe: string[] = [];       // Both sides

    for (const a of all) {
        const inL = onLeft.has(a);
        const inR = onRight.has(a);
        if (inL && !inR) mustBeInKey.push(a);
        else if (!inL && inR) neverInKey.push(a);
        else if (inL && inR) maybe.push(a);
        else mustBeInKey.push(a); // neither side → must be in key
    }

    const base = norm(mustBeInKey);

    // Check if base alone is a superkey
    if (isSuperkey(base, all, fds)) {
        return [base];
    }

    // BFS: try adding subsets of `maybe` to base, smallest first
    const candidateKeys: string[][] = [];

    const generateSubsets = (arr: string[], size: number): string[][] => {
        const results: string[][] = [];
        const combine = (start: number, current: string[]) => {
            if (current.length === size) {
                results.push([...current]);
                return;
            }
            for (let i = start; i < arr.length; i++) {
                current.push(arr[i]);
                combine(i + 1, current);
                current.pop();
            }
        };
        combine(0, []);
        return results;
    };

    // Cap to avoid combinatorial explosion
    const maxMaybeSize = Math.min(maybe.length, 10);

    for (let size = 1; size <= maxMaybeSize; size++) {
        const subsets = generateSubsets(maybe, size);
        for (const subset of subsets) {
            const candidate = union(base, subset);

            // Skip if a previously found candidate key is a subset (this can't be minimal)
            if (candidateKeys.some((ck) => isSubset(ck, candidate))) continue;

            if (isSuperkey(candidate, all, fds)) {
                candidateKeys.push(candidate);
            }
        }

        // If we found keys at this size, no need to go larger
        // (all larger sets would be supersets of these)
        if (candidateKeys.length > 0) break;
    }

    // Fallback: if nothing found (shouldn't happen), use all attributes
    if (candidateKeys.length === 0) {
        candidateKeys.push(all);
    }

    return candidateKeys;
};

/**
 * Compute the minimal cover (canonical cover) of a set of FDs.
 *
 * Algorithm:
 *  1. Split RHS: replace X → {A, B} with X → A, X → B
 *  2. Remove extraneous LHS attributes: for each FD X → A,
 *     for each attribute B in X, check if (X - {B})⁺ contains A.
 *     If yes, remove B from X.
 *  3. Remove redundant FDs: for each FD X → A,
 *     compute X⁺ under (all FDs - this FD). If A ∈ X⁺, remove this FD.
 *  4. Merge: combine FDs with identical LHS.
 */
export const minimalCover = (fds: FD[]): FD[] => {
    // Step 1: Split RHS into singletons
    let singles: { left: string[]; right: string }[] = [];
    for (const fd of fds) {
        const left = norm(fd.left);
        for (const r of norm(fd.right)) {
            // Skip trivial FDs where right is already in left
            if (!left.includes(r)) {
                singles.push({ left: [...left], right: r });
            }
        }
    }

    // Step 2: Remove extraneous LHS attributes
    for (const fd of singles) {
        if (fd.left.length <= 1) continue;
        for (let i = fd.left.length - 1; i >= 0; i--) {
            const reduced = [...fd.left.slice(0, i), ...fd.left.slice(i + 1)];
            const closure = attributeClosure(reduced, singles.map((s) => ({
                left: s.left,
                right: [s.right],
            })));
            if (closure.includes(fd.right)) {
                fd.left = reduced;
            }
        }
    }

    // Step 3: Remove redundant FDs
    const remaining: typeof singles = [];
    for (let i = 0; i < singles.length; i++) {
        const others = [...remaining, ...singles.slice(i + 1)];
        const otherFDs = others.map((s) => ({ left: s.left, right: [s.right] }));
        const closure = attributeClosure(singles[i].left, otherFDs);
        if (!closure.includes(singles[i].right)) {
            remaining.push(singles[i]);
        }
    }

    // Step 4: Merge FDs with same LHS
    const merged = new Map<string, { left: string[]; right: string[] }>();
    for (const fd of remaining) {
        const key = norm(fd.left).join(",");
        if (merged.has(key)) {
            merged.get(key)!.right = union(merged.get(key)!.right, [fd.right]);
        } else {
            merged.set(key, { left: norm(fd.left), right: [fd.right] });
        }
    }

    return Array.from(merged.values()).map((fd) => ({
        left: fd.left,
        right: norm(fd.right),
    }));
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Normal form checks
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check 2NF violations.
 *
 * Violation: there exists a non-prime attribute A and a proper subset Y of
 * some candidate key such that Y → A (partial dependency).
 */
const check2NF = (
    allAttributes: string[],
    fds: FD[],
    candidateKeys: string[][],
    primeAttrs: Set<string>,
): NormalizationViolation[] => {
    const violations: NormalizationViolation[] = [];
    const nonPrime = norm(allAttributes).filter((a) => !primeAttrs.has(a));
    if (nonPrime.length === 0) return [];

    for (const fd of fds) {
        const left = norm(fd.left);
        const right = norm(fd.right);

        // Check each non-prime attribute in RHS
        for (const a of right) {
            if (primeAttrs.has(a)) continue; // skip prime attrs in RHS

            // Check if left is a proper subset of any candidate key
            for (const ck of candidateKeys) {
                if (isProperSubset(left, ck)) {
                    violations.push({
                        normalForm: "2NF",
                        fd: { left: fd.left, right: [a] },
                        message: `Partial dependency: {${left.join(", ")}} → ${a}. ` +
                            `{${left.join(", ")}} is a proper subset of candidate key {${ck.join(", ")}}, ` +
                            `and "${a}" is a non-prime attribute.`,
                        partialKeySubset: left,
                    });
                    break; // one candidate key match is enough
                }
            }
        }
    }

    return violations;
};

/**
 * Check 3NF violations.
 *
 * Violation: for FD X → A, X is not a superkey AND A is not a prime attribute.
 * (This catches both partial deps from 2NF and transitive deps.)
 * We only report violations NOT already covered by 2NF (i.e., transitive deps).
 */
const check3NF = (
    allAttributes: string[],
    fds: FD[],
    candidateKeys: string[][],
    primeAttrs: Set<string>,
    violations2NF: NormalizationViolation[],
): NormalizationViolation[] => {
    const violations: NormalizationViolation[] = [];

    // Build a set of 2NF violation FD signatures to skip
    const sig2NF = new Set(
        violations2NF.map((v) => `${norm(v.fd.left).join(",")}->${norm(v.fd.right).join(",")}`),
    );

    for (const fd of fds) {
        const left = norm(fd.left);
        const right = norm(fd.right);

        // Check if left is a superkey
        const leftIsSuperkey = isSuperkey(left, allAttributes, fds);
        if (leftIsSuperkey) continue;

        for (const a of right) {
            // If A is prime, 3NF allows it (3NF exception)
            if (primeAttrs.has(a)) continue;
            // Skip if trivial
            if (left.includes(a)) continue;

            const fdSig = `${left.join(",")}->${a}`;
            if (sig2NF.has(fdSig)) continue; // already reported as 2NF

            violations.push({
                normalForm: "3NF",
                fd: { left: fd.left, right: [a] },
                message: `Transitive dependency: {${left.join(", ")}} → ${a}. ` +
                    `{${left.join(", ")}} is not a superkey, ` +
                    `and "${a}" is a non-prime attribute.`,
                transitiveDeterminant: left,
            });
        }
    }

    return violations;
};

/**
 * Check BCNF violations.
 *
 * Violation: for FD X → A, X is not a superkey.
 * (Stricter than 3NF: no exception for prime attributes.)
 * We only report violations NOT already covered by 2NF/3NF.
 */
const checkBCNF = (
    allAttributes: string[],
    fds: FD[],
    violations2NF: NormalizationViolation[],
    violations3NF: NormalizationViolation[],
): NormalizationViolation[] => {
    const violations: NormalizationViolation[] = [];

    const prevSigs = new Set([
        ...violations2NF.map((v) => `${norm(v.fd.left).join(",")}->${norm(v.fd.right).join(",")}`),
        ...violations3NF.map((v) => `${norm(v.fd.left).join(",")}->${norm(v.fd.right).join(",")}`),
    ]);

    for (const fd of fds) {
        const left = norm(fd.left);
        const right = norm(fd.right);

        const leftIsSuperkey = isSuperkey(left, allAttributes, fds);
        if (leftIsSuperkey) continue;

        for (const a of right) {
            if (left.includes(a)) continue; // trivial

            const fdSig = `${left.join(",")}->${a}`;
            if (prevSigs.has(fdSig)) continue;

            violations.push({
                normalForm: "BCNF",
                fd: { left: fd.left, right: [a] },
                message: `BCNF violation: {${left.join(", ")}} → ${a}. ` +
                    `{${left.join(", ")}} is not a superkey.`,
            });
        }
    }

    return violations;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Decomposition
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 3NF decomposition (synthesis algorithm).
 *
 * Algorithm:
 *  1. Compute minimal cover
 *  2. For each FD X → Y in minimal cover, create table (X ∪ Y) with key X
 *  3. If no table contains a candidate key, add a "key preservation" table
 *  4. Remove tables that are subsets of other tables
 *
 * Properties: lossless join + dependency preserving.
 */
export const decompose3NF = (
    tableName: string,
    allAttributes: string[],
    fds: FD[],
    candidateKeys: string[][],
): DecomposedTable[] => {
    const mc = minimalCover(fds);
    const tables: DecomposedTable[] = [];
    let counter = 1;

    // Step 1: one table per FD group in minimal cover
    for (const fd of mc) {
        const left = norm(fd.left);
        const right = norm(fd.right);
        const attrs = union(left, right);

        // Project FDs onto this sub-table
        const projectedFDs = projectFDs(mc, attrs);

        tables.push({
            name: `${tableName}_${counter++}`,
            attributes: attrs,
            primaryKey: left,
            fds: projectedFDs,
        });
    }

    // Step 2: ensure at least one table contains a candidate key
    const hasKeyTable = tables.some((t) =>
        candidateKeys.some((ck) => isSubset(ck, t.attributes)),
    );

    if (!hasKeyTable && candidateKeys.length > 0) {
        const ck = candidateKeys[0]; // pick first candidate key
        tables.push({
            name: `${tableName}_${counter++}`,
            attributes: [...ck],
            primaryKey: [...ck],
            fds: [],
            isKeyPreservation: true,
        });
    }

    // Step 3: remove tables whose attributes are a subset of another table
    const filtered = tables.filter((t, i) =>
        !tables.some((other, j) =>
            i !== j &&
            isSubset(t.attributes, other.attributes) &&
            t.attributes.length < other.attributes.length,
        ),
    );

    return filtered;
};

/**
 * BCNF decomposition.
 *
 * Algorithm:
 *  1. Start with the original relation
 *  2. While some relation R is not in BCNF:
 *     a. Find a violating FD X → Y where X is not a superkey of R
 *     b. Decompose R into R1 = (X ∪ Y) and R2 = (R - Y) ∪ X
 *     c. Replace R with R1 and R2
 *
 * Properties: lossless join (may NOT preserve all FDs).
 */
export const decomposeBCNF = (
    tableName: string,
    allAttributes: string[],
    fds: FD[],
): DecomposedTable[] => {
    type Relation = { attrs: string[]; fds: FD[] };

    const relations: Relation[] = [{
        attrs: norm(allAttributes),
        fds: projectFDs(fds, norm(allAttributes)),
    }];

    let changed = true;
    let maxIter = 50; // safety limit
    while (changed && maxIter-- > 0) {
        changed = false;
        for (let i = 0; i < relations.length; i++) {
            const rel = relations[i];
            const violation = findBCNFViolation(rel.attrs, rel.fds);
            if (!violation) continue;

            const left = norm(violation.left);
            const right = norm(violation.right);

            // R1 = X ∪ Y (the dependency table)
            const r1Attrs = union(left, right);
            const r1FDs = projectFDs(rel.fds, r1Attrs);

            // R2 = (R - Y) ∪ X (the remainder)
            const r2Attrs = union(difference(rel.attrs, right), left);
            const r2FDs = projectFDs(rel.fds, r2Attrs);

            // Replace R with R1 and R2
            relations.splice(i, 1, { attrs: r1Attrs, fds: r1FDs }, { attrs: r2Attrs, fds: r2FDs });
            changed = true;
            break; // restart loop
        }
    }

    return relations.map((rel, i) => {
        const keys = findCandidateKeys(rel.attrs, rel.fds);
        return {
            name: `${tableName}_${i + 1}`,
            attributes: rel.attrs,
            primaryKey: keys[0] ?? rel.attrs,
            fds: rel.fds,
        };
    });
};

/** Find a single BCNF-violating FD in a relation. */
const findBCNFViolation = (attrs: string[], fds: FD[]): FD | null => {
    for (const fd of fds) {
        const left = norm(fd.left);
        const right = difference(norm(fd.right), left); // non-trivial part
        if (right.length === 0) continue;
        if (!isSuperkey(left, attrs, fds)) {
            return { left, right };
        }
    }
    return null;
};

/**
 * Project a set of FDs onto a subset of attributes.
 * Only keeps FDs where both LHS and RHS are subsets of the given attributes.
 */
const projectFDs = (fds: FD[], attrs: string[]): FD[] => {
    const result: FD[] = [];
    for (const fd of fds) {
        const left = norm(fd.left);
        const right = norm(fd.right).filter((a) => attrs.includes(a));
        if (left.every((a) => attrs.includes(a)) && right.length > 0) {
            const nonTrivialRight = difference(right, left);
            if (nonTrivialRight.length > 0) {
                result.push({ left, right: nonTrivialRight });
            }
        }
    }
    return result;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Main analysis function
// ═══════════════════════════════════════════════════════════════════════════════

export type AnalyzeTableInput = {
    tableName: string;
    columns: string[];
    /** Columns marked as primary key */
    primaryKey: string[];
    /** Additional candidate keys (optional) */
    candidateKeys?: string[][];
    /** Functional dependencies defined by user */
    functionalDependencies: FD[];
};

/**
 * Analyse a single table for normalization.
 *
 * @returns Full analysis result including current NF, violations, and decomposition suggestion.
 */
export const analyzeTable = (input: AnalyzeTableInput): NormalizationResult => {
    const allAttrs = norm(input.columns);
    const fds = input.functionalDependencies.filter(
        (fd) => fd.left.length > 0 && fd.right.length > 0,
    );

    // Compute minimal cover
    const mc = minimalCover(fds);

    // Find candidate keys
    // Start with user-declared PK + any extra candidate keys
    let candidateKeys: string[][];
    if (fds.length > 0) {
        candidateKeys = findCandidateKeys(allAttrs, mc);
    } else {
        // No FDs → the only candidate key is whatever user declared as PK (or all attrs)
        candidateKeys = input.primaryKey.length > 0
            ? [norm(input.primaryKey)]
            : [allAttrs];
    }

    // Prime attributes
    const primeAttrs = new Set<string>();
    for (const ck of candidateKeys) {
        for (const a of ck) primeAttrs.add(a);
    }

    // If no FDs, the table is trivially in BCNF
    if (mc.length === 0) {
        return {
            tableName: input.tableName,
            attributes: allAttrs,
            originalFDs: fds,
            minimalCover: mc,
            candidateKeys,
            primeAttributes: [...primeAttrs].sort(),
            currentNF: "BCNF",
            violations: [],
            decomposition: [],
        };
    }

    // Check normal forms (cumulative)
    const violations2NF = check2NF(allAttrs, mc, candidateKeys, primeAttrs);
    const violations3NF = check3NF(allAttrs, mc, candidateKeys, primeAttrs, violations2NF);
    const violationsBCNF = checkBCNF(allAttrs, mc, violations2NF, violations3NF);

    const allViolations = [...violations2NF, ...violations3NF, ...violationsBCNF];

    // Determine current NF
    let currentNF: "1NF" | "2NF" | "3NF" | "BCNF";
    if (violations2NF.length > 0) {
        currentNF = "1NF"; // has 2NF violations → only satisfies 1NF
    } else if (violations3NF.length > 0) {
        currentNF = "2NF"; // has 3NF violations → only satisfies 2NF
    } else if (violationsBCNF.length > 0) {
        currentNF = "3NF"; // has BCNF violations → only satisfies 3NF
    } else {
        currentNF = "BCNF";
    }

    // Generate decomposition if not in 3NF
    let decomposition: DecomposedTable[] = [];
    if (currentNF === "1NF" || currentNF === "2NF") {
        // Not in 3NF → use 3NF synthesis (preserves dependencies + lossless)
        decomposition = decompose3NF(input.tableName, allAttrs, mc, candidateKeys);
    } else if (currentNF === "3NF") {
        // In 3NF but not BCNF → offer BCNF decomposition (lossless, may lose deps)
        decomposition = decomposeBCNF(input.tableName, allAttrs, mc);
    }

    return {
        tableName: input.tableName,
        attributes: allAttrs,
        originalFDs: fds,
        minimalCover: mc,
        candidateKeys,
        primeAttributes: [...primeAttrs].sort(),
        currentNF,
        violations: allViolations,
        decomposition,
    };
};

/**
 * Analyse all tables in a logical or physical schema.
 *
 * @param tables - Array of table data with columns, keys, and FDs
 * @returns Array of NormalizationResult, one per table
 */
export const analyzeSchema = (
    tables: AnalyzeTableInput[],
): NormalizationResult[] => {
    return tables.map(analyzeTable);
};
