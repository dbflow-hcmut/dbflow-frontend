"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input, Button } from "antd";
import { Send } from "lucide-react";

export interface Message {
    id: string;
    text: string;
    sender: "user" | "ai";
    timestamp: Date;
}

interface ChatContentProps {
    messages?: Message[];
    onSend: (text: string) => void;
    onMessagesChange?: (messages: Message[]) => void;
}

export const ChatContent: React.FC<ChatContentProps> = ({ 
    messages: externalMessages, 
    onSend,
    onMessagesChange 
}) => {
    const [internalMessages, setInternalMessages] = useState<Message[]>([
        {
            id: "1",
            text: "Hello! How can I help you with your database design?",
            sender: "ai",
            timestamp: new Date(),
        },
    ]);
    const [inputValue, setInputValue] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const messages = externalMessages !== undefined ? externalMessages : internalMessages;
    const setMessages = onMessagesChange || setInternalMessages;

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'CHAT_MESSAGES' && event.data.messages) {
                setMessages(event.data.messages);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [setMessages]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleSend = () => {
        if (!inputValue.trim()) return;

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
                {messages.map((message) => (
                    <div
                        key={message.id}
                        className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                message.sender === "user"
                                    ? "bg-primary-500 text-white"
                                    : "bg-white text-gray-800 border border-gray-200"
                            }`}
                        >
                            <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                            <p className="text-xs mt-1 opacity-70">
                                {message.timestamp.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-200 p-4 bg-white">
                <div className="flex items-end gap-2">
                    <Input.TextArea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type your message..."
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        className="flex-1 min-h-10!"
                    />
                    <Button
                        type="primary"
                        icon={<Send size={16} />}
                        onClick={handleSend}
                        disabled={!inputValue.trim()}
                        className="!h-10"
                    >
                        Send
                    </Button>
                </div>
            </div>
        </>
    );
};

