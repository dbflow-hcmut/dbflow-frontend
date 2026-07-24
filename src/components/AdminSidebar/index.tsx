"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Repeat2,
  PanelLeft,
  ArrowLeft,
  Settings,
  User,
  LogOut,
  X,
} from "lucide-react";
import { Avatar, Dropdown } from "antd";
import classNames from "classnames";
import { getUserMe } from "@/api/users/client";
import type { UserResponse } from "@/types/user.type";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

type AdminSidebarProps = {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  mobile?: boolean;
};

const navItems: NavItem[] = [
  {
    label: "Overview",
    icon: <LayoutDashboard className="h-5 w-5" />,
    path: "/admin",
  },
  {
    label: "Users",
    icon: <Users className="h-5 w-5" />,
    path: "/admin/users",
  },
  {
    label: "Plans & pricing",
    icon: <CreditCard className="h-5 w-5" />,
    path: "/admin/plans",
  },
  {
    label: "Subscriptions",
    icon: <Repeat2 className="h-5 w-5" />,
    path: "/admin/subscriptions",
  },
  {
    label: "Billing",
    icon: <BarChart3 className="h-5 w-5" />,
    path: "/admin/billing",
  },
];

export default function AdminSidebar({ mobileOpen = false, onMobileClose, mobile = false }: AdminSidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [userData, setUserData] = useState<UserResponse | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

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

  const isActive = (path: string) => path === "/admin" ? pathname === path : pathname === path || pathname.startsWith(path + "/");
  const showText = mobile || !isCollapsed;
  const sidebarWidth = mobile ? "w-72" : isCollapsed ? "w-16" : "w-72";

  const accountPopup = (
    <div className="w-[272px] rounded-xl border border-[#272A36] bg-[#1A1C24] p-2 text-gray-200 shadow-2xl">
      <div className="truncate px-3 pb-2 pt-1.5 text-xs font-medium text-gray-400">{userData?.email || "Account"}</div>
      <div className="mx-2 my-2 border-t border-[#272A36]" />
      <Link
        href="/projects"
        className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-200! !text-gray-200 transition-colors hover:bg-[#252834] hover:text-white"
        onClick={() => setAccountMenuOpen(false)}
      >
        <ArrowLeft className="h-[18px] w-[18px]" />
        <span>Back to app</span>
      </Link>
      <button
        type="button"
        className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-200 transition-colors hover:bg-[#252834] hover:text-white"
        onClick={() => {
          setAccountMenuOpen(false);
          window.dispatchEvent(new CustomEvent("dbflow:open-settings"));
        }}
      >
        <Settings className="h-[18px] w-[18px]" />
        <span>Settings</span>
      </button>
      <div className="mx-2 my-2 border-t border-[#272A36]" />
      <button
        type="button"
        className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-200 transition-colors hover:bg-[#252834] hover:text-white"
        onClick={() => {
          localStorage.removeItem("user_data");
          window.location.href = "/api/auth/logout";
        }}
      >
        <LogOut className="h-[18px] w-[18px]" />
        <span>Log out</span>
      </button>
    </div>
  );

  const sidebar = (
    <aside
      className={classNames(
        "h-full bg-[#1A1C24] text-gray-100 flex flex-col transition-all duration-200 overflow-hidden",
        !mobile && "border-r border-[#272A36]",
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
          href="/admin"
          prefetch
          onClick={mobile ? onMobileClose : undefined}
          className={classNames(
            "flex min-w-0 cursor-pointer items-center gap-2",
            showText ? "justify-start" : "justify-center",
          )}
        >
          <Image src="/favicon.ico" alt="DB Flow" width={24} height={24} priority />
          {showText && <span className="truncate text-lg font-bold text-white">DB Flow Admin</span>}
        </Link>

        {!mobile && showText && (
          <button
            type="button"
            aria-label="Collapse sidebar"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:bg-[#252834] hover:text-white"
            onClick={() => setIsCollapsed(true)}
          >
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
        )}

        {mobile && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-gray-400 hover:bg-[#252834] hover:text-white"
            onClick={onMobileClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {!mobile && !showText && isLogoHovered && (
          <button
            type="button"
            aria-label="Expand sidebar"
            className="absolute left-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[#252834] text-gray-300 hover:bg-[#2E3242] hover:text-white"
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
              href={item.path}
              prefetch
              onClick={() => {
                if (mobile) onMobileClose?.();
              }}
              className={classNames(
                "flex h-8 w-full cursor-pointer items-center rounded-lg px-3 transition-colors",
                showText ? "gap-3" : "justify-center",
                active ? "bg-[#252834] text-white font-medium" : "text-gray-400 hover:bg-[#252834]/70 hover:text-gray-200",
              )}
              title={!showText ? item.label : undefined}
            >
              <span className={classNames("flex-shrink-0", active ? "text-white" : "text-gray-400")}>
                {item.icon}
              </span>
              {showText && <span className="truncate text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-2">
        <Dropdown menu={{ items: [] }} popupRender={() => accountPopup} trigger={["click"]} placement="topRight" open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <button
            type="button"
            className={classNames(
              "flex w-full cursor-pointer items-center rounded-lg px-2 py-2 text-left hover:bg-[#252834]/70",
              showText ? "gap-3" : "justify-center",
            )}
          >
            {userData?.avatar ? (
              <Avatar src={userData.avatar} size={32} />
            ) : (
              <Avatar size={32} icon={<User className="h-4 w-4 text-gray-300" />} className="bg-[#252834]" />
            )}
            {showText && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-200">
                  {userData?.fullName || "User"}
                </span>
                <span className="block truncate text-xs text-gray-400">Administrator</span>
              </span>
            )}
          </button>
        </Dropdown>
      </div>
    </aside>
  );

  if (mobile) {
    return (
      <>
        <div
          className={classNames(
            "fixed inset-0 z-40 cursor-pointer bg-black/60 transition-opacity lg:hidden",
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
      </>
    );
  }

  return <div className="relative h-full">{sidebar}</div>;
}
