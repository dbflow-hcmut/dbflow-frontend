"use client";

import {
  PROXY_AI_THREADS,
  PROXY_AI_STREAM,
  PROXY_AI_CANCEL_RUN,
  PROXY_S3_AI_ATTACHMENT_PRESIGNED_UPLOAD,
} from "@/api";
import { apiPost } from "@/lib/clientFetch";
import { getActiveWorkspaceId } from "@/utils/active-workspace";

// ── Attachment types ──────────────────────────────────────────────────────────

export type AttachmentFileType = "sql" | "csv" | "json" | "image" | "pdf" | "docx";

export interface Attachment {
  id: string;
  name: string;
  fileType: AttachmentFileType;
  /** text content for sql/csv/json; base64 data URL for image/pdf preview; empty string for docx */
  content: string;
  size: number;
  mimeType?: string;
  /** Parsed model payload when fileType=json and the JSON looks like a schema model */
  modelJson?: Record<string, unknown>;
  /**
   * S3 presigned URL for image/pdf/docx — sent to the AI instead of the base64 content.
   * Populated asynchronously after upload. While undefined the file is still uploading.
   */
  url?: string;
  /** S3 key when the attachment has been persisted as a project document */
  s3Key?: string;
  /** True while the S3 upload is in progress */
  uploading?: boolean;
  /** Browser-only file handle used to persist chat uploads after a project is created */
  originalFile?: File;
}

/** Max attachments per message */
export const ATTACHMENT_MAX_COUNT = 5;
/** Max total size of all attachments (bytes) */
export const ATTACHMENT_MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB
/** Accepted file types for the file picker */
export const ATTACHMENT_ACCEPT = ".sql,.csv,.json,.png,.jpg,.jpeg,.webp,.svg,.pdf,.doc,.docx";

/**
 * Read a File object into an Attachment.
 * Returns null if the file type is unsupported or the file is too large.
 */
export async function readFileAsAttachment(file: File): Promise<Attachment | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  let fileType: AttachmentFileType;
  if (ext === "sql") fileType = "sql";
  else if (ext === "csv") fileType = "csv";
  else if (ext === "json") fileType = "json";
  else if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) fileType = "image";
  else if (ext === "pdf") fileType = "pdf";
  else if (["doc", "docx"].includes(ext)) fileType = "docx";
  else return null;

  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    if (fileType === "image" || fileType === "pdf") {
      reader.readAsDataURL(file);
    } else if (fileType === "docx") {
      // DOCX binary — we don't extract text client-side; store empty content
      resolve("");
    } else {
      reader.readAsText(file);
    }
  });

  let modelJson: Record<string, unknown> | undefined;
  if (fileType === "json") {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed && (parsed.entities || parsed.tables || parsed.model)) {
        modelJson = parsed;
      }
    } catch {
      // not valid JSON or not a model
    }
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    fileType,
    content,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    modelJson,
  };
}

/**
 * Upload a file to S3 using a backend-issued presigned PUT URL.
 * Flow:
 *   1. POST /api/proxy/s3/presigned-ai-attachment with metadata
 *   2. Browser PUTs the file directly to S3 using uploadUrl
 *   3. Return { key, url } where url is a presigned read URL for AI
 * Returns null on any failure (caller falls back to base64).
 */
export async function uploadAttachmentForAIRecord(
  file: File,
  attachmentId: string,
): Promise<{ key: string; uploadUrl: string; url: string } | null> {
  void attachmentId;
  try {
    const data = await apiPost<
      { key: string; uploadUrl: string; url: string },
      { fileName: string; mimeType: string; size: number }
    >(PROXY_S3_AI_ATTACHMENT_PRESIGNED_UPLOAD, {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });

    const putRes = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => putRes.status.toString());
      console.error("[uploadAttachmentForAI] upload failed", putRes.status, errText);
      return null;
    }

    console.log("[uploadAttachmentForAI] upload success, url:", data.url);
    return data;
  } catch (err) {
    console.error("[uploadAttachmentForAI] unexpected error", err);
    return null;
  }
}

export async function uploadAttachmentForAI(
  file: File,
  attachmentId: string,
): Promise<string | null> {
  const uploaded = await uploadAttachmentForAIRecord(file, attachmentId);
  return uploaded?.url ?? null;
}

// ── Multimodal ChatMessage support ───────────────────────────────────────────

