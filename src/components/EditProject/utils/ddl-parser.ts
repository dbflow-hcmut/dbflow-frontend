/**
 * DDL Parser — Converts SQL DDL (CREATE TABLE) statements into PhysicalModelPayload
 */
import type { PhysicalModelPayload } from "./physical-model.builder";
import type { DBMSType, FKAction, IndexType } from "./dbms-config";

/**
 * Detect DBMS dialect from DDL text by looking for dialect-specific keywords.
 * Returns null if no strong signal is found.
 */
export function detectDBMS(ddl: string): DBMSType | null {
    const upper = ddl.toUpperCase();

    const pgScore =
        +/\b(SERIAL|BIGSERIAL|SMALLSERIAL)\b/.test(upper) +
        +/\b(BOOLEAN)\b/.test(upper) * 0.5 +
        +/\b(TIMESTAMPTZ|JSONB|UUID|CITEXT|INET|MACADDR)\b/.test(upper) +
        +/\bINHERITS\s*\(/.test(upper) +
        +/\b(GIN|GIST|BRIN)\b/.test(upper) +
        +/::[\w\s]+/.test(ddl) +
        +/\bRETURNING\b/.test(upper) * 0.5 +
        +/\bON\s+CONFLICT\b/.test(upper) +
        +/\bCREATE\s+(UNIQUE\s+)?INDEX\s+.*\bUSING\b/i.test(ddl) * 0.5 +
        +/"\w+"/.test(ddl) * 0.3;

    const myScore =
        +/\bAUTO_INCREMENT\b/.test(upper) +
        +/\bENGINE\s*=/.test(upper) +
        +/\b(TINYINT|MEDIUMINT|MEDIUMTEXT|LONGTEXT|TINYTEXT)\b/.test(upper) +
        +/\bUNSIGNED\b/.test(upper) +
        +/\bDEFAULT\s+CHARSET\b/.test(upper) +
        +/`\w+`/.test(ddl) +
        +/\bENUM\s*\(/.test(upper) * 0.5 +
        +/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/.test(upper) * 0.5;

    const msScore =
        +/\bIDENTITY\s*\(/.test(upper) +
        +/\b(NVARCHAR|NCHAR|NTEXT|DATETIME2|DATETIMEOFFSET|HIERARCHYID|SQL_VARIANT|UNIQUEIDENTIFIER)\b/.test(upper) +
        +/\bGETDATE\s*\(\)/.test(upper) +
        +/\bGO\b/.test(upper) * 0.5 +
        +/\[\w+\]/.test(ddl) +
        +/\bCLUSTERED\b/.test(upper) +
        +/\bNEWID\s*\(\)/.test(upper) * 0.5;

    const max = Math.max(pgScore, myScore, msScore);
    if (max < 0.5) return null;
    if (pgScore === max && pgScore > 0) return "postgresql";
    if (myScore === max && myScore > 0) return "mysql";
    if (msScore > 0) return "sqlserver";
    return null;
}

// ── Internal parse types ─────────────────────────────────────────────

type ParsedColumn = {
    name: string;
    dataType: string;
    length?: string;
    nullable: boolean;
    unique: boolean;
    autoIncrement: boolean;
    defaultValue?: string;
    isPrimaryKey: boolean;
};

type ParsedForeignKey = {
    columns: string[];
    refTable: string;
    refColumns: string[];
    onDelete?: FKAction;
    onUpdate?: FKAction;
};

type ParsedIndex = {
    name: string;
    columns: { columnName: string; order: "ASC" | "DESC" }[];
    isUnique: boolean;
    resolvedType?: "BTREE" | "HASH" | "GIN" | "GIST" | "BRIN";
};

type ParsedTable = {
    name: string;
    columns: ParsedColumn[];
    primaryKeyColumns: string[];
    foreignKeys: ParsedForeignKey[];
    indexes: ParsedIndex[];
};

export type DDLParseResult = {
    tables: ParsedTable[];
    /** Blocking errors — e.g. no tables found, unparseable column */
    errors: string[];
    /** Non-blocking warnings — import still proceeds, but user should review */
    warnings: string[];
};

export type ValidationMarker = {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    message: string;
    severity: "error" | "warning";
};

/**
 * Structural syntax validation for DDL input.
 * Returns Monaco-compatible markers with line/column positions.
 */
export function validateDDLSyntax(sql: string): ValidationMarker[] {
    const markers: ValidationMarker[] = [];

    // Preserve line structure but blank out comment content so positions stay correct
    const masked = sql
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .split("\n")
        .map((line) => line.replace(/--.*$/, (m) => " ".repeat(m.length)))
        .join("\n");

    const lines = masked.split("\n");

    // ── 1. Unbalanced parentheses ──────────────────────────────────
    const openStack: { line: number; col: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
        for (let j = 0; j < lines[i].length; j++) {
            const ch = lines[i][j];
            if (ch === "(") {
                openStack.push({ line: i + 1, col: j + 1 });
            } else if (ch === ")") {
                if (openStack.length === 0) {
                    markers.push({
                        startLineNumber: i + 1,
                        startColumn: j + 1,
                        endLineNumber: i + 1,
                        endColumn: j + 2,
                        message: 'Unexpected ")" — no matching "("',
                        severity: "error",
                    });
                } else {
                    openStack.pop();
                }
            }
        }
    }
    for (const open of openStack) {
        markers.push({
            startLineNumber: open.line,
            startColumn: open.col,
            endLineNumber: open.line,
            endColumn: open.col + 1,
            message: 'Unclosed "(" — missing matching ")"',
            severity: "error",
        });
    }

    // ── 2. CREATE TABLE/INDEX must end with semicolon ──────────────
    // Also check CREATE INDEX (non-terminated) before the main index parser
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(line)) {
            // Find the end of this statement — look ahead for ')'
            let stmtEnd = i;
            for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                if (lines[j].includes(")")) { stmtEnd = j; break; }
            }
            const stmtLine = lines[stmtEnd];
            const closeIdx = stmtLine.lastIndexOf(")");
            if (closeIdx !== -1) {
                const afterClose = stmtLine.slice(closeIdx + 1).trimStart();
                if (!afterClose.startsWith(";")) {
                    markers.push({
                        startLineNumber: stmtEnd + 1,
                        startColumn: closeIdx + 1,
                        endLineNumber: stmtEnd + 1,
                        endColumn: closeIdx + 2,
                        message: 'CREATE INDEX statement must end with ";"',
                        severity: "warning",
                    });
                }
            }
        }
    }

    const ctRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = ctRegex.exec(masked)) !== null) {
        const openParenIdx = m.index + m[0].length - 1;
        let depth = 0;
        let closedAt = -1;
        for (let i = openParenIdx; i < masked.length; i++) {
            if (masked[i] === "(") depth++;
            else if (masked[i] === ")") {
                depth--;
                if (depth === 0) { closedAt = i; break; }
            }
        }
        if (closedAt === -1) continue; // already caught as unbalanced paren

        // Table options (ENGINE=InnoDB, DEFAULT CHARSET=..., COMMENT=...) may sit between ')' and ';'.
        // The statement is only unterminated when the next statement starts before any ';'.
        const rest = masked.slice(closedAt + 1);
        const semiIdx = rest.indexOf(";");
        const nextStmtIdx = rest.search(/\b(?:CREATE|ALTER|DROP|INSERT|GO)\b/i);
        const terminated = semiIdx !== -1 && (nextStmtIdx === -1 || semiIdx < nextStmtIdx);
        if (!terminated) {
            const lineNum = masked.slice(0, closedAt + 1).split("\n").length;
            const lineStart = masked.lastIndexOf("\n", closedAt) + 1;
            const col = closedAt - lineStart + 1;
            markers.push({
                startLineNumber: lineNum,
                startColumn: col,
                endLineNumber: lineNum,
                endColumn: col + 1,
                message: 'CREATE TABLE statement must end with ";"',
                severity: "error",
            });
        }
    }

    // ── 2b. Unknown statement keyword (e.g. "CREAT TABLE") ─────────
    const KNOWN_STATEMENTS = new Set([
        "CREATE", "ALTER", "DROP", "INSERT", "UPDATE", "DELETE", "SELECT", "SET", "USE", "GO", "BEGIN", "START",
        "COMMIT", "ROLLBACK", "LOCK", "UNLOCK", "GRANT", "REVOKE", "COMMENT", "TRUNCATE", "WITH", "DELIMITER",
        "PRAGMA", "EXEC", "EXECUTE", "DECLARE", "IF", "ANALYZE", "VACUUM", "RENAME", "COPY",
    ]);
    const editDistance = (a: string, b: string) => {
        const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
        for (let j = 1; j <= b.length; j++) dp[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
        }
        return dp[a.length][b.length];
    };
    {
        let depth = 0;
        let quote: string | null = null;
        let stmtStart = 0;
        const flush = (end: number) => {
            const text = masked.slice(stmtStart, end);
            const lead = text.length - text.trimStart().length;
            const word = text.trimStart().match(/^[A-Za-z_]+/)?.[0];
            const at = stmtStart + lead;
            stmtStart = end + 1;
            if (!word) return;
            const upper = word.toUpperCase();
            if (KNOWN_STATEMENTS.has(upper)) return;
            const lineNum = masked.slice(0, at).split("\n").length;
            const col = at - (masked.lastIndexOf("\n", at - 1) + 1) + 1;
            const near = ["CREATE", "ALTER", "DROP"].find((kw) => editDistance(upper, kw) <= 2);
            markers.push({
                startLineNumber: lineNum,
                startColumn: col,
                endLineNumber: lineNum,
                endColumn: col + word.length,
                message: near
                    ? `Unknown statement "${word}" - did you mean ${near}?`
                    : `Unrecognized statement "${word}" - it will be ignored.`,
                severity: near ? "error" : "warning",
            });
        };
        for (let i = 0; i < masked.length; i++) {
            const ch = masked[i];
            if (quote) {
                if (ch === quote) quote = null;
                continue;
            }
            if (ch === "'" || ch === '"' || ch === "`") quote = ch;
            else if (ch === "(") depth++;
            else if (ch === ")") depth = Math.max(0, depth - 1);
            else if (ch === ";" && depth === 0) flush(i);
        }
        flush(masked.length);
    }

    // ── 3. REFERENCES without column list ─────────────────────────
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const refIdx = line.search(/\bREFERENCES\b/i);
        if (refIdx === -1) continue;

        const afterRef = line.slice(refIdx + "REFERENCES".length).trimStart();
        // skip identifier (stop at '(' or whitespace), then check for '('
        const identMatch = afterRef.match(/^([^\s(]+)([\s\S]*)/);
        if (!identMatch) continue;
        const rest = identMatch[2].trimStart();
        // may span next line
        const nextLine = lines[i + 1] ?? "";
        if (!rest.startsWith("(") && !nextLine.trimStart().startsWith("(")) {
            markers.push({
                startLineNumber: i + 1,
                startColumn: refIdx + 1,
                endLineNumber: i + 1,
                endColumn: refIdx + "REFERENCES".length + 1,
                message: `REFERENCES must specify a column list: REFERENCES ${identMatch[1].replace(/[,;)]/g, "")}(column_name)`,
                severity: "error",
            });
        }
    }

    return markers;
}

