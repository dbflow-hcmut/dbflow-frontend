"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, Send, Check, Trash2, X } from "lucide-react";
import md5 from "md5";

/** Generate Gravatar URL from email (same formula as backend) */
function gravatarUrl(email?: string, size = 64): string {
    if (!email) return '';
    const hash = md5(email.trim().toLowerCase());
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon&r=g`;
}

export interface CommentData {
    id: string;
    x: number;
    y: number;
    content: string;
    resolved: boolean;
    parentId: string | null;
    nodeId: string | null;
    userId: string;
    createdAt: string;
    user?: { id: string; fullName: string; email: string };
    replies?: CommentData[];
}

export interface MentionableUser {
    userId: string;
    fullName: string;
    email: string;
    avatar?: string;
}

interface CommentPinProps {
    comment: CommentData;
    currentUserId: string;
    index: number;
    isActive: boolean;
    /** True when this is a newly placed pin waiting for first message */
    isDraft?: boolean;
    onActivate: (id: string) => void;
    onDeactivate: () => void;
    onReply: (parentId: string, content: string) => void;
    onResolve: (id: string) => void;
    onDelete: (id: string) => void;
    /** Called when a draft pin submits its first message */
    onSubmitDraft?: (content: string) => void;
    /** Called when a draft pin is cancelled (user clicks away with no text) */
    onCancelDraft?: () => void;
    /** List of mentionable project members */
    mentionUsers?: MentionableUser[];
}

/* ─────── Mention-aware textarea ─────── */
const MentionTextarea: React.FC<{
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    placeholder?: string;
    users: MentionableUser[];
    autoFocus?: boolean;
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}> = ({ value, onChange, onSubmit, placeholder, users, autoFocus, inputRef }) => {
    const [mentionQuery, setMentionQuery] = useState("");
    const [showMention, setShowMention] = useState(false);
    const [mentionIdx, setMentionIdx] = useState(0);
    const localRef = useRef<HTMLTextAreaElement>(null);
    const effectiveRef = inputRef || localRef;

    const filtered = users.filter(
        (u) =>
            u.fullName.toLowerCase().includes(mentionQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(mentionQuery.toLowerCase()),
    );

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        onChange(val);

        // Detect @mention trigger
        const cursor = e.target.selectionStart;
        const textBefore = val.slice(0, cursor);
        const atMatch = textBefore.match(/@(\w*)$/);
        if (atMatch) {
            setMentionQuery(atMatch[1]);
            setShowMention(true);
            setMentionIdx(0);
        } else {
            setShowMention(false);
        }
    };

    const insertMention = useCallback(
        (user: MentionableUser) => {
            const el = effectiveRef.current;
            if (!el) return;
            const cursor = el.selectionStart;
            const textBefore = value.slice(0, cursor);
            const atPos = textBefore.lastIndexOf("@");
            const before = value.slice(0, atPos);
            const after = value.slice(cursor);
            const mention = `@${user.fullName} `;
            onChange(before + mention + after);
            setShowMention(false);
            setTimeout(() => {
                el.focus();
                const pos = before.length + mention.length;
                el.setSelectionRange(pos, pos);
            }, 0);
        },
        [value, onChange, effectiveRef],
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showMention && filtered.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIdx((i) => Math.min(i + 1, filtered.length - 1));
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIdx((i) => Math.max(i - 1, 0));
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                insertMention(filtered[mentionIdx]);
                return;
            }
            if (e.key === "Escape") {
                setShowMention(false);
                return;
            }
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className="relative">
            <textarea
                ref={effectiveRef}
                value={value}
                onChange={(e) => {
                    handleChange(e);
                    // Auto-expand height
                    const el = e.target;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={2}
                style={{ minHeight: '52px', maxHeight: '96px', overflow: 'auto', fontSize: '14px' }}
                autoFocus={autoFocus}
                className="w-full !text-[14px] border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
            />
            {showMention && filtered.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-full max-h-32 overflow-y-auto bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    {filtered.map((u, i) => (
                        <button
                            key={u.userId}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                insertMention(u);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 text-[14px] flex items-center gap-2 ${i === mentionIdx ? "bg-primary-50 text-primary-700" : "hover:bg-gray-50 text-gray-700"}`}
                        >
                            <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                                {u.fullName
                                    .split(" ")
                                    .map((w) => w[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2)}
                            </span>
                            <span className="truncate">{u.fullName}</span>
                            <span className="text-[10px] text-gray-400 truncate ml-auto">{u.email}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ─────── CommentPin ─────── */
const CommentPin: React.FC<CommentPinProps> = ({
    comment,
    currentUserId,
    index,
    isActive,
    isDraft = false,
    onActivate,
    onDeactivate,
    onReply,
    onResolve,
    onDelete,
    onSubmitDraft,
    onCancelDraft,
    mentionUsers = [],
}) => {
    const [replyText, setReplyText] = useState("");
    const [draftText, setDraftText] = useState("");
    const popoverRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isActive && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isActive]);

    useEffect(() => {
        if (!isActive) return;
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                if (isDraft) {
                    // Draft cancelled — no text typed
                    if (!draftText.trim()) {
                        onCancelDraft?.();
                    }
                } else {
                    onDeactivate();
                }
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isActive, onDeactivate, isDraft, draftText, onCancelDraft]);

    const handleSubmitReply = () => {
        const trimmed = replyText.trim();
        if (!trimmed) return;
        onReply(comment.id, trimmed);
        setReplyText("");
    };

    const handleSubmitDraft = () => {
        const trimmed = draftText.trim();
        if (!trimmed) return;
        onSubmitDraft?.(trimmed);
        setDraftText("");
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
    };

    return (
        <div
            className="absolute nodrag nopan"
            style={{
                transform: `translate(${comment.x}px, ${comment.y}px)`,
                zIndex: isActive ? 1000 : 50,
            }}
        >
            {/* Pin marker — user avatar */}
            <div
                className="relative cursor-pointer group"
                onClick={(e) => {
                    e.stopPropagation();
                    if (isActive) onDeactivate();
                    else onActivate(comment.id);
                }}
            >
                <img
                    src={gravatarUrl(comment.user?.email)}
                    alt={comment.user?.fullName || 'User'}
                    className={`
                        w-8 h-8 rounded-full object-cover
                        shadow-lg transition-all duration-200 border-2 border-primary-500
                        ${isActive ? "ring-2 ring-primary-300 ring-offset-1 scale-110" : "hover:scale-105"}
                    `}
                />
            </div>

            {/* Popover */}
            {isActive && (
                <div
                    ref={popoverRef}
                    className="absolute left-10 -top-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
                    style={{ zIndex: 1001 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* ── Draft mode: just a text area to type the first message ── */}
                    {isDraft ? (
                        <div className="p-3">
                            <p className="text-[14px] text-gray-500 mb-2">Add a comment</p>
                            <MentionTextarea
                                value={draftText}
                                onChange={setDraftText}
                                onSubmit={handleSubmitDraft}
                                placeholder="Type your comment... (@ to mention)"
                                users={mentionUsers}
                                autoFocus
                                inputRef={inputRef}
                            />
                            <div className="flex justify-end mt-2 gap-1.5">
                                <button
                                    onClick={() => onCancelDraft?.()}
                                    className="px-3 py-1.5 !text-[14px] rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmitDraft}
                                    disabled={!draftText.trim()}
                                    className="px-3 py-1.5 !text-[14px] rounded-md bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Comment
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                                <div className="flex items-center gap-2">
                                    <MessageCircle size={14} className="text-primary-500" />
                                    <span className="text-[14px] font-semibold text-gray-600">
                                        Comment #{index + 1}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {!comment.resolved && (
                                        <button
                                            onClick={() => onResolve(comment.id)}
                                            className="p-1.5 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
                                            title="Resolve"
                                        >
                                            <Check size={14} />
                                        </button>
                                    )}
                                    {comment.userId === currentUserId && (
                                        <button
                                            onClick={() => onDelete(comment.id)}
                                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                    <button
                                        onClick={onDeactivate}
                                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="max-h-60 overflow-y-auto">
                                {/* Root comment */}
                                <div className="px-3 py-2.5 border-b border-gray-50">
                                    <div className="flex items-center gap-2 mb-1">
                                        <img
                                            src={gravatarUrl(comment.user?.email, 32)}
                                            alt=""
                                            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                        />
                                        <span className="text-[14px] font-medium text-gray-800 truncate">
                                            {comment.user?.fullName || "Unknown"}
                                        </span>
                                        <span className="text-[12px] text-gray-400 flex-shrink-0">
                                            {formatTime(comment.createdAt)}
                                        </span>
                                    </div>
                                    <p className="text-[14px] text-gray-700 pl-8 whitespace-pre-wrap break-words">
                                        {renderMentionContent(comment.content)}
                                    </p>
                                </div>

                                {/* Replies */}
                                {comment.replies?.map((reply) => (
                                    <div
                                        key={reply.id}
                                        className="px-3 py-2 border-b border-gray-50 bg-gray-50/50"
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <img
                                                src={gravatarUrl(reply.user?.email, 32)}
                                                alt=""
                                                className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                            />
                                            <span className="text-[14px] font-medium text-gray-800 truncate">
                                                {reply.user?.fullName || "Unknown"}
                                            </span>
                                            <span className="text-[12px] text-gray-400 flex-shrink-0">
                                                {formatTime(reply.createdAt)}
                                            </span>
                                        </div>
                                        <p className="text-[14px] text-gray-700 pl-8 whitespace-pre-wrap break-words">
                                            {renderMentionContent(reply.content)}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Reply input */}
                            {!comment.resolved && (
                                <div className="p-2 border-t border-gray-100">
                                    <div className="flex gap-1.5">
                                        <div className="flex-1">
                                            <MentionTextarea
                                                value={replyText}
                                                onChange={setReplyText}
                                                onSubmit={handleSubmitReply}
                                                placeholder="Reply... (@ to mention)"
                                                users={mentionUsers}
                                                inputRef={inputRef}
                                            />
                                        </div>
                                        <div className="pb-[5px] flex flex-col items-center justify-end">
                                            <button
                                                onClick={handleSubmitReply}
                                                disabled={!replyText.trim()}
                                                className="self-end p-2 pb-3 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0 flex items-center justify-center"
                                            >
                                                <Send size={14} className="text-white" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {comment.resolved && (
                                <div className="px-3 py-2 bg-emerald-50 text-emerald-600 text-[14px] font-medium text-center">
                                    ✓ Resolved
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

/** Render @Name mentions as highlighted spans */
function renderMentionContent(content: string): React.ReactNode {
    const parts = content.split(/(@\S+(?:\s\S+)?)/g);
    return parts.map((part, i) => {
        if (part.startsWith("@")) {
            return (
                <span key={i} className="text-primary-600 font-medium">
                    {part}
                </span>
            );
        }
        return part;
    });
}

export default CommentPin;
