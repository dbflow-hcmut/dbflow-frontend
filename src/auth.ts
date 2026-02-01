import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { PROXY_USERS_ME } from "./api";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize() {
        try {
          const cookieStore = await cookies();
          const access = cookieStore.get("access_token")?.value;
          if (!access) return null;

          const res = await fetch(PROXY_USERS_ME, {
            method: "GET",
            headers: {
              accept: "application/json",
              cookie: `access_token=${access}`,
            },
            cache: "no-store",
          });

          if (!res.ok) return null;
          const payload = await res.json().catch(() => ({}));
          const user = payload?.data?.data?.user || payload?.data;

          if (user?.id && user?.email) {
            return {
              id: user.id,
              email: user.email,
              role: user.role ?? "user",
            };
          }
          return null;
        } catch (error) {
          console.error("Authorize error:", error);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      },
    },
  },
});

