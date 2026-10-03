/**
 * Verification tests for DDL import (parser) and export (generator).
 * Run with: npx tsx src/components/EditProject/utils/ddl.test.ts
 */

import { ddlToPhysicalModel, parseDDL, validateDDLSyntax } from "./ddl-parser";
import { DEFAULT_DDL_OPTIONS, generateDDL } from "./ddl-generator";

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

const errorsOf = (sql: string) => validateDDLSyntax(sql).filter((m) => m.severity === "error");

const JOURNAL_PG = `
CREATE TABLE journal (journal_id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);
CREATE TABLE issue (
  journal_id INTEGER NOT NULL REFERENCES journal(journal_id) ON DELETE CASCADE,
  issue_number INTEGER NOT NULL,
  date_issued DATE NOT NULL,
  PRIMARY KEY (journal_id, issue_number, date_issued)
);
CREATE TABLE article (
  article_id SERIAL PRIMARY KEY,
  journal_id INTEGER NOT NULL,
  issue_number INTEGER NOT NULL,
  date_issued DATE NOT NULL,
  num_diagrams INTEGER DEFAULT 0,
  FOREIGN KEY (journal_id, issue_number, date_issued) REFERENCES issue(journal_id, issue_number, date_issued)
);`;

console.log("\n[1] DEF-026: table options after ')' (ENGINE, CHARSET)");
{
    const mysql = "CREATE TABLE `a` (`id` INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\nCREATE TABLE `b` (`id` INT PRIMARY KEY, `a_id` INT, CONSTRAINT `fk_b_a` FOREIGN KEY (`a_id`) REFERENCES `a` (`id`)) ENGINE=InnoDB;";
    assert(errorsOf(mysql).length === 0, "no syntax error for ENGINE=InnoDB / DEFAULT CHARSET");
    const r = parseDDL(mysql);
    assert(r.tables.length === 2, "both tables parsed (the first no longer swallows the second)");
    assert(r.tables[1].foreignKeys.length === 1 && r.tables[1].foreignKeys[0].refTable === "a", "FK of the second table kept");
    assert(errorsOf("CREATE TABLE a (id INT PRIMARY KEY) ENGINE=InnoDB").length === 1, "a table with no ';' at all is still reported");
    assert(errorsOf("CREATE TABLE a (id INT)\nCREATE TABLE b (id INT);").length >= 1, "missing ';' before the next statement is still reported");
}

console.log("\n[2] DEF-030: CONSTRAINT <quoted name> PRIMARY KEY");
{
    const sql = 'CREATE TABLE "journal" (\n    "journal_id" INTEGER NOT NULL,\n    "name" VARCHAR(100) NOT NULL,\n    CONSTRAINT "pk_journal" PRIMARY KEY ("journal_id")\n);\nCREATE TABLE [t] ([a] INT NOT NULL, [b] INT NOT NULL, CONSTRAINT [pk_t] PRIMARY KEY ([a], [b]));';
    const r = parseDDL(sql);
    assert(r.tables[0].columns.length === 2, "no phantom 'CONSTRAINT' column");
    assert(JSON.stringify(r.tables[0].primaryKeyColumns) === JSON.stringify(["journal_id"]), 'PK from CONSTRAINT "pk_journal"');
    assert(JSON.stringify(r.tables[1].primaryKeyColumns) === JSON.stringify(["a", "b"]), "composite PK from CONSTRAINT [pk_t]");
}

console.log("\n[3] DEF-027: SQL Server IDENTITY");
{
    const r = parseDDL("CREATE TABLE [t] ([id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY, [n] INT NOT NULL);");
    assert(r.tables[0].columns[0].autoIncrement === true, "IDENTITY(1,1) -> autoIncrement");
    assert(r.tables[0].columns[1].autoIncrement === false, "other column not auto-increment");
}

