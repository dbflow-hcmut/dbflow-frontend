"use client";

import { createContext, useContext, ReactNode, useMemo } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
import { UserResponse } from "@/types/user.type";
import { PROXY_USERS_ME } from "@/api";
import { getUserMe } from "@/api/users/client";

interface AuthContextType {
    user: UserResponse | null;
    isLoading: boolean;
    error: Error | null;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const { status } = useSession();
    const isAuthenticated = status === "authenticated";

    const { data: user, error, isLoading } = useSWR<UserResponse>(
        isAuthenticated ? PROXY_USERS_ME : null,
        async () => {
            return await getUserMe();
        },
        {
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        }
    );

    const value = useMemo(
        () => ({
            user: user ?? null,
            isLoading: status === "loading" || isLoading,
            error: error ?? null,
            isAuthenticated,
        }),
        [user, status, isLoading, error, isAuthenticated]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
