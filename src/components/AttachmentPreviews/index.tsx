"use client";

import React from "react";
import { X as XIcon, Loader2 } from "lucide-react";
import type { Attachment } from "@/api/ai/client";

interface AttachmentPreviewsProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  /** compact = smaller cards, used inside floating ChatBox */
  compact?: boolean;
  /** readonly = hide remove button, used for messages already sent */
  readonly?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeLabel({ fileType }: { fileType: Attachment["fileType"] }) {
  const map: Record<Attachment["fileType"], { label: string; bg: string; text: string }> = {
    sql: { label: "SQL", bg: "bg-blue-100", text: "text-blue-700" },
    csv: { label: "CSV", bg: "bg-green-100", text: "text-green-700" },
    json: { label: "JSON", bg: "bg-yellow-100", text: "text-yellow-700" },
    image: { label: "IMG", bg: "bg-purple-100", text: "text-purple-700" },
    pdf: { label: "PDF", bg: "bg-red-100", text: "text-red-700" },
    docx: { label: "DOCX", bg: "bg-sky-100", text: "text-sky-700" },
  };
  const { label, bg, text } = map[fileType] ?? { label: fileType.toUpperCase(), bg: "bg-gray-100", text: "text-gray-600" };
  return (
    <span className={`text-[10px] font-bold uppercase px-1 py-0.5 rounded ${bg} ${text}`}>
      {label}
    </span>
  );
}

function FileIcon({ fileType }: { fileType: Attachment["fileType"] }) {
  if (fileType === "pdf") {
    return (
      <div className="flex items-center justify-center w-full h-full bg-red-50 text-red-500">
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8.5 14h1.8c.7 0 1.2-.2 1.5-.5s.5-.8.5-1.3-.2-1-.5-1.3-.8-.4-1.5-.4H8.5V14zm1-2.8h.7c.3 0 .5.1.7.2s.2.4.2.7-.1.5-.2.7-.4.2-.7.2h-.7v-1.8zm4.5 2.8h1.1c.6 0 1.1-.2 1.4-.5s.5-.8.5-1.5-.2-1.2-.5-1.5-.8-.5-1.4-.5H14V14zm1-3.3h.2c.3 0 .5.1.7.3s.3.5.3.9-.1.7-.3.9-.4.3-.7.3H15v-2.4zm3.5.5h-2v3.3h-1v-3.3H15.5v-.8H19.5v.8z"/>
        </svg>
      </div>
    );
  }
  if (fileType === "docx") {
    return (
      <div className="flex items-center justify-center w-full h-full bg-sky-50 text-sky-500">
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM7 13h10v1H7zm0 2h10v1H7zm0 2h7v1H7zm0-6h10v1H7z"/>
        </svg>
      </div>
    );
  }
  if (fileType === "sql") {
    return (
      <div className="flex items-center justify-center w-full h-full bg-blue-50 text-blue-500">
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v5c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
          <path d="M4 10v5c0 1.66 3.58 3 8 3s8-1.34 8-3v-5" />
        </svg>
      </div>
    );
  }
  if (fileType === "csv") {
    return (
      <div className="flex items-center justify-center w-full h-full bg-green-50 text-green-500">
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M3 15h18M9 3v18" />
        </svg>
      </div>
    );
  }
  if (fileType === "json") {
    return (
      <div className="flex items-center justify-center w-full h-full bg-yellow-50 text-yellow-600">
        <span className="text-lg font-bold font-mono">{"{}"}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-full h-full bg-gray-50 text-gray-400">
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5z"/>
      </svg>
    </div>
  );
}

export function AttachmentPreviews({
  attachments,
  onRemove,
  compact = false,
  readonly = false,
}: AttachmentPreviewsProps) {
  if (attachments.length === 0) return null;

  const thumbSize = compact ? "w-12 h-12" : "w-16 h-16";
  const cardHeight = compact ? "h-12" : "h-14";

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => {
        if (a.fileType === "image") {
          const imgSrc = a.url ?? a.content;
          return (
            <div
              key={a.id}
              className={`relative ${thumbSize} rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-none ${readonly && imgSrc ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
              onClick={readonly && imgSrc ? () => window.open(imgSrc, "_blank", "noopener,noreferrer") : undefined}
              title={readonly ? a.name : undefined}
            >
              <img
                src={imgSrc}
                alt={a.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
              {a.uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <Loader2 size={16} className="text-white animate-spin" />
                </div>
              )}
              {!readonly && !a.uploading && (
                <button
                  onClick={() => onRemove(a.id)}
                  className="absolute top-0.5 right-0.5 z-20 w-4 h-4 flex items-center justify-center bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors cursor-pointer"
                  title="Remove"
                >
                  <XIcon size={10} />
                </button>
              )}
            </div>
          );
        }

        // Non-image file card
        const canOpen = readonly && !!a.url;
        return (
          <div
            key={a.id}
            className={`relative flex items-center gap-2 ${cardHeight} rounded-lg border border-gray-200 bg-white overflow-hidden flex-none ${compact ? "max-w-[160px]" : "max-w-[200px]"} ${canOpen ? "cursor-pointer hover:border-gray-400 transition-colors" : ""}`}
            onClick={canOpen ? () => window.open(a.url!, "_blank", "noopener,noreferrer") : undefined}
            title={canOpen ? a.name : undefined}
          >
            {/* Icon area */}
            <div className={`${compact ? "w-12 h-12" : "w-14 h-14"} flex-none overflow-hidden`}>
              <FileIcon fileType={a.fileType} />
            </div>
            {/* Info */}
            <div className={`flex-1 min-w-0 ${readonly || a.uploading ? "pr-2" : "pr-6"}`}>
              <p className="text-xs font-medium text-gray-800 truncate leading-tight">{a.name}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {a.uploading ? (
                  <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                    <Loader2 size={10} className="animate-spin" /> uploading…
                  </span>
                ) : (
                  <>
                    <FileTypeLabel fileType={a.fileType} />
                    <span className="text-[10px] text-gray-400">{formatSize(a.size)}</span>
                  </>
                )}
              </div>
            </div>
            {!readonly && !a.uploading && (
              <button
                onClick={() => onRemove(a.id)}
                className="absolute top-1 right-1 z-20 w-4 h-4 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition-colors cursor-pointer"
                title="Remove"
              >
                <XIcon size={9} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
