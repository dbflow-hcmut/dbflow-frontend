/**
 * Logical -> Conceptual (reverse engineering): what a database designer would read out of a relational schema.
 *
 * Expectations follow the standard relational -> ER reading (foreign key = relationship, pure junction table =
 * N:M, partial-key + owner FK = weak entity, PK that is also an FK = subclass, ...), not the converter's code.
 * A failing test is either a real gap or a rule we should decide to drop on purpose.
 *
 * Run: yarn test src/components/EditProject/utils/logical-to-conceptual.spec.ts
 */

import { convertLogicalToConceptualWithNotices, convertConceptualToLogicalWithNotices } from "./schema-conversion";
import type { LogicalModelPayload } from "./logical-model.builder";

// ── model builders ───────────────────────────────────────────────────────────────────────────────
// column spec: "name" | "name:pk" | "name:fk(table.col)" | "name:pk,fk(table.col)" | flags notnull / unique / ck

type Table = LogicalModelPayload["tables"][number];

const col = (spec: string, table: string) => {
    const [name, flagStr = ""] = spec.split(":");
    const flags: string[] = flagStr.match(/fk\([^)]*\)|[a-z]+/g) ?? [];
    const isPk = flags.includes("pk");
    const fkFlag = flags.find((f) => f.startsWith("fk("));
    const roles: Record<string, unknown> = {};
    if (isPk) roles.primaryKey = true;
    if (flags.includes("ck")) roles.candidateKey = true;
    if (fkFlag) {
        const [refTable, refCol] = fkFlag.slice(3, -1).split(".");
        roles.foreignKey = { refTableId: refTable, refColumnId: `${refTable}.${refCol}` };
    }
    return {
        id: `${table}.${name}`,
        name,
        nullable: isPk || flags.includes("notnull") ? false : true,
        unique: flags.includes("unique"),
        ...(Object.keys(roles).length ? { roles } : {}),
    };
};
const table = (name: string, specs: string[], extra: Partial<Table> = {}): Table =>
    ({ id: name, name, columns: specs.map((s) => col(s, name)), ...extra }) as Table;
const model = (tables: Table[]): LogicalModelPayload => ({ model: { id: "m", name: "Logical", version: 1 }, tables }) as LogicalModelPayload;

// ── result helpers ───────────────────────────────────────────────────────────────────────────────

