"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreVertical, Search } from "lucide-react";
import { Button, Checkbox, Empty, Input, Popconfirm, Select } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  getConversations,
  deleteConversation,
  ChatConversation,
} from "@/api/chat/client";
import LoadingIndicator from "@/components/LoadingIndicator";
import classNames from "classnames";

dayjs.extend(relativeTime);

type DateFilter = "all" | "today" | "week";

export default function ChatHistory() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setConversations(await getConversations());
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  const visibleConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const startOfToday = dayjs().startOf("day");
    const startOfWeek = dayjs().subtract(7, "day");

    return conversations.filter((conversation) => {
      const matchesQuery = !normalizedQuery || (conversation.title || "New chat").toLowerCase().includes(normalizedQuery);
      const updatedAt = dayjs(conversation.updatedAt);
      const matchesDate = dateFilter === "all"
        || (dateFilter === "today" && updatedAt.isAfter(startOfToday))
        || (dateFilter === "week" && updatedAt.isAfter(startOfWeek));
      return matchesQuery && matchesDate;
    });
  }, [conversations, dateFilter, query]);

  const removeConversations = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(deleteConversation));
      setConversations((current) => current.filter((conversation) => !ids.includes(conversation.id)));
      setSelectedIds([]);
      if (selecting) setSelecting(false);
    } catch (error) {
      console.error("Failed to delete conversations:", error);
    }
  };

  const toggleSelected = (conversationId: string) => {
    setSelectedIds((current) => current.includes(conversationId)
      ? current.filter((id) => id !== conversationId)
      : [...current, conversationId]);
  };

  if (loading) {
    return <LoadingIndicator fullArea label="Loading chats" />;
  }

  return (
    <div className="h-full overflow-y-auto bg-white px-5 py-8 sm:px-8 lg:px-12">
      <main className="mx-auto w-full max-w-5xl pb-12">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-950">Chats</h1>
          <div className="flex items-center gap-2.5">
            <Select
              value={dateFilter}
              onChange={setDateFilter}
              prefix={<span className="text-gray-500">Filter by</span>}
              options={[
                { value: "all", label: "All" },
                { value: "today", label: "Today" },
                { value: "week", label: "Last 7 days" },
              ]}
              className="w-[150px] [&_.ant-select-selector]:!h-8 [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selector]:!border-0 [&_.ant-select-selector]:!bg-gray-100 [&_.ant-select-selector]:!px-3 [&_.ant-select-selector]:!text-xs [&_.ant-select-selector]:!font-medium [&_.ant-select-selector]:!shadow-none"
            />

            {selecting && selectedIds.length > 0 ? (
              <Popconfirm
                title={`Delete ${selectedIds.length} selected chat${selectedIds.length === 1 ? "" : "s"}?`}
                description="This action cannot be undone."
                onConfirm={() => void removeConversations(selectedIds)}
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
              >
                <Button danger className="!h-8 !rounded-2xl !border-0 !bg-red-50 !px-4 !text-xs !font-medium !shadow-none">
                  Delete selected
                </Button>
              </Popconfirm>
            ) : (
              <Button
                onClick={() => { setSelecting((current) => !current); setSelectedIds([]); }}
                className="!h-8 !rounded-2xl !border-0 !bg-gray-100 !px-4 !text-xs !font-medium !shadow-none hover:!bg-gray-200"
              >
                {selecting ? "Cancel" : "Select chats"}
              </Button>
            )}

            <Button
              type="primary"
              onClick={() => router.push("/ai-chat")}
              className="!h-8 !rounded-2xl !border-0 !px-4 !text-xs !font-medium !shadow-none"
            >
              New chat
            </Button>
          </div>
        </header>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<Search className="mr-1 h-4 w-4 text-gray-400" />}
          placeholder="Search chats..."
          className="!mb-5 !h-10 !rounded-2xl !border-0 !bg-gray-100 !px-4 !text-sm !shadow-none"
        />

        {visibleConversations.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? "No chats match your search" : "No conversations yet"} />
          </div>
        ) : (
          <div>
            {visibleConversations.map((conversation) => {
              const selected = selectedIds.includes(conversation.id);
              return (
                <div
                  key={conversation.id}
                  onClick={selecting ? () => toggleSelected(conversation.id) : undefined}
                  className={classNames(
                    "group flex min-h-14 items-center gap-3 border-b border-gray-100 px-3 py-2 transition-colors hover:bg-gray-50",
                    selecting && "cursor-pointer",
                  )}
                >
                  {selecting && (
                    <Checkbox
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleSelected(conversation.id)}
                    />
                  )}
                  {selecting ? (
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                      {conversation.title || "New chat"}
                    </span>
                  ) : (
                    <Link
                      href={`/ai-chat/c/${conversation.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900"
                    >
                      {conversation.title || "New chat"}
                    </Link>
                  )}
                  <span className="shrink-0 text-xs text-gray-400">{dayjs(conversation.updatedAt).fromNow()}</span>
                  {!selecting && (
                    <Popconfirm
                      title="Delete conversation?"
                      description="This action cannot be undone."
                      onConfirm={() => void removeConversations([conversation.id])}
                      okText="Delete"
                      cancelText="Cancel"
                      okButtonProps={{ danger: true }}
                    >
                      <button
                        type="button"
                        aria-label="Chat actions"
                        onClick={(event) => event.stopPropagation()}
                        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 opacity-0 transition group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-950"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </Popconfirm>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
