"use client";

import React, { PropsWithChildren, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import SplashScreen from "@/components/SplashScreen";
import Sidebar from "@/components/Sidebar";
import { shouldShowLayout } from "@/utils/functions";

export default function AppShell({ children }: PropsWithChildren): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !resolvedTheme) {
    return <SplashScreen />;
  }

  const showLayout = shouldShowLayout(pathname);

  if (!showLayout) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex h-14 items-center gap-3 bg-white px-4 lg:hidden">
        <button
          type="button"
          aria-label="Open sidebar"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-gray-700 hover:bg-gray-100"
          onClick={() => setIsMobileSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/ai-chat" prefetch className="flex cursor-pointer items-center gap-2">
          <Image src="/favicon.ico" alt="DB Flow" width={24} height={24} priority />
          <span className="text-lg font-bold text-gray-900">DB Flow</span>
        </Link>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <Sidebar
          mobile
          mobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
        <main className="flex-1 overflow-auto bg-[#FCFCFC]">
          {children}
        </main>
      </div>
    </div>
  );
}
