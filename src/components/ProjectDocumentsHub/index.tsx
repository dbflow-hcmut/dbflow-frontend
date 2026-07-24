"use client";

import { useMemo, useRef, useState } from "react";
import { Button, Image as AntImage, Input, Modal, Tag, Tooltip } from "antd";
import {
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { apiGet } from "@/lib/clientFetch";
import { PROXY_PROJECT_DETAIL } from "@/api";
import { notificationProvider } from "@/providers/notification";
import {
  createProjectDocument,
  deleteProjectDocument,
  getProjectDocumentDownloadUrl,
  type ProjectDocument,
  retryIngestDocument,
  uploadProjectDocumentFile,
  useProjectDocuments,
} from "@/api/project-documents/client";
import type { ProjectResponse } from "@/types/projects.type";
import useSWR from "swr";

const ACCEPTED_DOCUMENTS =
  ".pdf,.png,.jpg,.jpeg,.webp,.svg,.doc,.docx,.txt,.md,.sql,.json,.csv";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type ProjectDocumentsHubProps = {
  project?: ProjectResponse | null;
  projectId?: string | null;
  projectVisibility?: string;
  embedded?: boolean;
};

function isImageDocument(doc: ProjectDocument) {
  return doc.mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.fileName);
}

function formatProjectScope(scope?: string) {
  const map: Record<string, string> = {
    owner_and_invited: "Private",
    anyone_can_view: "Anyone can view",
    anyone_can_edit: "Anyone can edit",
  };
  return map[scope ?? ""] ?? "Private";
}

function useProjectScope(projectId: string | null, fallback?: string) {
  const { data } = useSWR<{ project_mode: string }>(
    projectId ? `project-document-scope-${projectId}` : null,
    async () => apiGet<{ project_mode: string }>(`${PROXY_PROJECT_DETAIL(projectId!)}/permissions`),
    { revalidateOnFocus: false },
  );

  return data?.project_mode ?? fallback ?? "owner_and_invited";
}

