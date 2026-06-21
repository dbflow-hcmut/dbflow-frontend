import type { PhysicalModelPayload } from "./physical-model.builder";
import type { LogicalModelPayload } from "./logical-model.builder";
import type { ConceptualModelPayload } from "./conceptual-model.builder";

export type HTMLDocsOptions = {
    includeNotes: boolean;
    includeIndexes: boolean;
    includeFKDetails: boolean;
};

export const DEFAULT_HTML_DOCS_OPTIONS: HTMLDocsOptions = {
    includeNotes: true,
    includeIndexes: true,
    includeFKDetails: true,
};

export type HTMLDocsResult = {
    html: string;
    tableCount: number;
    columnCount: number;
};

// ── Helpers ──────────────────────────────────────────────────────────

function esc(str: string | undefined | null): string {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function badge(text: string, color: string): string {
    return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;color:#fff;background:${color};margin-right:3px;">${esc(text)}</span>`;
}

// ── Physical ─────────────────────────────────────────────────────────

function generatePhysicalHTML(model: PhysicalModelPayload, options: HTMLDocsOptions): HTMLDocsResult {
    const tables = model.tables ?? [];
    let columnCount = 0;

    // Build table-id → table-name map for FK references
    const tableNameMap = new Map<string, string>();
    const colNameMap = new Map<string, string>(); // colId -> colName (tableId_colId)
    for (const t of tables) {
        tableNameMap.set(t.id, t.name);
        for (const c of t.columns ?? []) {
            colNameMap.set(`${t.id}_${c.id}`, c.name);
        }
    }

    const tablesSections = tables.map((table) => {
        const cols = table.columns ?? [];
        columnCount += cols.length;

        const colRows = cols
            .map((col) => {
                const badges: string[] = [];
                if (col.roles?.primaryKey) badges.push(badge("PK", "#6366f1"));
                if (col.roles?.foreignKey) badges.push(badge("FK", "#f59e0b"));
                if (col.roles?.candidateKey) badges.push(badge("CK", "#8b5cf6"));
                if (col.unique) badges.push(badge("UQ", "#06b6d4"));

                const fkRef = col.roles?.foreignKey;
                let fkDetail = "";
                if (fkRef && options.includeFKDetails) {
                    const refTable = tableNameMap.get(fkRef.refTableId) ?? fkRef.refTableId;
                    const refCol = colNameMap.get(`${fkRef.refTableId}_${fkRef.refColumnId}`) ?? fkRef.refColumnId;
                    fkDetail = `<a href="#table-${esc(refTable)}">${esc(refTable)}</a>.${esc(refCol)}`;
                    if (fkRef.onDelete) fkDetail += ` <span style="color:#999;font-size:11px;">ON DELETE ${esc(fkRef.onDelete)}</span>`;
                    if (fkRef.onUpdate) fkDetail += ` <span style="color:#999;font-size:11px;">ON UPDATE ${esc(fkRef.onUpdate)}</span>`;
                }

                const constraints: string[] = [];
                if (!col.nullable) constraints.push("NOT NULL");
                if (col.autoIncrement) constraints.push("AUTO INCREMENT");
                if (col.defaultValue) constraints.push(`DEFAULT ${esc(col.defaultValue)}`);

                return `<tr>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:500;">${badges.join("")} ${esc(col.name)}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:13px;color:#6366f1;">${esc(col.dataType ?? "")}${col.length ? `(${esc(col.length)})` : ""}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${constraints.join(", ")}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">${fkDetail}</td>
                    ${options.includeNotes ? `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#888;">${esc(col.notes)}</td>` : ""}
                </tr>`;
            })
            .join("\n");

        // Indexes
        let indexSection = "";
        if (options.includeIndexes && table.indexes && table.indexes.length > 0) {
            const indexRows = table.indexes
                .map(
                    (idx) =>
                        `<tr>
                        <td style="padding:4px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${esc(idx.name)}</td>
                        <td style="padding:4px 10px;border-bottom:1px solid #eee;font-size:12px;">${esc(idx.type)}</td>
                        <td style="padding:4px 10px;border-bottom:1px solid #eee;font-size:12px;">${idx.columns.map((c) => `${esc(c.columnName)} ${esc(c.order)}`).join(", ")}</td>
                        <td style="padding:4px 10px;border-bottom:1px solid #eee;font-size:12px;">${idx.isUnique ? "Yes" : "No"}</td>
                    </tr>`,
                )
                .join("\n");

            indexSection = `
            <div style="margin-top:10px;">
                <strong style="font-size:13px;">Indexes</strong>
                <table style="width:100%;border-collapse:collapse;margin-top:4px;border:1px solid #e5e7eb;">
                    <thead><tr style="background:#f9fafb;">
                        <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Name</th>
                        <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Type</th>
                        <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Columns</th>
                        <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Unique</th>
                    </tr></thead>
                    <tbody>${indexRows}</tbody>
                </table>
            </div>`;
        }

        const notesSection = options.includeNotes && table.notes ? `<p style="margin:6px 0 0;font-size:12px;color:#888;"><em>${esc(table.notes)}</em></p>` : "";

        return `
        <div id="table-${esc(table.name)}" style="margin-bottom:28px;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#1f2937;border-bottom:2px solid #6366f1;padding-bottom:4px;">${esc(table.name)}</h3>
            ${notesSection}
            <table style="width:100%;border-collapse:collapse;margin-top:6px;border:1px solid #e5e7eb;">
                <thead><tr style="background:#f9fafb;">
                    <th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Column</th>
                    <th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Type</th>
                    <th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Constraints</th>
                    <th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">References</th>
                    ${options.includeNotes ? `<th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Notes</th>` : ""}
                </tr></thead>
                <tbody>${colRows}</tbody>
            </table>
            ${indexSection}
        </div>`;
    });

    // Table of contents
    const toc = tables
        .map((t) => `<li><a href="#table-${esc(t.name)}" style="color:#6366f1;text-decoration:none;">${esc(t.name)}</a> <span style="color:#aaa;font-size:12px;">(${(t.columns ?? []).length} columns)</span></li>`)
        .join("\n");

    const html = wrapHTML(
        model.model.name,
        `<p style="color:#6b7280;margin:0 0 4px;">Physical Schema · ${tables.length} tables · ${columnCount} columns</p>`,
        `<h2 style="font-size:18px;margin:24px 0 8px;">Table of Contents</h2>
        <ul style="list-style:none;padding:0;columns:2;column-gap:30px;">${toc}</ul>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        ${tablesSections.join("\n")}`,
    );

    return { html, tableCount: tables.length, columnCount };
}

// ── Logical ──────────────────────────────────────────────────────────

function generateLogicalHTML(model: LogicalModelPayload, options: HTMLDocsOptions): HTMLDocsResult {
    const tables = model.tables ?? [];
    let columnCount = 0;

    const tableNameMap = new Map<string, string>();
    for (const t of tables) tableNameMap.set(t.id, t.name);

    const tablesSections = tables.map((table) => {
        const cols = table.columns ?? [];
        columnCount += cols.length;

        const colRows = cols
            .map((col) => {
                const badges: string[] = [];
                if (col.roles?.primaryKey) badges.push(badge("PK", "#6366f1"));
                if (col.roles?.foreignKey) badges.push(badge("FK", "#f59e0b"));
                if (col.roles?.candidateKey) badges.push(badge("CK", "#8b5cf6"));

                const constraints: string[] = [];
                if (!col.nullable) constraints.push("NOT NULL");
                if (col.unique) constraints.push("UNIQUE");

                let fkDetail = "";
                if (col.roles?.foreignKey && options.includeFKDetails) {
                    const fk = col.roles.foreignKey;
                    const refTable = tableNameMap.get(fk.refTableId) ?? fk.refTableId;
                    fkDetail = `<a href="#table-${esc(refTable)}">${esc(refTable)}</a>`;
                }

                return `<tr>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:500;">${badges.join("")} ${esc(col.name)}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${constraints.join(", ")}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">${fkDetail}</td>
                    ${options.includeNotes ? `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#888;">${esc(col.notes)}</td>` : ""}
                </tr>`;
            })
            .join("\n");

        const notesSection = options.includeNotes && table.notes ? `<p style="margin:6px 0 0;font-size:12px;color:#888;"><em>${esc(table.notes)}</em></p>` : "";

        return `
        <div id="table-${esc(table.name)}" style="margin-bottom:28px;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#1f2937;border-bottom:2px solid #6366f1;padding-bottom:4px;">${esc(table.name)}</h3>
            ${notesSection}
            <table style="width:100%;border-collapse:collapse;margin-top:6px;border:1px solid #e5e7eb;">
                <thead><tr style="background:#f9fafb;">
                    <th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Column</th>
                    <th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Constraints</th>
                    <th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">References</th>
                    ${options.includeNotes ? `<th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Notes</th>` : ""}
                </tr></thead>
                <tbody>${colRows}</tbody>
            </table>
        </div>`;
    });

    const toc = tables
        .map((t) => `<li><a href="#table-${esc(t.name)}" style="color:#6366f1;text-decoration:none;">${esc(t.name)}</a> <span style="color:#aaa;font-size:12px;">(${(t.columns ?? []).length} columns)</span></li>`)
        .join("\n");

    const html = wrapHTML(
        model.model.name,
        `<p style="color:#6b7280;margin:0 0 4px;">Logical Schema · ${tables.length} tables · ${columnCount} columns</p>`,
        `<h2 style="font-size:18px;margin:24px 0 8px;">Table of Contents</h2>
        <ul style="list-style:none;padding:0;columns:2;column-gap:30px;">${toc}</ul>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        ${tablesSections.join("\n")}`,
    );

    return { html, tableCount: tables.length, columnCount };
}

// ── Conceptual ───────────────────────────────────────────────────────

function generateConceptualHTML(model: ConceptualModelPayload, options: HTMLDocsOptions): HTMLDocsResult {
    const entities = model.entities ?? [];
    const relationships = model.relationships ?? [];
    const generalizations = model.generalizations ?? [];

    const entityMap = new Map<string, string>();
    for (const e of entities) entityMap.set(e.id, e.name);

    // Entities
    const entitySections = entities.map((entity) => {
        const attrRows = (entity.attributes ?? [])
            .map((attr) => {
                const badges: string[] = [];
                if (attr.isKey) badges.push(badge("KEY", "#6366f1"));
                if (attr.kind === "multi_valued") badges.push(badge("MV", "#f59e0b"));
                if (attr.kind === "derived") badges.push(badge("DER", "#8b5cf6"));
                if (attr.kind === "composite") badges.push(badge("COMP", "#06b6d4"));

                const components = attr.components?.length
                    ? attr.components.map((c) => esc(c.name)).join(", ")
                    : "";

                return `<tr>
                    <td style="padding:5px 10px;border-bottom:1px solid #eee;font-weight:500;">${badges.join("")} ${esc(attr.name)}</td>
                    <td style="padding:5px 10px;border-bottom:1px solid #eee;font-size:12px;color:#666;">${esc(attr.kind)}</td>
                    <td style="padding:5px 10px;border-bottom:1px solid #eee;font-size:12px;">${components}</td>
                    ${options.includeNotes ? `<td style="padding:5px 10px;border-bottom:1px solid #eee;font-size:12px;color:#888;">${esc(attr.notes)}</td>` : ""}
                </tr>`;
            })
            .join("\n");

        const notesSection = options.includeNotes && entity.notes ? `<p style="margin:6px 0 0;font-size:12px;color:#888;"><em>${esc(entity.notes)}</em></p>` : "";
        const kindBadge = entity.kind === "weak" ? ` ${badge("WEAK", "#ef4444")}` : "";

        return `
        <div id="entity-${esc(entity.name)}" style="margin-bottom:28px;">
            <h3 style="margin:0 0 8px;font-size:16px;color:#1f2937;border-bottom:2px solid #6366f1;padding-bottom:4px;">${esc(entity.name)}${kindBadge}</h3>
            ${notesSection}
            ${(entity.attributes ?? []).length > 0 ? `
            <table style="width:100%;border-collapse:collapse;margin-top:6px;border:1px solid #e5e7eb;">
                <thead><tr style="background:#f9fafb;">
                    <th style="text-align:left;padding:5px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Attribute</th>
                    <th style="text-align:left;padding:5px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Kind</th>
                    <th style="text-align:left;padding:5px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Components</th>
                    ${options.includeNotes ? `<th style="text-align:left;padding:5px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Notes</th>` : ""}
                </tr></thead>
                <tbody>${attrRows}</tbody>
            </table>` : `<p style="color:#aaa;font-size:12px;">No attributes defined</p>`}
        </div>`;
    });

    // Relationships
    const relSections = relationships.map((rel) => {
        const endRows = (rel.ends ?? [])
            .map((end) => {
                const entityName = entityMap.get(end.entityId) ?? end.entityId;
                return `<tr>
                    <td style="padding:4px 10px;border-bottom:1px solid #eee;"><a href="#entity-${esc(entityName)}" style="color:#6366f1;text-decoration:none;">${esc(entityName)}</a></td>
                    <td style="padding:4px 10px;border-bottom:1px solid #eee;font-size:12px;">${esc(end.role)}</td>
                    <td style="padding:4px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:13px;">${esc(end.cardinality)}</td>
                    <td style="padding:4px 10px;border-bottom:1px solid #eee;font-size:12px;">${end.optional ? "Yes" : "No"}</td>
                </tr>`;
            })
            .join("\n");

        const typeBadge = rel.type === "identifying" ? badge("IDENTIFYING", "#ef4444") : badge("ASSOCIATION", "#3b82f6");

        return `
        <div style="margin-bottom:20px;">
            <h4 style="margin:0 0 6px;font-size:14px;color:#374151;">${typeBadge} ${esc(rel.name)}</h4>
            <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
                <thead><tr style="background:#f9fafb;">
                    <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Entity</th>
                    <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Role</th>
                    <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Cardinality</th>
                    <th style="text-align:left;padding:4px 10px;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;">Optional</th>
                </tr></thead>
                <tbody>${endRows}</tbody>
            </table>
        </div>`;
    });

    // Generalizations
    const genSections = generalizations.map((gen) => {
        const parentIds = gen.parentEntityIds?.length
            ? gen.parentEntityIds
            : (gen as typeof gen & { parentEntityId?: string }).parentEntityId
              ? [(gen as typeof gen & { parentEntityId: string }).parentEntityId]
              : [];
        const parentNames = parentIds.map((id) => entityMap.get(id) ?? id);
        const childNames = (gen.childEntityIds ?? []).map((id) => entityMap.get(id) ?? id);
        return `
        <div style="margin-bottom:14px;padding:8px 12px;background:#f3f4f6;border-radius:6px;">
            <strong>Parents:</strong> ${parentNames.map((n) => `<a href="#entity-${esc(n)}" style="color:#6366f1;">${esc(n)}</a>`).join(", ")}<br/>
            <strong>Children:</strong> ${childNames.map((n) => `<a href="#entity-${esc(n)}" style="color:#6366f1;">${esc(n)}</a>`).join(", ")}<br/>
            <span style="font-size:12px;color:#666;">${esc(gen.constraints.disjointness)} / ${esc(gen.constraints.completeness)}</span>
        </div>`;
    });

    const totalAttrs = entities.reduce((sum, e) => sum + (e.attributes?.length ?? 0), 0);

    const html = wrapHTML(
        model.model.name,
        `<p style="color:#6b7280;margin:0 0 4px;">Conceptual Schema · ${entities.length} entities · ${relationships.length} relationships · ${totalAttrs} attributes</p>`,
        `
        <h2 style="font-size:18px;margin:24px 0 8px;">Entities</h2>
        <ul style="list-style:none;padding:0;columns:2;column-gap:30px;">
            ${entities.map((e) => `<li><a href="#entity-${esc(e.name)}" style="color:#6366f1;text-decoration:none;">${esc(e.name)}</a> ${e.kind === "weak" ? badge("WEAK", "#ef4444") : ""}</li>`).join("\n")}
        </ul>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        ${entitySections.join("\n")}
        ${relationships.length > 0 ? `<h2 style="font-size:18px;margin:24px 0 8px;">Relationships</h2>${relSections.join("\n")}` : ""}
        ${generalizations.length > 0 ? `<h2 style="font-size:18px;margin:24px 0 8px;">Generalizations</h2>${genSections.join("\n")}` : ""}
        `,
    );

    return { html, tableCount: entities.length, columnCount: totalAttrs };
}

// ── HTML Wrapper ─────────────────────────────────────────────────────

function wrapHTML(title: string, subtitle: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)} — Schema Documentation</title>
<style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937; max-width: 960px; margin: 0 auto; padding: 32px 24px; line-height: 1.5; background: #fff; }
    a { color: #6366f1; }
    a:hover { text-decoration: underline; }
    table { font-size: 13px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${subtitle}
<p style="color:#aaa;font-size:12px;margin:0 0 16px;">Generated on ${new Date().toLocaleString()}</p>
${body}
<footer style="margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#aaa;">
    Generated by DBFlow
</footer>
</body>
</html>`;
}

// ── Public API ───────────────────────────────────────────────────────

type SchemaModel = PhysicalModelPayload | LogicalModelPayload | ConceptualModelPayload;
type SchemaKind = "physical" | "logical" | "conceptual";

function isPhysicalModel(model: SchemaModel): model is PhysicalModelPayload {
    return "tables" in model && (model as PhysicalModelPayload).tables?.[0]?.columns?.[0]?.dataType !== undefined;
}

function isConceptualModel(model: SchemaModel): model is ConceptualModelPayload {
    return "entities" in model;
}

export function generateHTMLDocs(
    model: SchemaModel,
    schemaKind: SchemaKind,
    options: HTMLDocsOptions = DEFAULT_HTML_DOCS_OPTIONS,
): HTMLDocsResult {
    if (schemaKind === "conceptual" || isConceptualModel(model)) {
        return generateConceptualHTML(model as ConceptualModelPayload, options);
    }
    if (schemaKind === "physical" || isPhysicalModel(model)) {
        return generatePhysicalHTML(model as PhysicalModelPayload, options);
    }
    return generateLogicalHTML(model as LogicalModelPayload, options);
}
