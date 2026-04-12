"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Trash2, Plus } from "lucide-react";
import { Empty, Popconfirm } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  getConversations,
  deleteConversation,
  ChatConversation,
} from "@/api/chat/client";

dayjs.extend(relativeTime);

export default function ChatHistory() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getConversations();
      setConversations(data);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelect = (conversationId: string) => {
    router.push(`/ai-chat/c/${conversationId}`);
  };

  const handleDelete = async (conversationId: string) => {
    try {
      await deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header - fixed */}
      <div className="px-8 py-6 shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 w-full">
            <div className="text-2xl text-gray-900">Chat History</div>
            <div className="flex gap-2 text-sm items-center cursor-pointer" onClick={() => router.push("/ai-chat")}>
                <Plus className="w-4 h-4" />
                New Chat
            </div>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto px-8 py-6 pt-0!">
        {loading ? (
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg">
                  <div className="w-5 h-5 bg-gray-200 rounded animate-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-4 bg-gray-200 rounded animate-pulse mb-1.5" style={{ width: `${60 + (i % 3) * 15}%` }} />
                    <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: '80px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No conversations yet"
            >
              <button
                onClick={() => router.push("/ai-chat")}
                className="px-4 py-2 text-sm font-medium! text-white! bg-primary-500 rounded-lg hover:bg-primary-600 cursor-pointer transition-colors"
              >
                Start a new chat
              </button>
            </Empty>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex flex-col gap-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  className="group flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <MessageSquare className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {conv.title || "New Chat"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {dayjs(conv.updatedAt).fromNow()}
                    </p>
                  </div>
                  <Popconfirm
                    title="Delete conversation?"
                    description="This action cannot be undone."
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      handleDelete(conv.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="Delete"
                    cancelText="Cancel"
                    okButtonProps={{ danger: true }}
                  >
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </Popconfirm>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
