"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, Button, Tooltip, Dropdown, Modal } from "antd";
import { Download, History, Send, ArrowRightLeft, DatabaseZap, MessageSquareWarning, Layers, RefreshCw, FileCode2, FolderOpen } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { RemoteCollaborator } from "../../hooks/useCollaborationAwareness";
import DbFlowController from "@/components/db-flow/DbFlowController";
import SQLGenerator from "@/components/SQLGenerator";
import { introspectDbConnection, useProjectDbConnections } from "@/api/db-connections/client";
import ProjectDocumentsHub from "@/components/ProjectDocumentsHub";
import ExportPortalDropdown from "@/components/ExportPortalDropdown";

type SchemaType = 'conceptual' | 'logical' | 'physical';
type DiagramExportFormat = 'png' | 'svg' | 'pdf';

export type SyncableSchema = {
    id: string;
    name: string;
    type: string;
};

type HeaderProps = {
    diagramName: string;
    isEditingDiagramName: boolean;
    canEdit?: boolean;
    onSetDiagramName: (name: string) => void;
    onSetIsEditingDiagramName: (isEditing: boolean) => void;
    collaborators: RemoteCollaborator[];
    onFollowUser: (user: RemoteCollaborator) => void;
    onDownload: (format: DiagramExportFormat) => void;
    onExportJson: () => void;
    onExportDDL?: () => void;
    onExportHTMLDocs?: () => void;
    onVersionHistory?: () => void;
    onShareClick: () => void;
    commentMode?: boolean;
    onToggleCommentMode?: () => void;
    schemaType?: SchemaType;
    onConvertSchema?: (targetType: SchemaType) => void;
    isConverting?: boolean;
    syncableSchemas?: SyncableSchema[];
    onSyncToSchema?: (targetSchemaId: string, targetSchemaType: string) => void;
    isSyncing?: boolean;
    linterOpen?: boolean;
    onToggleLinterPanel?: () => void;
    linterCounts?: { error: number; warning: number; info: number };
    projectId?: string;
    projectVisibility?: string;
    normalizationOpen?: boolean;
    onToggleNormalizationPanel?: () => void;
    onApplyToDatabase?: () => void;
    onExportHistory?: () => void;
};

type SQLGeneratorTable = {
    id: string;
    name: string;
    columns: {
        id: string;
        name: string;
        type: string;
        isPrimaryKey?: boolean;
        isNullable?: boolean;
    }[];
};

