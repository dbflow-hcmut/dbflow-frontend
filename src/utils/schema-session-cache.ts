const KEY_SCHEMAS = (id: string) => `dbflow_schemas_${id}`;
const KEY_SELECTED = (id: string) => `dbflow_sel_schema_${id}`;

function ssGet<T>(key: string): T | null {
    try { const v = sessionStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function ssSet(key: string, value: unknown) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getCachedSchemas(connId: string): string[] | null {
    return ssGet<string[]>(KEY_SCHEMAS(connId));
}
export function setCachedSchemas(connId: string, schemas: string[]): void {
    ssSet(KEY_SCHEMAS(connId), schemas);
}
export function getCachedSelectedSchema(connId: string): string | null {
    return ssGet<string>(KEY_SELECTED(connId));
}
export function setCachedSelectedSchema(connId: string, schema: string): void {
    ssSet(KEY_SELECTED(connId), schema);
}
/** Pick the best default schema: last saved → "public" → first → "" */
export function pickDefaultSchema(schemas: string[], connId: string): string {
    const saved = getCachedSelectedSchema(connId);
    if (saved && schemas.includes(saved)) return saved;
    return schemas.includes("public") ? "public" : schemas[0] ?? "";
}
