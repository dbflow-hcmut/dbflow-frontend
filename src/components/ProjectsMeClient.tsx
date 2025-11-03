"use client";

import { PROXY_USERS_ME } from "@/api";
import { useApiJson } from "@/lib/swr";

export default function ProjectsMeClient() {
    const { data: result } = useApiJson<{ id: string; email: string; name?: string }>(
        PROXY_USERS_ME,
        { method: "GET" }
    );

    console.log(result?.email);

    return (
        <div className="p-3">
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(result ?? { ok: false, status: 0, data: null }, null, 2)}
            </pre>
        </div>
    );
}


