"use client";

import React from "react";
import { MessageCircle, Check, Trash2, X } from "lucide-react";
import md5 from "md5";
import type { CommentData } from "../CommentPin";

function gravatarUrl(email?: string, size = 32): string {
    if (!email) return '';
    const hash = md5(email.trim().toLowerCase());
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon&r=g`;
}

type CommentPanelProps = {
    comments: CommentData[];
    currentUserId: string;
    onClose: () => void;
    onActivateComment: (id: string) => void;
    onResolve: (id: string) => void;
    onDelete: (id: string) => void;
};

const CommentPanel: React.FC<CommentPanelProps> = ({
    comments,
    currentUserId,
    onClose,
    onActivateComment,
    onResolve,
    onDelete,
}) => {
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

    const openComments = comments.filter((c) => !c.resolved);
    const resolvedComments = comments.filter((c) => c.resolved);

    return (
        <div
            className="absolute h-[calc(100vh-160px)] top-1/2 -translate-y-1/2 right-4 flex flex-col bg-white z-10 rounded-lg shadow-md"
        >
            <div className="w-72 flex-1 flex flex-col min-h-0">
                {/* Header */}
                <div className="border-b border-gray-200 flex items-center justify-between py-2 px-4 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <MessageCircle size={16} className="text-primary-500" />
                        <span className="text-base font-semibold">Comments</span>
                        <span className="text-[12px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                            {openComments.length}
                        </span>
                    </div>
                    <X className="cursor-pointer text-gray-400 hover:text-gray-600" size={18} onClick={onClose} />
                </div>

                {/* Comment list */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {comments.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 px-4 text-gray-400">
                            <MessageCircle size={32} className="mb-2 opacity-40" />
                            <p className="text-[14px]">No comments yet</p>
                            <p className="text-[12px] mt-1">Click on the canvas to add one</p>
                        </div>
                    )}

                    {/* Open comments */}
                    {openComments.length > 0 && (
                        <div>
                            {openComments.map((comment, idx) => (
                                <div
                                    key={comment.id}
                                    className="px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => onActivateComment(comment.id)}
                                >
                                    <div className="flex items-start gap-2">
                                        <img
                                            src={gravatarUrl(comment.user?.email)}
                                            alt=""
                                            className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[13px] font-medium text-gray-800 truncate">
                                                    {comment.user?.fullName || "Unknown"}
                                                </span>
                                                <span className="text-[11px] text-gray-400 flex-shrink-0">
                                                    {formatTime(comment.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-gray-600 line-clamp-2 mt-0.5">
                                                {comment.content}
                                            </p>
                                            {comment.replies && comment.replies.length > 0 && (
                                                <span className="text-[11px] text-primary-500 mt-1 inline-block">
                                                    {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onResolve(comment.id); }}
                                                className="p-1 rounded hover:bg-emerald-50 text-gray-300 hover:text-emerald-600 transition-colors"
                                                title="Resolve"
                                            >
                                                <Check size={14} />
                                            </button>
                                            {comment.userId === currentUserId && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDelete(comment.id); }}
                                                    className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Resolved comments */}
                    {resolvedComments.length > 0 && (
                        <div>
                            <div className="px-3 py-2 text-[12px] font-medium text-gray-400 uppercase tracking-wide bg-gray-50">
                                Resolved ({resolvedComments.length})
                            </div>
                            {resolvedComments.map((comment) => (
                                <div
                                    key={comment.id}
                                    className="px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors opacity-60"
                                    onClick={() => onActivateComment(comment.id)}
                                >
                                    <div className="flex items-start gap-2">
                                        <img
                                            src={gravatarUrl(comment.user?.email)}
                                            alt=""
                                            className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[13px] font-medium text-gray-800 truncate">
                                                    {comment.user?.fullName || "Unknown"}
                                                </span>
                                                <span className="text-[11px] text-gray-400 flex-shrink-0">
                                                    {formatTime(comment.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-gray-600 line-clamp-2 mt-0.5 line-through">
                                                {comment.content}
                                            </p>
                                        </div>
                                        <Check size={14} className="text-emerald-500 flex-shrink-0 mt-1" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CommentPanel;
