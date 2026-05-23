import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_BASE } from "@/api";

/**
 * Dedicated proxy for multipart/form-data file uploads.
 * The generic proxy (/api/proxy) uses req.text() which corrupts binary,
 * so uploads need this separate route that forwards FormData as-is.
 *
 * Forwards to POST /s3/upload → backend uploads to S3 and returns { key, url }
 * where url is a presigned S3 read URL (1h), used by AI instead of base64.
 */
export async function POST(req: NextRequest) {
  const access = (await cookies()).get("access_token")?.value;

  const formData = await req.formData();

  const headers: Record<string, string> = {};
  if (access) headers["cookie"] = `access_token=${access}`;
  // Do NOT set Content-Type — fetch sets it automatically with correct multipart boundary

  const res = await fetch(`${API_BASE}/s3/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text || "Upload failed" }, { status: res.status });
  }

  const raw = await res.json() as { data?: { key: string; url: string }; key?: string; url?: string };
  // Backend wraps response in { meta, data } via interceptor
  const data = raw.data ?? raw;
  return NextResponse.json(data, { status: 200 });
}
