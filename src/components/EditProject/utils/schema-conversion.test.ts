/**
 * Verification tests for Conceptual -> Logical (forward engineering),
 * following Elmasri & Navathe, "Fundamentals of Database Systems", Chapter 9.
 * Run with: npx tsx src/components/EditProject/utils/schema-conversion.test.ts
 */

import { convertConceptualToLogical, convertLogicalToConceptual } from "./schema-conversion";
import type { ConceptualModelPayload } from "./conceptual-model.builder";

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

type Attr = { id: string; name: string; kind: "simple"; isKey: boolean };
const attr = (id: string, name: string, isKey = false): Attr => ({ id, name, kind: "simple", isKey });

const model = (
    entities: ConceptualModelPayload["entities"],
    relationships: ConceptualModelPayload["relationships"],
): ConceptualModelPayload => ({
    model: { id: "cid_m", name: "Journal Conceptual", version: 1 },
    entities,
    relationships,
    generalizations: [],
    categories: [],
    constraints: [],
});

// Exercise 1 – Journal information.
//   ISSUE is a weak entity of JOURNAL, partial key = {issue_number, date_issued}.
const journalModel = (partialKey: "both" | "numberOnly" = "both"): ConceptualModelPayload =>
    model(
        [
            { id: "cid_journal", name: "journal", kind: "strong", attributes: [attr("a1", "journal_id", true), attr("a2", "name")] },
            {
                id: "cid_issue",
                name: "issue",
                kind: "weak",
                attributes: [
                    attr("a3", "issue_number", true),
                    attr("a4", "date_issued", partialKey === "both"),
                ],
            },
            {
                id: "cid_article",
                name: "article",
                kind: "strong",
                attributes: [attr("a5", "article_id", true), attr("a6", "length_words"), attr("a7", "num_diagrams")],
            },
            { id: "cid_writer", name: "writer", kind: "strong", attributes: [attr("a8", "writer_id", true), attr("a9", "name"), attr("a10", "address")] },
        ],
        [
            {
                id: "cid_has",
                name: "HAS",
                type: "identifying",
                ends: [
                    { entityId: "cid_journal", cardinality: "1", optional: true },
                    { entityId: "cid_issue", cardinality: "N", optional: false },
                ],
            },
            {
                id: "cid_contains",
                name: "CONTAINS",
                type: "association",
                ends: [
                    { entityId: "cid_issue", cardinality: "1", optional: true },
                    { entityId: "cid_article", cardinality: "N", optional: false },
                ],
            },
            {
                id: "cid_writes",
                name: "WRITES",
                type: "association",
                ends: [
                    { entityId: "cid_writer", cardinality: "N", optional: true },
                    { entityId: "cid_article", cardinality: "N", optional: false },
                ],
                attributes: [attr("a11", "fee")],
            },
        ],
    );

const tableOf = (logical: ReturnType<typeof convertConceptualToLogical>, name: string) =>
    logical.tables.find((t) => t.name === name)!;
const pkNames = (t: { columns: { name: string; roles?: { primaryKey?: boolean } }[] }) =>
    t.columns.filter((c) => c.roles?.primaryKey).map((c) => c.name);

// ─────────────────────────────────────────────────────────────────────────
console.log("\n[1] Weak entity: PK = owner PK + partial key (book Step 2)");
{
    const l = convertConceptualToLogical(journalModel("both"));
    const journal = tableOf(l, "journal");
    const issue = tableOf(l, "issue");

    assert(issue.columns.length === 3, "ISSUE has exactly 3 columns (no duplicate FK from the identifying relationship)");
    assert(
        JSON.stringify(pkNames(issue).sort()) === JSON.stringify(["date_issued", "issue_number", "journal_id"]),
        "ISSUE PK = (journal_id, issue_number, date_issued)",
    );
    const jid = issue.columns.find((c) => c.name === "journal_id")!;
    assert(!!jid.roles?.primaryKey && !!jid.roles?.foreignKey, "journal_id is both PK and FK");
    assert(
        jid.roles?.foreignKey?.refTableId === journal.id &&
            jid.roles?.foreignKey?.refColumnId === journal.columns.find((c) => c.name === "journal_id")!.id,
        "journal_id references JOURNAL.journal_id",
    );
    assert(jid.nullable === false, "owner FK column is NOT NULL");
    assert(
        issue.columns.filter((c) => c.name !== "journal_id").every((c) => c.unique === false),
        "partial key columns are not individually UNIQUE",
    );
    assert(journal.columns.find((c) => c.name === "journal_id")!.unique === true, "strong entity single key stays UNIQUE");
    assert(issue.columns[0].name === "journal_id", "owner FK column comes first");
}

