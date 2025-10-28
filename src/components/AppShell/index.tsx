"use client";

import React, { PropsWithChildren, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import SplashScreen from "@/components/SplashScreen";

export default function AppShell({ children }: PropsWithChildren): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !resolvedTheme) {
    return <SplashScreen />;
  }

  return <>{children}</>;
}


