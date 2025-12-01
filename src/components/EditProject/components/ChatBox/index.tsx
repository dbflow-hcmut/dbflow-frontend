"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, Minimize2, Maximize2, ExternalLink } from "lucide-react";
import { usePathname } from "next/navigation";
import { ChatContent, Message } from "./ChatContent";

interface ChatBoxProps {
    isOpen: boolean;
    onClose: () => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ isOpen, onClose }) => {
    const pathname = usePathname();
    const projectId = pathname?.split('/')[2];
    
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "1",
            text: "Hello! How can I help you with your database design?",
            sender: "ai",
            timestamp: new Date(),
        },
    ]);
    const [isMinimized, setIsMinimized] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 100 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const chatBoxRef = useRef<HTMLDivElement>(null);

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


    useEffect(() => {
        if (!isOpen) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && chatBoxRef.current) {
                const headerHeight = 48;
                const windowHeight = window.innerHeight;
                
                const newX = e.clientX - dragOffset.x;
                let newY = e.clientY - dragOffset.y;

                newY = Math.max(0, Math.min(newY, windowHeight - headerHeight));

                setPosition({
                    x: newX,
                    y: newY,
                });
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

    const handleOpenInNewWindow = () => {
        if (!projectId) return;
        
        const chatUrl = `/projects/${projectId}/chat`;
        const popup = window.open(
            chatUrl,
            'chatWindow',
            'width=500,height=700,resizable=yes,scrollbars=yes'
        );
        
        if (popup) {
            const sendMessages = () => {
                popup.postMessage({ type: 'CHAT_MESSAGES', messages }, window.location.origin);
            };
            
            try {
                sendMessages();
            } catch {
                setTimeout(sendMessages, 100);
            }
            
            onClose();
        }
    };

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
                        onClick={handleOpenInNewWindow}
                        className="text-white hover:bg-white/20 rounded p-1 transition-colors cursor-pointer"
                        title="Open in new window"
                    >
                        <ExternalLink size={16} />
                    </button>
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
                />
            )}
        </div>
    );
};

export default ChatBox;

