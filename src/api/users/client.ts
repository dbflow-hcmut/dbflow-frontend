import { apiGet, apiPut, apiPost } from "@/lib/clientFetch";
import { PROXY_USERS_ME, PROXY_USERS_PROFILE, PROXY_USERS_CHANGE_PASSWORD } from "@/api";
import { UserResponse, UpdateProfileDto, ChangePasswordDto } from "@/types/user.type";

export async function getUserMe() {
    const url = PROXY_USERS_ME;
    const res = await apiGet<UserResponse>(url);
    return res;
}

export async function updateUserProfile(data: UpdateProfileDto) {
    const url = PROXY_USERS_PROFILE;
    const res = await apiPut<UserResponse, UpdateProfileDto>(url, data);
    return res;
}

export async function changeUserPassword(data: ChangePasswordDto) {
    const url = PROXY_USERS_CHANGE_PASSWORD;
    const res = await apiPost<{ message: string }, ChangePasswordDto>(url, data);
    return res;
} 