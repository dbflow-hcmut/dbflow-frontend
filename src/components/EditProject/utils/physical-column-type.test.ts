/**
 * Verification tests for physical column type helpers.
 * Run with: npx tsx src/components/EditProject/utils/physical-column-type.test.ts
 */

import {
    collectReferencingColumns,
    getReferencingColumnType,
    isTypingValidLength,
    isValidTypeLength,
} from "./physical-column-type";

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

console.log("\n[1] DEF-014: length validation");
{
    assert(isValidTypeLength("255"), "255 is valid");
    assert(isValidTypeLength("max"), "max is valid for length types");
    assert(isValidTypeLength(undefined), "empty is valid");
    assert(!isValidTypeLength("abc"), "abc is invalid");
    assert(!isValidTypeLength("-5"), "-5 is invalid");
    assert(!isValidTypeLength("0"), "0 is invalid");
    assert(!isValidTypeLength("1.5"), "1.5 is invalid");
    assert(isValidTypeLength("10,2", true), "10,2 is valid precision");
    assert(!isValidTypeLength("2,10", true), "scale larger than precision is invalid");
    assert(!isValidTypeLength("10,2", false), "p,s is invalid for a length type");
    assert(!isValidTypeLength("max", true), "max is invalid for precision types");
}

console.log("\n[2] DEF-014: typing filter");
{
    assert(isTypingValidLength("", false), "empty");
    assert(isTypingValidLength("25", false), "digits");
    assert(!isTypingValidLength("a", false), "letter rejected");
    assert(!isTypingValidLength("-", false), "minus rejected");
    assert(isTypingValidLength("ma", false), "partial max");
    assert(isTypingValidLength("10,", true), "partial precision");
    assert(!isTypingValidLength("10,", false), "comma rejected for length types");
}

console.log("\n[3] FK column type for a referenced auto-increment column");
{
    assert(getReferencingColumnType("serial") === "integer", "serial -> integer");
    assert(getReferencingColumnType("BIGSERIAL") === "bigint", "bigserial -> bigint");
    assert(getReferencingColumnType("varchar") === "varchar", "other types unchanged");
    assert(getReferencingColumnType(undefined) === undefined, "undefined");
}

console.log("\n[4] Referencing columns follow FK edges transitively");
{
    const edges = [
        { type: "relation-table-edge", source: "issue", sourceHandle: "journal_id", target: "journal", targetHandle: "journal_id" },
        { type: "relation-table-edge", source: "article", sourceHandle: "journal_id", target: "issue", targetHandle: "journal_id" },
        { type: "relation-table-edge", source: "article", sourceHandle: "issue_number", target: "issue", targetHandle: "issue_number" },
        { type: "other", source: "x", sourceHandle: "a", target: "journal", targetHandle: "journal_id" },
    ];
    const refs = collectReferencingColumns(edges, "journal", "journal_id");
    assert(refs.length === 2, "issue.journal_id and article.journal_id");
    assert(refs.some((r) => r.tableId === "article" && r.columnName === "journal_id"), "transitive reference found");
    assert(collectReferencingColumns(edges, "issue", "issue_number").length === 1, "single reference");
    assert(collectReferencingColumns(edges, "article", "journal_id").length === 0, "no referencing columns");

    const cycle = [
        { type: "relation-table-edge", source: "a", sourceHandle: "x", target: "a", targetHandle: "x" },
    ];
    assert(collectReferencingColumns(cycle, "a", "x").length === 0, "self reference does not loop");
}

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
