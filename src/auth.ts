import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { API_BASE, PROXY_USERS_ME } from "./api";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
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
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && user?.email) {
        try {
          const res = await fetch(`${API_BASE}/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: account.id_token }),
          });

          if (res.ok) {
            const data = await res.json();
            const backendData = data?.data || data;
            token.id = backendData.user.id;
            token.role = backendData.user.role;

            const cookieStore = await cookies();
            cookieStore.set("access_token", backendData.access_token, {
              httpOnly: true,
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
              path: "/",
              maxAge: 7 * 24 * 60 * 60,
            });
          }
        } catch (error) {
          console.error("Google backend sync error:", error);
        }
      } else if (user) {
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

