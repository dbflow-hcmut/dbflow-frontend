/**
 * Verification tests for the conceptual linter rules about names and relationships.
 * Run with: npx tsx src/components/EditProject/utils/schema-linter.test.ts
 */

import { runConceptualLinter, type ConceptualLintPayload } from "./schema-linter";

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

const attr = (id: string, name: string, isKey = false) => ({ id, name, kind: "simple", isKey });
const entity = (id: string, name: string) => ({
    id,
    name,
    kind: "strong" as const,
    attributes: [attr(`${id}_a`, `${id}_id`, true)],
});

const lint = (payload: ConceptualLintPayload) => runConceptualLinter(payload).issues;
const rules = (payload: ConceptualLintPayload) => lint(payload).map((i) => i.ruleId);

console.log("\n[1] C015 – empty names are an error");
{
    const issues = lint({ entities: [entity("e1", "   ")], relationships: [] });
    const c015 = issues.filter((i) => i.ruleId === "C015");
    assert(c015.length === 1 && c015[0].severity === "error", "blank entity name -> C015 error");
    assert(c015[0].targetId === "e1", "targets the entity id (so the UI can focus it)");

    const rel = lint({
        entities: [entity("e1", "A"), entity("e2", "B")],
        relationships: [{ id: "r1", name: "", type: "association", ends: [{ entityId: "e1" }, { entityId: "e2" }] }],
    }).filter((i) => i.ruleId === "C015");
    assert(rel.length === 1, "empty relationship name -> C015");

    const attrIssues = lint({
        entities: [{ ...entity("e1", "A"), attributes: [attr("a1", ""), attr("a2", "ok")] }],
        relationships: [],
    }).filter((i) => i.ruleId === "C015");
    assert(attrIssues.length === 1 && attrIssues[0].targetId === "a1", "empty attribute name -> C015");
}

console.log("\n[2] C016 – special characters in entity names are a warning");
{
    const bad = lint({ entities: [entity("e1", "###")], relationships: [] }).filter((i) => i.ruleId === "C016");
    assert(bad.length === 1 && bad[0].severity === "warning", "'###' -> C016 warning");
    for (const ok of ["Journal", "Tạp chí", "order_item", "Order-Item 2", "Bài báo"]) {
        assert(!rules({ entities: [entity("e1", ok)], relationships: [] }).includes("C016"), `'${ok}' is accepted`);
    }
    const noCrossFire = lint({ entities: [entity("e1", "")], relationships: [] }).filter((i) => i.ruleId === "C016");
    assert(noCrossFire.length === 0, "empty name is reported only by C015");
}

console.log("\n[3] Existing rules still report");
{
    const dup = rules({ entities: [entity("e1", "Issue"), entity("e2", "issue")], relationships: [] });
    assert(dup.includes("C004"), "duplicate entity name -> C004");
    const oneEnd = rules({
        entities: [entity("e1", "A")],
        relationships: [{ id: "r1", name: "HAS", type: "association", ends: [{ entityId: "e1" }] }],
    });
    assert(oneEnd.includes("C005"), "relationship with one end (e.g. after deleting its entity) -> C005");
}

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