export default function ProjectDocumentsHub({
  project,
  projectId: propProjectId,
  projectVisibility,
  embedded = false,
}: ProjectDocumentsHubProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keyword, setKeyword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  const projectId = project?.id ?? propProjectId ?? null;
  const projectScope = useProjectScope(projectId, project?.visibility ?? projectVisibility);
  const { data: documents, isLoading, mutate } = useProjectDocuments(projectId, {
    keyword,
  });

  const totalSize = useMemo(
    () => documents.reduce((sum, doc) => sum + doc.size, 0),
    [documents],
  );

  const handleUpload = async (files: FileList | null) => {
    if (!projectId || !files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadProjectDocumentFile(projectId, file);
        await createProjectDocument(projectId, {
          title: file.name.replace(/\.[^/.]+$/, ""),
          fileName: file.name,
          s3Key: uploaded.key,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          source: "hub_upload",
        });
      }
      notificationProvider.open({
        type: "success",
        message: "Documents uploaded",
      });
      await mutate();
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePreview = async (doc: ProjectDocument) => {
    if (!projectId) return;
    try {
      const url = await getProjectDocumentDownloadUrl(projectId, doc.id);
      if (isImageDocument(doc)) {
        setPreviewImage({ url, title: doc.fileName });
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      notificationProvider.open({
        type: "error",
        message: "Could not open document",
      });
    }
  };

  const handleRetry = async (doc: ProjectDocument) => {
    if (!projectId) return;
    setRetryingId(doc.id);
    try {
      await retryIngestDocument(projectId, doc.id);
      notificationProvider.open({ type: "success", message: "Re-indexing started" });
      await mutate();
    } catch {
      notificationProvider.open({ type: "error", message: "Retry failed" });
    } finally {
      setRetryingId(null);
    }
  };

  const handleDelete = async (doc: ProjectDocument) => {
    if (!projectId) return;

    Modal.confirm({
      title: "Delete document?",
      content: doc.fileName,
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingId(doc.id);
        try {
          await deleteProjectDocument(projectId, doc.id);
          notificationProvider.open({
            type: "success",
            message: "Document deleted",
          });
          await mutate();
        } catch {
          notificationProvider.open({
            type: "error",
            message: "Delete failed",
          });
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Project not found.
      </div>
    );
  }

  return (
    <div className={embedded ? "flex h-[600px] max-h-[calc(100vh-180px)] flex-col bg-white" : "min-h-full bg-[#FCFCFC]"}>
      <AntImage
        src={previewImage?.url}
        alt={previewImage?.title}
        style={{ display: "none" }}
        preview={{
          visible: Boolean(previewImage),
          src: previewImage?.url,
          onVisibleChange: (visible) => {
            if (!visible) setPreviewImage(null);
          },
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_DOCUMENTS}
        className="hidden"
        onChange={(event) => void handleUpload(event.target.files)}
      />

      <div className={embedded ? "flex min-h-0 flex-1 flex-col gap-5 px-6 pb-6" : "mx-auto flex max-w-6xl flex-col gap-5 px-5 py-6"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-gray-50 px-5 py-4 transition-colors hover:bg-gray-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Documents</div>
            <div className="mt-1.5 text-xl font-semibold text-gray-900">{documents.length}</div>
          </div>
         <div className="rounded-2xl bg-gray-50 px-5 py-4 transition-colors hover:bg-gray-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Storage</div>
            <div className="mt-1.5 text-xl font-semibold text-gray-900">{formatBytes(totalSize)}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-5 py-4 transition-colors hover:bg-gray-100">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Project Scope</div>
            <div className="mt-1.5 truncate text-xl font-semibold text-gray-900">
              {formatProjectScope(projectScope)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input
            allowClear
            prefix={<Search className="mr-1 h-4 w-4 text-gray-400" />}
            placeholder="Search documents"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="!h-11 !rounded-xl !border-0 !bg-gray-100 !px-4 !shadow-none hover:!bg-gray-100 focus-within:!bg-white focus-within:!ring-1 focus-within:!ring-gray-200"
          />
          <Button
            type="primary"
            className="!h-11 !rounded-xl !border-0 !px-5 !font-semibold !shadow-none"
            icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload
          </Button>
        </div>

        <div className={embedded ? "min-h-0 flex-1 overflow-auto rounded-2xl bg-white ring-1 ring-gray-100" : "overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100"}>
          <div className="grid grid-cols-[1fr_120px_120px] gap-3 bg-gray-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400 max-md:hidden">
            <span>Name</span>
            <span>Size</span>
            <span className="text-right">Actions</span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents
            </div>
          ) : documents.length === 0 ? (
            <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-gray-100">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <div className="mt-4 text-sm font-semibold text-gray-800">No documents yet</div>
              <div className="mt-1.5 text-sm text-gray-500">
                Upload ER diagrams, schema files, SQL notes, or project specs.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="grid grid-cols-[1fr_120px_120px] items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 max-md:grid-cols-1"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-950">{doc.title}</div>
                      <div className="flex min-w-0 items-center gap-2 pt-0.5">
                        <span className="truncate text-xs text-gray-500">{doc.fileName}</span>
                        {/* {doc.source === "ai_chat_upload" && <Tag color="blue">AI Chat</Tag>} */}
                        {doc.status === 'ready' && (
                          <Tag color="success">Indexed</Tag>
                        )}
                        {doc.status === 'processing' && (
                          <Tag color="processing">Processing</Tag>
                        )}
                        {doc.status === 'failed' && (
                          <Tag color="error">Failed</Tag>
                        )}
                        {doc.status === 'uploaded' && (
                          <Tag color="default">Queued</Tag>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600">{formatBytes(doc.size)}</div>

                  <div className="flex justify-end gap-1 max-md:justify-start">
                    {(doc.status === 'failed' || doc.status === 'uploaded') && (
                      <Tooltip title="Retry indexing">
                        <Button
                          type="text"
                          loading={retryingId === doc.id}
                          icon={<RefreshCw className="h-4 w-4" />}
                          onClick={() => void handleRetry(doc)}
                        />
                      </Tooltip>
                    )}
                    <Tooltip title="Preview">
                      <Button
                        type="text"
                        icon={<Eye className="h-4 w-4" />}
                        onClick={() => void handlePreview(doc)}
                      />
                    </Tooltip>
                    <Tooltip title="Delete">
                      <Button
                        danger
                        type="text"
                        loading={deletingId === doc.id}
                        icon={<Trash2 className="h-4 w-4" />}
                        onClick={() => void handleDelete(doc)}
                      />
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
