import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("access_token")?.value;
    
    if (!accessToken) {
      return NextResponse.json({ token: null }, { status: 401 });
    }
    
    return NextResponse.json({ token: accessToken });
  } catch {
    return NextResponse.json({ token: null }, { status: 500 });
  }
}

