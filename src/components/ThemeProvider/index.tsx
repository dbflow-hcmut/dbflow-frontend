"use client";

import React, { PropsWithChildren } from "react";
import { ThemeProvider } from "next-themes";

export default function AppThemeProvider({ children }: PropsWithChildren): React.JSX.Element {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}


