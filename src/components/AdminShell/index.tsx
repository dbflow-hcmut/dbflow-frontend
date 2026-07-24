"use client";

import React, { PropsWithChildren, useEffect, useState } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import { ConfigProvider, theme as antdTheme } from "antd";
import { Menu } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import LoadingIndicator from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";

export default function AdminShell({ children }: PropsWithChildren): React.JSX.Element {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role?.toLowerCase() === "admin";

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      router.replace("/not-found");
    }
  }, [isAdmin, isLoading, router]);

  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: "#42A5F5",
          colorBgBase: "#000000",
          colorBgContainer: "#1A1C24",
          colorBgElevated: "#20232C",
          colorBorder: "#343844",
          colorBorderSecondary: "#272A36",
          colorText: "#E5E7EB",
          colorTextSecondary: "#A1A1AA",
          borderRadius: 12,
        },
        components: {
          DatePicker: {
            activeBg: "#1A1C24",
            hoverBg: "#22252E",
          },
          Select: {
            optionActiveBg: "#292D38",
            optionSelectedBg: "#173A55",
            optionSelectedColor: "#F3F4F6",
            selectorBg: "#1A1C24",
          },
          Modal: {
            contentBg: "#20232C",
            headerBg: "#20232C",
            titleColor: "#F3F4F6",
          },
          Table: {
            headerBg: "#232630",
            headerColor: "#9CA3AF",
            borderColor: "#272A36",
            rowHoverBg: "#22252E",
          },
        },
      }}
    >
      {isLoading ? (
        <div className="flex h-screen items-center justify-center bg-[#000000]">
          <LoadingIndicator label="Checking admin access" />
        </div>
      ) : !isAdmin ? (
        <div className="flex h-screen items-center justify-center bg-[#000000]">
          <LoadingIndicator label="Redirecting" />
        </div>
      ) : (
      <div className="dark flex h-screen overflow-hidden bg-[#000000] text-gray-100">
        <div className="hidden lg:block">
          <AdminSidebar />
        </div>
        <AdminSidebar
          mobile
          mobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
        <button
          type="button"
          aria-label="Open sidebar"
          className="fixed left-4 top-4 z-30 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-[#272A36] bg-[#1A1C24] text-gray-200 shadow-sm hover:bg-[#252834] lg:hidden"
          onClick={() => setIsMobileSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <main className="flex-1 overflow-auto bg-[#000000] text-gray-100">{children}</main>
      </div>
      )}
    </ConfigProvider>
  );
}
