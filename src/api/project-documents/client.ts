import useSWR from "swr";
import {
  FE_UPLOAD_PROJECT_DOCUMENT,
  PROXY_PROJECT_DOCUMENT_DETAIL,
  PROXY_PROJECT_DOCUMENT_DOWNLOAD_URL,
  PROXY_PROJECT_DOCUMENTS,
} from "@/api";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/clientFetch";

export type ProjectDocumentSource = "hub_upload" | "ai_chat_upload";
export type ProjectDocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface ProjectDocument {
  id: string;
  projectId: string;
  uploadedBy: string;
  title: string;
  description: string | null;
  fileName: string;
  s3Key: string;
  mimeType: string;
  size: number;
  source: ProjectDocumentSource;
  status: ProjectDocumentStatus;
  createdAt: string;
  updatedAt: string;
  uploader?: {
    id: string;
    fullName?: string;
    email?: string;
  };
}

export interface CreateProjectDocumentInput {
  title: string;
  description?: string;
  fileName: string;
  s3Key: string;
  mimeType: string;
  size: number;
  source?: ProjectDocumentSource;
}

export function useProjectDocuments(
  projectId: string | null,
  filters?: { keyword?: string },
) {
  const key = projectId
    ? ["project-documents", projectId, filters?.keyword ?? ""]
    : null;

  const { data, error, isLoading, mutate } = useSWR<ProjectDocument[]>(
    key,
    async () => {
      const url = new URL(PROXY_PROJECT_DOCUMENTS(projectId!), window.location.origin);
      if (filters?.keyword) url.searchParams.set("keyword", filters.keyword);
      return apiGet<ProjectDocument[]>(url.toString());
    },
    { revalidateOnFocus: false },
  );

  return {
    data: data ?? [],
    error: error as Error | undefined,
    isLoading,
    mutate,
  };
}

export async function uploadProjectDocumentFile(projectId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(FE_UPLOAD_PROJECT_DOCUMENT(projectId), {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to upload document");
  }

  return (await res.json()) as { key: string; url: string };
}

export async function createProjectDocument(
  projectId: string,
  input: CreateProjectDocumentInput,
) {
  return apiPost<ProjectDocument, CreateProjectDocumentInput>(
    PROXY_PROJECT_DOCUMENTS(projectId),
    input,
  );
}

export async function updateProjectDocument(
  projectId: string,
  documentId: string,
  input: Partial<Pick<ProjectDocument, "title" | "description">>,
) {
  return apiPatch<ProjectDocument, typeof input>(
    PROXY_PROJECT_DOCUMENT_DETAIL(projectId, documentId),
    input,
  );
}

export async function deleteProjectDocument(projectId: string, documentId: string) {
  return apiDelete<{ success: boolean }>(PROXY_PROJECT_DOCUMENT_DETAIL(projectId, documentId));
}

export async function getProjectDocumentDownloadUrl(projectId: string, documentId: string) {
  const result = await apiGet<{ url: string }>(
    PROXY_PROJECT_DOCUMENT_DOWNLOAD_URL(projectId, documentId),
  );
  return result.url;
}
