"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Modal,
    Button,
    Alert,
    Checkbox,
    Empty,
    Spin,
    Input,
    Tag,
    Select,
    Tooltip,
    Form,
} from "antd";
import {
    Database,
    Search,
    Table2,
    Columns3,
    RotateCcw,
    Key,
    Link2,
    Download,
} from "lucide-react";
import {
    introspectDbConnection,
    listSchemasDbConnection,
    getDbConnectionPlainParams,
    agentListSchemas,
    agentIntrospect,
    useMyDbConnections,
    type IntrospectedTable,
} from "@/api/db-connections/client";
import { createSchema, saveSchemaModel } from "@/components/EditProject/api/client";
import { createProject } from "@/components/CreateProject/api/client";
import { revalidateProjects } from "@/app/projects/actions";
import { introspectToPhysicalModel } from "@/utils/introspect-to-model";
import { useRouter } from "next/navigation";
import { notificationProvider } from "@/providers/notification";
import { SchemaType } from "@/utils/constants";
import { getCachedSchemas, setCachedSchemas, pickDefaultSchema, setCachedSelectedSchema } from "@/utils/schema-session-cache";

interface IntrospectSchemaModalProps {
    open: boolean;
    onClose: () => void;
    /** Pre-select a connection (e.g. just saved from DBConnectionModal) */
    initialConnectionId?: string;
}

