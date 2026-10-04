/**
 * Conceptual -> Logical: what a database designer would expect.
 *
 * The expectations come from the standard ER/EER -> relational mapping (Elmasri & Navathe ch. 9,
 * Silberschatz, Connolly & Begg), not from how the converter happens to be written. A failing test
 * is therefore either a real gap in the converter or a rule we should decide to drop on purpose.
 *
 * Run: yarn test src/components/EditProject/utils/conceptual-to-logical.spec.ts
 */

import { convertConceptualToLogicalWithNotices, convertLogicalToConceptual } from "./schema-conversion";
import type { ConceptualModelPayload } from "./conceptual-model.builder";

// ── model builders (entity id === entity name, so table names are predictable) ──────────────────

type Attr = ConceptualModelPayload["entities"][number]["attributes"][number];
type Entity = ConceptualModelPayload["entities"][number];
type Rel = ConceptualModelPayload["relationships"][number];
type End = Rel["ends"][number];

let seq = 0;
const attr = (name: string, o: Partial<Attr> = {}): Attr => ({ id: `a${++seq}`, name, kind: "simple", isKey: false, ...o }) as Attr;
const key = (name: string) => attr(name, { isKey: true });
const entity = (name: string, attributes: Attr[], o: Partial<Entity> = {}): Entity =>
    ({ id: name, name, kind: "strong", attributes, ...o }) as Entity;
const weak = (name: string, attributes: Attr[]) => entity(name, attributes, { kind: "weak" });
const end = (entityId: string, cardinality: string, optional = true): End => ({ entityId, cardinality, optional }) as End;
const rel = (name: string, ends: End[], o: Partial<Rel> = {}): Rel =>
    ({ id: `r_${name || ++seq}`, name, type: "association", ends, ...o }) as Rel;
const identifying = (name: string, owner: string, weakName: string, o: Partial<Rel> = {}) =>
    rel(name, [end(owner, "1"), end(weakName, "N", false)], { type: "identifying", ...o });
const isa = (parent: string | string[], children: string[]) => ({
    id: `g${++seq}`,
    parentEntityIds: Array.isArray(parent) ? parent : [parent],
    childEntityIds: children,
    constraints: { disjointness: "disjoint", completeness: "partial" },
});
const model = (entities: Entity[], relationships: Rel[] = [], extra: Partial<ConceptualModelPayload> = {}): ConceptualModelPayload =>
    ({ model: { id: "m", name: "Conceptual", version: 1 }, entities, relationships, ...extra }) as ConceptualModelPayload;

// ── result helpers ────────────────────────────────────────────────────────────────────────────

const convert = (m: ConceptualModelPayload) => {
    const { model: logical, notices } = convertConceptualToLogicalWithNotices(m);
    const tables = logical.tables;
    const byId = new Map(tables.map((t) => [t.id, t]));
    const table = (name: string) => {
        const t = tables.find((x) => x.name === name);
        if (!t) throw new Error(`table "${name}" not found; tables are: ${tables.map((x) => x.name).join(", ")}`);
        return t;
    };
    const pk = (name: string) => table(name).columns.filter((c) => c.roles?.primaryKey);
    /** FK columns of `name`, optionally only those that reference `refName`. */
    const fks = (name: string, refName?: string) =>
        table(name).columns.filter((c) => {
            const fk = c.roles?.foreignKey;
            return fk && (!refName || byId.get(fk.refTableId)?.name === refName);
        });
    const colNames = (name: string) => table(name).columns.map((c) => c.name);
    return { tables, notices, table, pk, fks, colNames, byId };
};

