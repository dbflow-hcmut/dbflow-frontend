"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input, Button } from "antd";
import { Send, Loader2, RefreshCw, Square } from "lucide-react";

export interface Message {
    id: string;
    text: string;
    sender: "user" | "ai";
    timestamp: Date;
    isStreaming?: boolean;
    isError?: boolean;
}

interface ChatContentProps {
    messages?: Message[];
    onSend: (text: string) => void;
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
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const messages = externalMessages !== undefined ? externalMessages : internalMessages;

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isLoading]);

    const handleSend = () => {
        if (!inputValue.trim() || isLoading) return;
        onSend(inputValue);
        setInputValue("");
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
                            className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                        >
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
                                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
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

            <div className="border-t border-gray-200 p-4 bg-white">
                <div className="flex items-end gap-2">
                    <Input.TextArea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type your message..."
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        className="flex-1 min-h-10!"
                        disabled={isLoading}
                    />
                    {isLoading ? (
                        <Button
                            type="default"
                            icon={<Square size={16} fill="white" color="white" />}
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
                            disabled={!inputValue.trim()}
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