// ── Helpers ──────────────────────────────────────────────────────────

const generateId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `pid_${crypto.randomUUID()}`;
    }
    return `pid_${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

/** Remove SQL comments (-- and /* ... *​/) */
function stripComments(sql: string): string {
    // Remove single-line comments
    let result = sql.replace(/--[^\n]*/g, "");
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, "");
    return result;
}

/** Unquote identifier: "name", `name`, [name] → name */
function unquote(id: string): string {
    const trimmed = id.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
        return trimmed.slice(1, -1);
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/**
 * Strip schema prefix from identifier: "public"."users" or public.users → users
 * Handles quoted and unquoted schemas.
 */
function stripSchemaPrefix(identifier: string): string {
    const unquoted = unquote(identifier);
    // Matches: schema.table, "schema"."table", `schema`.`table`, schema."table", etc.
    // After unquoting the outer quotes, a dot separator remains
    const dotIdx = unquoted.lastIndexOf('.');
    if (dotIdx !== -1) {
        return unquoted.slice(dotIdx + 1);
    }
    return unquoted;
}

/** Split on commas that are not inside parentheses */
function splitTopLevelCommas(str: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of str) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
        } else {
            current += ch;
        }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

/** Extract content between outermost parentheses */
function extractParenContent(str: string): string | null {
    const first = str.indexOf("(");
    if (first === -1) return null;
    let depth = 0;
    for (let i = first; i < str.length; i++) {
        if (str[i] === "(") depth++;
        else if (str[i] === ")") {
            depth--;
            if (depth === 0) return str.slice(first + 1, i);
        }
    }
    return null;
}

/** Parse FK action keyword */
function parseFKAction(str: string): FKAction | undefined {
    const upper = str.toUpperCase().trim();
    if (upper.includes("CASCADE")) return "CASCADE";
    if (upper.includes("SET NULL")) return "SET NULL";
    if (upper.includes("SET DEFAULT")) return "SET DEFAULT";
    if (upper.includes("RESTRICT")) return "RESTRICT";
    if (upper.includes("NO ACTION")) return "NO ACTION";
    return undefined;
}

/** Parse column list like (col1, col2) */
function parseColumnList(str: string): string[] {
    const inner = extractParenContent(str);
    if (!inner) return [];
    return inner.split(",").map((s) => unquote(s.trim())).filter(Boolean);
}

// ── Main parser ──────────────────────────────────────────────────────

/** Constraint/index name as it can appear in DDL: "quoted", `quoted`, [quoted] or a bare token. */
const CONSTRAINT_NAME = '(?:"[^"]*"|`[^`]*`|\\[[^\\]]*\\]|\\S+)';