console.log("\n[2] Weak entity with single-column partial key");
{
    const l = convertConceptualToLogical(journalModel("numberOnly"));
    const issue = tableOf(l, "issue");
    assert(
        JSON.stringify(pkNames(issue).sort()) === JSON.stringify(["issue_number", "journal_id"]),
        "ISSUE PK = (journal_id, issue_number)",
    );
    assert(issue.columns.find((c) => c.name === "date_issued")!.roles?.primaryKey !== true, "date_issued is a normal column");
}

console.log("\n[3] FK to a table with composite PK includes ALL PK columns");
{
    const l = convertConceptualToLogical(journalModel("both"));
    const issue = tableOf(l, "issue");
    const article = tableOf(l, "article");
    const fks = article.columns.filter((c) => c.roles?.foreignKey?.refTableId === issue.id);
    assert(fks.length === 3, "ARTICLE has 3 FK columns referencing ISSUE");
    const refIds = new Set(fks.map((c) => c.roles!.foreignKey!.refColumnId));
    assert(
        issue.columns.filter((c) => c.roles?.primaryKey).every((c) => refIds.has(c.id)),
        "each ISSUE PK column is referenced exactly once",
    );
    assert(fks.every((c) => c.nullable === false), "FKs are NOT NULL (Article has total participation in CONTAINS)");
    assert(fks.every((c) => !c.roles?.primaryKey), "FKs are not part of ARTICLE's PK");
    assert(
        new Set(article.columns.map((c) => c.name.toLowerCase())).size === article.columns.length,
        "ARTICLE column names are unique",
    );
}

console.log("\n[4] M:N -> junction table, FK columns form the PK; relationship attribute -> column");
{
    const l = convertConceptualToLogical(journalModel("both"));
    const writes = tableOf(l, "WRITES");
    assert(!!writes, "WRITES junction table exists");
    assert(
        JSON.stringify(pkNames(writes).sort()) === JSON.stringify(["article_id", "writer_id"]),
        "WRITES PK = (writer_id, article_id)",
    );
    assert(writes.columns.some((c) => c.name === "fee" && !c.roles?.primaryKey), "fee is a normal column");
    assert(l.tables.length === 5, "5 tables in total (journal, issue, article, writer, WRITES)");
}

console.log("\n[5] Participation -> FK nullability (1:N)");
{
    const m = journalModel("both");
    m.relationships.find((r) => r.id === "cid_contains")!.ends[1].optional = true;
    const l = convertConceptualToLogical(m);
    const article = tableOf(l, "article");
    const issue = tableOf(l, "issue");
    const fks = article.columns.filter((c) => c.roles?.foreignKey?.refTableId === issue.id);
    assert(fks.length === 3 && fks.every((c) => c.nullable === true), "optional participation -> FK columns allow NULL");
}

console.log("\n[6] Weak entity owned by a weak entity (owner mapped first)");
{
    const m = journalModel("both");
    m.entities.push({ id: "cid_section", name: "section", kind: "weak", attributes: [attr("a20", "section_no", true), attr("a21", "title")] });
    m.relationships.push({
        id: "cid_has_section",
        name: "HAS_SECTION",
        type: "identifying",
        ends: [
            { entityId: "cid_issue", cardinality: "1", optional: true },
            { entityId: "cid_section", cardinality: "N", optional: false },
        ],
    });
    const l = convertConceptualToLogical(m);
    const section = tableOf(l, "section");
    assert(
        JSON.stringify(pkNames(section).sort()) ===
            JSON.stringify(["date_issued", "issue_number", "journal_id", "section_no"]),
        "SECTION PK = ISSUE PK (3 cols) + section_no",
    );
    // order of entities in the model must not matter
    const m2 = { ...m, entities: [...m.entities].reverse() };
    const section2 = tableOf(convertConceptualToLogical(m2), "section");
    assert(pkNames(section2).length === 4, "same result when the weak entities are declared before their owners");
}

