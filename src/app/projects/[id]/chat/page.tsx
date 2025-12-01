"use client";

import React, { useState } from "react";
import { ChatContent, Message } from "@/components/EditProject/components/ChatBox/ChatContent";

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);

    const handleSend = (text: string) => {
        const newMessage: Message = {
            id: Date.now().toString(),
            text: text,
            sender: "user",
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, newMessage]);

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

    return (
        <div className="h-screen w-full flex flex-col bg-gray-50">
            <div className="bg-gradient-to-r from-primary-500 to-yellow-500 px-6 py-4">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-white font-semibold text-base">AI Assistant</span>
                </div>
            </div>

            <ChatContent 
                messages={messages}
                onSend={handleSend}
                onMessagesChange={setMessages}
            />
        </div>
    );
}

