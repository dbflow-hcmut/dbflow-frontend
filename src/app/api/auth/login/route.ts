import { API_LOGIN } from "@/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const beRes = await fetch(API_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });

    const beData = await beRes.json().catch(() => ({}));
    if (!beRes.ok || beData?.meta?.statusCode !== 200) {
      return NextResponse.json({ error: "Login failed" }, { status: beRes.status || 400 });
    }

    const setCookie = beRes.headers.get("set-cookie") || "";
    const match = setCookie.match(/access_token=([^;]+);/);
    const token = match?.[1];

    const res = NextResponse.json({ success: true, user: beData?.data?.user });
    if (token) {
      res.cookies.set("access_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60,
      });
    }
    return res;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