console.log("\n[4] DEF-028: composite FK export");
{
    const model = ddlToPhysicalModel(parseDDL(JOURNAL_PG), "J", "postgresql");
    const sql = generateDDL(model, { ...DEFAULT_DDL_OPTIONS, dbms: "postgresql" }).sql;
    assert(/FOREIGN KEY \("journal_id", "issue_number", "date_issued"\) REFERENCES "issue" \("journal_id", "issue_number", "date_issued"\)/.test(sql), "one composite FK with matching column lists");
    assert(!/FOREIGN KEY \("issue_number"\)/.test(sql), "no single-column FK for issue_number");
    assert(/FOREIGN KEY \("journal_id"\) REFERENCES "journal" \("journal_id"\) ON DELETE CASCADE/.test(sql), "single-column FK keeps its action");
}

console.log("\n[5] DEF-029: auto-increment flag exported");
{
    const model = ddlToPhysicalModel(parseDDL(JOURNAL_PG), "J", "postgresql");
    const pg = generateDDL(model, { ...DEFAULT_DDL_OPTIONS, dbms: "postgresql" }).sql;
    const my = generateDDL(model, { ...DEFAULT_DDL_OPTIONS, dbms: "mysql" }).sql;
    const ms = generateDDL(model, { ...DEFAULT_DDL_OPTIONS, dbms: "sqlserver" }).sql;
    assert(/"journal_id" SERIAL NOT NULL/.test(pg), "PostgreSQL: SERIAL");
    assert(/`journal_id` INT AUTO_INCREMENT NOT NULL/.test(my), "MySQL: INT AUTO_INCREMENT");
    assert(/\[journal_id\] INT IDENTITY\(1,1\) NOT NULL/.test(ms), "SQL Server: INT IDENTITY(1,1)");
    assert(!/"issue_number" SERIAL/.test(pg), "non auto-increment integer columns unchanged");
}

console.log("\n[6] Round trip: parse -> export -> parse");
{
    const first = parseDDL(JOURNAL_PG);
    const exported = generateDDL(ddlToPhysicalModel(first, "J", "postgresql"), { ...DEFAULT_DDL_OPTIONS, dbms: "postgresql" }).sql;
    assert(errorsOf(exported).length === 0, "exported DDL has no syntax errors");
    const second = parseDDL(exported);
    assert(second.errors.length === 0, "exported DDL re-imports without errors");
    assert(second.tables.length === first.tables.length, "same number of tables");
    const cols = (r: ReturnType<typeof parseDDL>) => r.tables.map((t) => `${t.name}:${t.columns.map((c) => c.name).join(",")}`).join("|");
    assert(cols(second) === cols(first), "same columns (no phantom CONSTRAINT column)");
    const pk = (r: ReturnType<typeof parseDDL>) => r.tables.map((t) => `${t.name}:${[...t.primaryKeyColumns].sort().join(",")}`).join("|");
    assert(pk(second) === pk(first), "same primary keys");
    const fk = (r: ReturnType<typeof parseDDL>) =>
        r.tables.map((t) => t.foreignKeys.map((f) => `${t.name}(${f.columns.join(",")})->${f.refTable}(${f.refColumns.join(",")})`).sort().join(";")).join("|");
    assert(fk(second) === fk(first), "same foreign keys (composite FK preserved)");
}

console.log("\n[7] DEF-031: feedback for unusable input");
{
    const typo = validateDDLSyntax("CREAT TABLE journal (id INT);");
    assert(typo.some((m) => m.severity === "error" && /CREATE/.test(m.message)), "keyword typo reported with a suggestion");
    assert(errorsOf("CREATE TABLE journal (id INT);").length === 0, "valid statement has no error");
    assert(validateDDLSyntax("SET search_path = public;\nCREATE TABLE a (id INT);").every((m) => m.severity !== "error"), "known statements such as SET are not flagged");
    assert(parseDDL("").errors.length === 1 && parseDDL("-- hello").errors.length === 1, "empty / comment-only input yields an explicit error");
    const missing = parseDDL("CREATE TABLE issue (issue_id INT PRIMARY KEY, journal_id INT REFERENCES journal(journal_id));");
    assert(missing.warnings.some((w) => /journal/.test(w)), "FK to a missing table yields a warning");
}

console.log(`\nPassed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(1);
