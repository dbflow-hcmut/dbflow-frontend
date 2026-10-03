/**
 * Verification tests for FD cleanup and decomposition owner selection.
 * Run with: npx tsx src/components/EditProject/utils/fd-cleanup.test.ts
 */

import { choosePkOwner, removeColumnFromFDs, renameColumnInFDs } from "./fd-cleanup";

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

console.log("\n[1] DEF-024: deleting a column removes it from the FDs");
{
    const fds = [
        { id: "f1", left: ["journal_id"], right: ["name"] },
        { id: "f2", left: ["a", "b"], right: ["c", "d"] },
        { id: "f3", left: [], right: [] },
    ];
    const afterName = removeColumnFromFDs(fds, "name");
    assert(!afterName.some((f) => f.id === "f1"), "FD whose dependent side becomes empty is dropped");
    assert(afterName.some((f) => f.id === "f3"), "FD still being edited (empty sides) is kept");
    const afterC = removeColumnFromFDs(fds, "c");
    assert(JSON.stringify(afterC.find((f) => f.id === "f2")) === JSON.stringify({ id: "f2", left: ["a", "b"], right: ["d"] }), "column removed from a multi-column side");
    const afterA = removeColumnFromFDs(fds, "a");
    assert(JSON.stringify(afterA.find((f) => f.id === "f2")?.left) === JSON.stringify(["b"]), "column removed from the determinant");
    assert(removeColumnFromFDs(fds, "zzz").length === 3, "unrelated column leaves all FDs");
    assert(removeColumnFromFDs(undefined, "x").length === 0, "undefined FDs");
    assert(removeColumnFromFDs([{ id: "f", left: ["Name"], right: ["x"] }], "name", true).length === 0, "case-insensitive match for physical names");
    assert(removeColumnFromFDs([{ id: "f", left: ["Name"], right: ["x"] }], "name").length === 1, "case-sensitive by default (ids)");
}

console.log("\n[2] Renaming a physical column keeps the FD attached");
{
    const out = renameColumnInFDs([{ id: "f", left: ["writer_id"], right: ["writer_name", "address"] }], "Writer_Name", "name");
    assert(JSON.stringify(out[0].right) === JSON.stringify(["name", "address"]), "renamed on the dependent side");
    assert(JSON.stringify(out[0].left) === JSON.stringify(["writer_id"]), "other refs untouched");
}

console.log("\n[3] DEF-023: owner of a shared PK column after decomposition");
{
    const col = (name: string, primaryKey = false) => ({ name, roles: { primaryKey } });
    // ARTICLE_WRITER decomposition: both sub-tables have 3 columns
    const t1 = { id: "t1", columns: [col("article_id", true), col("fee"), col("writer_id", true)] };
    const t2 = { id: "t2", columns: [col("writer_address"), col("writer_id", true), col("writer_name")] };
    assert(choosePkOwner([t1, t2])?.id === "t2", "table whose PK is the column alone wins over the composite-PK table (equal size)");
    assert(choosePkOwner([t2, t1])?.id === "t2", "independent of order");
    const small = { id: "s", columns: [col("x", true), col("y", true)] };
    const big = { id: "b", columns: [col("x", true), col("p"), col("q"), col("r")] };
    assert(choosePkOwner([small, big])?.id === "b", "single-column PK wins even if the table is larger");
    const a = { id: "a", columns: [col("k", true), col("m", true)] };
    const b = { id: "b2", columns: [col("k", true), col("m", true), col("n")] };
    assert(choosePkOwner([b, a])?.id === "a", "otherwise the table with fewer columns");
    assert(choosePkOwner([t1])?.id === "t1", "single candidate");
    assert(choosePkOwner<typeof t1>([]) === null, "no candidate");
}

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
