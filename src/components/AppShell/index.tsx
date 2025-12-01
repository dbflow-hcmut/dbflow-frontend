"use client";

import React, { PropsWithChildren, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import SplashScreen from "@/components/SplashScreen";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import { shouldShowLayout } from "@/utils/functions";

export default function AppShell({ children }: PropsWithChildren): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
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
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
