"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  User,
  LogOut,
  X,
  Plus,
  SlidersHorizontal,
  CreditCard,
} from "lucide-react";
import { Avatar, Dropdown, Input, Modal, Select } from "antd";
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
    label: "AI Chat",
    icon: <Sparkles className="h-5 w-5" />,
    path: "/ai-chat",
  },
  {
    label: "Projects",
    icon: <LayoutGrid className="h-5 w-5" />,
    path: "/projects",
  },
  {
    label: "Plans",
    icon: <CreditCard className="h-5 w-5" />,
    path: "/pricing",
  },
  {
    label: "Settings",
    icon: <Settings className="h-5 w-5" />,
    path: "/settings",
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
    void getWorkspaces().then((items) => {
      setWorkspaces(items);
      const queryWorkspace = searchParams.get("workspaceId");
      const storedWorkspace = localStorage.getItem("active_workspace_id");
      const selected =
        items.find((item) => item.id === queryWorkspace) ??
        items.find((item) => item.id === storedWorkspace) ??
        items.find((item) => item.type === "personal") ??
        items[0];
      if (selected) {
        setActiveWorkspaceId(selected.id);
        localStorage.setItem("active_workspace_id", selected.id);
      }
    });
  }, [mobile, mobileOpen, searchParams]);

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");
  const showText = mobile || !isCollapsed;
  const sidebarWidth = mobile ? "w-72" : isCollapsed ? "w-16" : "w-56";

  const userMenuItems = useMemo(
    () => [
      {
        key: "settings",
        label: (
          <Link href="/settings" prefetch className="flex cursor-pointer items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        ),
      },
      {
        type: "divider" as const,
      },
      {
        key: "logout",
        label: (
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 text-left"
            onClick={() => {
              localStorage.removeItem("user_data");
              window.location.href = "/api/auth/logout";
            }}
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        ),
      },
    ],
    [],
  );

  const sidebar = (
    <aside
      className={classNames(
        "h-full bg-white flex flex-col transition-all duration-200 overflow-hidden",
        !mobile && "border-r border-gray-200",
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
          {showText && <span className="truncate text-lg font-bold text-gray-900">DB Flow</span>}
        </Link>

        {!mobile && showText && (
          <button
            type="button"
            aria-label="Collapse sidebar"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            onClick={() => setIsCollapsed(true)}
          >
            <PanelLeftClose className="h-4 w-4" />
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
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
        {showText && workspaces.length > 0 && (
          <div className="mb-3 px-1">
            <Select
              className="w-full"
              size="small"
              value={activeWorkspaceId}
              options={workspaces.map((workspace) => ({
                value: workspace.id,
                label: workspace.name,
              }))}
              onChange={(workspaceId) => {
                setActiveWorkspaceId(workspaceId);
                localStorage.setItem("active_workspace_id", workspaceId);
                if (pathname.startsWith("/projects")) {
                  const params = new URLSearchParams(searchParams.toString());
                  params.set("workspaceId", workspaceId);
                  params.set("page", "1");
                  router.push(`/projects?${params.toString()}`);
                }
              }}
            />
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                onClick={() => setCreateTeamOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New team
              </button>
              {activeWorkspaceId && (
                <Link
                  href={`/workspaces/${activeWorkspaceId}/settings`}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Manage
                </Link>
              )}
            </div>
          </div>
        )}
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              prefetch
              onClick={() => {
                if (item.path === "/ai-chat") {
                  window.dispatchEvent(new CustomEvent("dbflow:new-ai-chat"));
                }
                if (mobile) onMobileClose?.();
              }}
              className={classNames(
                "flex h-11 w-full cursor-pointer items-center rounded-lg px-3 transition-colors",
                showText ? "gap-3" : "justify-center",
                active ? "bg-gray-100 text-primary-500" : "text-gray-700 hover:bg-gray-50",
              )}
              title={!showText ? item.label : undefined}
            >
              <span className={classNames("flex-shrink-0", active ? "text-primary-500" : "")}>
                {item.icon}
              </span>
              {showText && <span className="truncate text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-2">
        <Dropdown menu={{ items: userMenuItems }} trigger={["click"]} placement="topRight">
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
                <span className="block truncate text-xs text-gray-500">{userData?.email || ""}</span>
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
      okButtonProps={{ disabled: teamName.trim().length < 2 }}
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
            localStorage.setItem("active_workspace_id", workspace.id);
            setCreateTeamOpen(false);
            setTeamName("");
            router.push(`/workspaces/${workspace.id}/settings`);
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