const Header: React.FC<HeaderProps> = ({
    diagramName,
    isEditingDiagramName,
    canEdit = true,
    onSetDiagramName,
    onSetIsEditingDiagramName,
    collaborators,
    onFollowUser,
    onDownload,
    onExportJson,
    onExportDDL,
    onExportHTMLDocs,
    onVersionHistory,
    onShareClick,
    schemaType,
    onConvertSchema,
    isConverting = false,
    syncableSchemas = [],
    onSyncToSchema,
    isSyncing = false,
    linterOpen = false,
    onToggleLinterPanel,
    linterCounts,
    projectId,
    projectVisibility,
    normalizationOpen = false,
    onToggleNormalizationPanel,
    onApplyToDatabase,
    onExportHistory,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const [isDBConnectionOpen, setIsDBConnectionOpen] = useState(false);
    const [isSQLGeneratorOpen, setIsSQLGeneratorOpen] = useState(false);
    const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);
    const [sqlGeneratorTables, setSqlGeneratorTables] = useState<SQLGeneratorTable[]>([]);
    const [loadingTables, setLoadingTables] = useState(false);
    const { data: projectConns } = useProjectDbConnections(projectId ?? null);
    const connectedDbId = projectConns?.[0]?.id ?? null;

    const handleDBConnectionClose = useCallback(() => {
        setIsDBConnectionOpen(false);
    }, []);

    useEffect(() => {
        if (isEditingDiagramName && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditingDiagramName]);

    useEffect(() => {
        let cancelled = false;

        if (!connectedDbId) {
            setSqlGeneratorTables([]);
            setLoadingTables(false);
            setIsSQLGeneratorOpen(false);
            return;
        }

        const activeConnId = connectedDbId;

        async function loadTables() {
            try {
                setLoadingTables(true);
                const introspectedTables = await introspectDbConnection(activeConnId);
                if (cancelled) return;

                const formattedTables: SQLGeneratorTable[] = introspectedTables.map((table) => ({
                    id: table.name,
                    name: table.name,
                    columns: table.columns.map((col) => ({
                        id: col.name,
                        name: col.name,
                        type: col.dataType,
                        isPrimaryKey: col.isPrimaryKey,
                        isNullable: col.nullable,
                    })),
                }));
                setSqlGeneratorTables(formattedTables);
            } catch (error) {
                if (!cancelled) {
                    console.error('Failed to fetch tables:', error);
                    setSqlGeneratorTables([]);
                }
            } finally {
                if (!cancelled) {
                    setLoadingTables(false);
                }
            }
        }

        loadTables();

        return () => {
            cancelled = true;
        };
    }, [connectedDbId]);

    const collaboratorInitials = useCallback((user: RemoteCollaborator) => {
        const source = user.name ?? user.sessionId ?? "";
        if (!source) return "??";
        const parts = source.trim().split(/\s+/);
        if (parts.length === 1) {
            return parts[0].slice(0, 2).toUpperCase();
        }
        const first = parts[0][0] ?? "";
        const last = parts[parts.length - 1][0] ?? "";
        return `${first}${last}`.toUpperCase();
    }, []);

    const avatarItems = useMemo(() => collaborators.slice(0, 4), [collaborators]);

    const convertItems = useMemo(() => {
        const allTypes: { type: SchemaType; label: string }[] = [
            { type: 'conceptual', label: 'Convert to Conceptual' },
            { type: 'logical',    label: 'Convert to Logical' },
            { type: 'physical',   label: 'Convert to Physical' },
        ];
        return allTypes
            .filter((t) => t.type !== schemaType)
            .map((t) => ({
                key: t.type,
                label: t.label,
                onClick: () => onConvertSchema?.(t.type),
            }));
    }, [schemaType, onConvertSchema]);

    return (
        <>
        <div className="pt-4 bg-transparent flex items-center justify-between px-4 fixed top-0 z-10 w-full">
            <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                <div className="cursor-pointer mx-1" onClick={() => router.push(`/ai-chat`)}>
                    <Image width={26} height={26} src="/favicon.ico" alt="Logo" />
                </div>
                {!isEditingDiagramName ? (
                    <div
                        className={`text-md leading-none font-semibold px-2 py-1 bg-transparent rounded-md max-w-[300px] truncate ${
                            canEdit ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'
                        }`}
                        onClick={canEdit ? () => onSetIsEditingDiagramName(true) : undefined}
                        title={canEdit ? diagramName : `${diagramName} (Read-only)`}
                    >
                        {diagramName}
                    </div>
                ) : (
                    <input
                        ref={inputRef}
                        className="text-md leading-none font-semibold px-2 py-1 bg-transparent border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 max-w-[300px]"
                        value={diagramName}
                        onChange={(e) => onSetDiagramName(e.target.value)}
                        onBlur={() => onSetIsEditingDiagramName(false)}
                        style={{
                            width: `${Math.min(diagramName.length * 9 + 16, 300)}px`,
                        }}
                    />
                )}
                {projectId && canEdit && (
                    <Tooltip title="Project Documents" placement="bottom">
                        <Button
                            type="text"
                            className="!px-2"
                            onClick={() => setIsDocumentsOpen(true)}
                        >
                            <FolderOpen size={18} />
                        </Button>
                    </Tooltip>
                )}

                <Button
                    id="tour-share-btn"
                    type="primary"
                    className="!px-3 gap-2 flex items-center"
                    onClick={onShareClick}
                >
                    <Send className="text-white" size={18} />
                    <span className="font-semibold">Share</span>
                </Button>
            </div>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
                    {collaborators.length > 0 && (
                    <div className="rounded-xl py-1 h-10 flex items-center">
                        <Avatar.Group
                            max={{
                                count: 3,
                                style: { width: 28, height: 28, fontSize: 12 },
                            }}
                        >
                            {avatarItems.map((user) => {
                                const label = user.name ?? user.sessionId ?? "Collaborator";
                                const hasAvatar = Boolean(user.avatar);
                                return (
                                    <Tooltip title={label} key={user.clientId}>
                                            <Avatar
                                                size={28}
                                                src={hasAvatar ? user.avatar : undefined}
                                                style={{
                                                    backgroundColor: hasAvatar ? undefined : user.color,
                                                    cursor: user.viewport ? "pointer" : "default",
                                                    color: "#fff",
                                                    fontWeight: 600,
                                                }}
                                                onClick={() => {
                                                    if (user.viewport) {
                                                        onFollowUser(user);
                                                    }
                                                }}
                                            >
                                                {!hasAvatar ? collaboratorInitials(user) : null}
                                            </Avatar>
                                    </Tooltip>
                                );
                            })}
                        </Avatar.Group>
                    </div>
                    )}
                    <Tooltip title="Version History" placement="bottom">
                        <Button
                            id="tour-version-history"
                            type="text"
                            className="!px-2"
                            onClick={onVersionHistory}
                        >
                            <History size={18} />
                        </Button>
                    </Tooltip>
                    {/* <Tooltip title="Comment" placement="bottom">
                        <Button
                            type={commentMode ? 'primary' : 'text'}
                            className="!px-2"
                            onClick={onToggleCommentMode}
                        >
                            <MessageCircleMore size={18} />
                        </Button>
                    </Tooltip> */}
                    <Tooltip title="Database Management" placement="bottom">
                        <Button
                            type={'text'}
                            className="!px-2"
                            onClick={() => setIsDBConnectionOpen(true)}
                        >
                            <DatabaseZap size={18} />
                        </Button>
                    </Tooltip>
                    {/* Legacy code, do not use */}
                    {/* <Tooltip title={connectedDbId ? "SQL Query Generator" : "Connect a database to generate SQL"} placement="bottom">
                        <Button
                            type={isSQLGeneratorOpen ? 'primary' : 'text'}
                            className="!px-2"
                            onClick={() => {
                                if (connectedDbId) {
                                    setIsSQLGeneratorOpen(true);
                                    return;
                                }
                                setIsDBConnectionOpen(true);
                            }}
                        >
                            <FileCode2 size={18} />
                        </Button>
                    </Tooltip> */}
                    <Tooltip title="Linter & Safety Warning" placement="bottom">
                        <div className="relative inline-flex">
                            <Button
                                type={linterOpen ? 'primary' : 'text'}
                                className="!px-2"
                                onClick={onToggleLinterPanel}
                            >
                                <MessageSquareWarning size={18} />
                            </Button>
                            {linterCounts && (linterCounts.error + linterCounts.warning + linterCounts.info) > 0 && (
                                <span
                                    className="pointer-events-none absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white text-[9px] font-bold leading-none z-10"
                                    style={{
                                        minWidth: 14,
                                        height: 14,
                                        padding: '0 3px',
                                        backgroundColor: linterCounts.error > 0 ? '#ef4444' : linterCounts.warning > 0 ? '#f59e0b' : '#3b82f6',
                                    }}
                                >
                                    {linterCounts.error + linterCounts.warning + linterCounts.info}
                                </span>
                            )}
                        </div>
                    </Tooltip>
                    {onToggleNormalizationPanel && (
                        <Tooltip title="Normalization Analysis" placement="bottom">
                            <Button
                                type={normalizationOpen ? 'primary' : 'text'}
                                className="!px-2"
                                onClick={onToggleNormalizationPanel}
                            >
                                <Layers size={18} />
                            </Button>
                        </Tooltip>
                    )}
                    {syncableSchemas.length > 0 && onSyncToSchema && (
                        <Dropdown
                            menu={{
                                items: syncableSchemas.map((s) => ({
                                    key: s.id,
                                    label: s.name,
                                    onClick: () => {
                                        Modal.confirm({
                                            title: `Sync to "${s.name}"?`,
                                            content: `\"${s.name}\" will be updated to reflect the latest changes from the current schema. Its existing content will be replaced.`,
                                            okText: 'Sync',
                                            cancelText: 'Cancel',
                                            okButtonProps: { danger: true },
                                            onOk: () => onSyncToSchema(s.id, s.type),
                                        });
                                    },
                                })),
                            }}
                            trigger={isSyncing ? [] : ['click']}
                            placement="bottomRight"
                            align={{ offset: [0, 10] }}
                        >
                            <Tooltip title="Sync to Schema" placement="bottom">
                                <Button
                                    type={'text'}
                                    className="!px-2"
                                    disabled={isSyncing}
                                >
                                    <RefreshCw size={16} />
                                </Button>
                            </Tooltip>
                        </Dropdown>
                    )}
                    {schemaType && convertItems.length > 0 && (
                        <Dropdown
                            menu={{ items: convertItems }}
                            trigger={isConverting ? [] : ['click']}
                            placement="bottomRight"
                            align={{ offset: [0, 10] }}
                        >
                            <Tooltip title="Sync to Schema" placement="bottom">
                                <Button
                                    type="text"
                                    className="!px-2"
                                    loading={isConverting}
                                >
                                <ArrowRightLeft size={18} />
                                </Button>
                            </Tooltip>
                        </Dropdown>
                    )}
                </div>
                <ExportPortalDropdown
                    onDownload={onDownload}
                    onExportJson={onExportJson}
                    onExportDDL={onExportDDL}
                    onExportHTMLDocs={onExportHTMLDocs}
                    onApplyToDatabase={onApplyToDatabase}
                    onExportHistory={onExportHistory}
                >
                    <button
                        type="button"
                        aria-haspopup="menu"
                        className="flex h-12 cursor-pointer items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 shadow-md transition-colors hover:bg-primary-600"
                    >
                        <Download size={18} className="text-white" />
                        <span className="text-sm! font-semibold text-white">Export</span>
                    </button>
                </ExportPortalDropdown>
            </div>
        </div>
            <Modal
                title={"Project Documents Hub"}
                open={isDocumentsOpen}
                onCancel={() => setIsDocumentsOpen(false)}
                footer={null}
                width="min(1100px, calc(100vw - 48px))"
                destroyOnHidden
            >
                <ProjectDocumentsHub
                    projectId={projectId}
                    projectVisibility={projectVisibility}
                    embedded
                />
            </Modal>
            <Modal
                title="SQL Query Generator"
                open={isSQLGeneratorOpen}
                onCancel={() => setIsSQLGeneratorOpen(false)}
                footer={null}
                width="min(1200px, calc(100vw - 48px))"
                style={{ top: 24 }}
                destroyOnHidden
            >
                {connectedDbId ? (
                    <SQLGenerator
                        key={connectedDbId}
                        tables={sqlGeneratorTables}
                        projectId={projectId ?? ''}
                        connId={connectedDbId}
                        onDatabaseConfigRequired={() => setIsDBConnectionOpen(true)}
                        isLoading={loadingTables}
                        hasConnection={connectedDbId !== null}
                    />
                ) : (
                    <div className="py-8 text-center text-gray-500">
                        Connect a database before opening the SQL query generator.
                    </div>
                )}
            </Modal>
            <DbFlowController
                flow="db-management"
                open={isDBConnectionOpen}
                onClose={handleDBConnectionClose}
                projectId={projectId ?? null}
                onNewSchemaCreated={(schemaId) => {
                    if (projectId) router.push(`/projects/${projectId}?schemaId=${schemaId}`);
                }}
            />
        </>
    );
};

export default Header;