/**
 * Parse SQL DDL text into structured table definitions.
 * Supports: CREATE TABLE, PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL,
 * DEFAULT, AUTO_INCREMENT/SERIAL/IDENTITY, CREATE INDEX.
 */
export function parseDDL(sql: string): DDLParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const tableMap = new Map<string, ParsedTable>(); // keyed by lowercased name — duplicates overwrite
    const clean = stripComments(sql);

    // ── Extract CREATE TABLE statements ──
    // Table options after the closing ')' (ENGINE=InnoDB, DEFAULT CHARSET=...) are skipped; the body is found by
    // balancing parentheses instead of requiring ');'.
    const createTableRegex = /CREATE\s+(?:(?:GLOBAL\s+|LOCAL\s+)?(?:TEMP|TEMPORARY)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]*"|`[^`]*`|\[[^\]]*\]|[^\s(])+)\s*\(/gi;
    let match: RegExpExecArray | null;

    // Collect table names first for duplicate detection
    const seenTableNames = new Map<string, number>(); // normalized name → count

    while ((match = createTableRegex.exec(clean)) !== null) {
        const tableName = stripSchemaPrefix(match[1]);
        const openIdx = match.index + match[0].length - 1;
        let depth = 0;
        let closeIdx = -1;
        let inQuote: string | null = null;
        for (let i = openIdx; i < clean.length; i++) {
            const ch = clean[i];
            if (inQuote) {
                if (ch === inQuote) inQuote = null;
                continue;
            }
            if (ch === "'" || ch === '"' || ch === "`") inQuote = ch;
            else if (ch === "(") depth++;
            else if (ch === ")") {
                depth--;
                if (depth === 0) { closeIdx = i; break; }
            }
        }
        if (closeIdx === -1) continue; // unbalanced - reported by validateDDLSyntax
        const body = clean.slice(openIdx + 1, closeIdx);
        createTableRegex.lastIndex = closeIdx + 1;

        // ── Duplicate table name warning ──
        const normalizedName = tableName.toLowerCase();
        const prevCount = seenTableNames.get(normalizedName) ?? 0;
        seenTableNames.set(normalizedName, prevCount + 1);
        if (prevCount > 0) {
            warnings.push(`Duplicate table name "${tableName}" — only the last definition will be used.`);
        }
        const parts = splitTopLevelCommas(body);

        const columns: ParsedColumn[] = [];
        const primaryKeyColumns: string[] = [];
        const foreignKeys: ParsedForeignKey[] = [];
        const tableIndexes: ParsedIndex[] = [];

        for (const part of parts) {
            const upper = part.toUpperCase().trimStart();

            // ── Table-level PRIMARY KEY (optionally CONSTRAINT <name>, name may be quoted) ──
            if (new RegExp(`^(?:CONSTRAINT\\s+${CONSTRAINT_NAME}\\s+)?PRIMARY\\s+KEY\\b`, "i").test(upper)) {
                const cols = parseColumnList(part);
                primaryKeyColumns.push(...cols);
                continue;
            }

            // ── Table-level FOREIGN KEY ──
            if (new RegExp(`^(?:CONSTRAINT\\s+${CONSTRAINT_NAME}\\s+)?FOREIGN\\s+KEY\\b`, "i").test(upper)) {
                const fkMatch = part.match(
                    /FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\S+)\s*\(([^)]+)\)([^]*)?$/i
                );
                if (fkMatch) {
                    const fkCols = fkMatch[1].split(",").map((s) => unquote(s.trim()));
                    const refTable = stripSchemaPrefix(fkMatch[2]);
                    const refCols = fkMatch[3].split(",").map((s) => unquote(s.trim()));
                    const rest = fkMatch[4] || "";
                    const onDeleteMatch = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
                    const onUpdateMatch = rest.match(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
                    foreignKeys.push({
                        columns: fkCols,
                        refTable,
                        refColumns: refCols,
                        onDelete: onDeleteMatch ? parseFKAction(onDeleteMatch[1]) : undefined,
                        onUpdate: onUpdateMatch ? parseFKAction(onUpdateMatch[1]) : undefined,
                    });
                }
                continue;
            }

            // ── Table-level UNIQUE ──
            if (new RegExp(`^(?:CONSTRAINT\\s+${CONSTRAINT_NAME}\\s+)?UNIQUE\\b`, "i").test(upper)) {
                const cols = parseColumnList(part);
                const constraintNameMatch = part.match(new RegExp(`CONSTRAINT\\s+(${CONSTRAINT_NAME})`, "i"));
                tableIndexes.push({
                    name: constraintNameMatch ? unquote(constraintNameMatch[1]) : `uq_${tableName}_${cols.join("_")}`,
                    columns: cols.map((c) => ({ columnName: c, order: "ASC" as const })),
                    isUnique: true,
                });
                continue;
            }

            // ── Table-level CHECK (not modelled) ──
            if (new RegExp(`^(?:CONSTRAINT\\s+${CONSTRAINT_NAME}\\s+)?CHECK\\b`, "i").test(upper)) {
                warnings.push(`Table "${tableName}": CHECK constraint is not supported and was ignored.`);
                continue;
            }

            // ── MySQL inline index: KEY idx (cols) / INDEX idx (cols) / UNIQUE KEY idx (cols) ──
            const inlineIndex = part.match(new RegExp(`^(UNIQUE\\s+)?(?:KEY|INDEX)\\s+(${CONSTRAINT_NAME})\\s*\\(`, "i"));
            if (inlineIndex) {
                const cols = parseColumnList(part);
                tableIndexes.push({
                    name: unquote(inlineIndex[2]),
                    columns: cols.map((c) => ({ columnName: c, order: "ASC" as const })),
                    isUnique: !!inlineIndex[1],
                });
                continue;
            }

            // ── Column definition ──
            const colMatch = part.match(/^(\S+)\s+([\s\S]+)$/);
            if (!colMatch) {
                errors.push(`Could not parse: ${part.slice(0, 80)}`);
                continue;
            }

            const colName = unquote(colMatch[1]);
            const colDef = colMatch[2].trim();

            // Parse data type (first token, possibly with length)
            const typeMatch = colDef.match(/^(\w+)(?:\s*\(([^)]+)\))?/);
            let dataType = typeMatch ? typeMatch[1].toUpperCase() : "VARCHAR";
            const length = typeMatch?.[2]?.trim();

            // Detect auto-increment variants
            let autoIncrement = false;
            const upperDef = colDef.toUpperCase();
            if (/\bAUTO_INCREMENT\b/.test(upperDef) || /\bAUTOINCREMENT\b/.test(upperDef)) {
                autoIncrement = true;
            }
            if (/^(SERIAL|BIGSERIAL|SMALLSERIAL)$/.test(dataType)) {
                autoIncrement = true;
                dataType = dataType === "BIGSERIAL" ? "BIGINT" : dataType === "SMALLSERIAL" ? "SMALLINT" : "INTEGER";
            }
            if (/\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(colDef)) {
                autoIncrement = true;
            }
            // SQL Server: INT IDENTITY(1,1)
            if (/\bIDENTITY\s*\(/i.test(colDef)) {
                autoIncrement = true;
            }

            const nullable = !/\bNOT\s+NULL\b/i.test(colDef);
            const unique = /\bUNIQUE\b/i.test(colDef);
            const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(colDef);

            // Default value
            let defaultValue: string | undefined;
            const defaultMatch = colDef.match(/\bDEFAULT\s+('(?:[^'\\]|\\.)*'|\S+)/i);
            if (defaultMatch) {
                defaultValue = defaultMatch[1].replace(/^'|'$/g, "");
            }

            // Inline REFERENCES (single-column FK shorthand)
            const refMatch = colDef.match(/\bREFERENCES\s+(\S+)\s*\(([^)]+)\)([^]*)?$/i);
            if (refMatch) {
                const refTable = stripSchemaPrefix(refMatch[1]);
                const refCol = unquote(refMatch[2].trim());
                const rest = refMatch[3] || "";
                const onDeleteMatch = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
                const onUpdateMatch = rest.match(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
                foreignKeys.push({
                    columns: [colName],
                    refTable,
                    refColumns: [refCol],
                    onDelete: onDeleteMatch ? parseFKAction(onDeleteMatch[1]) : undefined,
                    onUpdate: onUpdateMatch ? parseFKAction(onUpdateMatch[1]) : undefined,
                });
            }

            if (isPrimaryKey) {
                primaryKeyColumns.push(colName);
            }

            columns.push({
                name: colName,
                dataType,
                length,
                nullable: isPrimaryKey ? false : nullable,
                unique,
                autoIncrement,
                defaultValue,
                isPrimaryKey,
            });
        }

        tableMap.set(normalizedName, { name: tableName, columns, primaryKeyColumns, foreignKeys, indexes: tableIndexes });
    }

    const tables = Array.from(tableMap.values());

    // ── Extract standalone CREATE INDEX statements ──
    // Match with optional USING clause, semicolon optional (warned separately)
    const createIndexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)\s+ON\s+(\S+)\s*\(([^)]+)\)(?:\s+USING\s+(\w+))?\s*;?/gi;
    while ((match = createIndexRegex.exec(clean)) !== null) {
        const isUnique = !!match[1];
        const indexName = unquote(match[2]);
        const tableName = stripSchemaPrefix(match[3]);
        const colsStr = match[4];
        const usingClause = match[5]?.toUpperCase();

        // Warn if missing semicolon
        const fullMatch = match[0];
        if (!fullMatch.trimEnd().endsWith(";")) {
            warnings.push(`CREATE INDEX "${indexName}" is missing a trailing ";".`);
        }

        // Map USING clause to supported IndexType (fallback BTREE)
        const indexTypeMap: Record<string, "BTREE" | "HASH" | "GIN" | "GIST" | "BRIN"> = {
            BTREE: "BTREE",
            HASH: "HASH",
            GIN: "GIN",
            GIST: "GIST",
            BRIN: "BRIN",
        };
        const resolvedType = (usingClause && indexTypeMap[usingClause]) ? indexTypeMap[usingClause] : "BTREE";

        const cols = colsStr.split(",").map((s) => {
            const parts = s.trim().split(/\s+/);
            const colName = unquote(parts[0]);
            const order = parts[1]?.toUpperCase() === "DESC" ? "DESC" as const : "ASC" as const;
            return { columnName: colName, order };
        });

        const table = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
        if (table) {
            table.indexes.push({ name: indexName, columns: cols, isUnique, resolvedType });
        }
    }

    // ── Extract ALTER TABLE ... ADD FOREIGN KEY statements ──
    const alterFKRegex = /ALTER\s+TABLE\s+(\S+)\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(\S+)\s*\(([^)]+)\)([^;]*);?/gi;
    while ((match = alterFKRegex.exec(clean)) !== null) {
        const srcTableName = stripSchemaPrefix(match[1]);
        const fkCols = match[2].split(",").map((s) => unquote(s.trim()));
        const refTable = stripSchemaPrefix(match[3]);
        const refCols = match[4].split(",").map((s) => unquote(s.trim()));
        const rest = match[5] || "";
        const onDeleteMatch = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);
        const onUpdateMatch = rest.match(/ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i);

        const table = tables.find((t) => t.name.toLowerCase() === srcTableName.toLowerCase());
        if (table) {
            table.foreignKeys.push({
                columns: fkCols,
                refTable,
                refColumns: refCols,
                onDelete: onDeleteMatch ? parseFKAction(onDeleteMatch[1]) : undefined,
                onUpdate: onUpdateMatch ? parseFKAction(onUpdateMatch[1]) : undefined,
            });
        }
    }

    if (tables.length === 0) {
        errors.push("No CREATE TABLE statements found in the input.");
    }

    // ── FK cross-reference warnings ──
    const allTableNames = new Set(tables.map((t) => t.name.toLowerCase()));
    for (const t of tables) {
        for (const fk of t.foreignKeys) {
            if (!allTableNames.has(fk.refTable.toLowerCase())) {
                warnings.push(
                    `Table "${t.name}": FK references "${fk.refTable}" which was not found in the input — this relationship will be skipped.`
                );
            }
        }
    }

    return { tables, errors, warnings };
}

