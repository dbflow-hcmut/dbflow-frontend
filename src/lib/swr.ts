"use client";

import useSWR from "swr";

export type ApiResponse<TData> = {
    ok: boolean;
    status: number;
    data: TData | null;
};

export function useApiJson<TData>(
    key: string | null,
    init?: RequestInit
): { data: TData | null; isLoading: boolean; error: Error } {
    const fetcher = async (url: string): Promise<TData | null> => {
        const res = await fetch(url, {
            ...init,
            headers: { accept: "application/json", ...(init?.headers as Record<string, string>) },
            credentials: "include",
            cache: "no-store",
        });
        if (res.status === 401 || (res.redirected && res.url.includes("/auth/signin"))) {
            const callback = typeof window !== "undefined" ? window.location.pathname : "/";
            window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(callback)}`;
            throw new Error("Unauthorized");
        }
        const json = (await res.json().catch(() => (null)));
        const payload = (json?.data ?? null) as TData | null;
        return payload;
    };

    const { data, isLoading, error } = useSWR<TData | null>(key, fetcher, { revalidateOnFocus: false });
    return { data: data ?? null, isLoading, error };
}


