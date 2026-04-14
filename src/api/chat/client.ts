import {
  PROXY_CHAT_CONVERSATIONS,
  PROXY_CHAT_CONVERSATION_DETAIL,
  PROXY_CHAT_CONVERSATION_MESSAGES,
  PROXY_CHAT_CONVERSATION_PROJECT,
  PROXY_CHAT_PROJECT_CONVERSATIONS,
} from "@/api";

export interface ChatConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageRecord {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConversationWithMessages extends ChatConversation {
  messages: ChatMessageRecord[];
}

/**
 * Unwrap backend response from { meta, data } wrapper
 */
async function unwrapResponse<T>(response: Response): Promise<T> {
  const json = await response.json();
  // Backend wraps all responses in { meta, data }
  return json.data !== undefined ? json.data : json;
}

/**
 * Create a new conversation in the backend
 */
export async function createConversation(
  threadId: string,
  title?: string
): Promise<ChatConversation> {
  const response = await fetch(PROXY_CHAT_CONVERSATIONS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, title }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }

  return unwrapResponse<ChatConversation>(response);
}

/**
 * Get all conversations for the current user
 */
export async function getConversations(): Promise<ChatConversation[]> {
  const response = await fetch(PROXY_CHAT_CONVERSATIONS, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to get conversations: ${response.status}`);
  }

  return unwrapResponse<ChatConversation[]>(response);
}

/**
 * Get a single conversation with its messages
 */
export async function getConversation(
  conversationId: string
): Promise<ConversationWithMessages> {
  const response = await fetch(PROXY_CHAT_CONVERSATION_DETAIL(conversationId), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to get conversation: ${response.status}`);
  }

  return unwrapResponse<ConversationWithMessages>(response);
}

/**
 * Save messages to a conversation
 */
export async function saveMessages(
  conversationId: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<ChatMessageRecord[]> {
  const response = await fetch(
    PROXY_CHAT_CONVERSATION_MESSAGES(conversationId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to save messages: ${response.status}`);
  }

  return unwrapResponse<ChatMessageRecord[]>(response);
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<ChatConversation> {
  const response = await fetch(PROXY_CHAT_CONVERSATION_DETAIL(conversationId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update conversation: ${response.status}`);
  }

  return unwrapResponse<ChatConversation>(response);
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  conversationId: string
): Promise<void> {
  const response = await fetch(PROXY_CHAT_CONVERSATION_DETAIL(conversationId), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete conversation: ${response.status}`);
  }
}

/**
 * Link a conversation to a project and/or schema
 */
export async function linkConversationToProject(
  conversationId: string,
  projectId?: string,
  schemaId?: string
): Promise<ChatConversation> {
  const response = await fetch(PROXY_CHAT_CONVERSATION_PROJECT(conversationId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, schemaId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to link conversation: ${response.status}`);
  }

  return unwrapResponse<ChatConversation>(response);
}

/**
 * Get conversations linked to a specific project
 */
export async function getProjectConversations(
  projectId: string
): Promise<ChatConversation[]> {
  const response = await fetch(PROXY_CHAT_PROJECT_CONVERSATIONS(projectId), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to get project conversations: ${response.status}`);
  }

  return unwrapResponse<ChatConversation[]>(response);
}