export type ChatMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ChatMessageContentPart[];
}

/**
 * Build a ChatMessage and optional model override from user text + attachments.
 * - SQL / CSV → embedded as fenced code blocks in the text
 * - JSON model files → returned as `modelOverride`; plain JSON embedded in text
 * - Images → multimodal content array (uses presigned S3 URL if available, else base64)
 * - PDF → inline base64 via image_url (Gemini 1.5 supports application/pdf inline)
 * - DOCX → reference note in text (Gemini doesn't support DOCX natively)
 */
export function buildChatInputFromAttachments(
  text: string,
  attachments: Attachment[],
): { message: ChatMessage; modelOverride?: Record<string, unknown> } {
  if (attachments.length === 0) {
    return { message: { role: "user", content: text } };
  }

  const imageFiles = attachments.filter((a) => a.fileType === "image");
  const pdfFiles = attachments.filter((a) => a.fileType === "pdf");
  // DOCX with a presigned URL → send as image_url part (Gemini supports document URLs)
  // DOCX without URL (upload pending/failed) → fall back to text reference
  const docxUrlFiles = attachments.filter((a) => a.fileType === "docx" && a.url);
  const jsonModel = attachments.find((a) => a.fileType === "json" && a.modelJson);

  let textContent = text;
  for (const a of attachments) {
    if (a.fileType === "sql") {
      textContent = `[File: ${a.name}]\n\`\`\`sql\n${a.content}\n\`\`\`\n\n${textContent}`;
    } else if (a.fileType === "csv") {
      textContent = `[File: ${a.name}]\n\`\`\`csv\n${a.content}\n\`\`\`\n\n${textContent}`;
    } else if (a.fileType === "json" && !a.modelJson) {
      textContent = `[File: ${a.name}]\n\`\`\`json\n${a.content}\n\`\`\`\n\n${textContent}`;
    } else if (a.fileType === "docx" && !a.url) {
      // No URL yet — upload failed or still pending
      textContent = `[Attached Word document: ${a.name}]\n\n${textContent}`;
    }
    // image, pdf, docx-with-url handled via content parts below
  }

  const hasMultimodal = imageFiles.length > 0 || pdfFiles.length > 0 || docxUrlFiles.length > 0;

  let message: ChatMessage;
  if (hasMultimodal) {
    const parts: ChatMessageContentPart[] = [{ type: "text", text: textContent }];

    for (const a of imageFiles) {
      parts.push({ type: "image_url", image_url: { url: a.url ?? a.content } });
    }

    for (const a of pdfFiles) {
      parts.push({ type: "image_url", image_url: { url: a.url ?? a.content } });
    }

    for (const a of docxUrlFiles) {
      parts.push({ type: "image_url", image_url: { url: a.url! } });
    }

    message = { role: "user", content: parts };
  } else {
    message = { role: "user", content: textContent };
  }

  return { message, modelOverride: jsonModel?.modelJson };
}

export const DBFLOW_ASSISTANT_ID = process.env.NEXT_PUBLIC_DBFLOW_ASSISTANT_ID || "71ce8f7d-18be-4139-b249-0001da5758b7";

export interface LangGraphStreamRequest {
  assistant_id: string;
    input: {
    messages: ChatMessage[];
    current_level?: string;
    input_model?: Record<string, unknown> | null;
    project_id?: string;
    workspace_id?: string;
    input_intent?: string;
  };
  config?: {
    configurable?: {
      thread_id?: string;
    };
  };
  stream_mode?: string[];
}

export interface LangGraphStreamEvent {
  event: string;
  data: unknown;
}

/**
 * Check if content looks like a routing/reasoning JSON response from the router node.
 * Matches both complete and partial JSON that starts with routing-like keys.
 */
function isRoutingJson(text: string): boolean {
  // Check for complete JSON with routing keys
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.intent !== undefined || parsed.reasoning !== undefined || parsed.detected_level !== undefined || parsed.effective_level !== undefined) {
        return true;
      }
    } catch {
      // Not valid JSON
    }
  }

  // Check for partial/streaming JSON that looks like routing output
  // e.g. '{ "intent"', '{ "intent": "chat",\n  "detected_level"', etc.
  if (text.startsWith("{")) {
    const routingPattern = /^\s*\{\s*"(intent|detected_level|effective_level|reasoning)"/;
    if (routingPattern.test(text)) {
      return true;
    }
  }

  return false;
}

