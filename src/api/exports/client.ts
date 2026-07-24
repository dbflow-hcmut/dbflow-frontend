"use client";

import { PROXY_PROJECT_EXPORT_USAGE } from "@/api";
import { apiPost } from "@/lib/clientFetch";

export type ClientExportKind = "png" | "svg" | "pdf" | "json" | "sql" | "html";

export async function trackExportUsage(projectId: string, kind: ClientExportKind) {
  return apiPost(PROXY_PROJECT_EXPORT_USAGE(projectId), {
    operation_id: crypto.randomUUID(),
    kind,
  });
}
