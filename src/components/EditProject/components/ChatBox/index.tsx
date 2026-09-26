"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Minimize2, Maximize2 } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChatContent, Message } from "./ChatContent";
import {
    streamChatToLangGraph,
    generateThreadId,
    DBFLOW_ASSISTANT_ID,
    ChatMessage,
    RoutingInfo,
    extractModelJsonFromContent,
    cancelRun,
    type Attachment,
    buildChatInputFromAttachments,
} from "@/api/ai/client";
import {
    createConversation,
    saveMessages,
    getConversation,
    getProjectConversations,
    linkConversationToProject,
    updateConversationTitle,
} from "@/api/chat/client";

interface ChatBoxProps {
    isOpen: boolean;
    onClose: () => void;
    projectId?: string;
    schemaId?: string;
    /** Current schema level: "conceptual" | "logical" | "physical" */
    schemaLevel?: string;
    /** Serialized current schema model (for forward/reverse engineering context) */
    currentModel?: Record<string, unknown> | null;
    /** If provided, load this thread's history and continue from it */
    initialThreadId?: string;
    /** Callback when AI generates a model JSON (for applying to diagram) */
    onModelGenerated?: (
        modelJson: Record<string, unknown>,
        detectedLevel?: string,
        intent?: string,
        /** Router-generated title of the current turn, used to name a newly created schema */
        schemaTitle?: string,
    ) => Promise<{ projectId: string; schemaId: string; label?: string } | void> | { projectId: string; schemaId: string; label?: string } | void;
}

const ATT_MARKER = "<!-- __att__:";
const ATT_END = " -->";

function encodeAttachmentMetadata(content: string, attachments: Attachment[]): string {
    if (attachments.length === 0) return content;
    const meta = attachments.map(({ id, name, fileType, size, url, s3Key, mimeType }) => ({
        id,
        name,
        fileType,
        size,
        ...(mimeType ? { mimeType } : {}),
        ...(url ? { url } : {}),
        ...(s3Key ? { s3Key } : {}),
    }));
    return `${content}\n${ATT_MARKER}${JSON.stringify(meta)}${ATT_END}`;
}

function decodeAttachmentMetadata(raw: string): { content: string; attachments: Attachment[] } {
    const markerIdx = raw.lastIndexOf(ATT_MARKER);
    if (markerIdx === -1) return { content: raw, attachments: [] };
    const endIdx = raw.lastIndexOf(ATT_END);
    if (endIdx <= markerIdx) return { content: raw, attachments: [] };

    const jsonStr = raw.slice(markerIdx + ATT_MARKER.length, endIdx);
    const cleanContent = raw.slice(0, markerIdx).trimEnd();
    try {
        const parsed = JSON.parse(jsonStr) as Array<{
            id: string;
            name: string;
            fileType: Attachment["fileType"];
            size: number;
            mimeType?: string;
            url?: string;
            s3Key?: string;
        }>;
        return {
            content: cleanContent,
            attachments: parsed.map((attachment) => ({ ...attachment, content: "" })),
        };
    } catch {
        return { content: raw, attachments: [] };
    }
}

