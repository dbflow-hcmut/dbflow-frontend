"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Avatar, Button, Tooltip, Dropdown } from "antd";
import { Download, MessageCircleMore, History, Send, Smile, ThumbsUp, PartyPopper, PlugZap } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { RemoteCollaborator } from "../../hooks/useCollaborationAwareness";

type HeaderProps = {
    diagramName: string;
    isEditingDiagramName: boolean;
    canEdit?: boolean;
    onSetDiagramName: (name: string) => void;
    onSetIsEditingDiagramName: (isEditing: boolean) => void;
    onOpenSearchModal: () => void;
    collaborators: RemoteCollaborator[];
    onFollowUser: (user: RemoteCollaborator) => void;
    onDownload: () => void;
    onExportJson: () => void;
    onExportDDL?: () => void;
    onExportHTMLDocs?: () => void;
    onVersionHistory?: () => void;
    onShareClick: () => void;
    commentMode?: boolean;
    onToggleCommentMode?: () => void;
};

const Header: React.FC<HeaderProps> = ({
    diagramName,
    isEditingDiagramName,
    canEdit = true,
    onSetDiagramName,
    onSetIsEditingDiagramName,
    onOpenSearchModal,
    collaborators,
    onFollowUser,
    onDownload,
    onExportJson,
    onExportDDL,
    onExportHTMLDocs,
    onVersionHistory,
    onShareClick,
    commentMode = false,
    onToggleCommentMode,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    useEffect(() => {
        if (isEditingDiagramName && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditingDiagramName]);

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

    const downloadItems = useMemo(() => {
        const items = [
            {
                key: 'export',
                label: 'Export Diagram to PNG/SVG',
                onClick: () => onDownload(),
            },
            {
                key: 'export-json',
                label: 'Export Diagram to JSON',
                onClick: () => onExportJson(),
            },
        ];
        if (onExportDDL) {
            items.push({
                key: 'export-ddl',
                label: 'Export SQL (DDL)',
                onClick: () => onExportDDL(),
            });
        }
        if (onExportHTMLDocs) {
            items.push({
                key: 'export-html-docs',
                label: 'Export HTML Documentation',
                onClick: () => onExportHTMLDocs(),
            });
        }
        return items;
    }, [onDownload, onExportJson, onExportDDL, onExportHTMLDocs]);

    return (
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
                <Dropdown 
                    menu={{ items: downloadItems }} 
                    trigger={['click']} 
                    placement="bottom"
                    align={{ offset: [0, 10] }}
                >
                    <Tooltip title="Export" placement="bottom">
                        <Button
                            id="tour-download-btn"
                            type="text"
                            className="!px-2"
                        >
                            <Download size={18} />
                        </Button>
                    </Tooltip>
                </Dropdown>

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
            <div className="flex items-center gap-2 bg-white rounded-lg shadow-md px-2 py-2 h-12">
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
                <Tooltip title="Comment" placement="bottom">
                    <Button
                        type={commentMode ? 'primary' : 'text'}
                        className="!px-2"
                        onClick={onToggleCommentMode}
                    >
                        <MessageCircleMore size={18} />
                    </Button>
                </Tooltip>
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
                <Button
                    type="primary"
                    className="!px-3 gap-2 flex items-center"
                >
                    <PlugZap className="text-white" size={18} />
                    <span className="font-semibold">Connect to Database</span>
                </Button>
            </div>
        </div>
    );
};

export default Header;