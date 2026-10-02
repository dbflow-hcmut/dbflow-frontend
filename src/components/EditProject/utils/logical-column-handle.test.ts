/**
 * Verification tests for resolving a logical-table handle to its column.
 * Run with: npx tsx src/components/EditProject/utils/logical-column-handle.test.ts
 */

import { findColumnIndexByHandle } from "./logical-column-handle";

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

const T = "cid_table";

console.log("\n[1] Columns whose id counter matches their position");
{
    const columns = [{ id: `lid_${T}_col_0` }, { id: `lid_${T}_col_1` }, { id: `lid_${T}_col_2` }];
    assert(findColumnIndexByHandle(columns, `lid_${T}_col_0-right`, T) === 0, "col_0 -> 0");
    assert(findColumnIndexByHandle(columns, `lid_${T}_col_2-left`, T) === 2, "col_2 -> 2 (left handle)");
}

console.log("\n[2] DEF-010: after deleting columns the id counter no longer equals the position");
{
    // ISSUE after 5 columns were added and the first ones removed: ids col_5..col_7, positions 0..2
    const columns = [{ id: `lid_${T}_col_5` }, { id: `lid_${T}_col_6` }, { id: `lid_${T}_col_7` }];
    assert(findColumnIndexByHandle(columns, `lid_${T}_col_5-right`, T) === 0, "col_5 is the first column (position 0)");
    assert(findColumnIndexByHandle(columns, `lid_${T}_col_7-left`, T) === 2, "col_7 is the third column (position 2)");
    assert(findColumnIndexByHandle(columns, `lid_${T}_col_0-right`, T) === -1, "a deleted column's handle matches nothing");
}

console.log("\n[3] Reordered columns");
{
    const columns = [{ id: `lid_${T}_col_2` }, { id: `lid_${T}_col_0` }, { id: `lid_${T}_col_1` }];
    assert(findColumnIndexByHandle(columns, `lid_${T}_col_0-right`, T) === 1, "col_0 now sits at position 1");
}

console.log("\n[4] Columns without an id use the positional id");
{
    const columns = [{}, {}, {}];
    assert(findColumnIndexByHandle(columns, `lid_${T}_col_1-right`, T) === 1, "lid_<table>_col_<position>");
}

console.log("\n[5] Missing data");
{
    assert(findColumnIndexByHandle(undefined, "x-left", T) === -1, "no columns");
    assert(findColumnIndexByHandle([{ id: "a" }], undefined, T) === -1, "no handle");
    assert(findColumnIndexByHandle([{ id: "a" }], null, T) === -1, "null handle");
}

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
