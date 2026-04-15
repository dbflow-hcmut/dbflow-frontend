"use client";

import { LANGGRAPH_THREADS, LANGGRAPH_STREAM, LANGGRAPH_CANCEL_RUN } from "@/api";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Fixed assistant ID for DBFlow AI
export const DBFLOW_ASSISTANT_ID = "71ce8f7d-18be-4139-b249-0001da5758b7";

export interface LangGraphStreamRequest {
  assistant_id: string;
  input: {
    messages: ChatMessage[];
    current_level?: string;
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
      if (parsed.intent !== undefined || parsed.reasoning !== undefined || parsed.detected_level !== undefined) {
        return true;
      }
    } catch {
      // Not valid JSON
    }
  }

  // Check for partial/streaming JSON that looks like routing output
  // e.g. '{ "intent"', '{ "intent": "chat",\n  "detected_level"', etc.
  if (text.startsWith("{")) {
    const routingPattern = /^\s*\{\s*"(intent|detected_level|reasoning)"/;
    if (routingPattern.test(text)) {
      return true;
    }
  }

  return false;
}

export interface RoutingInfo {
  intent?: string;
  detected_level?: string | null;
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
    await fetch(LANGGRAPH_CANCEL_RUN(threadId, runId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
): Promise<string | null> {
  let runId: string | null = null;
  try {
    // Create thread in parallel (non-blocking) if needed
    if (ensureThread) {
      createThread(threadId).catch((error) => {
        console.warn("Thread creation warning (may already exist):", error);
      });
    }

    const url = LANGGRAPH_STREAM(threadId);
    
    const requestBody: LangGraphStreamRequest = {
      assistant_id: assistantId,
      input: {
        messages: messages,
        ...(currentLevel ? { current_level: currentLevel } : {}),
      },
      config: {
        configurable: {
          thread_id: threadId,
        },
      },
      stream_mode: ["messages"],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
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

        // Process messages/partial events
        if (eventType === "messages/partial" && eventData) {
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
                if (content) {
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
  const response = await fetch(LANGGRAPH_THREADS, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      thread_id: threadId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create thread: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.thread_id;
}
