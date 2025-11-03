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
  if (access) headers["cookie"] = `access_token=${access}`;

  const method = req.method;
  const init: RequestInit = { method, headers, cache: "no-store" };
  if (method !== "GET" && method !== "HEAD") {
    init.body = req.body;
  }

  const beRes = await fetch(url, init);

  if (beRes.status === 401) {
    const res = NextResponse.redirect(new URL(`/auth/signin`, req.nextUrl.origin));
    res.cookies.delete("access_token");
    res.cookies.delete("authjs.session-token");
    return res;
  }

  const body = await beRes.text();
  return new NextResponse(body, {
    status: beRes.status,
    headers: {
      "content-type": beRes.headers.get("content-type") || "application/json",
    },
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;


