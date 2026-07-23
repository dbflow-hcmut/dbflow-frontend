export type UserResponse = {
    id: string;
    email: string;
    fullName: string;
    firstName: string;
    lastName: string;
    phone: string;
    bio: string;
    avatar: string;
    role?: string;
};

export type UpdateProfileDto = {
    firstName: string;
    lastName?: string;
    phone?: string;
    bio?: string;
    avatarKey?: string;
};

export type ChangePasswordDto = {
    currentPassword: string;
    newPassword: string;
};