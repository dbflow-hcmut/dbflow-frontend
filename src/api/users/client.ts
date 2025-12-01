import useSWR from "swr";
import { apiGet } from "@/lib/clientFetch";
import { PROXY_USERS_ME } from "@/api";
import { UserResponse } from "@/types/user.type";

export async function getUserMe() {
    const url = PROXY_USERS_ME;
    const res = await apiGet<UserResponse>(url);
    return res;
}

export function useUserMe() {
    const { data, isLoading, error } = useSWR<UserResponse>(
        PROXY_USERS_ME,
        async () => {
            return await getUserMe();
        },
        { revalidateOnFocus: false }
    );

    return {
        data: data ?? null,
        isLoading,
        error: error as Error | undefined,
    };
}