const warnings = (r: ReturnType<typeof convert>) => r.notices.filter((n) => n.level === "warning").map((n) => n.message);

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("entities and attributes", () => {
    it("key attribute becomes the PK, other attributes become nullable columns", () => {
        const r = convert(model([entity("student", [key("sid"), attr("name"), attr("email")])]));
        expect(r.pk("student").map((c) => c.name)).toEqual(["sid"]);
        const name = r.table("student").columns.find((c) => c.name === "name")!;
        expect(name.nullable).toBe(true);
        expect(r.pk("student")[0].nullable).toBe(false);
    });

    it("several key attributes form ONE composite PK", () => {
        const r = convert(model([entity("enrolment", [key("student_no"), key("course_no"), attr("grade")])]));
        expect(r.pk("enrolment").map((c) => c.name).sort()).toEqual(["course_no", "student_no"]);
    });

    it("composite attribute is stored as its components, not as a column of its own", () => {
        const name = attr("name", { kind: "composite", components: [attr("first_name"), attr("last_name")] });
        const r = convert(model([entity("person", [key("id"), name])]));
        expect(r.colNames("person")).toEqual(expect.arrayContaining(["first_name", "last_name"]));
        expect(r.colNames("person")).not.toContain("name");
    });

    it("nested composite attribute is flattened down to its leaves", () => {
        const address = attr("address", {
            kind: "complex",
            components: [attr("street"), attr("geo", { kind: "composite", components: [attr("lat"), attr("lng")] })],
        });
        const r = convert(model([entity("place", [key("id"), address])]));
        expect(r.colNames("place")).toEqual(expect.arrayContaining(["street", "lat", "lng"]));
        expect(r.colNames("place")).not.toContain("geo");
    });

    it("a composite attribute that is the key makes its components the PK", () => {
        const fullName = attr("full_name", { kind: "composite", isKey: true, components: [attr("first_name"), attr("last_name")] });
        const r = convert(model([entity("author", [fullName, attr("bio")])]));
        expect(r.pk("author").map((c) => c.name).sort()).toEqual(["first_name", "last_name"]);
        expect(r.colNames("author")).not.toContain("id");
    });

    it("a composite key attribute next to a plain key attribute gives ONE composite PK and no column is UNIQUE alone", () => {
        const fullName = attr("full_name", { kind: "composite", isKey: true, components: [attr("first_name"), attr("last_name")] });
        const r = convert(model([entity("author", [fullName, key("birth_year"), attr("bio")])]));
        expect(r.pk("author").map((c) => c.name).sort()).toEqual(["birth_year", "first_name", "last_name"]);
        expect(r.pk("author").every((c) => c.nullable === false && c.unique === false)).toBe(true);
    });

    it("multi-valued attribute goes to its own table: PK = owner FK + value, FK to the owner", () => {
        const r = convert(model([entity("student", [key("sid"), attr("phone", { kind: "multi_valued" })])]));
        expect(r.colNames("student")).not.toContain("phone");
        const mv = r.tables.find((t) => t.columns.some((c) => c.name === "phone") && t.name !== "student")!;
        expect(mv).toBeDefined();
        expect(mv.columns.filter((c) => c.roles?.primaryKey)).toHaveLength(2);
        expect(mv.columns.some((c) => c.roles?.foreignKey?.refTableId === "student")).toBe(true);
    });

    it("multi-valued attribute of an entity with a composite PK carries the whole PK", () => {
        const r = convert(model([entity("seat", [key("room"), key("number"), attr("tag", { kind: "multi_valued" })])]));
        const mv = r.tables.find((t) => t.columns.some((c) => c.name === "tag") && t.name !== "seat")!;
        expect(mv.columns.filter((c) => c.roles?.foreignKey?.refTableId === "seat")).toHaveLength(2);
    });

    it("derived attribute is not stored and the user is told", () => {
        const r = convert(model([entity("person", [key("id"), attr("birth_date"), attr("age", { kind: "derived" })])]));
        expect(r.colNames("person")).not.toContain("age");
        expect(warnings(r).join("\n")).toMatch(/age/);
    });

    it("entity without a key still gets a primary key (surrogate)", () => {
        const r = convert(model([entity("log", [attr("message")])]));
        expect(r.pk("log")).toHaveLength(1);
    });

    it("an attribute that is named like the generated FK column does not create a duplicate column", () => {
        const m = model(
            [entity("customer", [key("id")]), entity("order", [key("id"), attr("customer_id")])],
            [rel("places", [end("order", "N"), end("customer", "1")])],
        );
        const names = convert(m).colNames("order");
        expect(new Set(names).size).toBe(names.length);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("binary relationships", () => {
    const customer = entity("customer", [key("id")]);
    const order = entity("order", [key("id")]);

    it("1:N puts the FK on the N side, referencing the PK of the 1 side", () => {
        const r = convert(model([customer, order], [rel("places", [end("customer", "1"), end("order", "N")])]));
        expect(r.fks("order", "customer")).toHaveLength(1);
        expect(r.fks("customer")).toHaveLength(0);
    });

    it("FK is NOT NULL when the N side participates totally and nullable otherwise", () => {
        const total = convert(model([customer, order], [rel("places", [end("customer", "1"), end("order", "N", false)])]));
        const partial = convert(model([customer, order], [rel("places", [end("customer", "1"), end("order", "N", true)])]));
        expect(total.fks("order", "customer")[0].nullable).toBe(false);
        expect(partial.fks("order", "customer")[0].nullable).toBe(true);
    });

    it("1:1 puts a UNIQUE FK on one side", () => {
        const person = entity("person", [key("id")]);
        const passport = entity("passport", [key("no")]);
        const r = convert(model([person, passport], [rel("holds", [end("person", "1"), end("passport", "1")])]));
        const all = [...r.fks("person"), ...r.fks("passport")];
        expect(all).toHaveLength(1);
        expect(all[0].unique).toBe(true);
    });

    it("1:1 with total participation on one side puts the FK on that side", () => {
        const person = entity("person", [key("id")]);
        const passport = entity("passport", [key("no")]);
        const r = convert(model([person, passport], [rel("holds", [end("person", "1", true), end("passport", "1", false)])]));
        expect(r.fks("passport", "person")).toHaveLength(1);
        expect(r.fks("person")).toHaveLength(0);
    });

    it("N:M becomes a junction table whose PK is both FKs together", () => {
        const student = entity("student", [key("sid")]);
        const course = entity("course", [key("cid")]);
        const r = convert(model([student, course], [rel("enrols", [end("student", "N"), end("course", "M")])]));
        const j = r.table("enrols");
        expect(j.columns.filter((c) => c.roles?.primaryKey)).toHaveLength(2);
        expect(r.fks("enrols", "student")).toHaveLength(1);
        expect(r.fks("enrols", "course")).toHaveLength(1);
        expect(r.fks("student")).toHaveLength(0);
        expect(r.fks("course")).toHaveLength(0);
    });

    it("an unnamed N:M relationship still gets a sensibly named junction table", () => {
        const student = entity("student", [key("sid")]);
        const course = entity("course", [key("cid")]);
        const r = convert(model([student, course], [rel("", [end("student", "N"), end("course", "M")])]));
        expect(r.tables).toHaveLength(3);
        const junction = r.tables.find((t) => t.name !== "student" && t.name !== "course")!;
        expect(junction.name.trim()).not.toBe("");
    });

    it("relationship attribute of N:M lives on the junction table", () => {
        const student = entity("student", [key("sid")]);
        const course = entity("course", [key("cid")]);
        const r = convert(
            model([student, course], [rel("enrols", [end("student", "N"), end("course", "M")], { attributes: [attr("grade")] })]),
        );
        expect(r.colNames("enrols")).toContain("grade");
    });

    it("relationship attribute of 1:N lives on the N side table", () => {
        const r = convert(
            model([customer, order], [rel("places", [end("customer", "1"), end("order", "N")], { attributes: [attr("placed_at")] })]),
        );
        expect(r.colNames("order")).toContain("placed_at");
        expect(r.colNames("customer")).not.toContain("placed_at");
    });

    it("FK to a composite PK has one column per PK column, each referencing the matching PK column", () => {
        const section = entity("section", [key("course_no"), key("section_no")]);
        const enrol = entity("enrol", [key("id")]);
        const r = convert(model([section, enrol], [rel("in", [end("section", "1"), end("enrol", "N")])]));
        const refs = r.fks("enrol", "section");
        expect(refs).toHaveLength(2);
        const refCols = refs.map((c) => c.roles!.foreignKey!.refColumnId).sort();
        expect(refCols).toEqual(r.pk("section").map((c) => c.id).sort());
    });

    it("recursive 1:N (employee supervises employee) adds a nullable FK to the same table", () => {
        const emp = entity("employee", [key("id"), attr("name")]);
        const r = convert(model([emp], [rel("supervises", [end("employee", "1"), end("employee", "N")])]));
        const refs = r.fks("employee", "employee");
        expect(refs).toHaveLength(1);
        expect(refs[0].nullable).toBe(true);
        expect(refs[0].name).not.toBe("id");
    });

    it("recursive N:M (course prerequisites) gives two different FK columns, both to the entity", () => {
        const course = entity("course", [key("cid")]);
        const r = convert(model([course], [rel("prerequisite", [end("course", "N"), end("course", "M")])]));
        const refs = r.fks("prerequisite", "course");
        expect(refs).toHaveLength(2);
        expect(new Set(refs.map((c) => c.name)).size).toBe(2);
        expect(r.pk("prerequisite")).toHaveLength(2);
    });

    it("two relationships between the same two entities keep two separate FK columns", () => {
        const m = model(
            [customer, order],
            [
                rel("placed_by", [end("customer", "1"), end("order", "N")]),
                rel("billed_to", [end("customer", "1"), end("order", "N")]),
            ],
        );
        const r = convert(m);
        const refs = r.fks("order", "customer");
        expect(refs).toHaveLength(2);
        expect(new Set(refs.map((c) => c.name)).size).toBe(2);
    });

    it("a relationship named like an entity does not produce two tables with the same name", () => {
        const student = entity("student", [key("sid")]);
        const course = entity("course", [key("cid")]);
        const r = convert(model([student, course], [rel("course", [end("student", "N"), end("course", "M")])]));
        const names = r.tables.map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it("when the junction table has to be renamed because its name is taken, the user is told which name it got", () => {
        const student = entity("student", [key("sid")]);
        const course = entity("course", [key("cid")]);
        const r = convert(model([student, course], [rel("course", [end("student", "N"), end("course", "M")])]));
        expect(r.tables).toHaveLength(3);
        expect(r.fks("course_2", "student")).toHaveLength(1);
        expect(warnings(r).join("\n")).toMatch(/course_2/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("n-ary relationships", () => {
    const supplier = entity("supplier", [key("id")]);
    const part = entity("part", [key("id")]);
    const project = entity("project", [key("id")]);

    it("ternary N:N:N becomes a junction with three FKs, all in the PK", () => {
        const r = convert(model([supplier, part, project], [rel("supply", [end("supplier", "N"), end("part", "N"), end("project", "N")])]));
        expect(r.fks("supply")).toHaveLength(3);
        expect(r.pk("supply")).toHaveLength(3);
    });

    it("ternary with a '1' participant: that FK is NOT part of the PK (functional dependency)", () => {
        // a project is supplied by exactly one supplier for a given part -> (part, project) identifies the row
        const r = convert(model([supplier, part, project], [rel("supply", [end("supplier", "1"), end("part", "N"), end("project", "N")])]));
        expect(r.fks("supply")).toHaveLength(3);
        const pkRefs = r.pk("supply").map((c) => r.byId.get(c.roles!.foreignKey!.refTableId)!.name).sort();
        expect(pkRefs).toEqual(["part", "project"]);
    });

    it("ternary with two '1' participants: only the N participant's FK is in the PK", () => {
        const r = convert(model([supplier, part, project], [rel("supply", [end("supplier", "1"), end("part", "1"), end("project", "N")])]));
        const pkRefs = r.pk("supply").map((c) => r.byId.get(c.roles!.foreignKey!.refTableId)!.name);
        expect(pkRefs).toEqual(["project"]);
        expect(r.fks("supply")).toHaveLength(3);
    });

    it("ternary where every participant is '1' keeps all three FKs in the PK", () => {
        const r = convert(model([supplier, part, project], [rel("supply", [end("supplier", "1"), end("part", "1"), end("project", "1")])]));
        expect(r.pk("supply")).toHaveLength(3);
    });

    it("ternary with a missing cardinality keeps that participant's FK in the PK", () => {
        const r = convert(
            model([supplier, part, project], [rel("supply", [end("supplier", undefined as unknown as string), end("part", "N"), end("project", "N")])]),
        );
        expect(r.pk("supply")).toHaveLength(3);
    });

    it("the FK of a '1' participant in a ternary is still NOT NULL even though it is not in the PK", () => {
        const r = convert(model([supplier, part, project], [rel("supply", [end("supplier", "1"), end("part", "N"), end("project", "N")])]));
        expect(r.fks("supply", "supplier")[0].nullable).toBe(false);
    });

    it("ternary relationship attribute lives on the junction", () => {
        const r = convert(
            model([supplier, part, project], [rel("supply", [end("supplier", "N"), end("part", "N"), end("project", "N")], { attributes: [attr("quantity")] })]),
        );
        expect(r.colNames("supply")).toContain("quantity");
    });

    it("4-ary relationship becomes a junction with four FKs", () => {
        const store = entity("store", [key("id")]);
        const r = convert(
            model(
                [supplier, part, project, store],
                [rel("deliver", [end("supplier", "N"), end("part", "N"), end("project", "N"), end("store", "N")])],
            ),
        );
        expect(r.fks("deliver")).toHaveLength(4);
    });

    it("ternary with a participant that does not exist is reported, not silently turned into a binary relationship", () => {
        const r = convert(model([supplier, part], [rel("supply", [end("supplier", "N"), end("part", "N"), end("ghost", "N")])]));
        expect(warnings(r).join("\n")).toMatch(/supply/);
    });

    it("ternary where the same entity plays two roles keeps both FKs", () => {
        const person = entity("person", [key("id")]);
        const meeting = entity("meeting", [key("id")]);
        const r = convert(model([person, meeting], [rel("attends", [end("person", "N"), end("person", "N"), end("meeting", "N")])]));
        expect(r.fks("attends", "person")).toHaveLength(2);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("weak entities", () => {
    const building = entity("building", [key("code")]);

    it("PK = owner PK + partial key, and the owner part is an FK to the owner", () => {
        const room = weak("room", [key("room_no"), attr("floor")]);
        const r = convert(model([building, room], [identifying("has", "building", "room")]));
        expect(r.pk("room")).toHaveLength(2);
        expect(r.fks("room", "building")).toHaveLength(1);
        expect(r.fks("room", "building")[0].roles?.primaryKey).toBe(true);
    });

    it("weak entity without a partial key is identified by the owner key alone", () => {
        const note = weak("note", [attr("text")]);
        const r = convert(model([building, note], [identifying("has", "building", "note")]));
        expect(r.pk("note").map((c) => c.roles?.foreignKey?.refTableId)).toEqual(["building"]);
    });

    it("weak entity owned by another weak entity inherits the whole chain in its PK", () => {
        const room = weak("room", [key("room_no")]);
        const bed = weak("bed", [key("bed_no")]);
        const r = convert(model([building, room, bed], [identifying("has", "building", "room"), identifying("holds", "room", "bed")]));
        expect(r.pk("bed")).toHaveLength(3); // building code + room_no + bed_no
        expect(r.fks("bed", "room").length).toBeGreaterThanOrEqual(1);
    });

    it("weak entity identified through two owners has both owner keys in its PK", () => {
        const student = entity("student", [key("sid")]);
        const course = entity("course", [key("cid")]);
        const attempt = weak("attempt", [key("no")]);
        const r = convert(model([student, course, attempt], [identifying("a", "student", "attempt"), identifying("b", "course", "attempt")]));
        expect(r.fks("attempt", "student")).toHaveLength(1);
        expect(r.fks("attempt", "course")).toHaveLength(1);
        expect(r.pk("attempt")).toHaveLength(3);
    });

    it("attributes of the identifying relationship become columns of the weak table", () => {
        const room = weak("room", [key("room_no")]);
        const r = convert(model([building, room], [identifying("has", "building", "room", { attributes: [attr("since")] })]));
        expect(r.colNames("room")).toContain("since");
    });

    it("weak entity without any identifying relationship is reported", () => {
        const room = weak("room", [key("room_no")]);
        const r = convert(model([building, room], []));
        expect(warnings(r).join("\n")).toMatch(/room/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("generalization / specialization", () => {
    const person = entity("person", [key("id"), attr("name")]);

    it("each subclass table has the superclass PK as its own PK and as an FK", () => {
        const student = entity("student", [attr("gpa")]);
        const staff = entity("staff", [attr("salary")]);
        const r = convert(model([person, student, staff], [], { generalizations: [isa("person", ["student", "staff"])] } as any));
        for (const child of ["student", "staff"]) {
            expect(r.pk(child)).toHaveLength(1);
            expect(r.fks(child, "person")).toHaveLength(1);
            expect(r.pk(child)[0].roles?.foreignKey?.refTableId).toBe("person");
        }
        expect(r.colNames("student")).toContain("gpa");
    });

    it("parent with a composite PK: subclass PK is all of those columns, each an FK", () => {
        const seat = entity("seat", [key("room"), key("number")]);
        const vip = entity("vip_seat", [attr("perk")]);
        const r = convert(model([seat, vip], [], { generalizations: [isa("seat", ["vip_seat"])] } as any));
        expect(r.pk("vip_seat")).toHaveLength(2);
        expect(r.fks("vip_seat", "seat")).toHaveLength(2);
    });

    it("multi-level specialization chains the keys (person -> student -> phd)", () => {
        const student = entity("student", [attr("gpa")]);
        const phd = entity("phd", [attr("thesis")]);
        const r = convert(
            model([person, student, phd], [], { generalizations: [isa("person", ["student"]), isa("student", ["phd"])] } as any),
        );
        expect(r.pk("phd")[0].roles?.foreignKey?.refTableId).toBe("student");
        expect(r.pk("student")[0].roles?.foreignKey?.refTableId).toBe("person");
    });

    it("a subclass with its own key attribute still ends up identified by the superclass key", () => {
        const student = entity("student", [key("student_no"), attr("gpa")]);
        const r = convert(model([person, student], [], { generalizations: [isa("person", ["student"])] } as any));
        expect(r.pk("student")[0].roles?.foreignKey?.refTableId).toBe("person");
        // the own key must not be silently lost: either kept as a unique column or reported
        const kept = r.table("student").columns.some((c) => c.name === "student_no");
        expect(kept || warnings(r).join("\n").match(/student_no/)).toBeTruthy();
    });

    it("a subclass declared with two superclasses (multiple inheritance): only the first parent is supported and the user is told", () => {
        // Out of scope on purpose: the project supports ONE parent per generalization.
        const student = entity("student", [key("sid")]);
        const employee = entity("employee", [key("eid")]);
        const ta = entity("teaching_assistant", [attr("hours")]);
        const r = convert(model([student, employee, ta], [], { generalizations: [isa(["student", "employee"], ["teaching_assistant"])] } as any));
        expect(r.fks("teaching_assistant", "student")).toHaveLength(1);
        expect(r.fks("teaching_assistant", "employee")).toHaveLength(0);
        expect(warnings(r).join("\n")).toMatch(/multiple parents/);
    });

    it("a relationship that targets a subclass references the subclass table", () => {
        const student = entity("student", [attr("gpa")]);
        const club = entity("club", [key("id")]);
        const r = convert(
            model([person, student, club], [rel("joins", [end("student", "N"), end("club", "1")])], {
                generalizations: [isa("person", ["student"])],
            } as any),
        );
        expect(r.fks("student", "club")).toHaveLength(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("categories (union types)", () => {
    it("owner can be a person OR a company: a category table is created and linked to every superclass", () => {
        const person = entity("person", [key("ssn")]);
        const company = entity("company", [key("tax_id")]);
        const owner = entity("owner", []);
        const r = convert(
            model([person, company, owner], [], {
                categories: [{ id: "c1", categoryEntityId: "owner", superclassEntityIds: ["person", "company"], completeness: "total" }],
            } as any),
        );
        const links = (a: string, b: string) => r.fks(a, b).length + r.fks(b, a).length;
        expect(links("owner", "person")).toBeGreaterThan(0);
        expect(links("owner", "company")).toBeGreaterThan(0);
    });

    it("if a category cannot be converted the user is told", () => {
        const person = entity("person", [key("ssn")]);
        const company = entity("company", [key("tax_id")]);
        const owner = entity("owner", []);
        const r = convert(
            model([person, company, owner], [], {
                categories: [{ id: "c1", categoryEntityId: "owner", superclassEntityIds: ["person", "company"], completeness: "total" }],
            } as any),
        );
        const linked = r.fks("owner", "person").length + r.fks("person", "owner").length > 0;
        expect(linked || warnings(r).length > 0).toBe(true);
    });
});

// Slide "4_RelationalDataModelAndRelationalMapping", EER step 9 (pages 85-86): union types / categories.
describe("categories: the slide examples (EER step 9)", () => {
    const category = (entityId: string, superclassEntityIds: string[]) => ({ id: `c_${entityId}`, categoryEntityId: entityId, superclassEntityIds, completeness: "total" });
    const person = entity("person", [key("ssn"), attr("driver_license_no"), attr("name"), attr("address")]);
    const bank = entity("bank", [key("bname"), attr("baddress")]);
    const company = entity("company", [key("cname"), attr("caddress")]);
    const owner = entity("owner", []);
    const car = entity("car", [key("vehicle_id"), attr("cstyle"), attr("cmake"), attr("cmodel"), attr("cyear")]);
    const truck = entity("truck", [key("vehicle_id"), attr("tmake"), attr("tmodel"), attr("tonnage"), attr("tyear")]);
    const vehicle = entity("registered_vehicle", [attr("license_plate_number")]);

    it("different keys (PERSON, BANK, COMPANY -> OWNER): OWNER gets a surrogate key, each superclass gets an owner_id FK to it", () => {
        const r = convert(model([person, bank, company, owner], [], { categories: [category("owner", ["person", "bank", "company"])] } as any));
        expect(r.table("owner").columns.map((c) => c.name)).toEqual(["owner_id"]);
        expect(r.pk("owner").map((c) => c.name)).toEqual(["owner_id"]);
        for (const name of ["person", "bank", "company"]) {
            const refs = r.fks(name, "owner");
            expect(refs).toHaveLength(1);
            expect(refs[0].name).toBe("owner_id");
            expect(refs[0].nullable).toBe(true); // a person does not have to be an owner
            expect(refs[0].roles?.primaryKey).toBeFalsy();
        }
    });

    it("the superclass tables keep their own primary keys and columns", () => {
        const r = convert(model([person, bank, company, owner], [], { categories: [category("owner", ["person", "bank", "company"])] } as any));
        expect(r.pk("person").map((c) => c.name)).toEqual(["ssn"]);
        expect(r.pk("bank").map((c) => c.name)).toEqual(["bname"]);
        expect(r.pk("company").map((c) => c.name)).toEqual(["cname"]);
        expect(r.colNames("person")).toEqual(expect.arrayContaining(["driver_license_no", "name", "address"]));
    });

    it("different keys: attributes of the category itself stay on the category table next to the surrogate key", () => {
        const richOwner = entity("owner", [attr("since")]);
        const r = convert(model([person, company, richOwner], [], { categories: [category("owner", ["person", "company"])] } as any));
        expect(r.colNames("owner").sort()).toEqual(["owner_id", "since"]);
        expect(r.pk("owner").map((c) => c.name)).toEqual(["owner_id"]);
    });

    it("different keys: a key declared on the category entity is used instead of a surrogate", () => {
        const keyedOwner = entity("owner", [key("owner_no")]);
        const r = convert(model([person, company, keyedOwner], [], { categories: [category("owner", ["person", "company"])] } as any));
        expect(r.pk("owner").map((c) => c.name)).toEqual(["owner_no"]);
        expect(r.fks("person", "owner")).toHaveLength(1);
        expect(r.fks("company", "owner")).toHaveLength(1);
    });

    it("same key (CAR, TRUCK -> REGISTERED_VEHICLE): the category table is identified by the shared key", () => {
        const r = convert(model([car, truck, vehicle], [], { categories: [category("registered_vehicle", ["car", "truck"])] } as any));
        expect(r.pk("registered_vehicle").map((c) => c.name)).toEqual(["vehicle_id"]);
        expect(r.colNames("registered_vehicle").sort()).toEqual(["license_plate_number", "vehicle_id"]);
    });

    it("same key: the key of CAR and TRUCK is also an FK to the category table (no extra column)", () => {
        const r = convert(model([car, truck, vehicle], [], { categories: [category("registered_vehicle", ["car", "truck"])] } as any));
        for (const name of ["car", "truck"]) {
            expect(r.pk(name)).toHaveLength(1);
            expect(r.pk(name)[0].roles?.foreignKey?.refTableId).toBe("registered_vehicle");
        }
        expect(r.colNames("car")).toEqual(["vehicle_id", "cstyle", "cmake", "cmodel", "cyear"]);
        expect(r.colNames("truck")).toEqual(["vehicle_id", "tmake", "tmodel", "tonnage", "tyear"]);
    });

    it("same key made of two columns: the category PK has both columns and each superclass key references them", () => {
        const a = entity("a", [key("x"), key("y")]);
        const b = entity("b", [key("x"), key("y")]);
        const c = entity("c", []);
        const r = convert(model([a, b, c], [], { categories: [category("c", ["a", "b"])] } as any));
        expect(r.pk("c").map((col) => col.name).sort()).toEqual(["x", "y"]);
        expect(r.pk("a").every((col) => col.roles?.foreignKey?.refTableId === "c")).toBe(true);
        expect(r.pk("b").every((col) => col.roles?.foreignKey?.refTableId === "c")).toBe(true);
    });

    it("the whole slide model (both categories + OWNS M:N) gives exactly the tables of the slide", () => {
        const owns = rel("owns", [end("owner", "M"), end("registered_vehicle", "N")], { attributes: [attr("purchase_date"), attr("lien_or_regular")] });
        const m = model([person, bank, company, owner, vehicle, car, truck], [owns], {
            categories: [category("owner", ["person", "bank", "company"]), category("registered_vehicle", ["car", "truck"])],
        } as any);
        const r = convert(m);
        expect(r.tables.map((t) => t.name).sort()).toEqual(["bank", "car", "company", "owner", "owns", "person", "registered_vehicle", "truck"]);
        // OWNS(Owner_id, Vehicle_id, Purchase_date, Lien_or_regular), PK = both FKs. Same structure as the slide; the
        // tool names a single-column FK "<referenced table>_id", so the slide's Vehicle_id is registered_vehicle_id here.
        expect(r.colNames("owns").sort()).toEqual(["lien_or_regular", "owner_id", "purchase_date", "registered_vehicle_id"]);
        expect(r.pk("owns")).toHaveLength(2);
        expect(r.fks("owns", "owner")).toHaveLength(1);
        expect(r.fks("owns", "registered_vehicle")).toHaveLength(1);
        expect(r.notices).toEqual([]);
    });

    it("a category without an entity of its own is reported and does not crash", () => {
        const r = convert(model([person, company], [], { categories: [{ id: "c", superclassEntityIds: ["person", "company"], completeness: "total" }] } as any));
        expect(warnings(r).join("\n")).toMatch(/category/i);
    });

    it("a category whose superclass does not exist is reported; the existing superclasses are still linked", () => {
        const r = convert(model([person, owner], [], { categories: [category("owner", ["person", "ghost"])] } as any));
        expect(warnings(r).join("\n")).toMatch(/owner/);
        expect(r.fks("person", "owner")).toHaveLength(1);
    });

    it("a category with no superclass is reported", () => {
        const r = convert(model([owner], [], { categories: [category("owner", [])] } as any));
        expect(warnings(r).join("\n")).toMatch(/owner/);
    });

    it("same key, but a superclass key already references another table (it is a subclass): reported, not overwritten", () => {
        const base = entity("base", [key("vehicle_id")]);
        const sub = entity("car", [attr("cstyle")]);
        const truck2 = entity("truck", [key("vehicle_id")]);
        const rv = entity("registered_vehicle", []);
        const r = convert(
            model([base, sub, truck2, rv], [], { generalizations: [isa("base", ["car"])], categories: [category("registered_vehicle", ["car", "truck"])] } as any),
        );
        expect(warnings(r).join("\n")).toMatch(/car/);
        expect(r.pk("car")[0].roles?.foreignKey?.refTableId).toBe("base");
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("a realistic model keeps the schema valid", () => {
    // university: person ISA (student, instructor); department 1:N instructor; course weak section;
    // student N:M section (grade); course prerequisite (recursive N:M); instructor teaches section (1:N)
    const university = model(
        [
            entity("person", [key("id"), attr("name", { kind: "composite", components: [attr("first"), attr("last")] }), attr("age", { kind: "derived" }), attr("phone", { kind: "multi_valued" })]),
            entity("student", [attr("gpa")]),
            entity("instructor", [attr("salary")]),
            entity("department", [key("code"), attr("title")]),
            entity("course", [key("cid"), attr("title")]),
            weak("section", [key("sec_no"), attr("room")]),
        ],
        [
            rel("works_in", [end("department", "1"), end("instructor", "N", false)]),
            identifying("offers", "course", "section"),
            rel("takes", [end("student", "N"), end("section", "M")], { attributes: [attr("grade")] }),
            rel("prerequisite", [end("course", "N"), end("course", "M")]),
            rel("teaches", [end("instructor", "1"), end("section", "N")]),
        ],
        { generalizations: [isa("person", ["student", "instructor"])] } as any,
    );
    const r = convert(university);

    it("every table has a primary key", () => {
        for (const t of r.tables) expect({ table: t.name, pk: t.columns.filter((c) => c.roles?.primaryKey).length > 0 }).toEqual({ table: t.name, pk: true });
    });

    it("every FK points to an existing table and an existing column of that table", () => {
        for (const t of r.tables) {
            for (const c of t.columns) {
                const fk = c.roles?.foreignKey;
                if (!fk) continue;
                const target = r.byId.get(fk.refTableId);
                expect({ at: `${t.name}.${c.name}`, tableExists: !!target }).toEqual({ at: `${t.name}.${c.name}`, tableExists: true });
                expect({ at: `${t.name}.${c.name}`, colExists: !!target!.columns.find((x) => x.id === fk.refColumnId) }).toEqual({
                    at: `${t.name}.${c.name}`,
                    colExists: true,
                });
            }
        }
    });

    it("column names are unique inside each table", () => {
        for (const t of r.tables) {
            const names = t.columns.map((c) => c.name.toLowerCase());
            expect({ table: t.name, dup: names.length - new Set(names).size }).toEqual({ table: t.name, dup: 0 });
        }
    });

    it("table names are unique", () => {
        const names = r.tables.map((t) => t.name.toLowerCase());
        expect(new Set(names).size).toBe(names.length);
    });

    it("a PK column is never nullable", () => {
        for (const t of r.tables) for (const c of t.columns) if (c.roles?.primaryKey) expect({ at: `${t.name}.${c.name}`, nullable: c.nullable }).toEqual({ at: `${t.name}.${c.name}`, nullable: false });
    });

    it("every relationship of the model is represented (no relationship silently disappears)", () => {
        // works_in -> FK instructor->department; teaches -> FK section->instructor; takes / prerequisite -> junctions
        expect(r.fks("instructor", "department").length).toBeGreaterThan(0);
        expect(r.fks("section", "instructor").length).toBeGreaterThan(0);
        expect(r.fks("takes", "student").length).toBeGreaterThan(0);
        expect(r.fks("takes", "section").length).toBeGreaterThan(0);
        expect(r.fks("prerequisite", "course")).toHaveLength(2);
    });

    it("reports exactly the information that was dropped (the derived attribute) and nothing else", () => {
        const w = warnings(r);
        expect(w.filter((m) => /age/.test(m))).toHaveLength(1);
        expect(w.filter((m) => !/age/.test(m))).toEqual([]);
    });
});

describe("notices", () => {
    it("a model that loses nothing produces no notices", () => {
        const r = convert(model([entity("a", [key("id")]), entity("b", [key("id")])], [rel("r", [end("a", "1"), end("b", "N")])]));
        expect(r.notices).toEqual([]);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Classic ways a conceptual -> logical mapping goes wrong. Inputs are what a user can really draw:
// the cardinality dropdown only offers 1 / N / M and can be cleared, so "no cardinality" is normal.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const noDuplicateColumns = (r: ReturnType<typeof convert>) => {
    for (const t of r.tables) {
        const names = t.columns.map((c) => c.name.toLowerCase());
        expect({ table: t.name, duplicates: names.filter((n, i) => names.indexOf(n) !== i) }).toEqual({ table: t.name, duplicates: [] });
    }
};

describe("pitfall: column name collisions", () => {
    it("two composite attributes with the same component names (home/work address) do not produce duplicate columns", () => {
        const home = attr("home_address", { kind: "composite", components: [attr("street"), attr("city")] });
        const work = attr("work_address", { kind: "composite", components: [attr("street"), attr("city")] });
        noDuplicateColumns(convert(model([entity("person", [key("id"), home, work])])));
    });

    it("a composite component named like a plain attribute does not produce a duplicate column", () => {
        const address = attr("address", { kind: "composite", components: [attr("city"), attr("zip")] });
        noDuplicateColumns(convert(model([entity("person", [key("id"), attr("city"), address])])));
    });

    it("a user attribute named 'id' on an entity without a key does not collide with the surrogate key", () => {
        noDuplicateColumns(convert(model([entity("thing", [attr("id"), attr("label")])])));
    });

    it("colliding composite components are prefixed with their composite attribute's name", () => {
        const home = attr("home_address", { kind: "composite", components: [attr("street"), attr("city")] });
        const work = attr("work_address", { kind: "composite", components: [attr("street"), attr("city")] });
        const r = convert(model([entity("person", [key("id"), home, work])]));
        expect(r.colNames("person").sort()).toEqual(["home_address_city", "home_address_street", "id", "work_address_city", "work_address_street"]);
    });

    it("when a component collides with a plain attribute, the plain attribute keeps its name and only the component is prefixed", () => {
        const address = attr("address", { kind: "composite", components: [attr("city"), attr("zip")] });
        const r = convert(model([entity("person", [key("id"), attr("city"), address])]));
        expect(r.colNames("person").sort()).toEqual(["address_city", "city", "id", "zip"]);
    });

    it("renaming a component is reported so the user knows the new column name", () => {
        const address = attr("address", { kind: "composite", components: [attr("city")] });
        const r = convert(model([entity("person", [key("id"), attr("city"), address])]));
        expect(warnings(r).join("\n")).toMatch(/address_city/);
    });

    it("components that do not collide keep their own names and nothing is reported", () => {
        const name = attr("name", { kind: "composite", components: [attr("first_name"), attr("last_name")] });
        const r = convert(model([entity("person", [key("id"), name])]));
        expect(r.colNames("person").sort()).toEqual(["first_name", "id", "last_name"]);
        expect(r.notices).toEqual([]);
    });

    it("nested composite components are prefixed with the top-level attribute name on a collision", () => {
        const address = attr("address", {
            kind: "complex",
            components: [attr("street"), attr("geo", { kind: "composite", components: [attr("lat"), attr("lng")] })],
        });
        const r = convert(model([entity("place", [key("id"), attr("lat"), address])]));
        expect(r.colNames("place")).toEqual(expect.arrayContaining(["lat", "address_lat", "lng", "street"]));
        noDuplicateColumns(r);
    });

    it("a composite KEY whose component collides is still the PK (with the prefixed column name)", () => {
        const fullName = attr("full_name", { kind: "composite", isKey: true, components: [attr("first"), attr("last")] });
        const r = convert(model([entity("author", [fullName, attr("first")])]));
        expect(r.pk("author").map((c) => c.name).sort()).toEqual(["full_name_first", "last"]); // only the colliding component is prefixed
        noDuplicateColumns(r);
    });

    it("the surrogate key is named <entity>_id when the entity already has a column called 'id'", () => {
        const r = convert(model([entity("thing", [attr("id"), attr("label")])]));
        expect(r.pk("thing").map((c) => c.name)).toEqual(["thing_id"]);
        expect(r.colNames("thing")).toContain("id");
    });

    it("the surrogate key is still called 'id' when nothing clashes", () => {
        const r = convert(model([entity("log", [attr("message")])]));
        expect(r.pk("log").map((c) => c.name)).toEqual(["id"]);
    });

    it("a self-relationship twice (mentor and supervisor) gives two different FK columns", () => {
        const emp = entity("employee", [key("id")]);
        const r = convert(
            model([emp], [rel("mentors", [end("employee", "1"), end("employee", "N")]), rel("supervises", [end("employee", "1"), end("employee", "N")])]),
        );
        const refs = r.fks("employee", "employee");
        expect(refs).toHaveLength(2);
        expect(new Set(refs.map((c) => c.name)).size).toBe(2);
        noDuplicateColumns(r);
    });

    it("self 1:N on an entity with a composite PK adds FK columns that do not clash with its own PK columns", () => {
        const part = entity("part", [key("maker"), key("code")]);
        const r = convert(model([part], [rel("contains", [end("part", "1"), end("part", "N")])]));
        expect(r.fks("part", "part")).toHaveLength(2);
        noDuplicateColumns(r);
    });

    it("self N:M on an entity with a composite PK gives four distinct FK columns", () => {
        const part = entity("part", [key("maker"), key("code")]);
        const r = convert(model([part], [rel("assembly", [end("part", "N"), end("part", "M")])]));
        expect(r.fks("assembly", "part")).toHaveLength(4);
        noDuplicateColumns(r);
    });

    it("N:M between two entities that both have a PK named 'id' gives distinct FK names", () => {
        const a = entity("student", [key("id")]);
        const b = entity("course", [key("id")]);
        noDuplicateColumns(convert(model([a, b], [rel("enrols", [end("student", "N"), end("course", "M")])])));
    });

    it("N:M between two entities whose composite PKs share a column name gives distinct FK names", () => {
        const a = entity("flight", [key("airline"), key("number")]);
        const b = entity("crew", [key("airline"), key("badge")]);
        noDuplicateColumns(convert(model([a, b], [rel("staffed_by", [end("flight", "N"), end("crew", "M")])])));
    });

    it("two unnamed N:M relationships between the same two entities get different junction table names", () => {
        const a = entity("student", [key("id")]);
        const b = entity("course", [key("id")]);
        const r = convert(model([a, b], [rel("", [end("student", "N"), end("course", "M")]), rel("", [end("student", "N"), end("course", "M")])]));
        const names = r.tables.map((t) => t.name.toLowerCase());
        expect(new Set(names).size).toBe(names.length);
    });

    it("two entities whose names differ only by case are reported (they collide in most DBMSs)", () => {
        const r = convert(model([entity("User", [key("id")]), entity("user", [key("id")])]));
        expect(warnings(r).length).toBeGreaterThan(0);
    });

    it("two attributes whose names differ only by case are reported", () => {
        const r = convert(model([entity("person", [key("id"), attr("Name"), attr("name")])]));
        expect(warnings(r).length).toBeGreaterThan(0);
    });
});

describe("pitfall: cardinality left empty or ordered the other way", () => {
    const customer = entity("customer", [key("id")]);
    const order = entity("order", [key("id")]);
    const noCard = undefined as unknown as string;

    it("both cardinalities empty: the relationship is still represented AND the user is told it was assumed", () => {
        const r = convert(model([customer, order], [rel("places", [end("customer", noCard), end("order", noCard)])]));
        const represented = r.fks("order", "customer").length + r.fks("customer", "order").length + r.tables.filter((t) => t.name === "places").length;
        expect(represented).toBeGreaterThan(0);
        expect(warnings(r).join("\n")).toMatch(/places/);
    });

    it("one cardinality empty and the other N: the user is told the empty one was read as 1", () => {
        const r = convert(model([customer, order], [rel("places", [end("customer", noCard), end("order", "N")])]));
        expect(warnings(r).join("\n")).toMatch(/places.*customer/);
    });

    it("when both cardinalities are set there is no cardinality warning", () => {
        const r = convert(model([customer, order], [rel("places", [end("customer", "1"), end("order", "N")])]));
        expect(r.notices).toEqual([]);
    });

    it("a ternary with an empty cardinality tells the user it was read as many", () => {
        const a = entity("a", [key("id")]);
        const b = entity("b", [key("id")]);
        const c = entity("c", [key("id")]);
        const r = convert(model([a, b, c], [rel("t", [end("a", noCard), end("b", "N"), end("c", "N")])]));
        expect(warnings(r).join("\n")).toMatch(/t.*a/);
    });

    it("one cardinality empty and the other N: FK goes on the N side", () => {
        const r = convert(model([customer, order], [rel("places", [end("customer", noCard), end("order", "N")])]));
        expect(r.fks("order", "customer")).toHaveLength(1);
    });

    it("ends listed N-side first give the same result as 1-side first", () => {
        const a = convert(model([customer, order], [rel("places", [end("customer", "1"), end("order", "N")])]));
        const b = convert(model([customer, order], [rel("places", [end("order", "N"), end("customer", "1")])]));
        expect(b.fks("order", "customer")).toHaveLength(a.fks("order", "customer").length);
        expect(b.fks("customer")).toHaveLength(0);
    });

    it("'M' on one end and '1' on the other is a 1:N (FK on the M side)", () => {
        const r = convert(model([customer, order], [rel("places", [end("customer", "1"), end("order", "M")])]));
        expect(r.fks("order", "customer")).toHaveLength(1);
    });

    it("'N' on both ends is many-to-many (junction), same as N and M", () => {
        const r = convert(model([customer, order], [rel("places", [end("customer", "N"), end("order", "N")])]));
        expect(r.fks("places")).toHaveLength(2);
    });

    it("1:1 with optional on both sides keeps the FK nullable and unique", () => {
        const a = entity("user", [key("id")]);
        const b = entity("profile", [key("id")]);
        const r = convert(model([a, b], [rel("has", [end("user", "1", true), end("profile", "1", true)])]));
        const fk = [...r.fks("user"), ...r.fks("profile")][0];
        expect(fk.nullable).toBe(true);
        expect(fk.unique).toBe(true);
    });

    it("1:1 self-relationship (person is married to person) adds one unique nullable FK", () => {
        const p = entity("person", [key("id")]);
        const r = convert(model([p], [rel("married_to", [end("person", "1"), end("person", "1")])]));
        const refs = r.fks("person", "person");
        expect(refs).toHaveLength(1);
        expect(refs[0].unique).toBe(true);
    });

    it("1:1 relationship attribute is kept on the table that holds the FK", () => {
        const a = entity("user", [key("id")]);
        const b = entity("profile", [key("id")]);
        const r = convert(model([a, b], [rel("has", [end("user", "1"), end("profile", "1", false)], { attributes: [attr("since")] })]));
        expect([...r.colNames("user"), ...r.colNames("profile")]).toContain("since");
    });

    it("a relationship with a single end does not crash and is reported", () => {
        const r = convert(model([customer], [rel("dangling", [end("customer", "1")])]));
        expect(warnings(r).join("\n")).toMatch(/dangling/);
    });

    it("a relationship with no ends does not crash", () => {
        expect(() => convert(model([customer], [rel("empty", [])]))).not.toThrow();
    });

    it("a binary relationship whose second entity does not exist is reported", () => {
        const r = convert(model([customer], [rel("places", [end("customer", "1"), end("ghost", "N")])]));
        expect(warnings(r).join("\n")).toMatch(/places/);
    });

    it("ternary with cardinalities 1, M, N: the '1' FK stays out of the PK", () => {
        const a = entity("a", [key("id")]);
        const b = entity("b", [key("id")]);
        const c = entity("c", [key("id")]);
        const r = convert(model([a, b, c], [rel("t", [end("a", "1"), end("b", "M"), end("c", "N")])]));
        expect(r.pk("t")).toHaveLength(2);
    });

    it("ternary where one participant has a composite PK has FK columns for every PK column", () => {
        const a = entity("a", [key("id")]);
        const b = entity("b", [key("x"), key("y")]);
        const c = entity("c", [key("id")]);
        const r = convert(model([a, b, c], [rel("t", [end("a", "N"), end("b", "N"), end("c", "N")])]));
        expect(r.fks("t")).toHaveLength(4);
    });
});

describe("pitfall: weak entities", () => {
    const building = entity("building", [key("code")]);

    it("two weak entities with the same owner each get their own FK to it", () => {
        const room = weak("room", [key("no")]);
        const locker = weak("locker", [key("no")]);
        const r = convert(model([building, room, locker], [identifying("has_room", "building", "room"), identifying("has_locker", "building", "locker")]));
        expect(r.fks("room", "building")).toHaveLength(1);
        expect(r.fks("locker", "building")).toHaveLength(1);
    });

    it("owner with a composite PK: the weak entity carries every owner PK column in its PK", () => {
        const campus = entity("campus", [key("city"), key("code")]);
        const lab = weak("lab", [key("no")]);
        const r = convert(model([campus, lab], [identifying("has", "campus", "lab")]));
        expect(r.fks("lab", "campus")).toHaveLength(2);
        expect(r.pk("lab")).toHaveLength(3);
    });

    it("identifying relationship drawn without cardinalities still makes the weak entity depend on its owner", () => {
        const room = weak("room", [key("no")]);
        const r = convert(model([building, room], [rel("has", [end("building", undefined as unknown as string), end("room", undefined as unknown as string, false)], { type: "identifying" })]));
        expect(r.fks("room", "building")).toHaveLength(1);
        expect(r.fks("room", "building")[0].roles?.primaryKey).toBe(true);
    });

    it("a weak entity linked to its owner by an ORDINARY relationship is reported (the identifying marker is missing)", () => {
        const room = weak("room", [key("no")]);
        const r = convert(model([building, room], [rel("has", [end("building", "1"), end("room", "N")])]));
        expect(warnings(r).join("\n")).toMatch(/room/);
    });

    it("a strong entity drawn with an identifying relationship still gets a foreign key to the other entity", () => {
        const room = entity("room", [key("no")]);
        const r = convert(model([building, room], [identifying("has", "building", "room")]));
        expect(r.fks("room", "building").length + r.fks("building", "room").length).toBeGreaterThan(0);
    });

    it("a normal 1:N from a strong entity to a weak entity references the weak entity's FULL composite PK", () => {
        const room = weak("room", [key("no")]);
        const booking = entity("booking", [key("id")]);
        const r = convert(
            model([building, room, booking], [identifying("has", "building", "room"), rel("for_room", [end("room", "1"), end("booking", "N")])]),
        );
        expect(r.fks("booking", "room")).toHaveLength(2);
    });

    it("N:M between a weak entity and a strong entity has FK columns for the whole weak PK", () => {
        const room = weak("room", [key("no")]);
        const event = entity("event", [key("id")]);
        const r = convert(
            model([building, room, event], [identifying("has", "building", "room"), rel("hosts", [end("room", "N"), end("event", "M")])]),
        );
        expect(r.fks("hosts", "room")).toHaveLength(2);
        expect(r.pk("hosts")).toHaveLength(3);
    });

    it("ownership cycle between two weak entities terminates (no hang, no exception)", () => {
        const a = weak("a", [key("x")]);
        const b = weak("b", [key("y")]);
        expect(() => convert(model([a, b], [identifying("ab", "a", "b"), identifying("ba", "b", "a")]))).not.toThrow();
    });
});

describe("pitfall: generalization", () => {
    it("subclass of a weak entity references the weak entity's whole PK", () => {
        const building = entity("building", [key("code")]);
        const room = weak("room", [key("no")]);
        const lab = entity("lab_room", [attr("equipment")]);
        const r = convert(model([building, room, lab], [identifying("has", "building", "room")], { generalizations: [isa("room", ["lab_room"])] } as any));
        expect(r.pk("lab_room")).toHaveLength(2);
        expect(r.fks("lab_room", "room")).toHaveLength(2);
    });

    it("inheritance cycle (A is B and B is A) terminates", () => {
        const a = entity("a", [key("id")]);
        const b = entity("b", [key("id")]);
        expect(() => convert(model([a, b], [], { generalizations: [isa("a", ["b"]), isa("b", ["a"])] } as any))).not.toThrow();
    });

    it("an entity that is its own parent does not crash", () => {
        const a = entity("a", [key("id")]);
        expect(() => convert(model([a], [], { generalizations: [isa("a", ["a"])] } as any))).not.toThrow();
    });

    it("a generalization that lists a child entity which does not exist is reported", () => {
        const person = entity("person", [key("id")]);
        const r = convert(model([person], [], { generalizations: [isa("person", ["ghost"])] } as any));
        expect(warnings(r).join("\n")).toMatch(/ghost/);
    });

    it("a missing child is reported with the parent's name, and the other children are still converted", () => {
        const person = entity("person", [key("id")]);
        const student = entity("student", [attr("gpa")]);
        const r = convert(model([person, student], [], { generalizations: [isa("person", ["student", "ghost"])] } as any));
        expect(warnings(r).join("\n")).toMatch(/person.*ghost/);
        expect(r.fks("student", "person")).toHaveLength(1);
    });

    it("a generalization whose children all exist produces no notice", () => {
        const person = entity("person", [key("id")]);
        const student = entity("student", [attr("gpa")]);
        const r = convert(model([person, student], [], { generalizations: [isa("person", ["student"])] } as any));
        expect(r.notices).toEqual([]);
    });

    it("overlap/total versus disjoint/partial does not change the relational schema", () => {
        const person = entity("person", [key("id")]);
        const student = entity("student", [attr("gpa")]);
        const a = isa("person", ["student"]);
        const b = { ...isa("person", ["student"]), constraints: { disjointness: "overlap", completeness: "total" } };
        const shape = (g: unknown) => {
            const r = convert(model([person, student], [], { generalizations: [g] } as any));
            return r.tables.map((t) => `${t.name}(${t.columns.map((c) => c.name).join(",")})`).sort();
        };
        expect(shape(b)).toEqual(shape(a));
    });
});

describe("pitfall: attributes of relationships and multi-valued attributes", () => {
    const a = entity("a", [key("id")]);
    const b = entity("b", [key("id")]);

    it("derived attribute inside a composite is not stored and is reported", () => {
        const full = attr("name", { kind: "composite", components: [attr("first"), attr("initials", { kind: "derived" })] });
        const r = convert(model([entity("person", [key("id"), full])]));
        expect(r.colNames("person")).not.toContain("initials");
        expect(warnings(r).join("\n")).toMatch(/initials/);
    });

    it("derived attribute on a relationship is not stored and is reported", () => {
        const r = convert(model([a, b], [rel("r", [end("a", "N"), end("b", "M")], { attributes: [attr("total", { kind: "derived" })] })]));
        expect(r.colNames("r")).not.toContain("total");
        expect(warnings(r).join("\n")).toMatch(/total/);
    });

    it("composite attribute on a relationship is stored as its components", () => {
        const period = attr("period", { kind: "composite", components: [attr("from_date"), attr("to_date")] });
        const r = convert(model([a, b], [rel("r", [end("a", "N"), end("b", "M")], { attributes: [period] })]));
        expect(r.colNames("r")).toEqual(expect.arrayContaining(["from_date", "to_date"]));
        expect(r.colNames("r")).not.toContain("period");
    });

    it("multi-valued attribute with components (phone: type + number) keeps every component as a column", () => {
        const phone = attr("phone", { kind: "multi_valued", components: [attr("kind"), attr("number")] });
        const r = convert(model([entity("person", [key("id"), phone])]));
        const mv = r.tables.find((t) => t.name !== "person")!;
        expect(mv.columns.map((c) => c.name)).toEqual(expect.arrayContaining(["kind", "number"]));
    });

    it("derived attribute on a 1:N relationship is not stored on the N side table and is reported", () => {
        const r = convert(model([a, b], [rel("r", [end("a", "1"), end("b", "N")], { attributes: [attr("total", { kind: "derived" })] })]));
        expect(r.colNames("b")).not.toContain("total");
        expect(warnings(r).join("\n")).toMatch(/total/);
    });

    it("derived attribute on a ternary relationship is not stored and is reported", () => {
        const c = entity("c", [key("id")]);
        const r = convert(model([a, b, c], [rel("t", [end("a", "N"), end("b", "N"), end("c", "N")], { attributes: [attr("total", { kind: "derived" })] })]));
        expect(r.colNames("t")).not.toContain("total");
        expect(warnings(r).join("\n")).toMatch(/total/);
    });

    it("derived attribute on an identifying relationship is not stored on the weak table and is reported", () => {
        const building = entity("building", [key("code")]);
        const room = weak("room", [key("no")]);
        const r = convert(model([building, room], [identifying("has", "building", "room", { attributes: [attr("age", { kind: "derived" })] })]));
        expect(r.colNames("room")).not.toContain("age");
        expect(warnings(r).join("\n")).toMatch(/age/);
    });

    it("composite attribute on a 1:N relationship becomes component columns on the N side table", () => {
        const period = attr("period", { kind: "composite", components: [attr("from_date"), attr("to_date")] });
        const r = convert(model([a, b], [rel("r", [end("a", "1"), end("b", "N")], { attributes: [period] })]));
        expect(r.colNames("b")).toEqual(expect.arrayContaining(["from_date", "to_date"]));
        expect(r.colNames("b")).not.toContain("period");
    });

    it("composite attribute on a ternary relationship becomes component columns on the junction (slide step 7)", () => {
        const c = entity("c", [key("id")]);
        const period = attr("period", { kind: "composite", components: [attr("from_date"), attr("to_date")] });
        const r = convert(model([a, b, c], [rel("t", [end("a", "N"), end("b", "N"), end("c", "N")], { attributes: [period] })]));
        expect(r.colNames("t")).toEqual(expect.arrayContaining(["from_date", "to_date"]));
        expect(r.colNames("t")).not.toContain("period");
    });

    it("composite attribute on an identifying relationship becomes component columns on the weak table", () => {
        const building = entity("building", [key("code")]);
        const room = weak("room", [key("no")]);
        const period = attr("period", { kind: "composite", components: [attr("from_date"), attr("to_date")] });
        const r = convert(model([building, room], [identifying("has", "building", "room", { attributes: [period] })]));
        expect(r.colNames("room")).toEqual(expect.arrayContaining(["from_date", "to_date"]));
    });

    it("composite relationship attribute components are nullable and not part of the PK", () => {
        const period = attr("period", { kind: "composite", components: [attr("from_date"), attr("to_date")] });
        const r = convert(model([a, b], [rel("r", [end("a", "N"), end("b", "M")], { attributes: [period] })]));
        const cols = r.table("r").columns.filter((c) => c.name === "from_date" || c.name === "to_date");
        expect(cols).toHaveLength(2);
        expect(cols.every((c) => c.nullable && !c.roles?.primaryKey)).toBe(true);
        expect(r.pk("r")).toHaveLength(2);
    });

    it("two composite relationship attributes with the same component names are prefixed and reported", () => {
        const start = attr("start", { kind: "composite", components: [attr("day"), attr("month")] });
        const end2 = attr("finish", { kind: "composite", components: [attr("day"), attr("month")] });
        const r = convert(model([a, b], [rel("r", [end("a", "N"), end("b", "M")], { attributes: [start, end2] })]));
        noDuplicateColumns(r);
        expect(r.colNames("r")).toEqual(expect.arrayContaining(["day", "month", "finish_day", "finish_month"]));
        expect(warnings(r).join("\n")).toMatch(/finish_day/);
    });

    it("a composite relationship attribute with a derived component stores the other components and reports the derived one", () => {
        const period = attr("period", { kind: "composite", components: [attr("from_date"), attr("days", { kind: "derived" })] });
        const r = convert(model([a, b], [rel("r", [end("a", "N"), end("b", "M")], { attributes: [period] })]));
        expect(r.colNames("r")).toContain("from_date");
        expect(r.colNames("r")).not.toContain("days");
        expect(warnings(r).join("\n")).toMatch(/days/);
    });

    it("multi-valued composite attribute: PK = owner FK + every component (slide step 6)", () => {
        const phone = attr("phone", { kind: "multi_valued", components: [attr("kind"), attr("number")] });
        const r = convert(model([entity("person", [key("id"), phone])]));
        const mv = r.tables.find((t) => t.name !== "person")!;
        expect(mv.columns.map((c) => c.name).sort()).toEqual(["kind", "number", "person_id"]);
        expect(mv.columns.every((c) => c.roles?.primaryKey)).toBe(true);
        expect(mv.columns.find((c) => c.name === "person_id")!.roles?.foreignKey?.refTableId).toBe("person");
    });

    it("multi-valued composite attribute on an owner with a composite PK carries the whole owner PK plus the components", () => {
        const tag = attr("tag", { kind: "multi_valued", components: [attr("label"), attr("color")] });
        const r = convert(model([entity("seat", [key("room"), key("number"), tag])]));
        const mv = r.tables.find((t) => t.name !== "seat")!;
        expect(mv.columns).toHaveLength(4);
        expect(mv.columns.filter((c) => c.roles?.foreignKey?.refTableId === "seat")).toHaveLength(2);
    });

    it("multi-valued composite component named like the owner's FK column is prefixed", () => {
        const link = attr("link", { kind: "multi_valued", components: [attr("person_id"), attr("url")] });
        const r = convert(model([entity("person", [key("id"), link])]));
        const mv = r.tables.find((t) => t.name !== "person")!;
        const names = mv.columns.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain("link_person_id");
    });

    it("multi-valued composite attribute whose components are all derived is dropped and reported", () => {
        const odd = attr("odd", { kind: "multi_valued", components: [attr("x", { kind: "derived" })] });
        const r = convert(model([entity("person", [key("id"), odd])]));
        expect(r.tables.map((t) => t.name)).toEqual(["person"]);
        expect(warnings(r).join("\n")).toMatch(/odd/);
    });

    it("nested components of a multi-valued attribute are flattened to their leaves", () => {
        const place = attr("place", {
            kind: "multi_valued",
            components: [attr("street"), attr("geo", { kind: "composite", components: [attr("lat"), attr("lng")] })],
        });
        const r = convert(model([entity("person", [key("id"), place])]));
        const mv = r.tables.find((t) => t.name !== "person")!;
        expect(mv.columns.map((c) => c.name).sort()).toEqual(["lat", "lng", "person_id", "street"]);
    });

    it("same multi-valued attribute name on two entities gives two separate tables", () => {
        const p = entity("person", [key("id"), attr("email", { kind: "multi_valued" })]);
        const c = entity("company", [key("id"), attr("email", { kind: "multi_valued" })]);
        const r = convert(model([p, c]));
        const names = r.tables.map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
        expect(r.tables).toHaveLength(4);
    });

    it("a multi-valued attribute table does not take the name of an existing entity", () => {
        const person = entity("person", [key("id"), attr("phone", { kind: "multi_valued" })]);
        const clash = entity("person_phone", [key("id")]);
        const r = convert(model([person, clash]));
        const names = r.tables.map((t) => t.name.toLowerCase());
        expect(new Set(names).size).toBe(names.length);
        expect(r.tables).toHaveLength(3);
    });

    it("multi-valued attribute on a weak entity references the weak entity's whole PK", () => {
        const building = entity("building", [key("code")]);
        const room = weak("room", [key("no"), attr("tag", { kind: "multi_valued" })]);
        const r = convert(model([building, room], [identifying("has", "building", "room")]));
        const mv = r.tables.find((t) => t.columns.some((c) => c.name === "tag") && t.name !== "room")!;
        expect(mv.columns.filter((c) => c.roles?.foreignKey?.refTableId === "room")).toHaveLength(2);
    });

    it("entity that has only key attributes keeps all of them in the PK", () => {
        const r = convert(model([entity("pair", [key("a"), key("b")])]));
        expect(r.pk("pair")).toHaveLength(2);
        expect(r.table("pair").columns).toHaveLength(2);
    });
});

describe("pitfall: degenerate input", () => {
    it("an empty model converts to an empty schema", () => {
        const r = convert(model([]));
        expect(r.tables).toEqual([]);
        expect(r.notices).toEqual([]);
    });

    it("an entity with no attributes still becomes a table with a PK", () => {
        const r = convert(model([entity("empty", [])]));
        expect(r.pk("empty")).toHaveLength(1);
    });

    it("converting the same model twice gives the same tables and columns (ids aside)", () => {
        const m = model(
            [entity("a", [key("id"), attr("x")]), entity("b", [key("id")])],
            [rel("r", [end("a", "N"), end("b", "M")], { attributes: [attr("w")] })],
        );
        const shape = () => convert(m).tables.map((t) => `${t.name}(${t.columns.map((c) => c.name).join(",")})`);
        expect(shape()).toEqual(shape());
    });

    it("the input model is not mutated by the conversion", () => {
        const m = model([entity("a", [key("id")]), entity("b", [key("id")])], [rel("r", [end("a", "1"), end("b", "N")])]);
        const before = JSON.stringify(m);
        convert(m);
        expect(JSON.stringify(m)).toBe(before);
    });
});

// Names typed by users: Vietnamese diacritics, spaces, special characters. The DDL generator quotes every identifier,
// so such names are valid downstream and the logical schema keeps them as the user wrote them.
describe("names with diacritics, spaces and special characters", () => {
    const NFD = (v: string) => v.normalize("NFD");

    it("Vietnamese names are kept exactly as typed (table and column names)", () => {
        const r = convert(model([entity("Học sinh", [key("Mã số"), attr("Họ và tên")])]));
        expect(r.tables.map((t) => t.name)).toEqual(["Học sinh"]);
        expect(r.colNames("Học sinh")).toEqual(["Mã số", "Họ và tên"]);
    });

    it("names with spaces are kept as typed", () => {
        const r = convert(model([entity("order item", [key("item no"), attr("unit price")])]));
        expect(r.colNames("order item")).toEqual(["item no", "unit price"]);
    });

    it("names with hyphens, dots or symbols are kept as typed", () => {
        const r = convert(model([entity("e-shop", [key("shop.id"), attr("price ($)"), attr("e-mail")])]));
        expect(r.colNames("e-shop")).toEqual(["shop.id", "price ($)", "e-mail"]);
    });

    it("names that differ only by a diacritic are different names (Ma / Mã) and are not reported", () => {
        const r = convert(model([entity("person", [key("id"), attr("Ma"), attr("Mã")])]));
        expect(r.colNames("person")).toEqual(expect.arrayContaining(["Ma", "Mã"]));
        expect(r.notices).toEqual([]);
    });

    it("the same name typed with different Unicode forms (precomposed vs combining accent) is reported as a duplicate", () => {
        const r = convert(model([entity("person", [key("id"), attr("Mã"), attr(NFD("Mã"))])]));
        expect(warnings(r).join("\n")).toMatch(/same name/);
    });

    it("upper/lower case of an accented letter is the same name (MÃ / mã) and is reported", () => {
        const r = convert(model([entity("person", [key("id"), attr("MÃ"), attr("mã")])]));
        expect(warnings(r).join("\n")).toMatch(/same name/);
    });

    it("two entities that differ only by trailing spaces ('user' / 'user ') are reported", () => {
        const r = convert(model([entity("user", [key("id")]), entity("user ", [key("id")])]));
        expect(warnings(r).join("\n")).toMatch(/same name/);
    });

    it("leading and trailing spaces are kept as typed (spaces in names are accepted as valid)", () => {
        const r = convert(model([entity("  student  ", [key(" sid "), attr(" name ")])]));
        expect(r.tables.map((t) => t.name)).toEqual(["  student  "]);
        expect(r.colNames("  student  ")).toEqual([" sid ", " name "]);
    });

    it("an explicit relationship name with spaces is used as the junction table name", () => {
        const a = entity("student", [key("id")]);
        const b = entity("course", [key("id")]);
        const r = convert(model([a, b], [rel("is enrolled in", [end("student", "N"), end("course", "M")])]));
        expect(r.tables.map((t) => t.name)).toContain("is enrolled in");
    });

    it("a FK column generated from a table name with spaces keeps the space (accepted as valid)", () => {
        const c = entity("order item", [key("id")]);
        const o = entity("order", [key("id")]);
        const r = convert(model([c, o], [rel("has", [end("order item", "1"), end("order", "N")])]));
        expect(r.fks("order", "order item")[0].name).toBe("order item_id");
    });

    it("an automatically named junction table built from names with spaces and diacritics keeps them (accepted as valid)", () => {
        const a = entity("học sinh", [key("id")]);
        const b = entity("môn học", [key("id")]);
        const r = convert(model([a, b], [rel("", [end("học sinh", "N"), end("môn học", "M")])]));
        expect(r.tables.map((t) => t.name)).toContain("học sinh_môn học");
        expect(r.fks("học sinh_môn học").map((c) => c.name).sort()).toEqual(["học sinh_id", "môn học_id"]);
    });

    it("an automatically named surrogate key built from an entity name with spaces keeps the space (accepted as valid)", () => {
        const r = convert(model([entity("order item", [attr("id"), attr("qty")])]));
        expect(r.pk("order item")[0].name).toBe("order item_id");
    });

    it("an entity whose name is only spaces is treated as having no name: it gets a default name and the user is told", () => {
        const r = convert(model([entity("   ", [key("id")])]));
        expect(r.tables.map((t) => t.name)).toEqual(["unnamed_entity"]);
        expect(warnings(r).join("\n")).toMatch(/unnamed_entity/);
    });

    it("two entities without a name get two different default names", () => {
        const r = convert(model([entity("", [key("id")]), { ...entity("", [key("id")]), id: "second" }]));
        expect(r.tables.map((t) => t.name).sort()).toEqual(["unnamed_entity", "unnamed_entity_2"]);
    });

    it("a default entity name does not clash with an entity that is really called unnamed_entity", () => {
        const r = convert(model([entity("unnamed_entity", [key("id")]), { ...entity("", [key("id")]), id: "blank" }]));
        const names = r.tables.map((t) => t.name);
        expect(new Set(names).size).toBe(2);
        expect(names).toContain("unnamed_entity_2");
    });

    it("a relationship still connects an unnamed entity (its FK is built from the default name)", () => {
        const owner = { ...entity("", [key("id")]), id: "blank" };
        const item = entity("item", [key("id")]);
        const r = convert(model([owner, item], [rel("has", [end("blank", "1"), end("item", "N")])]));
        expect(r.fks("item", "unnamed_entity")).toHaveLength(1);
    });

    it("two attributes without a name get two different default names", () => {
        const r = convert(model([entity("person", [key("id"), attr(""), attr("  ")])]));
        expect(r.colNames("person")).toEqual(["id", "unnamed_attribute", "unnamed_attribute_2"]);
    });

    it("a composite component without a name gets a default name", () => {
        const address = attr("address", { kind: "composite", components: [attr("city"), attr("")] });
        const r = convert(model([entity("person", [key("id"), address])]));
        expect(r.colNames("person")).toEqual(["id", "city", "unnamed_attribute"]);
        expect(warnings(r).join("\n")).toMatch(/person.*unnamed_attribute/);
    });

    it("a relationship attribute without a name gets a default name on the junction table", () => {
        const a = entity("a", [key("id")]);
        const b = entity("b", [key("id")]);
        const r = convert(model([a, b], [rel("r", [end("a", "N"), end("b", "M")], { attributes: [attr("")] })]));
        expect(r.colNames("r")).toContain("unnamed_attribute");
        expect(warnings(r).join("\n")).toMatch(/Relationship r.*unnamed_attribute/);
    });

    it("an identifying relationship attribute without a name gets a default name on the weak table", () => {
        const building = entity("building", [key("code")]);
        const room = weak("room", [key("no")]);
        const r = convert(model([building, room], [identifying("has", "building", "room", { attributes: [attr("")] })]));
        expect(r.colNames("room")).toContain("unnamed_attribute");
    });

    it("the input model is not changed when names are filled in", () => {
        const m = model([entity("", [key("id"), attr("")])]);
        const before = JSON.stringify(m);
        convert(m);
        expect(JSON.stringify(m)).toBe(before);
    });

    it("entities and attributes that have names are not renamed and produce no notice", () => {
        const r = convert(model([entity("student", [key("sid"), attr("name")])]));
        expect(r.colNames("student")).toEqual(["sid", "name"]);
        expect(r.notices).toEqual([]);
    });

    it("an entity with an empty name does not crash and is reported", () => {
        let r: ReturnType<typeof convert> | undefined;
        expect(() => { r = convert(model([entity("", [key("id")])])); }).not.toThrow();
        expect(warnings(r!).join("\n")).toMatch(/name/i);
    });

    it("an attribute with an empty name does not crash and is reported", () => {
        let r: ReturnType<typeof convert> | undefined;
        expect(() => { r = convert(model([entity("person", [key("id"), attr("")])])); }).not.toThrow();
        expect(warnings(r!).join("\n")).toMatch(/name/i);
    });
});

describe("round trip: conceptual -> logical -> conceptual keeps the structure", () => {
    const source = model(
        [
            entity("person", [key("id"), attr("name"), attr("phone", { kind: "multi_valued" })]),
            entity("student", [attr("gpa")]),
            entity("department", [key("code")]),
            entity("instructor", [attr("salary")]),
            entity("course", [key("cid")]),
            weak("section", [key("sec_no")]),
        ],
        [
            rel("works_in", [end("department", "1"), end("instructor", "N", false)]),
            identifying("offers", "course", "section"),
            rel("takes", [end("student", "N"), end("section", "M")], { attributes: [attr("grade")] }),
        ],
        { generalizations: [isa("person", ["student", "instructor"])] } as any,
    );
    const back = convertLogicalToConceptual(convertConceptualToLogicalWithNotices(source).model);

    it("every original entity is still an entity", () => {
        const names = back.entities.map((e) => e.name).sort();
        expect(names).toEqual(source.entities.map((e) => e.name).sort());
    });

    it("the weak entity is still weak and is tied to its owner by an identifying relationship", () => {
        expect(back.entities.find((e) => e.name === "section")?.kind).toBe("weak");
        expect(back.relationships.some((x) => x.type === "identifying")).toBe(true);
    });

    it("the generalization is recovered with both children", () => {
        const gen = back.generalizations?.[0];
        const nameOf = (id: string) => back.entities.find((e) => e.id === id)?.name;
        expect(gen?.childEntityIds.map(nameOf).sort()).toEqual(["instructor", "student"]);
    });

    it("the multi-valued attribute is an attribute of person again, not an entity", () => {
        const person = back.entities.find((e) => e.name === "person")!;
        expect(person.attributes.some((a) => a.name === "phone" && a.kind === "multi_valued")).toBe(true);
        expect(back.entities.map((e) => e.name)).not.toContain("person_phone");
    });

    it("the N:M with an attribute comes back as ONE relationship that still carries the attribute", () => {
        const takes = back.relationships.find((x) => x.name === "takes");
        expect(takes?.attributes?.map((a) => a.name)).toContain("grade");
        expect(takes?.ends).toHaveLength(2);
    });
});
