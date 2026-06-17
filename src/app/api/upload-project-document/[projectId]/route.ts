import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE } from "@/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const access = (await cookies()).get("access_token")?.value;
  const formData = await req.formData();

  const headers: Record<string, string> = {};
  if (access) headers.cookie = `access_token=${access}`;

  const res = await fetch(`${API_BASE}/projects/${projectId}/documents/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || "Upload failed" }, { status: res.status });
  }

  const raw = (await res.json()) as { data?: { key: string; url: string }; key?: string; url?: string };
  return NextResponse.json(raw.data ?? raw, { status: 200 });
}
