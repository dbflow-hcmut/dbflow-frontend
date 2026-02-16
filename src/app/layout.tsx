import "@ant-design/v5-patch-for-react-19";
import "antd/dist/reset.css";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import AntdThemeProvider from "@/providers/AntdThemeProvider";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import AppShell from "@/components/AppShell";
import NotificationRoot from "@/providers/notification";
import SessionProvider from "@/providers/SessionProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "DB Flow - Database Design Tool",
  description: "DB Flow - The collaborative database design tool",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.ico" />
        {/* <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=localStorage.getItem('theme');if(d&&t==='light'){localStorage.removeItem('theme');}}catch{}`,
          }}
        /> */}
        <link rel="preload" as="font" href="/Gilroy/400-Gilroy-Regular.ttf" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" as="font" href="/Gilroy/500-Gilroy-Medium.ttf" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" as="font" href="/Gilroy/600-Gilroy-Semibold.ttf" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" as="font" href="/Gilroy/700-Gilroy-Bold.ttf" type="font/ttf" crossOrigin="anonymous" />
      </head>
      <body className="antialiased min-h-screen bg-bg-light text-text-light" suppressHydrationWarning>
        <SessionProvider>
          <AuthProvider>
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
              <AntdRegistry>
                <AntdThemeProvider>
                  <NotificationRoot />
                  <AppShell>
                    {children}
                  </AppShell>
                </AntdThemeProvider>
              </AntdRegistry>
            </ThemeProvider>
          </AuthProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
