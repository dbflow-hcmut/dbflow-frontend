"use client";

import React, { useState, useEffect, useRef } from "react";
import { Input, Button } from "antd";
import { Send } from "lucide-react";

interface Message {
    id: string;
    text: string;
    sender: "user" | "ai";
    timestamp: Date;
}

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            text: "Hello! How can I help you with your database design?",
            sender: "ai",
            timestamp: new Date(),
        },
    ]);
    const [inputValue, setInputValue] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'CHAT_MESSAGES' && event.data.messages) {
                setMessages(event.data.messages);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleSend = () => {
        if (!inputValue.trim()) return;

        const newMessage: Message = {
            id: Date.now().toString(),
            text: inputValue,
            sender: "user",
            timestamp: new Date(),
        };

        setMessages([...messages, newMessage]);
        setInputValue("");

        setTimeout(() => {
            const aiResponse: Message = {
                id: (Date.now() + 1).toString(),
                text: "I understand. Let me help you with that.",
                sender: "ai",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, aiResponse]);
        }, 1000);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="h-screen w-full flex flex-col bg-gray-50">
            <div className="bg-gradient-to-r from-primary-500 to-yellow-500 px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-white font-semibold text-base">AI Assistant</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                        className="flex-1"
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
        </div>
    );
}

