/**
 * Quick verification tests for the normalization engine.
 * Run with: npx tsx src/components/EditProject/utils/normalization.test.ts
 */

import {
    attributeClosure,
    findCandidateKeys,
    minimalCover,
    isSuperkey,
    analyzeTable,
    decompose3NF,
    decomposeBCNF,
    type FD,
} from "./normalization";

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

function arrEq(a: string[], b: string[]): boolean {
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n🧮 Attribute Closure");

{
    // R(A,B,C,D), FDs: A→B, B→C
    const fds: FD[] = [
        { left: ["A"], right: ["B"] },
        { left: ["B"], right: ["C"] },
    ];
    const closure = attributeClosure(["A"], fds);
    assert(arrEq(closure, ["a", "b", "c"]), "{A}⁺ = {A,B,C}");
}

{
    // R(A,B,C,D,E), FDs: AB→C, C→D, D→E
    const fds: FD[] = [
        { left: ["A", "B"], right: ["C"] },
        { left: ["C"], right: ["D"] },
        { left: ["D"], right: ["E"] },
    ];
    const closure = attributeClosure(["A", "B"], fds);
    assert(arrEq(closure, ["a", "b", "c", "d", "e"]), "{A,B}⁺ = {A,B,C,D,E}");
}

{
    // Single attribute, no FDs
    const closure = attributeClosure(["X"], []);
    assert(arrEq(closure, ["x"]), "{X}⁺ with no FDs = {X}");
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n🔑 Superkey Check");

{
    const fds: FD[] = [
        { left: ["A"], right: ["B", "C", "D"] },
    ];
    assert(isSuperkey(["A"], ["A", "B", "C", "D"], fds), "{A} is superkey");
    assert(!isSuperkey(["B"], ["A", "B", "C", "D"], fds), "{B} is NOT superkey");
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n🔑 Candidate Keys");

{
    // R(A,B,C), FDs: A→B, B→C → key is {A}
    const fds: FD[] = [
        { left: ["A"], right: ["B"] },
        { left: ["B"], right: ["C"] },
    ];
    const keys = findCandidateKeys(["A", "B", "C"], fds);
    assert(keys.length === 1, "One candidate key");
    assert(arrEq(keys[0], ["a"]), "Key = {A}");
}

{
    // R(A,B,C), FDs: A→B, B→A, A→C → keys are {A} and {B}
    const fds: FD[] = [
        { left: ["A"], right: ["B"] },
        { left: ["B"], right: ["A"] },
        { left: ["A"], right: ["C"] },
    ];
    const keys = findCandidateKeys(["A", "B", "C"], fds);
    assert(keys.length === 2, "Two candidate keys");
    assert(keys.some((k) => arrEq(k, ["a"])), "Key contains {A}");
    assert(keys.some((k) => arrEq(k, ["b"])), "Key contains {B}");
}

{
    // R(A,B,C,D), FDs: AB→C, C→D → key is {A,B}
    const fds: FD[] = [
        { left: ["A", "B"], right: ["C"] },
        { left: ["C"], right: ["D"] },
    ];
    const keys = findCandidateKeys(["A", "B", "C", "D"], fds);
    assert(keys.length === 1, "One candidate key");
    assert(arrEq(keys[0], ["a", "b"]), "Key = {A,B}");
}

{
    // No FDs → key = all attributes
    const keys = findCandidateKeys(["A", "B", "C"], []);
    assert(keys.length === 1, "One key with no FDs");
    assert(arrEq(keys[0], ["a", "b", "c"]), "Key = all attrs");
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n📐 Minimal Cover");

{
    // FDs: A→BC, B→C, A→B, AB→C → minimal cover should be A→B, B→C
    const fds: FD[] = [
        { left: ["A"], right: ["B", "C"] },
        { left: ["B"], right: ["C"] },
        { left: ["A"], right: ["B"] },
        { left: ["A", "B"], right: ["C"] },
    ];
    const mc = minimalCover(fds);
    assert(mc.length === 2, "Minimal cover has 2 FDs");
    assert(mc.some((fd) => arrEq(fd.left, ["a"]) && arrEq(fd.right, ["b"])), "Contains A→B");
    assert(mc.some((fd) => arrEq(fd.left, ["b"]) && arrEq(fd.right, ["c"])), "Contains B→C");
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n📊 Normal Form Analysis");

{
    // Classic 2NF violation:
    // STUDENT_COURSE(student_id, course_id, student_name, grade)
    // PK: {student_id, course_id}
    // FDs: student_id → student_name (partial dependency)
    //      student_id, course_id → grade
    const result = analyzeTable({
        tableName: "student_course",
        columns: ["student_id", "course_id", "student_name", "grade"],
        primaryKey: ["student_id", "course_id"],
        functionalDependencies: [
            { left: ["student_id"], right: ["student_name"] },
            { left: ["student_id", "course_id"], right: ["grade"] },
        ],
    });
    assert(result.currentNF === "1NF", "student_course is in 1NF (not 2NF)");
    assert(result.violations.some((v) => v.normalForm === "2NF"), "Has 2NF violation");
    assert(result.decomposition.length >= 2, "Decomposition produces ≥2 tables");
    console.log("    Decomposition:", result.decomposition.map((t) => `${t.name}(${t.attributes.join(",")})`).join(", "));
}

{
    // Classic 3NF violation (transitive):
    // EMPLOYEE(emp_id, dept_id, dept_name)
    // PK: {emp_id}
    // FDs: emp_id → dept_id, dept_id → dept_name
    const result = analyzeTable({
        tableName: "employee",
        columns: ["emp_id", "dept_id", "dept_name"],
        primaryKey: ["emp_id"],
        functionalDependencies: [
            { left: ["emp_id"], right: ["dept_id"] },
            { left: ["dept_id"], right: ["dept_name"] },
        ],
    });
    assert(result.currentNF === "2NF", "employee is in 2NF (not 3NF)");
    assert(result.violations.some((v) => v.normalForm === "3NF"), "Has 3NF violation");
    assert(result.decomposition.length >= 2, "Decomposition produces ≥2 tables");
    console.log("    Decomposition:", result.decomposition.map((t) => `${t.name}(${t.attributes.join(",")})`).join(", "));
}

{
    // BCNF violation:
    // COURSE(student, course, instructor)
    // CK1: {student, course}
    // FDs: student, course → instructor
    //      instructor → course
    const result = analyzeTable({
        tableName: "course_assignment",
        columns: ["student", "course", "instructor"],
        primaryKey: ["student", "course"],
        functionalDependencies: [
            { left: ["student", "course"], right: ["instructor"] },
            { left: ["instructor"], right: ["course"] },
        ],
    });
    assert(result.currentNF === "3NF", "course_assignment is in 3NF (not BCNF)");
    assert(result.violations.some((v) => v.normalForm === "BCNF"), "Has BCNF violation");
    console.log("    Candidate keys:", result.candidateKeys.map((k) => `{${k.join(",")}}`).join(", "));
    console.log("    Decomposition:", result.decomposition.map((t) => `${t.name}(${t.attributes.join(",")})`).join(", "));
}

{
    // Already in BCNF:
    // SIMPLE(id, name, email)
    // PK: {id}
    // FDs: id → name, id → email
    const result = analyzeTable({
        tableName: "simple",
        columns: ["id", "name", "email"],
        primaryKey: ["id"],
        functionalDependencies: [
            { left: ["id"], right: ["name", "email"] },
        ],
    });
    assert(result.currentNF === "BCNF", "simple is in BCNF");
    assert(result.violations.length === 0, "No violations");
    assert(result.decomposition.length === 0, "No decomposition needed");
}

{
    // No FDs defined → trivially BCNF
    const result = analyzeTable({
        tableName: "no_fds",
        columns: ["a", "b", "c"],
        primaryKey: ["a"],
        functionalDependencies: [],
    });
    assert(result.currentNF === "BCNF", "No FDs → BCNF");
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n🔀 3NF Decomposition");

{
    // R(A,B,C,D), FDs: A→B, B→C, C→D, key={A}
    // Should decompose into: {A,B}, {B,C}, {C,D}
    const fds: FD[] = [
        { left: ["A"], right: ["B"] },
        { left: ["B"], right: ["C"] },
        { left: ["C"], right: ["D"] },
    ];
    const tables = decompose3NF("R", ["A", "B", "C", "D"], fds, [["a"]]);
    assert(tables.length >= 3, "3NF decomposition produces ≥3 tables");
    // Verify lossless: union of all table attrs should cover all original attrs
    const allAttrs = new Set(tables.flatMap((t) => t.attributes));
    assert(["a", "b", "c", "d"].every((a) => allAttrs.has(a)), "Lossless: covers all attrs");
    console.log("    Tables:", tables.map((t) => `${t.name}(${t.attributes.join(",")})[PK:${t.primaryKey.join(",")}]`).join(", "));
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n🔀 BCNF Decomposition");

{
    // R(A,B,C), FDs: A→B, B→C, candidate key={A}
    const fds: FD[] = [
        { left: ["A"], right: ["B"] },
        { left: ["B"], right: ["C"] },
    ];
    const tables = decomposeBCNF("R", ["A", "B", "C"], fds);
    // Should produce 2 tables: {B,C} and {A,B}
    assert(tables.length === 2, "BCNF decomposition produces 2 tables");
    const allAttrs = new Set(tables.flatMap((t) => t.attributes));
    assert(["a", "b", "c"].every((a) => allAttrs.has(a)), "Lossless: covers all attrs");
    console.log("    Tables:", tables.map((t) => `${t.name}(${t.attributes.join(",")})[PK:${t.primaryKey.join(",")}]`).join(", "));
}

// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
