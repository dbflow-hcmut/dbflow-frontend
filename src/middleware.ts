import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isAuthRoute = pathname.startsWith("/auth");
  const isApiRoute = pathname.startsWith("/api");
  const isNotFoundRoute = pathname.startsWith("/not-found");
  const isPublicRoute = pathname.startsWith("/_next");
  const isSharedDocsRoute = pathname.startsWith("/shared-docs");

  if (pathname === "/") {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL("/ai-chat", req.url));
    }
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/ai-chat", req.url));
  }

  if (!isLoggedIn && !isAuthRoute && !isApiRoute && !isNotFoundRoute && !isPublicRoute && !isSharedDocsRoute) {
    const signInUrl = new URL("/auth/signin", req.url);
    const callbackUrl = pathname + req.nextUrl.search;
    signInUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|Gilroy/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ttf|woff|woff2|otf|css|js)$).*)",
  ],
};

