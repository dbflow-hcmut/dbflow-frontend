"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp } from "lucide-react";
import { Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import LogoHeader from "@/components/LogoHeader";
import {
  streamChatToLangGraph,
  generateThreadId,
  DBFLOW_ASSISTANT_ID,
  ChatMessage,
  RoutingInfo,
} from "@/api/ai/client";
import {
  createConversation,
  saveMessages,
  getConversation,
} from "@/api/chat/client";

const { TextArea } = Input;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatViewProps {
  /** If provided, load this existing conversation */
  threadId?: string;
}

export default function AIChatView({ threadId: initialThreadId }: AIChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(!!initialThreadId);
  const [threadId, setThreadId] = useState<string>(
    () => initialThreadId || generateThreadId()
  );
  const [conversationCreated, setConversationCreated] = useState(!!initialThreadId);
  const [reasoningInfo, setReasoningInfo] = useState<RoutingInfo | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<TextAreaRef>(null);

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
          const loadedMessages: Message[] = msgs.map((msg, index) => ({
            id: `loaded-${index}-${msg.id}`,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
          }));
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

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessageContent = inputValue.trim();

    // Clear input immediately
    setInputValue("");

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessageContent,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setReasoningInfo(null);

    // Create conversation in backend if it's the first message (non-blocking)
    if (!conversationCreated) {
      createConversation(threadId)
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
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    // Only send the new user message — LangGraph manages conversation state via thread_id
    const chatMessages: ChatMessage[] = [
      {
        role: "user" as const,
        content: userMessageContent,
      },
    ];

    let finalAssistantContent = "";

    // Stream response from LangGraph
    // Skip LangGraph thread creation if conversation already exists
    await streamChatToLangGraph(
      DBFLOW_ASSISTANT_ID,
      threadId,
      chatMessages,
      // onChunk: Update assistant message with streaming content
      (chunk: string) => {
        finalAssistantContent = chunk;
        setReasoningInfo(null); // Clear reasoning when real content arrives
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: chunk }
              : msg
          )
        );
      },
      // onComplete: Save messages to backend
      async () => {
        setIsLoading(false);
        setReasoningInfo(null);

        // Save the user + assistant message pair to backend
        if (finalAssistantContent && typeof finalAssistantContent === "string") {
          try {
            await saveMessages(threadId, [
              { role: "user", content: userMessageContent },
              { role: "assistant", content: finalAssistantContent },
            ]);
          } catch (error) {
            console.error("Failed to save messages:", error);
          }
        }
      },
      // onError
      (error: Error) => {
        console.error("LangGraph streaming error:", error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: `❌ Error: ${error.message}. Please check if LangGraph server is running.`,
                }
              : msg
          )
        );
        setIsLoading(false);
      },
      !conversationCreated, // ensureThread: only create LangGraph thread for new conversations
      // onReasoning: Show reasoning indicator
      (info: RoutingInfo) => {
        setReasoningInfo(info);
      }
    );
  }, [inputValue, isLoading, threadId, conversationCreated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 && !isLoadingHistory && !initialThreadId ? (
        /* Empty State - Centered Input */
        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="w-full max-w-3xl">
            <div className="flex justify-center mb-6">
              <LogoHeader size="extra-large" />
            </div>

            <div className="relative">
              <TextArea
                ref={textAreaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about databases..."
                className="!resize-none !pr-12 !py-4 !rounded-xl !border-gray-300 focus:!border-primary-500 focus:!ring-2 focus:!ring-primary-100 !text-sm"
                autoSize={{ minRows: 1, maxRows: 10 }}
                autoFocus
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className="absolute cursor-pointer right-3 bottom-[10px] p-2 bg-primary-500 text-white rounded-full hover:bg-primary-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowUp className="w-5 h-5 font-bold text-white" />
              </button>
            </div>

            <div className="text-xs text-gray-500 text-center mt-6">
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">
                Enter
              </kbd>{" "}
              to send,{" "}
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">
                Shift+Enter
              </kbd>{" "}
              for new line
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {isLoadingHistory ? (
                <div className="flex flex-col gap-6 py-4">
                  {/* Skeleton: user bubble */}
                  <div className="flex justify-end">
                    <div className="w-[60%] h-12 bg-gray-200 rounded-2xl rounded-tr-sm animate-pulse" />
                  </div>
                  {/* Skeleton: assistant bubble */}
                  <div className="flex justify-start">
                    <div className="w-[75%] h-20 bg-gray-100 rounded-2xl rounded-tl-sm animate-pulse" />
                  </div>
                  {/* Skeleton: user bubble */}
                  <div className="flex justify-end">
                    <div className="w-[50%] h-10 bg-gray-200 rounded-2xl rounded-tr-sm animate-pulse" />
                  </div>
                  {/* Skeleton: assistant bubble */}
                  <div className="flex justify-start">
                    <div className="w-[70%] h-16 bg-gray-100 rounded-2xl rounded-tl-sm animate-pulse" />
                  </div>
                </div>
              ) : (
              <>
              {messages.map((message) => {
                // Hide empty assistant messages (placeholder while streaming)
                if (message.role === "assistant" && !message.content) {
                  return null;
                }
                return (
                <div
                  key={message.id}
                  className={`mb-6 flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] ${
                      message.role === "user"
                        ? "bg-primary-500 text-white rounded-2xl rounded-tr-sm"
                        : "bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm"
                    } px-5 py-3`}
                  >
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </div>
                    <div
                      className={`text-xs mt-2 ${
                        message.role === "user"
                          ? "text-primary-100"
                          : "text-gray-500"
                      }`}
                    >
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
                );
              })}

              {isLoading && messages[messages.length - 1]?.content === "" && (
                <div className="mb-6">
                  {/* Thinking dots */}
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

                  {/* Reasoning indicator - below bubble */}
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

              <div ref={messagesEndRef} />
              </>
              )}
            </div>
          </div>

          {/* Input Area - Bottom */}
          <div>
            <div className="max-w-3xl mx-auto px-4 py-4">
              <div className="relative">
                <TextArea
                  ref={textAreaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything about databases..."
                  className="!resize-none !pr-12 !py-4 !text-sm !rounded-xl !border-gray-300 focus:!border-primary-500 focus:!ring-2 focus:!ring-primary-100"
                  autoSize={{ minRows: 1, maxRows: 6 }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading}
                  className="absolute cursor-pointer right-3 bottom-[10px] p-2 bg-primary-500 text-white rounded-full hover:bg-primary-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="w-5 h-5 font-bold text-white" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
