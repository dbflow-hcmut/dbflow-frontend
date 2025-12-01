import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    cookieStore.delete("access_token");
    cookieStore.delete("authjs.session-token");
    
    const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/";
    return NextResponse.redirect(new URL(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`, req.url));
}

