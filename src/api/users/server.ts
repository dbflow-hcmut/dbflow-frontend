import { serverFetchJSON } from "@/lib/serverFetch";
import { PROXY_USERS_ME } from "@/api";
import { UserResponse } from "@/types/user.type";

export async function getUserMeServer(): Promise<UserResponse | null> {
    try {
        const data = await serverFetchJSON(PROXY_USERS_ME);
        return data as UserResponse | null;
    } catch (error) {
        if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.includes('NEXT_REDIRECT')) {
            throw error;
        }
        console.error("Error fetching user:", error);
        return null;
    }
}