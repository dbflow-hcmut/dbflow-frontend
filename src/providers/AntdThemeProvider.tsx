"use client";

import "@ant-design/v5-patch-for-react-19";

import { PropsWithChildren } from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { useTheme } from "next-themes";

export default function AntdThemeProvider({ children }: PropsWithChildren) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const algorithm = isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm;

  return (
    <ConfigProvider
      theme={{
        algorithm,
        token: {
          colorPrimary: "#42A5F5",
          fontFamily: '"Gilroy", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}