export default function IntrospectSchemaModal({
    open,
    onClose,
    initialConnectionId,
}: IntrospectSchemaModalProps) {
    const router = useRouter();
    const { data: connections } = useMyDbConnections();
    const [form] = Form.useForm<{ projectName: string }>();
    const [selectedConnId, setSelectedConnId] = useState<string | null>(null);
    const [schemas, setSchemas] = useState<string[]>([]);
    const [selectedSchema, setSelectedSchema] = useState<string | null>(null);
    const [schemasLoading, setSchemasLoading] = useState(false);
    const [tables, setTables] = useState<IntrospectedTable[]>([]);
    const [selectedTableNames, setSelectedTableNames] = useState<Set<string>>(
        new Set(),
    );
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchText, setSearchText] = useState("");
    const [expandedTable, setExpandedTable] = useState<string | null>(null);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setSelectedConnId(null);
            setSchemas([]);
            setSelectedSchema(null);
            setSchemasLoading(false);
            setTables([]);
            setSelectedTableNames(new Set());
            setLoading(false);
            setImporting(false);
            setError(null);
            setSearchText("");
            setExpandedTable(null);
            form.resetFields();
        }
    }, [open, form]);

    // Pre-select initialConnectionId or first connection
    useEffect(() => {
        if (!open) return;
        if (initialConnectionId) {
            setSelectedConnId(initialConnectionId);
        } else if (!selectedConnId && connections && connections.length > 0) {
            setSelectedConnId(connections[0].id);
        }
    }, [open, initialConnectionId, connections, selectedConnId]);

    // Auto-populate project name from selected connection
    const selectedConn = useMemo(
        () => (connections ?? []).find((c) => c.id === selectedConnId),
        [connections, selectedConnId],
    );

    useEffect(() => {
        if (selectedConn && !form.getFieldValue("projectName")) {
            form.setFieldValue("projectName", selectedConn.database);
        }
    }, [selectedConn, form]);

    const loadSchemas = useCallback((force = false) => {
        if (!selectedConnId) { setSchemas([]); setSelectedSchema(null); setTables([]); return; }
        if (!force) {
            const cached = getCachedSchemas(selectedConnId);
            if (cached) { setSchemas(cached); setSelectedSchema(pickDefaultSchema(cached, selectedConnId)); return; }
        }
        setSchemasLoading(true);
        setSchemas([]);
        setSelectedSchema(null);
        setTables([]);
        setSelectedTableNames(new Set());
        const id = selectedConnId;
        const isAgent = (connections ?? []).find((c) => c.id === id)?.method === "local_agent";
        const load = isAgent
            ? getDbConnectionPlainParams(id).then((params) => agentListSchemas(params))
            : listSchemasDbConnection(id);
        load
            .then((s) => { setCachedSchemas(id, s); setSchemas(s); setSelectedSchema(pickDefaultSchema(s, id)); })
            .catch(() => setSchemas([]))
            .finally(() => setSchemasLoading(false));
    }, [selectedConnId, connections]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { loadSchemas(); }, [selectedConnId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleIntrospect = useCallback(async () => {
        if (!selectedConnId) return;
        setLoading(true);
        setError(null);
        setTables([]);
        setSelectedTableNames(new Set());
        setExpandedTable(null);

        try {
            const isAgent =
                (connections ?? []).find((c) => c.id === selectedConnId)?.method === "local_agent";

            let result: IntrospectedTable[];
            if (isAgent) {
                const params = await getDbConnectionPlainParams(selectedConnId);
                result = await agentIntrospect(params, selectedSchema ?? undefined);
            } else {
                result = await introspectDbConnection(selectedConnId, selectedSchema ?? undefined);
            }

            setTables(result);
            setSelectedTableNames(new Set(result.map((t) => t.name)));
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message.includes("Failed to fetch") || err.message.includes("NetworkError")
                        ? "Local Agent is not running. Start it at localhost:27182."
                        : err.message
                    : "Failed to introspect database",
            );
        } finally {
            setLoading(false);
        }
    }, [selectedConnId, selectedSchema, connections]);

    const filteredTables = useMemo(() => {
        if (!searchText.trim()) return tables;
        const q = searchText.toLowerCase();
        return tables.filter((t) => t.name.toLowerCase().includes(q));
    }, [tables, searchText]);

    const toggleTable = useCallback((name: string) => {
        setSelectedTableNames((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }, []);

    const toggleAll = useCallback(() => {
        if (selectedTableNames.size === filteredTables.length) {
            // Deselect all filtered
            setSelectedTableNames((prev) => {
                const next = new Set(prev);
                filteredTables.forEach((t) => next.delete(t.name));
                return next;
            });
        } else {
            // Select all filtered
            setSelectedTableNames((prev) => {
                const next = new Set(prev);
                filteredTables.forEach((t) => next.add(t.name));
                return next;
            });
        }
    }, [filteredTables, selectedTableNames]);

    const selectedTables = useMemo(
        () => tables.filter((t) => selectedTableNames.has(t.name)),
        [tables, selectedTableNames],
    );

    const totalColumns = useMemo(
        () => selectedTables.reduce((s, t) => s + t.columns.length, 0),
        [selectedTables],
    );

    const totalFKs = useMemo(
        () => selectedTables.reduce((s, t) => s + t.foreignKeys.length, 0),
        [selectedTables],
    );

    const handleImport = useCallback(
        async (values: { projectName: string }) => {
            if (selectedTables.length === 0 || !selectedConn) return;
            setImporting(true);
            try {
                const projectName = values.projectName || selectedConn.database;

                // 1. Create new project
                const project = await createProject({
                    name: projectName,
                    skipDefaultSchema: true,
                });
                if (!project?.id) throw new Error("Failed to create project");

                // 2. Create physical schema
                const schemaName = `${selectedConn.database} (imported)`;
                const schema = await createSchema(project.id, {
                    name: schemaName,
                    type: SchemaType.PHYSICAL,
                });
                if (!schema?.id) throw new Error("Failed to create schema");

                // 3. Convert → PhysicalModelPayload → save to S3
                const model = introspectToPhysicalModel(selectedTables, schemaName);
                await saveSchemaModel(
                    project.id,
                    schema.id,
                    model as unknown as Record<string, unknown>,
                );

                await revalidateProjects();

                notificationProvider.open({
                    type: "success",
                    message: `Imported ${selectedTables.length} table${selectedTables.length !== 1 ? "s" : ""} into "${projectName}"`,
                });
                onClose();
                router.push(`/projects/${project.id}`);
            } catch (err) {
                notificationProvider.open({
                    type: "error",
                    message: err instanceof Error ? err.message : "Failed to import schema",
                });
            } finally {
                setImporting(false);
            }
        },
        [selectedTables, selectedConn, onClose, router],
    );

    const connOptions = useMemo(
        () =>
            (connections ?? []).map((c) => ({
                label: `${c.name}  (${c.host}/${c.database})`,
                value: c.id,
            })),
        [connections],
    );

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <div className="flex items-center gap-2">
                    <span>Import Schema from Database</span>
                </div>
            }
            width={720}
            styles={{
                content: { padding: 0 },
                header: { padding: "20px 24px 8px" },
                body: { padding: 0, overflow: "hidden" },
                footer: { padding: "12px 24px 16px" },
            }}
            footer={
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                        {tables.length > 0
                            ? `${selectedTableNames.size} / ${tables.length} table${tables.length !== 1 ? "s" : ""} selected · ${totalColumns} column${totalColumns !== 1 ? "s" : ""}${totalFKs > 0 ? ` · ${totalFKs} FK${totalFKs !== 1 ? "s" : ""}` : ""}`
                            : "Select a connection and click Introspect"}
                    </span>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            type="primary"
                            icon={<Download size={15} />}
                            loading={importing}
                            disabled={selectedTableNames.size === 0}
                            onClick={() => form.submit()}
                        >
                            Import{" "}
                            {selectedTableNames.size > 0
                                ? `${selectedTableNames.size} Table${selectedTableNames.size !== 1 ? "s" : ""}`
                                : ""}
                        </Button>
                    </div>
                </div>
            }
            destroyOnHidden
        >
            <div
                style={{ maxHeight: "65vh", overflowY: "auto", padding: "12px 24px" }}
            >
                {/* Project name */}
                <Form form={form} onFinish={handleImport} layout="vertical">
                    <Form.Item
                        name="projectName"
                        label="Project Name"
                        rules={[{ required: true, message: "Enter a project name" }]}
                        className="mb-3"
                    >
                        <Input placeholder="e.g. my_database" className="!h-9" />
                    </Form.Item>
                </Form>

                {/* Connection selector + schema picker + introspect button */}
                <div className="flex gap-2 mb-3 min-w-0">
                    <Select
                        className="min-w-0 flex-1"
                        style={{ overflow: "hidden" }}
                        placeholder={connections?.length === 0 ? "No connections — create one first" : "Select a connection"}
                        value={selectedConnId}
                        onChange={(val) => {
                            setSelectedConnId(val);
                            const conn = (connections ?? []).find((c) => c.id === val);
                            if (conn) form.setFieldValue("projectName", conn.database);
                        }}
                        options={connOptions}
                    />
                    {schemasLoading ? (
                        <div className="h-8 w-28 rounded-md bg-gray-200 animate-pulse shrink-0" />
                    ) : (
                        <Select
                            className="shrink-0"
                            style={{ minWidth: 120 }}
                            placeholder="Schema"
                            disabled={!selectedConnId || schemas.length === 0}
                            value={selectedSchema}
                            onChange={(val) => {
                                setSelectedSchema(val);
                                if (selectedConnId) setCachedSelectedSchema(selectedConnId, val);
                                setTables([]);
                                setSelectedTableNames(new Set());
                            }}
                            options={schemas.map((s) => ({ label: s, value: s }))}
                            notFoundContent="No schemas"
                        />
                    )}
                    <Tooltip title="Reload schemas">
                        <button
                            onClick={() => loadSchemas(true)}
                            disabled={schemasLoading || !selectedConnId}
                            className="cursor-pointer text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                            <RotateCcw size={14} />
                        </button>
                    </Tooltip>
                    <Button
                        type="primary"
                        icon={<Database size={15} />}
                        loading={loading}
                        disabled={!selectedConnId || !selectedSchema}
                        onClick={handleIntrospect}
                        className="shrink-0"
                    >
                        Introspect
                    </Button>
                </div>

                {error && (
                    <Alert
                        type="error"
                        message={error}
                        className="mb-3"
                        showIcon
                        closable
                        onClose={() => setError(null)}
                    />
                )}

                {loading && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Spin size="large" />
                        <span className="mt-3 text-sm text-gray-500">
                            Reading database schema...
                        </span>
                    </div>
                )}

                {!loading && tables.length === 0 && !error && (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Click Introspect to read tables from the database"
                    />
                )}

                {!loading && tables.length > 0 && (
                    <>
                        {/* Search + select all */}
                        <div className="flex items-center gap-2 mb-2">
                            <Input
                                prefix={<Search size={12} className="text-gray-400" />}
                                placeholder="Filter tables..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                allowClear
                                size="small"
                                className="flex-1 h-8!"
                            />
                            <Checkbox
                                indeterminate={
                                    selectedTableNames.size > 0 &&
                                    selectedTableNames.size < filteredTables.length
                                }
                                checked={
                                    filteredTables.length > 0 &&
                                    filteredTables.every((t) =>
                                        selectedTableNames.has(t.name),
                                    )
                                }
                                onChange={toggleAll}
                            >
                                <span className="text-xs text-gray-500">All</span>
                            </Checkbox>
                        </div>

                        {/* Table list */}
                        <div className="space-y-1 max-h-[45vh] overflow-y-auto">
                            {filteredTables.map((t) => {
                                const pkCount = t.columns.filter(
                                    (c) => c.isPrimaryKey,
                                ).length;
                                const isExpanded = expandedTable === t.name;

                                return (
                                    <div
                                        key={t.name}
                                        className="rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                                    >
                                        {/* Table row */}
                                        <div className="flex items-center gap-2 px-3 py-2">
                                            <Checkbox
                                                checked={selectedTableNames.has(t.name)}
                                                onChange={() => toggleTable(t.name)}
                                            />
                                            <button
                                                type="button"
                                                className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-gray-50 rounded px-1 -mx-1"
                                                onClick={() =>
                                                    setExpandedTable(
                                                        isExpanded ? null : t.name,
                                                    )
                                                }
                                            >
                                                <Table2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                <span className="text-sm font-medium text-gray-900 truncate">
                                                    {t.name}
                                                </span>
                                                <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1.5 ml-auto">
                                                    <Tooltip title="Columns">
                                                        <span className="flex items-center gap-0.5">
                                                            <Columns3 className="w-3 h-3" />
                                                            {t.columns.length}
                                                        </span>
                                                    </Tooltip>
                                                    {pkCount > 0 && (
                                                        <Tooltip title="Primary keys">
                                                            <span className="flex items-center gap-0.5">
                                                                <Key className="w-3 h-3" />
                                                                {pkCount}
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                    {t.foreignKeys.length > 0 && (
                                                        <Tooltip title="Foreign keys">
                                                            <span className="flex items-center gap-0.5">
                                                                <Link2 className="w-3 h-3" />
                                                                {t.foreignKeys.length}
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                </span>
                                            </button>
                                        </div>

                                        {/* Expanded column list */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 px-3 pb-2 pt-1">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="text-gray-400">
                                                            <th className="text-left font-medium py-1 pr-2">
                                                                Column
                                                            </th>
                                                            <th className="text-left font-medium py-1 pr-2">
                                                                Type
                                                            </th>
                                                            <th className="text-left font-medium py-1 pr-2">
                                                                Nullable
                                                            </th>
                                                            <th className="text-left font-medium py-1">
                                                                Flags
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {t.columns.map((col) => (
                                                            <tr
                                                                key={col.name}
                                                                className="text-gray-600 border-t border-gray-50"
                                                            >
                                                                <td className="py-1 pr-2 font-mono">
                                                                    {col.name}
                                                                </td>
                                                                <td className="py-1 pr-2 text-gray-500">
                                                                    {col.dataType}
                                                                    {col.length
                                                                        ? `(${col.length})`
                                                                        : ""}
                                                                </td>
                                                                <td className="py-1 pr-2">
                                                                    {col.nullable
                                                                        ? "YES"
                                                                        : "NO"}
                                                                </td>
                                                                <td className="py-1">
                                                                    <div className="flex gap-1">
                                                                        {col.isPrimaryKey && (
                                                                            <Tag
                                                                                color="gold"
                                                                                className="text-[10px] leading-4 px-1"
                                                                            >
                                                                                PK
                                                                            </Tag>
                                                                        )}
                                                                        {col.autoIncrement && (
                                                                            <Tag
                                                                                color="blue"
                                                                                className="text-[10px] leading-4 px-1"
                                                                            >
                                                                                AI
                                                                            </Tag>
                                                                        )}
                                                                        {col.isUnique && (
                                                                            <Tag
                                                                                color="cyan"
                                                                                className="text-[10px] leading-4 px-1"
                                                                            >
                                                                                UQ
                                                                            </Tag>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                {t.foreignKeys.length > 0 && (
                                                    <div className="mt-2 pt-1 border-t border-gray-100">
                                                        <div className="text-[10px] font-medium text-gray-400 uppercase mb-1">
                                                            Foreign Keys
                                                        </div>
                                                        {t.foreignKeys.map((fk) => (
                                                            <div
                                                                key={fk.constraintName}
                                                                className="text-[11px] text-gray-500"
                                                            >
                                                                {fk.columns.join(", ")}{" "}
                                                                → {fk.refTable}(
                                                                {fk.refColumns.join(
                                                                    ", ",
                                                                )}
                                                                )
                                                                {fk.onDelete &&
                                                                    fk.onDelete !==
                                                                        "NO ACTION" && (
                                                                        <span className="text-gray-400">
                                                                            {" "}
                                                                            ON DELETE{" "}
                                                                            {fk.onDelete}
                                                                        </span>
                                                                    )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
