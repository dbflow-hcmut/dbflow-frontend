"use client";

export async function apiFetch<TData>(
    url: string,
    init?: RequestInit
): Promise<{ data: TData | null; response: Response }> {
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
    
    // Check if response is not OK and throw error
    if (!res.ok) {
        // Try to get error message from different possible locations
        const rawMessage = json?.meta?.message || json?.message;
        const errorMessage = Array.isArray(rawMessage) 
            ? rawMessage.join(', ') 
            : (rawMessage || 'Request failed');
        throw new Error(errorMessage);
    }
    
    const payload = (json?.data ?? null) as TData | null;
    return { data: payload, response: res };
}

export async function apiGet<T>(url: string, options: RequestInit = {}): Promise<T> {
    const { data } = await apiFetch<T>(url, { ...options, method: "GET" });
    return data as T;
}

export async function apiPost<T, B = unknown>(
    url: string,
    body: B,
    options: RequestInit = {}
): Promise<T> {
    const { data } = await apiFetch<T>(url, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers as Record<string, string>),
        },
        body: JSON.stringify(body),
    });
    return data as T;
}

export async function apiPut<T, B = unknown>(
    url: string,
    body: B,
    options: RequestInit = {}
): Promise<T> {
    const { data } = await apiFetch<T>(url, {
        ...options,
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers as Record<string, string>),
        },
        body: JSON.stringify(body),
    });
    return data as T;
}

export async function apiPatch<T, B = unknown>(
    url: string,
    body: B,
    options: RequestInit = {}
): Promise<T> {
    const { data } = await apiFetch<T>(url, {
        ...options,
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers as Record<string, string>),
        },
        body: JSON.stringify(body),
    });
    return data as T;
}

export async function apiDelete<T, B = unknown>(
    url: string,
    body?: B,
    options: RequestInit = {}
): Promise<T> {
    const reqInit: RequestInit = { ...options, method: "DELETE" };
    if (typeof body !== "undefined") {
        reqInit.headers = {
            "Content-Type": "application/json",
            ...(options.headers as Record<string, string>),
        };
        reqInit.body = JSON.stringify(body);
    }
    const { data } = await apiFetch<T>(url, reqInit);
    return data as T;
}


