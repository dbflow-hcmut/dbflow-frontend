import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export async function serverFetchJSON<TData>(
    input: string | URL,
    init?: RequestInit
): Promise<TData | null> {

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

    const contentType = res.headers.get("content-type") || "";

    const getCallbackUrl = (url: string | URL): string => {
        const urlStr = url.toString();
        const callback = urlStr.replace(/^.*\/api\/proxy/, "") || "/";
        return callback;
    };

    if (contentType.includes("text/html")) {
        const callback = getCallbackUrl(input);
        redirect(`/api/auth/logout?callbackUrl=${encodeURIComponent(callback)}`);
    }

    if (res.status === 401 || (res.redirected && res.url.includes("/auth/signin"))) {
        const callback = getCallbackUrl(input);
        redirect(`/api/auth/logout?callbackUrl=${encodeURIComponent(callback)}`);
    }

    const data = await res.json().catch(() => ({}));
    return (data?.data ?? null) as TData | null;
}
