"use client";

import { LANGGRAPH_THREADS, LANGGRAPH_STREAM } from "@/api";

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
  data: any;
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
 * Stream chat messages to LangGraph API and process Server-Sent Events
 * @param assistantId - Assistant ID to use
 * @param threadId - Unique thread ID to maintain conversation history
 * @param messages - Array of chat messages
 * @param onChunk - Callback for each message chunk received (final AI response)
 * @param onComplete - Callback when stream completes
 * @param onError - Callback for errors
 * @param ensureThread - If true, will create thread if it doesn't exist (default: true)
 * @param onReasoning - Callback for routing/reasoning data from the router node
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
) {
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
                    ? msg.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join("")
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
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
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
