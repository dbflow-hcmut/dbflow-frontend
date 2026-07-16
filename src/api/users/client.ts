import { apiGet, apiPut, apiPost } from "@/lib/clientFetch";
import { PROXY_USERS_ME, PROXY_USERS_PROFILE, PROXY_USERS_CHANGE_PASSWORD, PROXY_S3_AVATAR_PRESIGNED_UPLOAD } from "@/api";
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

export async function uploadUserAvatar(file: File): Promise<string> {
    const presignedRes = await apiPost<
        { key: string; uploadUrl: string; url: string },
        { fileName: string; mimeType: string; size: number }
    >(PROXY_S3_AVATAR_PRESIGNED_UPLOAD, {
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
    });

    await fetch(presignedRes.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
    });

    return presignedRes.key;
}