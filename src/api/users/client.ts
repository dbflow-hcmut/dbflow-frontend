import useSWR from "swr";
import { apiGet } from "@/lib/clientFetch";
import { PROXY_USERS_ME } from "@/api";
import { UserResponse } from "@/types/user.type";

export async function getUserMe() {
    const url = PROXY_USERS_ME;
    const res = await apiGet<UserResponse>(url);
    return res;
} 