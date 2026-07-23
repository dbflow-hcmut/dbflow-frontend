import { ROUTES_WITH_LAYOUT, EXACT_MATCH_ROUTES } from "./constants";

export function shouldShowLayout(pathname: string | null): boolean {
    if (!pathname) return false;

    return ROUTES_WITH_LAYOUT.some((route) => {
        if (EXACT_MATCH_ROUTES.includes(route)) {
            return pathname === route;
        }
        return pathname === route || pathname.startsWith(route + "/");
    });
}

export function formatDateTimeVN(input: string | number | Date): string {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(input));
  }

export function formatBytes(bytes: number | null | undefined): string {
    if (bytes == null) return "Unlimited";
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % 1024 ** 3 === 0 ? 0 : 1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes % 1024 ** 2 === 0 ? 0 : 1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

export const getToken = async () => {
  try {
      const response = await fetch('/api/auth/token', {
          credentials: 'include',
      });
      if (!response.ok) {
          return '';
      }
      const data = await response.json();
      return data.token || '';
  } catch {
      return '';
  }
};