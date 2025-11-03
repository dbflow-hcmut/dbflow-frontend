export async function serverFetchJSON(input: string | URL, init?: RequestInit) {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const access = cookieStore.get("access_token")?.value;

    const res = await fetch(input, {
        ...init,
        headers: {
            accept: "application/json",
            ...(init?.headers as Record<string, string>),
            ...(access ? { cookie: `access_token=${access}` } : {}),
        },
        cache: init?.cache ?? "no-store",
    });

    const data = await res.json().catch(() => ({}));
    const result = data?.data ?? null;
    return result;
}


