import { ROUTES_WITH_LAYOUT } from "./constants";

export function shouldShowLayout(pathname: string | null): boolean {
    if (!pathname) return false;

    return ROUTES_WITH_LAYOUT.some((route) => pathname === route);
}

export function formatDateTimeVN(input: string | number | Date): string {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(input));
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