export interface RoutingInfo {
  intent?: string;
  detected_level?: string | null;
  effective_level?: string | null;
  reasoning?: string;
}

/**
 * Check if the streamed content contains a model.json code block (diagram generation).
 * Returns the extracted text description and partial/complete JSON if found.
 */
export function extractModelJsonFromContent(content: string): {
  hasDiagram: boolean;
  textDescription: string;
  modelJson: Record<string, unknown> | null;
  isJsonComplete: boolean;
} {
  // Check for model.json code block (complete)
  const completePattern = /```(?:\w+)?\s*model\.json\s*\n([\s\S]*?)```/i;
  const completeMatch = content.match(completePattern);

  if (completeMatch) {
    const codeBlockStart = content.indexOf("```");
    const codeBlockEnd = content.indexOf("```", codeBlockStart + 3) + 3;
    const textBefore = content.substring(0, codeBlockStart).trim();
    const textAfter = content.substring(codeBlockEnd).trim();
    const textDescription = [textBefore, textAfter].filter(Boolean).join("\n\n");
    try {
      const parsed = JSON.parse(completeMatch[1].trim());
      return {
        hasDiagram: true,
        textDescription,
        modelJson: parsed,
        isJsonComplete: true,
      };
    } catch {
      return {
        hasDiagram: true,
        textDescription,
        modelJson: null,
        isJsonComplete: false,
      };
    }
  }

  // Check for any json code block that looks like a model (complete)
  const jsonPattern = /```(?:json)?\s*\n([\s\S]*?)```/;
  const jsonMatch = content.match(jsonPattern);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed && (parsed.entities || parsed.tables || parsed.model)) {
        const codeBlockStart = content.indexOf("```");
        const codeBlockEnd = content.indexOf("```", codeBlockStart + 3) + 3;
        const textBefore = content.substring(0, codeBlockStart).trim();
        const textAfter = content.substring(codeBlockEnd).trim();
        const textDescription = [textBefore, textAfter].filter(Boolean).join("\n\n");
        return {
          hasDiagram: true,
          textDescription,
          modelJson: parsed,
          isJsonComplete: true,
        };
      }
    } catch {
      // Not valid JSON yet
    }
  }

  // Check for partial/in-progress code block (started but not closed)
  const partialPattern = /```(?:\w+)?\s*(?:model\.json)?\s*\n([\s\S]*?)$/i;
  const partialMatch = content.match(partialPattern);
  if (partialMatch) {
    const textBefore = content.substring(0, content.indexOf("```")).trim();
    // Try to parse partial JSON for progressive rendering
    let partialJson: Record<string, unknown> | null = null;
    try {
      partialJson = JSON.parse(partialMatch[1].trim());
    } catch {
      // Try to fix incomplete JSON by closing brackets
      const partial = partialMatch[1].trim();
      if (partial.startsWith("{")) {
        partialJson = tryParsePartialJson(partial);
      }
    }
    return {
      hasDiagram: true,
      textDescription: textBefore,
      modelJson: partialJson,
      isJsonComplete: false,
    };
  }

  // Check if content has text that looks like it will be followed by a code block
  // (e.g., AI wrote description text but hasn't started the code block yet)
  // We detect this by checking if routing info indicated create/edit intent
  return {
    hasDiagram: false,
    textDescription: content,
    modelJson: null,
    isJsonComplete: false,
  };
}

/**
 * Extract a SQL query from a fenced ```sql code block in streamed AI content.
 * Used by the text_to_sql intent — no partial-JSON repair needed since SQL
 * is only consumed once the block is complete.
 */
export function extractSqlFromContent(content: string): {
  hasSql: boolean;
  textDescription: string;
  sql: string | null;
  isSqlComplete: boolean;
} {
  const completePattern = /```sql\s*\n([\s\S]*?)```/i;
  const completeMatch = content.match(completePattern);

  if (completeMatch) {
    const codeBlockStart = content.search(/```sql/i);
    const codeBlockEnd = content.indexOf("```", codeBlockStart + 3) + 3;
    const textBefore = content.substring(0, codeBlockStart).trim();
    const textAfter = content.substring(codeBlockEnd).trim();
    return {
      hasSql: true,
      textDescription: [textBefore, textAfter].filter(Boolean).join("\n\n"),
      sql: completeMatch[1].trim(),
      isSqlComplete: true,
    };
  }

  const partialPattern = /```sql\s*\n([\s\S]*)$/i;
  const partialMatch = content.match(partialPattern);
  if (partialMatch) {
    const codeBlockStart = content.search(/```sql/i);
    const textBefore = content.substring(0, codeBlockStart).trim();
    return {
      hasSql: true,
      textDescription: textBefore,
      sql: partialMatch[1].trim(),
      isSqlComplete: false,
    };
  }

  return {
    hasSql: false,
    textDescription: content,
    sql: null,
    isSqlComplete: false,
  };
}