const convert = (m: LogicalModelPayload) => {
    const { model: c, notices } = convertLogicalToConceptualWithNotices(m);
    const byId = new Map(c.entities.map((e) => [e.id, e]));
    const nameOf = (id: string) => byId.get(id)?.name ?? id;
    const entity = (name: string) => {
        const e = c.entities.find((x) => x.name === name);
        if (!e) throw new Error(`entity "${name}" not found; entities are: ${c.entities.map((x) => x.name).join(", ")}`);
        return e;
    };
    const attrs = (name: string) => entity(name).attributes.map((a) => a.name);
    const keys = (name: string) => entity(name).attributes.filter((a) => a.isKey).map((a) => a.name);
    /** relationships that connect the two entities (in any order). */
    const relsBetween = (a: string, b: string) =>
        c.relationships.filter((r) => {
            const ids = r.ends.map((e) => nameOf(e.entityId));
            return a === b ? ids.filter((x) => x === a).length >= 2 : ids.includes(a) && ids.includes(b);
        });
    const relByName = (name: string) => c.relationships.find((r) => r.name === name);
    const endOf = (r: (typeof c.relationships)[number], entityName: string) => r.ends.find((e) => nameOf(e.entityId) === entityName)!;
    const entityNames = c.entities.map((e) => e.name).sort();
    return { c, notices, entity, attrs, keys, relsBetween, relByName, endOf, entityNames, nameOf };
};
const warnings = (r: ReturnType<typeof convert>) => r.notices.filter((n) => n.level === "warning").map((n) => n.message);

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("tables, keys and plain columns", () => {
    it("a plain table becomes an entity: PK column is the key attribute, other columns are attributes", () => {
        const r = convert(model([table("student", ["sid:pk", "name", "email"])]));
        expect(r.entityNames).toEqual(["student"]);
        expect(r.keys("student")).toEqual(["sid"]);
        expect(r.attrs("student")).toEqual(expect.arrayContaining(["sid", "name", "email"]));
    });

    it("a composite PK of plain columns gives several key attributes on one entity", () => {
        const r = convert(model([table("seat", ["room:pk", "number:pk", "label"])]));
        expect(r.keys("seat").sort()).toEqual(["number", "room"]);
    });

    it("a candidate-key column is read as a key attribute", () => {
        const r = convert(model([table("user", ["id:pk", "email:ck"])]));
        expect(r.keys("user").sort()).toEqual(["email", "id"]);
    });

    it("table and column names are kept exactly as written", () => {
        const r = convert(model([table("Order_Item", ["Item_No:pk", "unit_Price"])]));
        expect(r.entityNames).toEqual(["Order_Item"]);
        expect(r.attrs("Order_Item")).toEqual(expect.arrayContaining(["Item_No", "unit_Price"]));
    });

    it("table notes are carried to the entity", () => {
        const r = convert(model([table("student", ["sid:pk"], { notes: "enrolled students" } as Partial<Table>)]));
        expect(r.entity("student").notes).toBe("enrolled students");
    });

    it("column notes are not lost (kept on the attribute or reported)", () => {
        const t = table("student", ["sid:pk", "name"]);
        (t.columns[1] as { notes?: string }).notes = "legal name";
        const r = convert(model([t]));
        const attr = r.entity("student").attributes.find((a) => a.name === "name") as { notes?: string };
        expect(attr.notes === "legal name" || warnings(r).join("\n").match(/name/)).toBeTruthy();
    });

    it("a table without a primary key still becomes an entity (no crash)", () => {
        const r = convert(model([table("log", ["message", "created_at"])]));
        expect(r.entityNames).toEqual(["log"]);
        expect(r.attrs("log")).toEqual(expect.arrayContaining(["message", "created_at"]));
    });

    it("a table with only the PK columns still becomes an entity", () => {
        const r = convert(model([table("pair", ["a:pk", "b:pk"])]));
        expect(r.entityNames).toEqual(["pair"]);
        expect(r.keys("pair").sort()).toEqual(["a", "b"]);
    });

    it("an empty schema converts to an empty model", () => {
        const r = convert(model([]));
        expect(r.c.entities).toEqual([]);
        expect(r.c.relationships).toEqual([]);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("foreign keys become relationships", () => {
    const customer = table("customer", ["id:pk", "name"]);

    it("a FK column becomes a relationship, not an attribute", () => {
        const order = table("order", ["id:pk", "customer_id:fk(customer.id)"]);
        const r = convert(model([customer, order]));
        expect(r.attrs("order")).not.toContain("customer_id");
        expect(r.relsBetween("order", "customer")).toHaveLength(1);
    });

    it("an ordinary FK is many-to-one: N on the table that holds the FK, 1 on the referenced table", () => {
        const order = table("order", ["id:pk", "customer_id:fk(customer.id)"]);
        const r = convert(model([customer, order]));
        const rel = r.relsBetween("order", "customer")[0];
        expect(r.endOf(rel, "order").cardinality).toBe("N");
        expect(r.endOf(rel, "customer").cardinality).toBe("1");
    });

    it("a NOT NULL FK is mandatory on the N side, a nullable FK is optional", () => {
        const required = convert(model([customer, table("order", ["id:pk", "customer_id:fk(customer.id),notnull"])]));
        const optional = convert(model([customer, table("order", ["id:pk", "customer_id:fk(customer.id)"])]));
        expect(required.endOf(required.relsBetween("order", "customer")[0], "order").optional).toBe(false);
        expect(optional.endOf(optional.relsBetween("order", "customer")[0], "order").optional).toBe(true);
    });

    it("a UNIQUE FK is one-to-one, not one-to-many", () => {
        const profile = table("profile", ["id:pk", "user_id:fk(customer.id),unique"]);
        const r = convert(model([customer, profile]));
        const rel = r.relsBetween("profile", "customer")[0];
        expect(r.endOf(rel, "profile").cardinality).toBe("1");
    });

    it("two FKs from the same table to the same table give two relationships", () => {
        const order = table("order", ["id:pk", "placed_by:fk(customer.id)", "billed_to:fk(customer.id)"]);
        const r = convert(model([customer, order]));
        expect(r.relsBetween("order", "customer")).toHaveLength(2);
    });

    it("a self-referencing FK (employee.manager_id) is one recursive relationship", () => {
        const emp = table("employee", ["id:pk", "name", "manager_id:fk(employee.id)"]);
        const r = convert(model([emp]));
        expect(r.attrs("employee")).not.toContain("manager_id");
        const rels = r.relsBetween("employee", "employee");
        expect(rels).toHaveLength(1);
        expect(rels[0].ends).toHaveLength(2);
    });

    it("a composite FK (two columns to a composite PK) is ONE relationship, not two", () => {
        const section = table("section", ["course_no:pk", "section_no:pk"]);
        const enrol = table("enrol", ["id:pk", "course_no:fk(section.course_no)", "section_no:fk(section.section_no)"]);
        const r = convert(model([section, enrol]));
        expect(r.relsBetween("enrol", "section")).toHaveLength(1);
        expect(r.attrs("enrol")).not.toEqual(expect.arrayContaining(["course_no"]));
    });

    it("a composite FK is converted without any false warning (nothing was lost)", () => {
        const section = table("section", ["course_no:pk", "section_no:pk"]);
        const enrol = table("enrol", ["id:pk", "course_no:fk(section.course_no)", "section_no:fk(section.section_no)"]);
        expect(convert(model([section, enrol])).notices).toEqual([]);
    });

    it("two tables that reference each other give two relationships (one per FK direction)", () => {
        const a = table("a", ["id:pk", "b_id:fk(b.id)"]);
        const b = table("b", ["id:pk", "a_id:fk(a.id)"]);
        expect(convert(model([a, b])).relsBetween("a", "b")).toHaveLength(2);
    });

    it("a FK that points to a table that does not exist is reported", () => {
        const order = table("order", ["id:pk", "customer_id:fk(ghost.id)"]);
        const r = convert(model([order]));
        expect(warnings(r).join("\n")).toMatch(/customer_id/);
    });

    it("a table that has only FK columns and no PK becomes an entity with its relationships", () => {
        const a = table("a", ["id:pk"]);
        const b = table("b", ["id:pk"]);
        const link = table("link_log", ["a_id:fk(a.id)", "b_id:fk(b.id)", "note"]);
        const r = convert(model([a, b, link]));
        expect(r.entityNames).toContain("link_log");
        expect(r.relsBetween("link_log", "a")).toHaveLength(1);
        expect(r.relsBetween("link_log", "b")).toHaveLength(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("junction tables", () => {
    const student = table("student", ["id:pk"]);
    const course = table("course", ["id:pk"]);

    it("a table whose PK is exactly two FKs is an N:M relationship, not an entity", () => {
        const enrols = table("enrols", ["student_id:pk,fk(student.id)", "course_id:pk,fk(course.id)"]);
        const r = convert(model([student, course, enrols]));
        expect(r.entityNames).toEqual(["course", "student"]);
        const rel = r.relByName("enrols")!;
        expect(rel).toBeDefined();
        expect(rel.ends).toHaveLength(2);
        expect(rel.ends.every((e) => e.cardinality === "N" || e.cardinality === "M")).toBe(true);
    });

    it("extra columns of the junction table become attributes of the relationship", () => {
        const enrols = table("enrols", ["student_id:pk,fk(student.id)", "course_id:pk,fk(course.id)", "grade", "semester"]);
        const r = convert(model([student, course, enrols]));
        expect(r.relByName("enrols")!.attributes?.map((a) => a.name).sort()).toEqual(["grade", "semester"]);
    });

    it("a junction with three FKs in its PK is ONE ternary relationship with three ends", () => {
        const project = table("project", ["id:pk"]);
        const supply = table("supply", ["student_id:pk,fk(student.id)", "course_id:pk,fk(course.id)", "project_id:pk,fk(project.id)"]);
        const r = convert(model([student, course, project, supply]));
        expect(r.relByName("supply")!.ends).toHaveLength(3);
    });

    it("a recursive junction (course prerequisites) is one N:M relationship from course to course", () => {
        const prereq = table("prerequisite", ["course_id:pk,fk(course.id)", "requires_id:pk,fk(course.id)"]);
        const r = convert(model([course, prereq]));
        expect(r.entityNames).toEqual(["course"]);
        expect(r.relByName("prerequisite")!.ends).toHaveLength(2);
    });

    it("a junction between two entities with COMPOSITE keys is still a binary relationship (two ends)", () => {
        const flight = table("flight", ["airline:pk", "number:pk"]);
        const crew = table("crew", ["badge:pk"]);
        const staffed = table("staffed_by", ["airline:pk,fk(flight.airline)", "number:pk,fk(flight.number)", "badge:pk,fk(crew.badge)"]);
        const r = convert(model([flight, crew, staffed]));
        expect(r.entityNames).toEqual(["crew", "flight"]);
        expect(r.relByName("staffed_by")!.ends).toHaveLength(2);
    });

    it("a junction with its own surrogate id keeps both links (as an associative entity or an N:M)", () => {
        const enrols = table("enrols", ["id:pk", "student_id:fk(student.id)", "course_id:fk(course.id)", "grade"]);
        const r = convert(model([student, course, enrols]));
        const linkedToStudent = r.relsBetween("enrols", "student").length + r.relsBetween("course", "student").length;
        const linkedToCourse = r.relsBetween("enrols", "course").length + r.relsBetween("course", "student").length;
        expect(linkedToStudent).toBeGreaterThan(0);
        expect(linkedToCourse).toBeGreaterThan(0);
    });

    it("a table with PK (student_id FK, course_id FK, date) keeps both links to student and course", () => {
        const attendance = table("attendance", ["student_id:pk,fk(student.id)", "course_id:pk,fk(course.id)", "day:pk", "present"]);
        const r = convert(model([student, course, attendance]));
        expect(r.entityNames.concat(r.c.relationships.map((x) => x.name))).toContain("attendance");
        const touchesStudent = r.relsBetween("attendance", "student").length + (r.relByName("attendance")?.ends.length ? 1 : 0);
        expect(touchesStudent).toBeGreaterThan(0);
    });

    it("a junction does not also leave a relationship per FK (no duplicate relationships)", () => {
        const enrols = table("enrols", ["student_id:pk,fk(student.id)", "course_id:pk,fk(course.id)"]);
        const r = convert(model([student, course, enrols]));
        expect(r.c.relationships).toHaveLength(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("multi-valued attributes", () => {
    const person = table("person", ["id:pk", "name"]);

    it("a table (owner FK + value, both in the PK, nothing else) is a multi-valued attribute of the owner", () => {
        const phone = table("person_phone", ["person_id:pk,fk(person.id)", "phone:pk"]);
        const r = convert(model([person, phone]));
        expect(r.entityNames).toEqual(["person"]);
        const mv = r.entity("person").attributes.find((a) => a.name === "phone");
        expect(mv?.kind).toBe("multi_valued");
    });

    it("a table with an extra column is NOT a multi-valued attribute (it becomes an entity)", () => {
        const phone = table("person_phone", ["person_id:pk,fk(person.id)", "phone:pk", "kind"]);
        const r = convert(model([person, phone]));
        expect(r.entityNames).toContain("person_phone");
    });

    it("several multi-valued tables on one entity give several multi-valued attributes", () => {
        const phone = table("person_phone", ["person_id:pk,fk(person.id)", "phone:pk"]);
        const email = table("person_email", ["person_id:pk,fk(person.id)", "email:pk"]);
        const r = convert(model([person, phone, email]));
        const kinds = r.entity("person").attributes.filter((a) => a.kind === "multi_valued").map((a) => a.name).sort();
        expect(kinds).toEqual(["email", "phone"]);
    });

    it("a multi-valued table of an owner with a composite PK is still a multi-valued attribute", () => {
        const seat = table("seat", ["room:pk", "number:pk"]);
        const tag = table("seat_tag", ["room:pk,fk(seat.room)", "number:pk,fk(seat.number)", "tag:pk"]);
        const r = convert(model([seat, tag]));
        expect(r.entityNames).toEqual(["seat"]);
        expect(r.entity("seat").attributes.some((a) => a.name === "tag" && a.kind === "multi_valued")).toBe(true);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("weak entities", () => {
    const building = table("building", ["code:pk", "address"]);

    it("a table whose PK is (owner FK + partial key) with extra columns is a weak entity with an identifying relationship", () => {
        const room = table("room", ["building_code:pk,fk(building.code)", "room_no:pk", "floor"]);
        const r = convert(model([building, room]));
        expect(r.entity("room").kind).toBe("weak");
        expect(r.c.relationships.some((x) => x.type === "identifying")).toBe(true);
    });

    it("the weak entity keeps its partial key as the key attribute and does not repeat the owner key", () => {
        const room = table("room", ["building_code:pk,fk(building.code)", "room_no:pk", "floor"]);
        const r = convert(model([building, room]));
        expect(r.keys("room")).toEqual(["room_no"]);
        expect(r.attrs("room")).not.toContain("building_code");
    });

    it("the identifying relationship is 1 on the owner and N (mandatory) on the weak entity", () => {
        const room = table("room", ["building_code:pk,fk(building.code)", "room_no:pk", "floor"]);
        const r = convert(model([building, room]));
        const rel = r.c.relationships.find((x) => x.type === "identifying")!;
        expect(r.endOf(rel, "building").cardinality).toBe("1");
        expect(r.endOf(rel, "room").cardinality).toBe("N");
        expect(r.endOf(rel, "room").optional).toBe(false);
    });

    it("a weak entity with ONLY its partial key (owner FK + key, nothing else) is still a weak entity, not a multi-valued attribute", () => {
        const section = table("section", ["building_code:pk,fk(building.code)", "sec_no:pk"]);
        const r = convert(model([building, section]));
        expect(r.entityNames).toContain("section");
    });

    it("weak entity of a weak entity (building -> room -> bed) gives two weak entities", () => {
        const room = table("room", ["building_code:pk,fk(building.code)", "room_no:pk", "floor"]);
        const bed = table("bed", ["building_code:pk,fk(room.building_code)", "room_no:pk,fk(room.room_no)", "bed_no:pk", "type"]);
        const r = convert(model([building, room, bed]));
        expect(r.entity("room").kind).toBe("weak");
        expect(r.entity("bed").kind).toBe("weak");
    });

    it("a weak entity with a composite owner key (two FK columns) has ONE identifying relationship", () => {
        const campus = table("campus", ["city:pk", "code:pk"]);
        const lab = table("lab", ["city:pk,fk(campus.city)", "code:pk,fk(campus.code)", "lab_no:pk", "capacity"]);
        const r = convert(model([campus, lab]));
        expect(r.entity("lab").kind).toBe("weak");
        expect(r.c.relationships.filter((x) => x.type === "identifying")).toHaveLength(1);
    });

    it("a weak entity identified by TWO owners has an identifying relationship to each owner", () => {
        const student = table("student", ["id:pk"]);
        const course = table("course", ["id:pk"]);
        const attempt = table("attempt", ["student_id:pk,fk(student.id)", "course_id:pk,fk(course.id)", "no:pk", "score"]);
        const r = convert(model([student, course, attempt]));
        expect(r.c.relationships.filter((x) => x.type === "identifying")).toHaveLength(2);
    });

    it("a table with a composite PK made of plain columns is a normal entity, not a weak one", () => {
        const seat = table("seat", ["room:pk", "number:pk", "label"]);
        const r = convert(model([seat]));
        expect(r.entity("seat").kind).toBe("strong");
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("generalization (PK that is also an FK)", () => {
    const person = table("person", ["id:pk", "name"]);

    it("a table whose single PK column is an FK to another table is a subclass of it", () => {
        const student = table("student", ["id:pk,fk(person.id)", "gpa"]);
        const r = convert(model([person, student]));
        expect(r.c.generalizations).toHaveLength(1);
        const g = r.c.generalizations![0];
        expect(g.parentEntityIds.map(r.nameOf)).toEqual(["person"]);
        expect(g.childEntityIds.map(r.nameOf)).toEqual(["student"]);
    });

    it("the subclass keeps its own columns but not the inherited key", () => {
        const student = table("student", ["id:pk,fk(person.id)", "gpa"]);
        const r = convert(model([person, student]));
        expect(r.attrs("student")).toContain("gpa");
        expect(r.attrs("student")).not.toContain("id");
    });

    it("several subclasses of one parent are grouped in ONE generalization", () => {
        const student = table("student", ["id:pk,fk(person.id)", "gpa"]);
        const staff = table("staff", ["id:pk,fk(person.id)", "salary"]);
        const r = convert(model([person, student, staff]));
        expect(r.c.generalizations).toHaveLength(1);
        expect(r.c.generalizations![0].childEntityIds.map(r.nameOf).sort()).toEqual(["staff", "student"]);
    });

    it("multi-level inheritance (person -> student -> phd) gives two generalizations", () => {
        const student = table("student", ["id:pk,fk(person.id)", "gpa"]);
        const phd = table("phd", ["id:pk,fk(student.id)", "thesis"]);
        const r = convert(model([person, student, phd]));
        expect(r.c.generalizations).toHaveLength(2);
    });

    it("a subclass whose parent has a COMPOSITE key (two FK columns as PK) is still a subclass, not a junction", () => {
        const seat = table("seat", ["room:pk", "number:pk"]);
        const vip = table("vip_seat", ["room:pk,fk(seat.room)", "number:pk,fk(seat.number)", "perk"]);
        const r = convert(model([seat, vip]));
        expect(r.entityNames).toContain("vip_seat");
        expect(r.c.generalizations).toHaveLength(1);
    });

    it("a subclass with no extra columns is still a subclass", () => {
        const guest = table("guest", ["id:pk,fk(person.id)"]);
        const r = convert(model([person, guest]));
        expect(r.entityNames).toContain("guest");
        expect(r.c.generalizations).toHaveLength(1);
    });

    it("a relationship that targets a subclass table is kept", () => {
        const student = table("student", ["id:pk,fk(person.id)", "gpa"]);
        const club = table("club", ["id:pk"]);
        const member = table("membership", ["id:pk", "student_id:fk(student.id)", "club_id:fk(club.id)"]);
        const r = convert(model([person, student, club, member]));
        expect(r.relsBetween("membership", "student")).toHaveLength(1);
    });

    it("a subclass that also has a normal FK keeps that relationship", () => {
        const dept = table("department", ["id:pk"]);
        const staff = table("staff", ["id:pk,fk(person.id)", "dept_id:fk(department.id)"]);
        const r = convert(model([person, dept, staff]));
        expect(r.relsBetween("staff", "department")).toHaveLength(1);
        expect(r.c.generalizations).toHaveLength(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("information that cannot be carried over is reported", () => {
    it("functional dependencies are dropped and reported", () => {
        const t = table("student", ["sid:pk", "zip", "city"], {
            functionalDependencies: [{ id: "fd", left: ["student.zip"], right: ["student.city"] }],
        } as unknown as Partial<Table>);
        const r = convert(model([t]));
        expect(warnings(r).join("\n")).toMatch(/[Ff]unctional dependenc/);
    });

    it("a clean schema produces no notices", () => {
        const r = convert(model([table("customer", ["id:pk", "name"]), table("order", ["id:pk", "customer_id:fk(customer.id),notnull"])]));
        expect(r.notices).toEqual([]);
    });

    it("a FK that points to a junction table is reported (the junction is no longer an entity)", () => {
        const a = table("a", ["id:pk"]);
        const b = table("b", ["id:pk"]);
        const ab = table("ab", ["a_id:pk,fk(a.id)", "b_id:pk,fk(b.id)"]);
        const note = table("note", ["id:pk", "a_id:fk(ab.a_id)"]);
        const r = convert(model([a, b, ab, note]));
        expect(warnings(r).join("\n")).toMatch(/a_id/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("robustness", () => {
    it("does not mutate the input model", () => {
        const m = model([table("a", ["id:pk"]), table("b", ["id:pk", "a_id:fk(a.id)"])]);
        const before = JSON.stringify(m);
        convert(m);
        expect(JSON.stringify(m)).toBe(before);
    });

    it("converting the same schema twice gives the same entities and relationships (ids aside)", () => {
        const m = model([table("a", ["id:pk"]), table("b", ["id:pk", "a_id:fk(a.id)"])]);
        const shape = () => {
            const r = convert(m);
            return { e: r.entityNames, rel: r.c.relationships.map((x) => x.name).sort() };
        };
        expect(shape()).toEqual(shape());
    });

    it("two tables that reference each other (circular FKs) do not hang", () => {
        const a = table("a", ["id:pk", "b_id:fk(b.id)"]);
        const b = table("b", ["id:pk", "a_id:fk(a.id)"]);
        expect(() => convert(model([a, b]))).not.toThrow();
        expect(convert(model([a, b])).entityNames).toEqual(["a", "b"]);
    });

    it("relationship names are unique when two FKs join the same pair of tables", () => {
        const c = table("customer", ["id:pk"]);
        const o = table("order", ["id:pk", "placed_by:fk(customer.id)", "billed_to:fk(customer.id)"]);
        const r = convert(model([c, o]));
        const names = r.c.relationships.map((x) => x.name);
        expect(new Set(names).size).toBe(names.length);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe("round trip: logical -> conceptual -> logical keeps the schema", () => {
    const school = model([
        table("person", ["id:pk", "name"]),
        table("student", ["id:pk,fk(person.id)", "gpa"]),
        table("department", ["code:pk", "title"]),
        table("instructor", ["id:pk,fk(person.id)", "salary", "dept_code:fk(department.code),notnull"]),
        table("course", ["cid:pk", "title"]),
        table("section", ["course_cid:pk,fk(course.cid)", "sec_no:pk", "room"]),
        table("takes", ["student_id:pk,fk(student.id)", "course_cid:pk,fk(section.course_cid)", "sec_no:pk,fk(section.sec_no)", "grade"]),
        table("person_phone", ["person_id:pk,fk(person.id)", "phone:pk"]),
    ]);
    const back = convertConceptualToLogicalWithNotices(convertLogicalToConceptualWithNotices(school).model).model;
    const names = (m: LogicalModelPayload) => m.tables.map((t) => t.name).sort();

    it("every original table comes back (multi-valued and junction tables are rebuilt)", () => {
        expect(names(back)).toEqual(expect.arrayContaining(["person", "student", "department", "instructor", "course", "section", "takes", "person_phone"]));
    });

    it("no extra tables appear", () => {
        expect(names(back)).toEqual(names(school));
    });

    it("every FK of the original schema still exists (same source table, same target table)", () => {
        const fks = (m: LogicalModelPayload) =>
            m.tables
                .flatMap((t) => t.columns.filter((c) => c.roles?.foreignKey).map((c) => `${t.name}->${m.tables.find((x) => x.id === c.roles!.foreignKey!.refTableId)?.name}`))
                .sort();
        const unique = (xs: string[]) => Array.from(new Set(xs)).sort();
        expect(unique(fks(back))).toEqual(unique(fks(school)));
    });

    it("primary keys keep their size (composite keys do not shrink or grow)", () => {
        const pkSize = (m: LogicalModelPayload) => Object.fromEntries(m.tables.map((t) => [t.name, t.columns.filter((c) => c.roles?.primaryKey).length]));
        expect(pkSize(back)).toEqual(pkSize(school));
    });

    it("non-key data columns survive (gpa, salary, grade, room, title...)", () => {
        const dataCols = (m: LogicalModelPayload) =>
            m.tables.flatMap((t) => t.columns.filter((c) => !c.roles?.primaryKey && !c.roles?.foreignKey).map((c) => `${t.name}.${c.name}`)).sort();
        expect(dataCols(back)).toEqual(dataCols(school));
    });
});
