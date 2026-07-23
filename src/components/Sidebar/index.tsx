"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Settings,
  PanelLeft,
  User,
  LogOut,
  X,
  Plus,
  CreditCard,
  Check,
  MessageCircle,
  FolderKanban,
  ChevronDown,
  MoreVertical,
  ShieldCheck,
} from "lucide-react";
import { Avatar, Dropdown, Input, Modal, Popconfirm } from "antd";
import classNames from "classnames";
import { getUserMe } from "@/api/users/client";
import type { UserResponse } from "@/types/user.type";
import {
  createTeamWorkspace,
  getWorkspaces,
  WorkspaceSummary,
} from "@/api/workspaces/client";
import { useRouter, useSearchParams } from "next/navigation";
import { notificationProvider } from "@/providers/notification";
import { getActiveWorkspaceId, setActiveWorkspaceId as persistActiveWorkspaceId } from "@/utils/active-workspace";
import { ChatConversation, deleteConversation, getConversations } from "@/api/chat/client";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

type SidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  mobile?: boolean;
};

const navItems: NavItem[] = [
  {
    label: "New chat",
    icon: <Plus className="h-5 w-5" />,
    path: "/ai-chat",
  },
  {
    label: "Chats",
    icon: <MessageCircle className="h-5 w-5" />,
    path: "/history",
  },
  {
    label: "Projects",
    icon: <FolderKanban className="h-5 w-5" />,
    path: "/projects",
  },
  {
    label: "Plans",
    icon: <CreditCard className="h-5 w-5" />,
    path: "/pricing",
  },
];