const ChatBox: React.FC<ChatBoxProps> = ({
    isOpen,
    onClose,
    projectId: propProjectId,
    schemaId: propSchemaId,
    schemaLevel,
    currentModel,
    initialThreadId,
    onModelGenerated,
}) => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const projectId = propProjectId || pathname?.split('/')[2];
    const schemaId = propSchemaId || searchParams.get("schemaId") || undefined;

    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [reasoningText, setReasoningText] = useState<string | undefined>();
    const [isStreamingJson, setIsStreamingJson] = useState(false);
    const chatBoxRef = useRef<HTMLDivElement>(null);

    // Thread management
    const [threadId, setThreadId] = useState<string>(() => initialThreadId || generateThreadId());
    const [conversationCreated, setConversationCreated] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const currentIntentRef = useRef<string | null>(null);
    const detectedLevelRef = useRef<string | null>(null);
    const lastUserMessageRef = useRef<string>("");
    const abortControllerRef = useRef<AbortController | null>(null);
    const runIdRef = useRef<string | null>(null);

    const buildOpenSchemaLink = useCallback((link: { projectId: string; schemaId: string; label?: string }) => {
        const href = `/projects/${link.projectId}?schemaId=${link.schemaId}&openChat=true&chatThread=${threadId}`;
        return `[${link.label ?? "Open schema"}](${href})`;
    }, [threadId]);

    // Load chat history when opened
    useEffect(() => {
        if (!isOpen || historyLoaded) return;

        /**
         * Convert backend messages to UI messages.
         * For AI messages that contain JSON code blocks (diagram responses),
         * strip the JSON and show only the human-readable text description.
         */
        const toUiMessages = (msgs: { id: string; content: string; role: string; createdAt: string }[]): Message[] =>
            msgs.map((msg, index) => {
                let displayText = msg.content;
                let attachments: Attachment[] | undefined;
                if (msg.role === "user") {
                    const decoded = decodeAttachmentMetadata(msg.content);
                    displayText = decoded.content;
                    attachments = decoded.attachments.length > 0 ? decoded.attachments : undefined;
                }
                if (msg.role === "assistant") {
                    const extracted = extractModelJsonFromContent(msg.content);
                    if (extracted.hasDiagram && extracted.textDescription) {
                        displayText = extracted.textDescription;
                    }
                }
                return {
                    id: `loaded-${index}-${msg.id}`,
                    text: displayText,
                    sender: msg.role === "user" ? "user" as const : "ai" as const,
                    timestamp: new Date(msg.createdAt),
                    attachments,
                };
            });

        const getWelcomeMessage = (): Message => {
            const levelMessages: Record<string, string> = {
                conceptual: "Hi! I'm your AI assistant for database design. I'm here to help you design your **conceptual schema** — create entities, define relationships, and structure your data model.\n\nYou can also ask me to **forward engineer** your conceptual schema into a logical schema.\n\nWhat would you like to build?",
                logical: "Hi! I'm your AI assistant for database design. I'm here to help you work on your **logical schema** — define tables, columns, keys, and relationships.\n\nYou can ask me to **forward engineer** this into a physical schema, or **reverse engineer** from a DDL script.\n\nHow can I help?",
                physical: "Hi! I'm your AI assistant for database design. I'm here to help you with your **physical schema** — manage tables, indexes, constraints, and generate DDL.\n\nYou can also ask me to **reverse engineer** a DDL script into a logical schema.\n\nWhat would you like to do?",
            };
            const text = (schemaLevel && levelMessages[schemaLevel])
                ? levelMessages[schemaLevel]
                : "Hi! I'm your AI assistant for database design. I can help you create, edit, and manage your database schemas, as well as perform **Forward Engineering** (model → DDL) and **Reverse Engineering** (DDL → model).\n\nWhat would you like to do?";
            return {
                id: "welcome-msg",
                text,
                sender: "ai" as const,
                timestamp: new Date(),
            };
        };

        const loadHistory = async () => {
            let hasMessages = false;
            try {
                // If we have an initial thread ID (from URL param), load that conversation
                if (initialThreadId) {
                    const conversation = await getConversation(initialThreadId);
                    const msgs = conversation?.messages ?? [];
                    if (msgs.length > 0) {
                        setMessages(toUiMessages(msgs));
                        setConversationCreated(true);
                        setThreadId(initialThreadId);
                        hasMessages = true;
                    }
                } else if (projectId) {
                    // Try to load the most recent conversation for this project
                    const conversations = await getProjectConversations(projectId);
                    if (conversations && conversations.length > 0) {
                        const latestConv = conversations[0];
                        const conversation = await getConversation(latestConv.id);
                        const msgs = conversation?.messages ?? [];
                        if (msgs.length > 0) {
                            setMessages(toUiMessages(msgs));
                            setConversationCreated(true);
                            setThreadId(latestConv.id);
                            hasMessages = true;
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load chat history:", error);
            } finally {
                setHistoryLoaded(true);
                if (!hasMessages) {
                    setMessages([getWelcomeMessage()]);
                }
            }
        };

        loadHistory();
    }, [isOpen, historyLoaded, initialThreadId, projectId, schemaLevel]);

    // Position calculation
    useEffect(() => {
        if (isOpen && position.x === 0 && typeof window !== 'undefined') {
            const chatBoxWidth = 400;
            const chatBoxHeight = 600;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            let initialX = windowWidth - chatBoxWidth - 20;
            let initialY = windowHeight - chatBoxHeight - 100;
            
            initialX = Math.max(0, Math.min(initialX, windowWidth - chatBoxWidth));
            initialY = Math.max(0, Math.min(initialY, windowHeight - chatBoxHeight));
            
            setPosition({ x: initialX, y: initialY });
        }
    }, [isOpen, position.x]);

    // Drag handlers
    useEffect(() => {
        if (!isOpen) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && chatBoxRef.current) {
                const headerHeight = 48;
                const windowHeight = window.innerHeight;
                
                const newX = e.clientX - dragOffset.x;
                let newY = e.clientY - dragOffset.y;
                newY = Math.max(0, Math.min(newY, windowHeight - headerHeight));

                setPosition({ x: newX, y: newY });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, dragOffset, isOpen]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (chatBoxRef.current) {
            const rect = chatBoxRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
            setIsDragging(true);
        }
    };

    const handleSend = useCallback(async (text: string, attachments?: Attachment[]) => {
        const trimmed = text.trim();
        const atts = attachments ?? [];
        if (!trimmed && atts.length === 0) return;
        if (isLoading) return;

        const shouldApplySuggestedTitle = !conversationCreated;
        let suggestedTitle = "";
        // Title of THIS turn (not only the first one), used to name a new schema.
        let latestRoutedTitle = "";
        lastUserMessageRef.current = trimmed;

        const { message: enrichedMessage, modelOverride } = buildChatInputFromAttachments(trimmed, atts);

        const userMessage: Message = {
            id: Date.now().toString(),
            text: trimmed,
            sender: "user",
            timestamp: new Date(),
            attachments: atts.length > 0 ? atts : undefined,
        };

        setMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);
        setReasoningText(undefined);
        currentIntentRef.current = null;
        detectedLevelRef.current = null;

        // Create AbortController for this stream
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        runIdRef.current = null;

        // Create conversation in backend if first message
        if (!conversationCreated) {
            try {
                await createConversation(threadId);
                setConversationCreated(true);
                // Link conversation to project
                if (projectId) {
                    await linkConversationToProject(threadId, projectId, schemaId);
                }
            } catch (error) {
                console.error("Failed to create conversation:", error);
            }
        }

        // Create placeholder for AI response
        const aiMessageId = (Date.now() + 1).toString();
        const aiMessage: Message = {
            id: aiMessageId,
            text: "",
            sender: "ai",
            timestamp: new Date(),
            isStreaming: true,
        };

        setMessages((prev) => [...prev, aiMessage]);

        const chatMessages: ChatMessage[] = [enrichedMessage];

        let finalContent = "";
        let assistantContentToSave = "";
        let modelAlreadyApplied = false;

        const effectiveModel = modelOverride ?? currentModel ?? undefined;

        const returnedRunId = await streamChatToLangGraph(
            DBFLOW_ASSISTANT_ID,
            threadId,
            chatMessages,
            // onChunk
            (chunk: string) => {
                finalContent = chunk;

                // Only clear reasoning indicator when we have real visible content
                if (chunk.trim()) {
                    setReasoningText(undefined);
                }

                const isDiagramIntent =
                    currentIntentRef.current === "create" ||
                    currentIntentRef.current === "edit";

                if (isDiagramIntent) {
                    // For diagram responses, show text description only (hide JSON block)
                    const extracted = extractModelJsonFromContent(chunk);
                    setIsStreamingJson(extracted.hasDiagram && !extracted.isJsonComplete);
                    const displayText = extracted.textDescription ||
                        (extracted.hasDiagram ? "Generating schema..." : chunk);

                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === aiMessageId
                                ? { ...msg, text: displayText, isStreaming: !extracted.isJsonComplete }
                                : msg
                        )
                    );

                    // If model JSON is complete, mark it but DON'T apply yet —
                    // wait for onComplete so the validator has a chance to reject it.
                    if (extracted.isJsonComplete && extracted.modelJson) {
                        setMessages((prev) =>
                            prev.map((msg) =>
                                msg.id === aiMessageId
                                    ? { ...msg, isStreaming: false }
                                    : msg
                            )
                        );
                    }
                } else {
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === aiMessageId
                                ? { ...msg, text: chunk, isStreaming: true }
                                : msg
                        )
                    );
                }
            },
            // onComplete
            async () => {
                setIsLoading(false);
                setReasoningText(undefined);
                setIsStreamingJson(false);

                // Final update for diagram responses
                const isDiagramIntentFinal =
                    currentIntentRef.current === "create" ||
                    currentIntentRef.current === "edit";

                if (isDiagramIntentFinal) {
                    const extracted = extractModelJsonFromContent(finalContent);
                    const displayText = extracted.textDescription || "Schema ready.";

                    let finalDisplayText = extracted.modelJson
                        ? displayText
                        : displayText;

                    // Apply final model JSON — only here in onComplete, after validator has run.
                    // During streaming, we intentionally don't apply to avoid creating
                    // schema that the validator will reject and retry.
                    if (extracted.modelJson && onModelGenerated && !modelAlreadyApplied) {
                        const effectiveTargetLevel = detectedLevelRef.current ?? undefined;
                        const openLink = await onModelGenerated(extracted.modelJson, effectiveTargetLevel, currentIntentRef.current ?? undefined, latestRoutedTitle || undefined);
                        if (openLink) {
                            const linkMarkdown = buildOpenSchemaLink(openLink);
                            finalDisplayText = `${finalDisplayText}\n\n${linkMarkdown}`;
                            assistantContentToSave = `${finalContent}\n\n${linkMarkdown}`;
                        }
                        modelAlreadyApplied = true;
                    }

                    if (!assistantContentToSave) {
                        assistantContentToSave = finalContent;
                    }

                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === aiMessageId
                                ? {
                                    ...msg,
                                    text: finalDisplayText,
                                    isStreaming: false,
                                  }
                                : msg
                        )
                    );
                } else {
                    assistantContentToSave = finalContent;
                    // Final state for normal messages
                    setMessages((prev) =>
                        prev.map((msg) =>
                            msg.id === aiMessageId
                                ? { ...msg, isStreaming: false }
                                : msg
                        )
                    );
                }

                // Save messages to backend
                if (finalContent) {
                    try {
                        await saveMessages(threadId, [
                            { role: "user", content: encodeAttachmentMetadata(trimmed, atts) },
                            { role: "assistant", content: assistantContentToSave || finalContent },
                        ]);
                        if (shouldApplySuggestedTitle && suggestedTitle) {
                            await updateConversationTitle(threadId, suggestedTitle);
                        }
                    } catch (error) {
                        console.error("Failed to save messages:", error);
                    }
                }
            },
            // onError
            (error: Error) => {
                console.error("LangGraph streaming error:", error);
                setIsStreamingJson(false);
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === aiMessageId
                            ? {
                                ...msg,
                                text: error.message || "An error occurred. Please try again.",
                                isStreaming: false,
                                isError: true,
                              }
                            : msg
                    )
                );
                setIsLoading(false);
            },
            !conversationCreated,
            // onReasoning
            (info: RoutingInfo) => {
                setReasoningText(info.reasoning || "Analyzing...");
                if (info.intent) {
                    currentIntentRef.current = info.intent;
                }
                if (info.effective_level) {
                    detectedLevelRef.current = info.effective_level;
                } else if (info.detected_level) {
                    detectedLevelRef.current = info.detected_level;
                }
                if (info.suggested_title) {
                    latestRoutedTitle = info.suggested_title;
                    if (shouldApplySuggestedTitle) suggestedTitle = info.suggested_title;
                }
            },
            abortController.signal,
            schemaLevel,
            effectiveModel,
            projectId ?? undefined,
        );
        if (returnedRunId) runIdRef.current = returnedRunId;
        abortControllerRef.current = null;
    }, [isLoading, threadId, conversationCreated, projectId, schemaId, schemaLevel, currentModel, onModelGenerated, buildOpenSchemaLink]);

    const handleRetry = useCallback(() => {
        if (!lastUserMessageRef.current) return;
        // Remove the last error message before retrying
        setMessages((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg?.isError) {
                return prev.slice(0, -1);
            }
            return prev;
        });
        handleSend(lastUserMessageRef.current);
    }, [handleSend]);

    const handleStop = useCallback(() => {
        // Abort the fetch stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        // Cancel the run on LangGraph server
        if (runIdRef.current) {
            cancelRun(threadId, runIdRef.current);
            runIdRef.current = null;
        }
        setIsLoading(false);
        setIsStreamingJson(false);
        setReasoningText(undefined);
        // Finalize the last AI message
        setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.sender === "ai" && !last.text) {
                return prev.slice(0, -1);
            }
            if (last?.sender === "ai") {
                return prev.map((msg, i) =>
                    i === prev.length - 1 ? { ...msg, isStreaming: false } : msg
                );
            }
            return prev;
        });
    }, [threadId]);

    if (!isOpen) return null;

    return (
        <div
            ref={chatBoxRef}
            className="fixed z-50 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: isMinimized ? "320px" : "400px",
                height: isMinimized ? "50px" : "600px",
                maxWidth: "calc(100vw - 20px)",
                maxHeight: "calc(100vh - 20px)",
                cursor: isDragging ? "grabbing" : "default",
            }}
        >
            <div
                onMouseDown={handleMouseDown}
                className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-primary-500 to-yellow-500 cursor-grab active:cursor-grabbing"
            >
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-white font-semibold text-sm">AI Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="text-white hover:bg-white/20 rounded p-1 transition-colors cursor-pointer"
                    >
                        {isMinimized ? (
                            <Maximize2 size={16} />
                        ) : (
                            <Minimize2 size={16} />
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white/20 rounded p-1 transition-colors cursor-pointer"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <ChatContent 
                    messages={messages}
                    onSend={handleSend}
                    onMessagesChange={setMessages}
                    isLoading={isLoading}
                    reasoningText={reasoningText}
                onRetry={handleRetry}
                isStreamingJson={isStreamingJson}
                onStop={handleStop}
                projectId={projectId}
            />
            )}
        </div>
    );
};

export default ChatBox;