/**
 * Try to parse partial/incomplete JSON by adding closing brackets.
 * Used for progressive diagram rendering while streaming.
 */
function tryParsePartialJson(partial: string): Record<string, unknown> | null {
  // Count open brackets
  let opens = 0;
  let closes = 0;
  let inString = false;
  let escaped = false;
  let openSquare = 0;
  let closeSquare = 0;

  for (let i = 0; i < partial.length; i++) {
    const ch = partial[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') opens++;
    if (ch === '}') closes++;
    if (ch === '[') openSquare++;
    if (ch === ']') closeSquare++;
  }

  // Remove trailing comma if present (common in streaming)
  let fixed = partial.replace(/,\s*$/, '');

  // Remove trailing incomplete key-value pairs
  // e.g., '"name":' or '"name": "partial' 
  fixed = fixed.replace(/,?\s*"[^"]*"\s*:\s*("[^"]*)?$/, '');

  // Close arrays and objects
  const neededSquare = openSquare - closeSquare;
  const neededCurly = opens - closes;

  for (let i = 0; i < neededSquare; i++) fixed += ']';
  for (let i = 0; i < neededCurly; i++) fixed += '}';

  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/**
 * Cancel a running LangGraph run.
 */
export async function cancelRun(threadId: string, runId: string): Promise<void> {
  try {
    await fetch(PROXY_AI_CANCEL_RUN(threadId, runId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch (error) {
    console.warn("Failed to cancel run:", error);
  }
}

/**
 * Stream chat messages to LangGraph API and process Server-Sent Events
 * @param assistantId - Assistant ID to use
 * @param threadId - Unique thread ID to maintain conversation history
 * @param messages - Array of chat messages
 * @param onChunk - Callback for each message chunk received (final AI response)
 * @param onComplete - Callback when stream completes
 * @param onError - Callback for errors
 * @param ensureThread - If true, will create thread if it doesn't exist (default: true)
 * @param onReasoning - Callback for routing/reasoning data from the router node
 * @param abortSignal - Optional AbortSignal to cancel the stream
 * @param currentLevel - Optional current schema level hint
 * @param currentModel - Optional current schema model (for forward/reverse engineering)
 * @param inputIntent - Optional explicit intent override (e.g. "text_to_sql"), skips LLM classification
 * @param workspaceId - Workspace to attribute usage to when no projectId is available yet
 *   (e.g. a brand-new AI chat that hasn't created a project). Takes priority over the
 *   localStorage fallback below.
 * @returns The run_id if captured from metadata event, or null
 */
export async function streamChatToLangGraph(
  assistantId: string,
  threadId: string,
  messages: ChatMessage[],
  onChunk: (content: string) => void,
  onComplete: () => void,
  onError: (error: Error) => void,
  ensureThread: boolean = true,
  onReasoning?: (info: RoutingInfo) => void,
  abortSignal?: AbortSignal,
  currentLevel?: string,
  currentModel?: Record<string, unknown> | null,
  projectId?: string,
  inputIntent?: string,
  workspaceId?: string,
): Promise<string | null> {
  let runId: string | null = null;
  try {
    // Ensure thread exists before streaming — must await to avoid race condition
    if (ensureThread) {
      try {
        await createThread(threadId);
      } catch (error) {
        // 409 / duplicate thread is fine — thread already exists
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes("409") && !msg.toLowerCase().includes("already exist")) {
          throw error;
        }
      }
    }

    const url = PROXY_AI_STREAM(threadId);
    
    const requestBody: LangGraphStreamRequest = {
      assistant_id: assistantId,
      input: {
        messages: messages,
        ...(currentLevel ? { current_level: currentLevel } : {}),
        ...(currentModel ? { input_model: currentModel } : {}),
        ...(projectId ? { project_id: projectId } : {}),
        ...(inputIntent ? { input_intent: inputIntent } : {}),
      },
      config: {
        configurable: {
          thread_id: threadId,
        },
      },
      stream_mode: ["messages"],
    };

    if (!projectId) {
      const activeWorkspaceId = workspaceId ?? getActiveWorkspaceId();
      if (activeWorkspaceId) {
        requestBody.input.workspace_id = activeWorkspaceId;
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`LangGraph API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body reader available");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        onComplete();
        break;
      }

      // Decode chunk and add to buffer
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // Process complete SSE messages (separated by \r\n\r\n or \n\n)
      const parts = buffer.split(/\r\n\r\n|\n\n/);
      
      // Keep the last part (might be incomplete)
      buffer = parts.pop() || "";

      for (const message of parts) {
        if (!message.trim()) continue;
        
        // Split by line (handle both \r\n and \n)
        const lines = message.split(/\r\n|\n/);
        let eventType = "";
        let eventData = "";
        
        // Parse SSE format: event: xxx and data: xxx
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6).trim();
          }
        }
        
        // Capture run_id from metadata events
        if (eventType === "metadata" && eventData) {
          try {
            const meta = JSON.parse(eventData);
            if (meta.run_id) {
              runId = meta.run_id;
            }
          } catch {
            // ignore parse errors for metadata
          }
        }

        // Process messages/partial and messages/complete events
        if ((eventType === "messages/partial" || eventType === "messages/complete") && eventData) {
          try {
            const data = JSON.parse(eventData);
            
            // Data is an array of all AI messages so far (partial streaming)
            // Process each AI message: routing ones go to onReasoning, real ones go to onChunk
            if (Array.isArray(data)) {
              let foundRealContent = false;

              // Iterate in reverse to find the last real AI response first
              for (let i = data.length - 1; i >= 0; i--) {
                const msg = data[i];
                if (msg.type !== "ai" || !msg.content) continue;

                // content can be string or array of content blocks
                const content = typeof msg.content === "string"
                  ? msg.content
                  : Array.isArray(msg.content)
                    ? msg.content.map((c: string | { text?: string }) => (typeof c === "string" ? c : c.text || "")).join("")
                    : String(msg.content);

                const trimmed = content.trim();
                if (isRoutingJson(trimmed)) {
                  // Send routing/reasoning info via callback
                  if (onReasoning && !foundRealContent) {
                    try {
                      // Try to parse complete JSON
                      if (trimmed.endsWith("}")) {
                        const parsed = JSON.parse(trimmed);
                        onReasoning(parsed);
                      } else {
                        // Partial JSON - extract what we can
                        onReasoning({ reasoning: "Analyzing your request..." });
                      }
                    } catch {
                      onReasoning({ reasoning: "Analyzing your request..." });
                    }
                  }
                  continue;
                }

                // Found a valid non-routing AI message
                // Skip whitespace-only chunks (e.g. "\n" from Gemini thinking phase)
                if (content && content.trim()) {
                  foundRealContent = true;
                  onChunk(content);
                }
                break;
              }
            }
          } catch (parseError) {
            console.error("Failed to parse SSE data:", parseError);
          }
        }

        // Handle server-sent error events
        if (eventType === "error" && eventData) {
          try {
            const errorData = JSON.parse(eventData);
            const errorMessage = errorData.message || errorData.error || "An internal error occurred";
            reader.cancel();
            onError(new Error(errorMessage));
            return runId;
          } catch {
            reader.cancel();
            onError(new Error(eventData || "An internal error occurred"));
            return runId;
          }
        }
      }
    }
  } catch (error) {
    // Don't report abort errors — those are intentional cancellations
    if (error instanceof DOMException && error.name === "AbortError") {
      onComplete();
      return runId;
    }
    onError(error instanceof Error ? error : new Error(String(error)));
  }
  return runId;
}

/**
 * Generate a unique thread ID for conversation tracking using UUID v4
 */
export function generateThreadId(): string {
  return crypto.randomUUID();
}

/**
 * Create a new thread in LangGraph
 * @param threadId - Optional thread ID, if not provided will be auto-generated
 */
export async function createThread(threadId?: string): Promise<string> {
  const response = await fetch(PROXY_AI_THREADS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      thread_id: threadId,
    }),
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create thread: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.thread_id;
}
