"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import LogoHeader from "@/components/LogoHeader";

const { TextArea } = Input;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<TextAreaRef>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    // Simulate AI response
    setIsLoading(true);
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "This is a demo response. In the actual implementation, this will connect to your AI backend to generate database schemas, SQL queries, and provide database assistance.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 ? (
        /* Empty State - Centered Input */
        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="w-full max-w-3xl">
            <div className="flex justify-center mb-6">
              <LogoHeader size="large" />
            </div>
            
            <div className="relative">
              <TextArea
                ref={textAreaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about databases..."
                className="!resize-none !pr-12 !py-4 !text-base !rounded-xl !border-gray-300 focus:!border-primary-500 focus:!ring-2 focus:!ring-primary-100"
                autoSize={{ minRows: 1, maxRows: 10 }}
                autoFocus
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className="absolute cursor-pointer right-3 bottom-3 p-2 bg-primary-500 text-white rounded-full hover:bg-primary-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowUp className="w-5 h-5 font-bold text-white" />
              </button>
            </div>
            
            <div className="text-xs text-gray-500 text-center mt-6">
              Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 font-mono">Shift+Enter</kbd> for new line
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map((message) => (
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
              ))}

              {isLoading && (
                <div className="mb-6 flex justify-start">
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
              )}

              <div ref={messagesEndRef} />
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
                  className="!resize-none !pr-12 !py-4 !text-base !rounded-xl !border-gray-300 focus:!border-primary-500 focus:!ring-2 focus:!ring-primary-100"
                  autoSize={{ minRows: 1, maxRows: 6 }}
                />
                <button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isLoading}
                    className="absolute cursor-pointer right-3 bottom-3 p-2 bg-primary-500 text-white rounded-full hover:bg-primary-500 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
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