console.log("\n[7] Weak entity without partial key / without owner");
{
    const m = journalModel("both");
    m.entities.find((e) => e.id === "cid_issue")!.attributes = [attr("a30", "note")];
    const issue = tableOf(convertConceptualToLogical(m), "issue");
    assert(JSON.stringify(pkNames(issue)) === JSON.stringify(["journal_id"]), "no partial key -> PK = owner PK only");

    const orphan = model(
        [{ id: "cid_w", name: "w", kind: "weak", attributes: [attr("b1", "x")] }],
        [],
    );
    const w = tableOf(convertConceptualToLogical(orphan), "w");
    assert(JSON.stringify(pkNames(w)) === JSON.stringify(["id"]), "weak entity without identifying relationship falls back to auto id PK");
}

console.log("\n[8] Composite key of a strong entity = one PK (not UNIQUE per column)");
{
    const m = model(
        [{ id: "cid_e", name: "enrol", kind: "strong", attributes: [attr("c1", "student_no", true), attr("c2", "course_no", true)] }],
        [],
    );
    const e = tableOf(convertConceptualToLogical(m), "enrol");
    assert(pkNames(e).length === 2 && e.columns.every((c) => c.unique === false), "2 key attributes -> composite PK, no per-column UNIQUE");
}

console.log("\n[9] 1:N with single-column PK keeps existing naming");
{
    const m = model(
        [
            { id: "cid_d", name: "department", kind: "strong", attributes: [attr("d1", "dept_id", true)] },
            { id: "cid_e", name: "employee", kind: "strong", attributes: [attr("e1", "emp_id", true)] },
        ],
        [
            {
                id: "cid_wf",
                name: "WORKS_FOR",
                type: "association",
                ends: [
                    { entityId: "cid_d", cardinality: "1", optional: true },
                    { entityId: "cid_e", cardinality: "N", optional: false },
                ],
            },
        ],
    );
    const emp = tableOf(convertConceptualToLogical(m), "employee");
    const fk = emp.columns.find((c) => c.roles?.foreignKey);
    assert(fk?.name === "department_id" && fk.nullable === false, "FK column department_id, NOT NULL");
}

console.log("\n[reverse] DEF-021: participation when converting logical -> conceptual");
{
    const col = (id: string, name: string, extra: Record<string, unknown> = {}, roles: Record<string, unknown> = {}) => ({
        id, name, nullable: true, unique: false, roles, ...extra,
    });
    const logical = (fkNullable: boolean, fkInPk: boolean) => ({
        model: { id: "lid_m", name: "L", version: 1 },
        tables: [
            { id: "lid_issue", name: "ISSUE", columns: [col("i1", "issue_id", { nullable: false }, { primaryKey: true }), col("i2", "title")] },
            {
                id: "lid_article", name: "ARTICLE",
                columns: [
                    col("a1", "article_id", { nullable: false }, { primaryKey: true }),
                    col("a2", "issue_id", { nullable: fkNullable }, { foreignKey: { refTableId: "lid_issue", refColumnId: "i1" }, ...(fkInPk ? { primaryKey: true } : {}) }),
                    col("a3", "summary"),
                ],
            },
        ],
    });
    const endOf = (m: ReturnType<typeof convertLogicalToConceptual>, tableName: string) => {
        const rel = m.relationships[0];
        const entity = m.entities.find((e) => e.name === tableName)!;
        return rel.ends.find((e) => e.entityId === entity.id)!;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notNull = convertLogicalToConceptual(logical(false, false) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nullable = convertLogicalToConceptual(logical(true, false) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keyFk = convertLogicalToConceptual(logical(true, true) as any);
    assert(endOf(notNull, "ARTICLE").optional === false, "NOT NULL FK -> child (N) end mandatory");
    assert(endOf(nullable, "ARTICLE").optional === true, "nullable FK -> child (N) end optional");
    assert(endOf(keyFk, "ARTICLE").optional === false, "FK that is part of the PK -> child end mandatory");
    assert(endOf(notNull, "ISSUE").optional === true && endOf(nullable, "ISSUE").optional === true, "referenced (1) end always optional");
}

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
