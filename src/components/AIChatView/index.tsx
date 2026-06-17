"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Loader2, RefreshCw, Square, Plus } from "lucide-react";
import { Input, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { usePathname, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  streamChatToLangGraph,
  generateThreadId,
  DBFLOW_ASSISTANT_ID,
  ChatMessage,
  RoutingInfo,
  extractModelJsonFromContent,
  cancelRun,
  type Attachment,
  readFileAsAttachment,
  uploadAttachmentForAI,
  buildChatInputFromAttachments,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_TOTAL_BYTES,
} from "@/api/ai/client";
import {
  createConversation,
  saveMessages,
  getConversation,
  linkConversationToProject,
} from "@/api/chat/client";
import { createProject } from "@/components/CreateProject/api/client";
import { createSchema, saveSchemaModel } from "@/components/EditProject/api/client";
import { AttachmentPreviews } from "@/components/AttachmentPreviews";
import { SchemaType } from "@/utils/constants";
import type { UserResponse } from "@/types/user.type";

const { TextArea } = Input;

const GREETING_TEMPLATES = [
  "Good to see you, {name}.",
  "Ready when you are, {name}.",
  "What are we designing today, {name}?",
  "Let's build something clean, {name}.",
  "Where should we start, {name}?",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
  attachments?: Attachment[];
}

interface AIChatViewProps {
  /** If provided, load this existing conversation */
  threadId?: string;
}

// ── Attachment metadata persistence helpers ───────────────────────────────────
const ATT_MARKER = "<!-- __att__:";
const ATT_END = " -->";

function encodeAttachmentMetadata(content: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return content;
  const meta = attachments.map(({ id, name, fileType, size, url }) => ({
    id,
    name,
    fileType,
    size,
    ...(url ? { url } : {}),
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
      url?: string;
    }>;
    return {
      content: cleanContent,
      attachments: parsed.map((a) => ({ ...a, content: "" })),
    };
  } catch {
    return { content: raw, attachments: [] };
  }
}

function getStoredUserName(): string {
  try {
    const cachedUser = localStorage.getItem("user_data");
    if (!cachedUser) return "there";
    const user = JSON.parse(cachedUser) as Partial<UserResponse>;
    const name = user.firstName || user.fullName || user.email?.split("@")[0];
    return name?.trim() || "there";
  } catch {
    return "there";
  }
}

function buildRandomGreeting(): string {
  const template = GREETING_TEMPLATES[Math.floor(Math.random() * GREETING_TEMPLATES.length)];
  return template.replace("{name}", getStoredUserName());
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AIChatView({ threadId: initialThreadId }: AIChatViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(!!initialThreadId);
  const [threadId, setThreadId] = useState<string>(
    () => initialThreadId || generateThreadId()
  );
  const [conversationCreated, setConversationCreated] = useState(!!initialThreadId);
  const [reasoningInfo, setReasoningInfo] = useState<RoutingInfo | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  /** True while JSON code block is being streamed (diagram intent) */
  const [isStreamingJson, setIsStreamingJson] = useState(false);
  /** Track the project created in this conversation to reuse it */
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [greeting, setGreeting] = useState("Good to see you.");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<TextAreaRef>(null);
  /** Track the current routing intent */
  const currentIntentRef = useRef<string | null>(null);
  /** Track the detected schema level from AI routing */
  const detectedLevelRef = useRef<string | null>(null);
  const redirectTriggeredRef = useRef(false);
  /** Track the last user message for retry */
  const lastUserMessageRef = useRef<string>("");
  /** AbortController for cancelling the current stream */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Track run_id for cancelling via LangGraph API */
  const runIdRef = useRef<string | null>(null);

  const resetToNewChat = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    runIdRef.current = null;
    redirectTriggeredRef.current = false;
    currentIntentRef.current = null;
    detectedLevelRef.current = null;
    lastUserMessageRef.current = "";

    setMessages([]);
    setInputValue("");
    setIsLoading(false);
    setReasoningInfo(null);
    setIsRedirecting(false);
    setIsStreamingJson(false);
    setCreatedProjectId(null);
    setAttachments([]);
    setGreeting(buildRandomGreeting());
    setThreadId(generateThreadId());
    setConversationCreated(false);
    setIsLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (pathname?.startsWith("/ai-chat/c/") && !initialThreadId) {
      return;
    }

    if (pathname === "/ai-chat") {
      resetToNewChat();
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    runIdRef.current = null;
    redirectTriggeredRef.current = false;
    currentIntentRef.current = null;
    detectedLevelRef.current = null;
    lastUserMessageRef.current = "";

    setMessages([]);
    setInputValue("");
    setIsLoading(false);
    setReasoningInfo(null);
    setIsRedirecting(false);
    setIsStreamingJson(false);
    setCreatedProjectId(null);
    setAttachments([]);
    setGreeting(buildRandomGreeting());

    if (initialThreadId) {
      setThreadId(initialThreadId);
      setConversationCreated(true);
      setIsLoadingHistory(true);
      return;
    }

    setThreadId(generateThreadId());
    setConversationCreated(false);
    setIsLoadingHistory(false);
  }, [initialThreadId, pathname, resetToNewChat]);

  useEffect(() => {
    const handleNewChat = () => {
      if (window.location.pathname.startsWith("/ai-chat")) {
        resetToNewChat();
      }
    };

    window.addEventListener("dbflow:new-ai-chat", handleNewChat);
    return () => window.removeEventListener("dbflow:new-ai-chat", handleNewChat);
  }, [resetToNewChat]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load existing conversation if threadId is provided
  useEffect(() => {
    if (!initialThreadId) return;

    const loadConversation = async () => {
      try {
        const conversation = await getConversation(initialThreadId);
        const msgs = conversation?.messages ?? [];
        if (msgs.length > 0) {
          const loadedMessages: Message[] = msgs.map((msg, index) => {
            if (msg.role === "user") {
              const { content, attachments } = decodeAttachmentMetadata(msg.content);
              return {
                id: `loaded-${index}-${msg.id}`,
                role: msg.role as "user",
                content,
                timestamp: new Date(msg.createdAt),
                attachments: attachments.length > 0 ? attachments : undefined,
              };
            }
            return {
              id: `loaded-${index}-${msg.id}`,
              role: msg.role,
              content: msg.content,
              timestamp: new Date(msg.createdAt),
            };
          });
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadConversation();
  }, [initialThreadId]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    // Reset so same file can be re-selected
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
    const newAttachments = pairs.map(({ att }) =>
      needsUpload(att.fileType) ? { ...att, uploading: true } : att,
    );
    setAttachments((prev) => [...prev, ...newAttachments]);

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

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const isUploading = attachments.some((a) => a.uploading);  const handleSend = useCallback(async (retryMessage?: string) => {
    const messageToSend = retryMessage || inputValue.trim();
    if ((!messageToSend && attachments.length === 0) || isLoading) return;

    const userMessageContent = messageToSend || "(attached files)";
    if (!retryMessage) setInputValue("");
    const currentAttachments = retryMessage ? [] : attachments;
    if (!retryMessage) setAttachments([]);
    redirectTriggeredRef.current = false;
    lastUserMessageRef.current = userMessageContent;

    const { message: enrichedMessage, modelOverride } = buildChatInputFromAttachments(
      userMessageContent,
      currentAttachments,
    );
    const chatMessages: ChatMessage[] = [enrichedMessage];

    // Remove any previous error messages when retrying
    if (retryMessage) {
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.isError) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessageContent,
      timestamp: new Date(),
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setReasoningInfo(null);
    currentIntentRef.current = null;
    detectedLevelRef.current = null;

    // Create AbortController for this stream
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    runIdRef.current = null;

    // Create conversation in backend if first message
    let conversationPromise: Promise<void> | null = null;
    if (!conversationCreated) {
      conversationPromise = createConversation(threadId)
        .then(() => {
          setConversationCreated(true);
          window.history.replaceState(null, "", `/ai-chat/c/${threadId}`);
        })
        .catch((error) => {
          console.error("Failed to create conversation:", error);
        });
    }

    // Create placeholder for assistant message
    const assistantMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    let finalAssistantContent = "";

    const ensureConversationReady = async () => {
      if (conversationPromise) await conversationPromise;
    };

    /**
     * After stream completes with a create/edit intent:
     * 1. Extract model JSON from the full response
     * 2. Create project + schema
     * 3. Save model JSON to S3 via backend
     * 4. Redirect to editor — HocusPocus will load the model from S3
     */
    const handleDiagramRedirectAfterStream = async (
      fullContent: string,
      userMsg: string,
    ) => {
      if (redirectTriggeredRef.current) return;
      redirectTriggeredRef.current = true;
      setIsRedirecting(true);

      const extracted = extractModelJsonFromContent(fullContent);
      if (!extracted.isJsonComplete || !extracted.modelJson) {
        // JSON extraction failed — show error, don't redirect
        redirectTriggeredRef.current = false;
        setIsRedirecting(false);
        return;
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: extracted.textDescription || "Creating project and opening editor...",
              }
            : msg
        )
      );

      try {
        let projectIdToUse = createdProjectId;

        // Only create a new project if we don't already have one from this conversation
        if (!projectIdToUse) {
          const projectName =
            userMsg.length > 50 ? userMsg.substring(0, 50) + "..." : userMsg;

          const project = await createProject({
            name: `AI: ${projectName}`,
            skipDefaultSchema: true,
          });
          if (!project) throw new Error("Failed to create project");
          projectIdToUse = project.id;
          setCreatedProjectId(project.id);
        }

        const level = detectedLevelRef.current
          // For engineering intents without explicit level, infer from model structure.
          // All levels have a "model" metadata key — check entity/table arrays instead.
          // Then distinguish logical (lid_) vs physical (pid_) by the model.id prefix.
          ?? (extracted.modelJson
            ? (extracted.modelJson.entities
                ? "conceptual"
                : extracted.modelJson.tables
                  ? (typeof (extracted.modelJson.model as Record<string, unknown>)?.id === "string" &&
                     ((extracted.modelJson.model as Record<string, unknown>).id as string).startsWith("pid_")
                       ? "physical"
                       : "logical")
                  : "physical")
            : null);
        const schemaType =
          level === "logical"
            ? SchemaType.LOGICAL
            : level === "physical"
              ? SchemaType.PHYSICAL
              : SchemaType.CONCEPTUAL;
        const schemaName =
          schemaType === SchemaType.LOGICAL
            ? "Logical Schema"
            : schemaType === SchemaType.PHYSICAL
              ? "Physical Schema"
              : "Conceptual Schema";

        const schema = await createSchema(projectIdToUse, {
          name: schemaName,
          type: schemaType,
        });

        // Save model JSON to S3 so HocusPocus loads it on connect
        await saveSchemaModel(projectIdToUse, schema.id, extracted.modelJson);

        // Save messages and link conversation to this project
        await ensureConversationReady();
        await saveMessages(threadId, [
          { role: "user", content: encodeAttachmentMetadata(userMsg, currentAttachments) },
          { role: "assistant", content: fullContent },
        ]);
        await linkConversationToProject(threadId, projectIdToUse, schema.id);

        // Navigate to editor with ChatBox auto-opened showing this conversation
        router.push(
          `/projects/${projectIdToUse}?schemaId=${schema.id}&openChat=true&chatThread=${threadId}`
        );
      } catch (err) {
        console.error("Failed to create project:", err);
        redirectTriggeredRef.current = false;
        setIsRedirecting(false);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: "Failed to create project. Please try again." }
              : msg
          )
        );
      }
    };

    const returnedRunId = await streamChatToLangGraph(
      DBFLOW_ASSISTANT_ID,
      threadId,
      chatMessages,
      // onChunk — show streaming text (strip JSON block for diagram intents)
      (chunk: string) => {
        if (redirectTriggeredRef.current) return;
        finalAssistantContent = chunk;

        // Only clear reasoning indicator when we have real visible content
        if (chunk.trim()) {
          setReasoningInfo(null);
        }

        const isDiagramIntent =
          currentIntentRef.current === "create" ||
          currentIntentRef.current === "edit" ||
          currentIntentRef.current === "forward_engineer" ||
          currentIntentRef.current === "reverse_engineer";

        if (isDiagramIntent) {
          // Show only text description while streaming, hide JSON block
          const extracted = extractModelJsonFromContent(chunk);
          setIsStreamingJson(extracted.hasDiagram && !extracted.isJsonComplete);
          const displayText = extracted.textDescription || 
            (extracted.hasDiagram ? "Generating diagram..." : chunk);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content: displayText } : msg
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, content: chunk } : msg
            )
          );
        }
      },
      // onComplete — handle redirect for diagram intents, save messages otherwise
      async () => {
        setReasoningInfo(null);

        const isDiagramIntent =
          currentIntentRef.current === "create" ||
          currentIntentRef.current === "edit" ||
          currentIntentRef.current === "forward_engineer" ||
          currentIntentRef.current === "reverse_engineer";

        if (isDiagramIntent && finalAssistantContent) {
          // Keep loading state while creating project + saving to S3
          setIsStreamingJson(false);
          await handleDiagramRedirectAfterStream(finalAssistantContent, userMessageContent);
        } else {
          setIsLoading(false);
        }

        // Save messages for non-diagram intents (diagram messages are saved in handleDiagramRedirectAfterStream)
        if (finalAssistantContent && !isDiagramIntent) {
          try {
            await ensureConversationReady();
            await saveMessages(threadId, [
              { role: "user", content: encodeAttachmentMetadata(userMessageContent, currentAttachments) },
              { role: "assistant", content: finalAssistantContent },
            ]);
          } catch (error) {
            console.error("Failed to save messages:", error);
          }
        }
      },
      // onError
      (error: Error) => {
        if (redirectTriggeredRef.current) return;
        console.error("LangGraph streaming error:", error);
        setIsStreamingJson(false);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: error.message || "An error occurred. Please try again.", isError: true }
              : msg
          )
        );
        setIsLoading(false);
      },
      !conversationCreated,
      // onReasoning — track intent but don't redirect early
      (info: RoutingInfo) => {
        setReasoningInfo(info);
        if (info.intent) {
          currentIntentRef.current = info.intent;
        }
        if (info.effective_level) {
          detectedLevelRef.current = info.effective_level;
        } else if (info.detected_level) {
          detectedLevelRef.current = info.detected_level;
        }
      },
      abortController.signal,
      undefined,
      modelOverride ?? undefined,
    );
    if (returnedRunId) runIdRef.current = returnedRunId;
    abortControllerRef.current = null;
  }, [inputValue, attachments, isLoading, threadId, conversationCreated, router, createdProjectId]);

  const handleRetry = useCallback(() => {
    if (lastUserMessageRef.current) {
      handleSend(lastUserMessageRef.current);
    }
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
    setReasoningInfo(null);
    setIsRedirecting(false);
    // Finalize the last assistant message
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && !last.content) {
        // Remove empty placeholder
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, [threadId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Always-present hidden file input — fixes paperclip when chat has messages */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      {messages.length === 0 && !isLoadingHistory && !initialThreadId ? (
        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="w-full max-w-3xl">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">
                {greeting}
              </h1>
            </div>

            <div>
              <div className="rounded-[26px] border border-gray-200 bg-white p-2 transition-colors focus-within:border-gray-300">
                {attachments.length > 0 && (
                  <div className="px-2 pt-2 pb-2">
                    <AttachmentPreviews attachments={attachments} onRemove={removeAttachment} />
                  </div>
                )}
                <div className="flex items-end gap-1">
                  <Tooltip title="Attach file">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isLoading || attachments.length >= ATTACHMENT_MAX_COUNT}
                      className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500! transition-colors hover:bg-gray-100 hover:text-gray-700! disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Plus size={19} />
                    </button>
                  </Tooltip>
                  <div className="min-w-0 flex-1">
                    <TextArea
                      ref={textAreaRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask me anything about databases..."
                      className="!resize-none !rounded-2xl !border-0 !px-2 !py-2.5 !text-sm !shadow-none !outline-none focus:!border-0 focus:!ring-0 focus:!shadow-none"
                      autoSize={{ minRows: 1, maxRows: 10 }}
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={(!inputValue.trim() && attachments.length === 0) || isLoading || isUploading}
                    className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary-500 text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    <ArrowUp className="w-5 h-5 font-bold text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* <div className="text-xs text-gray-500 text-center mt-6">
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">
                Enter
              </kbd>{" "}
              to send,{" "}
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">
                Shift+Enter
              </kbd>{" "}
              for new line
            </div> */}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {isLoadingHistory ? (
                <div className="flex flex-col gap-6 py-4">
                  <div className="flex justify-end">
                    <div className="w-[60%] h-12 bg-gray-200 rounded-2xl rounded-tr-sm animate-pulse" />
                  </div>
                  <div className="flex justify-start">
                    <div className="w-[75%] h-20 bg-gray-100 rounded-2xl rounded-tl-sm animate-pulse" />
                  </div>
                  <div className="flex justify-end">
                    <div className="w-[50%] h-10 bg-gray-200 rounded-2xl rounded-tr-sm animate-pulse" />
                  </div>
                  <div className="flex justify-start">
                    <div className="w-[70%] h-16 bg-gray-100 rounded-2xl rounded-tl-sm animate-pulse" />
                  </div>
                </div>
              ) : (
              <>
              {messages.map((message, index) => {
                if (message.role === "assistant" && !message.content) {
                  return null;
                }
                const isLastMessage = index === messages.length - 1;
                return (
                <div
                  key={message.id}
                  className={`mb-6 flex flex-col ${
                    message.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {/* File previews — outside the bubble, above it */}
                  {message.role === "user" && message.attachments && message.attachments.length > 0 && (
                    <div className="mb-2 max-w-[80%]">
                      <AttachmentPreviews
                        attachments={message.attachments}
                        onRemove={() => {}}
                        readonly
                      />
                    </div>
                  )}
                  <div className="max-w-[80%]">
                      <div className={`${
                        message.role === "user"
                          ? "bg-primary-500 text-white rounded-2xl rounded-tr-sm"
                          : message.isError
                            ? "bg-red-50 text-red-700 border border-red-200 rounded-2xl rounded-tl-sm"
                            : "bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm"
                      } px-5 py-3`}
                    >
                      {message.role === "user" ? (
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </div>
                      ) : (
                        <div className="text-sm leading-relaxed prose prose-sm max-w-none
                          prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1
                          prose-li:my-0 prose-pre:my-2 prose-blockquote:my-1
                          prose-code:text-primary-700 prose-code:bg-primary-50
                          prose-code:px-1 prose-code:rounded prose-code:text-xs
                          prose-pre:bg-gray-900 prose-pre:text-gray-100
                          prose-a:text-primary-600 prose-strong:text-gray-900
                          prose-table:text-xs prose-th:bg-gray-200">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}
                      <div
                        className={`text-xs mt-2 ${
                          message.role === "user"
                            ? "text-primary-100"
                            : message.isError
                              ? "text-red-400"
                              : "text-gray-500"
                        }`}
                      >
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    {message.isError && isLastMessage && !isLoading && (
                      <div className="pt-4">
                        <button
                          onClick={handleRetry}
                          className="mt-2 flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 cursor-pointer transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Try again
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}

              {isLoading && messages[messages.length - 1]?.content === "" && !isRedirecting && !isStreamingJson && (
                <div className="mb-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                          <span
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.2s" }}
                          ></span>
                          <span
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.4s" }}
                          ></span>
                        </div>
                        <span className="text-sm text-gray-500">Thinking...</span>
                      </div>
                    </div>
                  </div>

                  {reasoningInfo && (
                    <div className="flex items-center gap-2 mt-2 ml-1">
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></span>
                      <span className="text-xs text-gray-400 italic">
                        {reasoningInfo.reasoning || "Analyzing your request..."}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {isStreamingJson && (
                <div className="mb-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                        <span className="text-sm text-gray-500">Generating schema...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isRedirecting && (
                <div className="mb-6">
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
                        <span className="text-sm text-gray-500">Creating project and opening editor...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
              </>
              )}
            </div>
          </div>

          <div>
            <div className="max-w-3xl mx-auto px-4 py-4">
              <div>
                <div className="rounded-[26px] border border-gray-200 bg-white p-2 transition-colors focus-within:border-gray-300">
                  {attachments.length > 0 && (
                    <div className="px-2 pt-2 pb-2">
                      <AttachmentPreviews attachments={attachments} onRemove={removeAttachment} />
                    </div>
                  )}
                  <div className="flex items-end gap-1">
                    <Tooltip title="Attach file">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || attachments.length >= ATTACHMENT_MAX_COUNT}
                        className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500! transition-colors hover:bg-gray-100 hover:text-gray-700! disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Plus size={19} />
                      </button>
                    </Tooltip>
                    <div className="min-w-0 flex-1">
                      <TextArea
                        ref={textAreaRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask me anything about databases..."
                        className="!resize-none !rounded-2xl !border-0 !px-2 !py-2.5 !text-sm !shadow-none !outline-none focus:!border-0 focus:!ring-0 focus:!shadow-none"
                        autoSize={{ minRows: 1, maxRows: 6 }}
                      />
                    </div>
                    {isLoading ? (
                      <button
                        type="button"
                        onClick={handleStop}
                        className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary-500 text-white transition-colors hover:bg-primary-500"
                      >
                        <Square className="w-5 h-5" fill="white" color="white" />
                      </button>
                    ) : (
                    <button
                      type="button"
                      onClick={() => handleSend()}
                      disabled={(!inputValue.trim() && attachments.length === 0) || isUploading}
                      className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary-500 text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      <ArrowUp className="w-5 h-5 font-bold text-white" />
                    </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
