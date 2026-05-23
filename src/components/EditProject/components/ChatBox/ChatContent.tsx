"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input, Button } from "antd";
import { Send, Loader2, RefreshCw, Square, Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    type Attachment,
    readFileAsAttachment,
    uploadAttachmentForAI,
    ATTACHMENT_ACCEPT,
    ATTACHMENT_MAX_COUNT,
    ATTACHMENT_MAX_TOTAL_BYTES,
} from "@/api/ai/client";
import { AttachmentPreviews } from "@/components/AttachmentPreviews";

export interface Message {
    id: string;
    text: string;
    sender: "user" | "ai";
    timestamp: Date;
    isStreaming?: boolean;
    isError?: boolean;
    attachments?: Attachment[];
}

interface ChatContentProps {
    messages?: Message[];
    onSend: (text: string, attachments?: Attachment[]) => void;
    onMessagesChange?: (messages: Message[]) => void;
    isLoading?: boolean;
    reasoningText?: string;
    onRetry?: () => void;
    isStreamingJson?: boolean;
    onStop?: () => void;
}

export const ChatContent: React.FC<ChatContentProps> = ({ 
    messages: externalMessages, 
    onSend,
    isLoading = false,
    reasoningText,
    onRetry,
    isStreamingJson = false,
    onStop,
}) => {
    const [internalMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const messages = externalMessages !== undefined ? externalMessages : internalMessages;

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        e.target.value = "";
        const currentTotal = attachments.reduce((s, a) => s + a.size, 0);
        const pairs: Array<{ att: Attachment; file: File }> = [];
        for (const file of files) {
            if (attachments.length + pairs.length >= ATTACHMENT_MAX_COUNT) break;
            if (currentTotal + pairs.reduce((s, { att }) => s + att.size, 0) + file.size > ATTACHMENT_MAX_TOTAL_BYTES) continue;
            const att = await readFileAsAttachment(file);
            if (att) pairs.push({ att, file });
        }
        if (pairs.length === 0) return;

        // Mark files that need S3 upload as uploading immediately
        const needsUpload = (fileType: Attachment["fileType"]) =>
            fileType === "image" || fileType === "pdf" || fileType === "docx";
        const newAtts = pairs.map(({ att }) =>
            needsUpload(att.fileType) ? { ...att, uploading: true } : att,
        );
        setAttachments((prev) => [...prev, ...newAtts]);

        // Upload image/pdf/docx to S3 in background so AI receives a URL instead of base64
        for (const { att, file } of pairs) {
            if (needsUpload(att.fileType)) {
                uploadAttachmentForAI(file, att.id).then((url) => {
                    setAttachments((prev) =>
                        prev.map((a) =>
                            a.id === att.id ? { ...a, uploading: false, ...(url ? { url } : {}) } : a,
                        ),
                    );
                });
            }
        }
    }, [attachments]);

    const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

    const isUploading = attachments.some((a) => a.uploading);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoading]);

    const handleSend = () => {
        if ((!inputValue.trim() && attachments.length === 0) || isLoading || isUploading) return;
        const currentAttachments = [...attachments];
        onSend(inputValue, currentAttachments);
        setInputValue("");
        setAttachments([]);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map((message, index) => {
                    // Hide empty AI messages completely
                    if (message.sender === "ai" && !message.text) {
                        return null;
                    }

                    return (
                        <div
                            key={message.id}
                            className={`flex flex-col ${message.sender === "user" ? "items-end" : "items-start"}`}
                        >
                            {/* File previews — outside bubble, above it */}
                            {message.sender === "user" && message.attachments && message.attachments.length > 0 && (
                                <div className="mb-1 max-w-[80%]">
                                    <AttachmentPreviews
                                        attachments={message.attachments}
                                        onRemove={() => {}}
                                        compact
                                        readonly
                                    />
                                </div>
                            )}
                            <div className="max-w-[80%]">
                                <div
                                    className={`rounded-lg px-4 py-2 ${
                                        message.sender === "user"
                                            ? "bg-primary-500 text-white"
                                            : message.isError
                                                ? "bg-red-50 text-red-700 border border-red-200"
                                                : "bg-white text-gray-800 border border-gray-200"
                                    }`}
                                >
                                    {message.sender === "user" ? (
                                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                                    ) : (
                                        <div className="text-sm prose prose-sm max-w-none
                                            prose-p:my-1 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1
                                            prose-li:my-0 prose-pre:my-1 prose-blockquote:my-1
                                            prose-code:text-primary-700 prose-code:bg-primary-50
                                            prose-code:px-1 prose-code:rounded prose-code:text-xs
                                            prose-pre:bg-gray-900 prose-pre:text-gray-100
                                            prose-a:text-primary-600 prose-strong:text-gray-900
                                            prose-table:text-xs prose-th:bg-gray-100">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {message.text}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                    <p className={`text-xs mt-1 ${message.isError ? "text-red-400" : "opacity-70"}`}>
                                        {message.timestamp.toLocaleTimeString([], {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                                {message.isError && index === messages.length - 1 && !isLoading && onRetry && (
                                    <div className="pt-4">
                                        <button
                                            onClick={onRetry}
                                            className="mt-1 flex items-center gap-1 text-xs text-red-600 hover:text-red-700 cursor-pointer transition-colors"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            Try again
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Loading indicator - initial thinking */}
                {isLoading && messages[messages.length - 1]?.text === "" && !isStreamingJson && (
                    <div className="flex justify-start">
                        <div className="bg-white rounded-lg px-4 py-2 border border-gray-200">
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></span>
                                </div>
                                <span className="text-xs text-gray-500">
                                    {reasoningText || "Thinking..."}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Loading indicator - generating schema JSON */}
                {isStreamingJson && (
                    <div className="flex justify-start">
                        <div className="bg-white rounded-lg px-4 py-2 border border-gray-200">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 text-primary-500 animate-spin" />
                                <span className="text-xs text-gray-500">Generating schema...</span>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-200 p-3 bg-white">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                />
                <div className="flex items-end gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || attachments.length >= ATTACHMENT_MAX_COUNT}
                        className="flex-none p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer pb-3"
                        title="Attach file (.sql, .csv, .json, image)"
                    >
                        <Paperclip size={16} />
                    </button>
                    <div className="flex-1 border border-gray-300 rounded-lg focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-100 bg-white overflow-hidden">
                        {attachments.length > 0 && (
                            <div className="px-2 pt-2 pb-1">
                                <AttachmentPreviews attachments={attachments} onRemove={removeAttachment} compact />
                            </div>
                        )}
                        <Input.TextArea
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Type your message..."
                            autoSize={{ minRows: 1, maxRows: 4 }}
                            className="!border-0 !shadow-none !outline-none focus:!border-0 focus:!ring-0 focus:!shadow-none min-h-10!"
                            disabled={isLoading}
                        />
                    </div>
                    {isLoading ? (
                        <Button
                            type="default"
                            icon={<Square size={16} className="text-blue-500" fill="currentColor" />}
                            onClick={onStop}
                            className="!h-10"
                        >
                            Stop
                        </Button>
                    ) : (
                        <Button
                            type="primary"
                            icon={<Send size={16} />}
                            onClick={handleSend}
                            disabled={(!inputValue.trim() && attachments.length === 0) || isUploading}
                            className="!h-10"
                        >
                            Send
                        </Button>
                    )}
                </div>
            </div>
        </>
    );
};

