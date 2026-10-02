/**
 * Verification tests for FK edge cardinality (logical / physical diagrams).
 * Run with: npx tsx src/components/EditProject/utils/edge-cardinality.test.ts
 */

import { getFkSourceCardinality, isColumnAloneUnique, type KeyFlags } from "./edge-cardinality";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
    if (condition) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.error(`  ❌ ${name}`);
        failed++;
    }
}

// issue(journal_id PK/FK, issue_number PK, date_issued PK)
const issue: KeyFlags[] = [{ isKey: true }, { isKey: true }, { isKey: true }];
const journalPk: KeyFlags = { isKey: true };

console.log("\n[1] FK column that is only PART of a composite PK stays 1–N");
assert(isColumnAloneUnique(issue, 0) === false, "journal_id in issue's 3-column PK is not unique on its own");
assert(getFkSourceCardinality(issue, 0, journalPk) === "N", "issue.journal_id -> journal.journal_id is N:1");

console.log("\n[2] FK column that is the whole PK is 1–1 (e.g. ISA child, 1:1)");
const child: KeyFlags[] = [{ isKey: true }, {}, {}];
assert(isColumnAloneUnique(child, 0) === true, "single-column PK column is unique");
assert(getFkSourceCardinality(child, 0, journalPk) === "1", "child.pk -> parent.pk is 1:1");

console.log("\n[3] Plain FK column is N");
const emp: KeyFlags[] = [{ isKey: true }, {}];
assert(getFkSourceCardinality(emp, 1, journalPk) === "N", "non-key FK column -> N");

console.log("\n[4] UNIQUE / candidate key columns are 1–1");
assert(getFkSourceCardinality([{ isKey: true }, { isCandidateKey: true }], 1, journalPk) === "1", "candidate key FK column -> 1");
assert(getFkSourceCardinality([{ isPrimary: true }, { isUnique: true }], 1, { isPrimary: true }) === "1", "UNIQUE FK column (physical) -> 1");

console.log("\n[5] Physical PK flag (`isPrimary`) follows the same rule");
const physIssue: KeyFlags[] = [{ isPrimary: true }, { isPrimary: true }, { isPrimary: true }];
assert(getFkSourceCardinality(physIssue, 0, { isPrimary: true }) === "N", "part of composite physical PK -> N");
assert(getFkSourceCardinality([{ isPrimary: true }], 0, { isPrimary: true }) === "1", "single physical PK column -> 1");

console.log("\n[6] Referenced column must be a key; missing data is N");
assert(getFkSourceCardinality(child, 0, {}) === "N", "referenced column is not a key -> N");
assert(getFkSourceCardinality(undefined, 0, journalPk) === "N", "no columns -> N");
assert(getFkSourceCardinality(child, 9, journalPk) === "N", "index out of range -> N");

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