export default function Sidebar({ mobileOpen = false, onMobileClose, mobile = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [userData, setUserData] = useState<UserResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>();
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [recentChats, setRecentChats] = useState<ChatConversation[]>([]);
  const [recentsExpanded, setRecentsExpanded] = useState(true);

  useEffect(() => {
    if (mobile && !mobileOpen) return;

    const cachedUser = localStorage.getItem("user_data");
    if (cachedUser) {
      try {
        setUserData(JSON.parse(cachedUser) as UserResponse);
      } catch {
        localStorage.removeItem("user_data");
      }
    }

    void (async () => {
      try {
        const data = await getUserMe();
        setUserData(data);
        localStorage.setItem("user_data", JSON.stringify(data));
      } catch (error) {
        console.error("Failed to load user data", error);
        localStorage.removeItem("user_data");
      }
    })();
  }, [mobile, mobileOpen]);

  useEffect(() => {
    if (mobile && !mobileOpen) return;
    void getConversations()
      .then((items) => setRecentChats(items.slice(0, 7)))
      .catch((error) => console.error("Failed to load recent chats", error));
  }, [mobile, mobileOpen, pathname]);

  useEffect(() => {
    if (mobile && !mobileOpen) return;
    void getWorkspaces().then((items) => {
      setWorkspaces(items);
      const queryWorkspace = searchParams.get("workspaceId");
      const storedWorkspace = getActiveWorkspaceId();
      const selected =
        items.find((item) => item.id === queryWorkspace) ??
        items.find((item) => item.id === storedWorkspace) ??
        items.find((item) => item.type === "personal") ??
        items[0];
      if (selected) {
        setActiveWorkspaceId(selected.id);
        persistActiveWorkspaceId(selected.id);
        if (pathname.startsWith("/projects") && queryWorkspace !== selected.id) {
          const params = new URLSearchParams(searchParams.toString());
          params.set("workspaceId", selected.id);
          params.set("page", "1");
          router.replace(`/projects?${params.toString()}`);
        }
      }
    });
  }, [mobile, mobileOpen, pathname, router, searchParams]);

  const isActive = (path: string) => {
    if (path === "/ai-chat") return pathname === "/ai-chat";
    if (path === "/history") return pathname === "/history" || pathname.startsWith("/ai-chat/c/");
    return pathname === path || pathname.startsWith(path + "/");
  };
  const showText = mobile || !isCollapsed;
  const sidebarWidth = mobile ? "w-72" : isCollapsed ? "w-16" : "w-72";
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  const selectWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    persistActiveWorkspaceId(workspaceId);
    if (pathname.startsWith("/projects")) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("workspaceId", workspaceId);
      params.set("page", "1");
      router.push(`/projects?${params.toString()}`);
    }
  }, [pathname, router, searchParams]);

  const removeRecentChat = async (conversationId: string) => {
    try {
      await deleteConversation(conversationId);
      setRecentChats((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (pathname === `/ai-chat/c/${conversationId}`) router.push("/history");
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Unable to delete chat",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const accountPopup = (
    <div className="w-[272px] rounded-xl border border-gray-200 bg-white p-2 shadow-[0_14px_40px_rgba(0,0,0,0.16)]">
      <div className="truncate px-3 pb-2 pt-1.5 text-xs font-medium text-gray-500">{userData?.email || "Account"}</div>
      <div className="max-h-[198px] space-y-0.5 overflow-y-auto overscroll-contain">
        {workspaces.map((workspace) => (
          <button key={workspace.id} type="button" className="flex h-12 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-gray-100" onClick={() => { selectWorkspace(workspace.id); setAccountMenuOpen(false); }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">{workspace.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{workspace.name}</span><span className="block text-xs text-gray-500">{workspace.type === "team" ? "Team" : "Personal"}</span></span>
            {activeWorkspaceId === workspace.id && <Check className="h-4 w-4 shrink-0 text-primary-500" />}
          </button>
        ))}
      </div>
      <div className="mx-2 my-2 border-t border-gray-200" />
      <button type="button" className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-800 transition-colors hover:bg-gray-100" onClick={() => { setAccountMenuOpen(false); setCreateTeamOpen(true); }}><Plus className="h-[18px] w-[18px]" /><span>New team</span></button>
      {userData?.role?.toLowerCase() === "admin" && (
        <Link
          href="/admin"
          className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-800! !text-gray-800 transition-colors hover:bg-gray-100"
          onClick={() => setAccountMenuOpen(false)}
        >
          <ShieldCheck className="h-[18px] w-[18px]" />
          <span>Admin Portal</span>
        </Link>
      )}
      <button type="button" className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-800 transition-colors hover:bg-gray-100" onClick={() => { setAccountMenuOpen(false); window.dispatchEvent(new CustomEvent("dbflow:open-settings")); }}><Settings className="h-[18px] w-[18px]" /><span>Settings</span></button>
      <div className="mx-2 my-2 border-t border-gray-200" />
      <button type="button" className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-800 transition-colors hover:bg-gray-100" onClick={() => { localStorage.removeItem("user_data"); window.location.href = "/api/auth/logout"; }}><LogOut className="h-[18px] w-[18px]" /><span>Log out</span></button>
    </div>
  );

  const sidebar = (
    <aside
      className={classNames(
        "h-full bg-white flex flex-col transition-all duration-200 overflow-hidden",
        !mobile && "border-r border-gray-100",
        sidebarWidth,
      )}
    >
      <div
        className={classNames(
          "relative flex h-16 items-center px-3",
          showText ? "justify-between" : "justify-center",
        )}
        onMouseEnter={() => setIsLogoHovered(true)}
        onMouseLeave={() => setIsLogoHovered(false)}
      >
        <Link
          href="/ai-chat"
          prefetch
          onClick={mobile ? onMobileClose : undefined}
          className={classNames(
            "flex min-w-0 cursor-pointer items-center gap-2",
            showText ? "justify-start" : "justify-center",
          )}
        >
          <Image src="/favicon.ico" alt="DB Flow" width={24} height={24} priority />
          {showText && <span className="truncate text-lg font-bold text-primary-500">DB Flow</span>}
        </Link>

        {!mobile && showText && (
          <button
            type="button"
            aria-label="Collapse sidebar"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            onClick={() => setIsCollapsed(true)}
          >
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
        )}

        {mobile && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            onClick={onMobileClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {!mobile && !showText && isLogoHovered && (
          <button
            type="button"
            aria-label="Expand sidebar"
            className="absolute left-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            onClick={() => setIsCollapsed(false)}
          >
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
        )}
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-4">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              href={item.path === "/projects" && activeWorkspaceId ? `/projects?workspaceId=${activeWorkspaceId}` : item.path}
              prefetch
              onClick={() => {
                if (item.path === "/ai-chat") {
                  window.dispatchEvent(new CustomEvent("dbflow:new-ai-chat"));
                }
                if (mobile) onMobileClose?.();
              }}
              className={classNames(
                "flex h-8 w-full cursor-pointer items-center rounded-lg px-3 transition-colors",
                showText ? "gap-3" : "justify-center",
                active ? "bg-gray-100 text-gray-700 " : "text-gray-700 hover:bg-gray-50",
              )}
              title={!showText ? item.label : undefined}
            >
              <span className={classNames("flex-shrink-0", active ? "text-gray-700" : "")}>
                {item.icon}
              </span>
              {showText && <span className="truncate text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}

        {showText && recentChats.length > 0 && (
          <section className="mt-5 min-h-0 overflow-hidden">
            <button
              type="button"
              aria-expanded={recentsExpanded}
              onClick={() => setRecentsExpanded((current) => !current)}
              className="flex h-8 w-full cursor-pointer items-center justify-between px-3 text-left text-xs! font-medium text-gray-500 hover:text-gray-800"
            >
              <span>Recents</span>
              <ChevronDown className={classNames("h-4 w-4 transition-transform", !recentsExpanded && "-rotate-90")} />
            </button>

            {recentsExpanded && (
              <div className="mt-1 space-y-0.5">
                {recentChats.map((conversation) => {
                  const active = pathname === `/ai-chat/c/${conversation.id}`;
                  return (
                    <div
                      key={conversation.id}
                      className={classNames(
                        "group flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors",
                        active ? "bg-gray-100 text-gray-950" : "text-gray-700 hover:bg-gray-50",
                      )}
                    >
                      <Link
                        href={`/ai-chat/c/${conversation.id}`}
                        onClick={() => mobile && onMobileClose?.()}
                        className="min-w-0 flex-1 truncate font-medium"
                      >
                        {conversation.title || "New chat"}
                      </Link>
                      <Popconfirm
                        title="Delete conversation?"
                        description="This action cannot be undone."
                        onConfirm={() => void removeRecentChat(conversation.id)}
                        okText="Delete"
                        cancelText="Cancel"
                        okButtonProps={{ danger: true }}
                      >
                        <button
                          type="button"
                          aria-label="Delete chat"
                          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-200"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </Popconfirm>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </nav>

      <div className="p-2">
        <Dropdown menu={{ items: [] }} popupRender={() => accountPopup} trigger={["click"]} placement="topRight" open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <button
            type="button"
            className={classNames(
              "flex w-full cursor-pointer items-center rounded-lg px-2 py-2 text-left hover:bg-gray-50",
              showText ? "gap-3" : "justify-center",
            )}
          >
            {userData?.avatar ? (
              <Avatar src={userData.avatar} size={32} />
            ) : (
              <Avatar size={32} icon={<User className="h-4 w-4" />} />
            )}
            {showText && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {userData?.fullName || "User"}
                </span>
                <span className="block truncate text-xs text-gray-500">{activeWorkspace?.name || ""}</span>
              </span>
            )}
          </button>
        </Dropdown>
      </div>
    </aside>
  );

  const createTeamModal = (
    <Modal
      title="Create team workspace"
      open={createTeamOpen}
      okText="Create team"
      confirmLoading={creatingTeam}
      className="[&_.ant-modal-close]:!rounded-full [&_.ant-modal-close]:hover:!bg-gray-100 [&_.ant-modal-content]:!rounded-[20px] [&_.ant-modal-content]:!p-6 [&_.ant-modal-footer]:!mt-5 [&_.ant-modal-header]:!mb-5 [&_.ant-modal-title]:!text-xl [&_.ant-modal-title]:!font-semibold"
      styles={{ mask: { backgroundColor: "rgba(24, 24, 27, 0.34)" } }}
      cancelButtonProps={{ className: "!h-10 !rounded-xl !border-0 !bg-gray-100 !px-5 !shadow-none hover:!bg-gray-200" }}
      okButtonProps={{ disabled: teamName.trim().length < 2, className: "!h-10 !rounded-xl !border-0 !px-5 !shadow-none" }}
      onCancel={() => {
        setCreateTeamOpen(false);
        setTeamName("");
      }}
      onOk={() => {
        setCreatingTeam(true);
        void createTeamWorkspace(teamName.trim())
          .then((workspace) => {
            setWorkspaces((current) => [...current, workspace]);
            setActiveWorkspaceId(workspace.id);
            persistActiveWorkspaceId(workspace.id);
            setCreateTeamOpen(false);
            setTeamName("");
            window.dispatchEvent(new CustomEvent("dbflow:workspace-changed", {
              detail: { workspaceId: workspace.id },
            }));
            window.dispatchEvent(new CustomEvent("dbflow:open-settings", {
              detail: { tab: "workspace" },
            }));
          })
          .catch((error) => {
            notificationProvider.open({
              type: "error",
              message: "Failed to create team",
              description: error instanceof Error ? error.message : undefined,
            });
          })
          .finally(() => setCreatingTeam(false));
      }}
    >
      <Input
        value={teamName}
        maxLength={100}
        placeholder="Team name"
        onChange={(event) => setTeamName(event.target.value)}
        className="!h-11 !rounded-xl !border-0 !bg-gray-100 !px-4 !shadow-none"
      />
    </Modal>
  );

  if (mobile) {
    return (
      <>
        <div
          className={classNames(
            "fixed inset-0 z-40 cursor-pointer bg-black/30 transition-opacity lg:hidden",
            "duration-300 ease-out",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={onMobileClose}
        />
        <div
          className={classNames(
            "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:hidden",
            "ease-out will-change-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebar}
        </div>
        {createTeamModal}
      </>
    );
  }

  return (
    <div className="relative h-full">
      {sidebar}
      {createTeamModal}
    </div>
  );
}
