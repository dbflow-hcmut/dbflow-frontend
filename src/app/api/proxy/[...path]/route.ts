import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE } from "@/api";

async function forward(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/api\/proxy/, "");
  const url = `${API_BASE}${path}${req.nextUrl.search}`;

  const access = (await cookies()).get("access_token")?.value;

  const headers: Record<string, string> = {
    accept: req.headers.get("accept") || "application/json",
  };
  
  const method = req.method;
  let requestBody: string | undefined;
  
  if (method !== "GET" && method !== "HEAD") {
    requestBody = await req.text();
    const contentType = req.headers.get("content-type");
    if (contentType) {
      headers["content-type"] = contentType;
    }
  }
  
  if (access) headers["cookie"] = `access_token=${access}`;

  const init: RequestInit = { 
    method, 
    headers, 
    cache: "no-store",
    ...(requestBody && { body: requestBody }),
  };

  function clearAuthAndRedirect() {
    const res = NextResponse.redirect(new URL(`/auth/signin`, req.nextUrl.origin));
    const cookieOpts = { maxAge: 0, path: "/" } as const;
    res.cookies.set("access_token", "", cookieOpts);
    res.cookies.set("authjs.session-token", "", {
      ...cookieOpts,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  }

  let beRes: Response;
  try {
    beRes = await fetch(url, init);
  } catch {
    return clearAuthAndRedirect();
  }

  if (beRes.status === 401) {
    return clearAuthAndRedirect();
  }

  if (beRes.status === 404) {
    return NextResponse.redirect(new URL(`/not-found`, req.nextUrl.origin));
  }

  const contentType =
    beRes.headers.get("content-type") || "application/json";
  if (contentType.includes("text/event-stream") && beRes.body) {
    return new NextResponse(beRes.body, {
      status: beRes.status,
      headers: {
        "content-type": contentType,
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  }

  const responseBody = await beRes.text();
  return new NextResponse(responseBody, {
    status: beRes.status,
    headers: {
      "content-type": contentType,
    },
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;