// ── Convert parse result to PhysicalModelPayload ─────────────────────

export function ddlToPhysicalModel(
    parseResult: DDLParseResult,
    modelName: string = "Imported Schema",
    dbms?: DBMSType,
): PhysicalModelPayload {
    const tableIdMap = new Map<string, string>(); // tableName → tableId
    const columnIdMap = new Map<string, Map<string, string>>(); // tableName → (colName → colId)

    // First pass: assign IDs
    for (const t of parseResult.tables) {
        const tableId = generateId();
        tableIdMap.set(t.name.toLowerCase(), tableId);
        const colMap = new Map<string, string>();
        for (const c of t.columns) {
            colMap.set(c.name.toLowerCase(), generateId());
        }
        columnIdMap.set(t.name.toLowerCase(), colMap);
    }

    // Second pass: build model tables
    const tables = parseResult.tables.map((t) => {
        const tableId = tableIdMap.get(t.name.toLowerCase())!;
        const colMap = columnIdMap.get(t.name.toLowerCase())!;
        const pkSet = new Set(t.primaryKeyColumns.map((c) => c.toLowerCase()));

        const columns = t.columns.map((c) => {
            const colId = colMap.get(c.name.toLowerCase())!;
            const isPK = c.isPrimaryKey || pkSet.has(c.name.toLowerCase());

            // Find FK for this column
            const fk = t.foreignKeys.find((fk) =>
                fk.columns.length === 1 && fk.columns[0].toLowerCase() === c.name.toLowerCase()
            );

            let foreignKey: { refTableId: string; refColumnId: string; onDelete?: FKAction; onUpdate?: FKAction } | undefined;
            if (fk) {
                const refTableId = tableIdMap.get(fk.refTable.toLowerCase());
                const refColMap = columnIdMap.get(fk.refTable.toLowerCase());
                const refColId = refColMap?.get(fk.refColumns[0].toLowerCase());
                if (refTableId && refColId) {
                    foreignKey = {
                        refTableId,
                        refColumnId: refColId,
                        onDelete: fk.onDelete,
                        onUpdate: fk.onUpdate,
                    };
                }
            }

            return {
                id: colId,
                name: c.name,
                dataType: c.dataType,
                length: c.length,
                nullable: isPK ? false : c.nullable,
                unique: c.unique,
                autoIncrement: c.autoIncrement || undefined,
                defaultValue: c.defaultValue,
                roles: {
                    ...(isPK ? { primaryKey: true } : {}),
                    ...(foreignKey ? { foreignKey } : {}),
                },
            };
        });

        // Handle composite FKs (multi-column) - map each column
        for (const fk of t.foreignKeys) {
            if (fk.columns.length <= 1) continue;
            const refTableId = tableIdMap.get(fk.refTable.toLowerCase());
            const refColMap = columnIdMap.get(fk.refTable.toLowerCase());
            if (!refTableId || !refColMap) continue;

            for (let i = 0; i < fk.columns.length; i++) {
                const col = columns.find((c) => c.name.toLowerCase() === fk.columns[i].toLowerCase());
                const refColId = refColMap.get(fk.refColumns[i]?.toLowerCase());
                if (col && refColId && !col.roles?.foreignKey) {
                    col.roles = {
                        ...col.roles,
                        foreignKey: {
                            refTableId,
                            refColumnId: refColId,
                            onDelete: fk.onDelete,
                            onUpdate: fk.onUpdate,
                        },
                    };
                }
            }
        }

        const indexes = t.indexes.map((idx) => ({
            id: generateId(),
            name: idx.name,
            type: idx.resolvedType ?? "BTREE" as const,
            columns: idx.columns,
            isUnique: idx.isUnique,
        }));

        return {
            id: tableId,
            name: t.name,
            columns,
            ...(indexes.length > 0 ? { indexes } : {}),
        };
    });

    return {
        model: {
            id: generateId(),
            name: modelName,
            version: 1,
            ...(dbms ? { dbms } : {}),
        },
        tables,
    };
}
