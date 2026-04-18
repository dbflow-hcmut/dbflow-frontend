export const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
export const FE_BASE = process.env.NEXT_PUBLIC_APP_URL;
export const LANGGRAPH_API_BASE = process.env.NEXT_PUBLIC_LANGGRAPH_API;

export const API_LOGIN = `${API_BASE}/auth/login`;

export const PROXY_BASE = `${FE_BASE}/api/proxy`;

export const PROXY_USERS = `${PROXY_BASE}/users`;
export const PROXY_USERS_ME = `${PROXY_USERS}/me`;
export const PROXY_USERS_PROFILE = `${PROXY_USERS}/profile`;
export const PROXY_USERS_CHANGE_PASSWORD = `${PROXY_USERS}/change-password`;

export const PROXY_PROJECTS = `${PROXY_BASE}/projects`;
export const PROXY_PROJECT_DETAIL = (id: string) => `${PROXY_PROJECTS}/${id}`;
export const PROXY_DELETE_PROJECT = (id: string) => `${PROXY_PROJECTS}/${id}`;
export const PROXY_PROJECT_SCHEMAS = (id: string) => `${PROXY_PROJECT_DETAIL(id)}/schemas`;
export const PROXY_DELETE_SCHEMA = (projectId: string, schemaId: string) => `${PROXY_PROJECT_DETAIL(projectId)}/schemas/${schemaId}`;
export const PROXY_UPDATE_SCHEMA = (projectId: string, schemaId: string) => `${PROXY_PROJECT_DETAIL(projectId)}/schemas/${schemaId}`;
export const PROXY_SCHEMA_DIAGRAM = (schemaId: string) => `${PROXY_BASE}/schemas/${schemaId}/diagram`;

// LangGraph API endpoints
export const LANGGRAPH_THREADS = `${LANGGRAPH_API_BASE}/threads`;
export const LANGGRAPH_STREAM = (threadId: string) => `${LANGGRAPH_API_BASE}/threads/${threadId}/runs/stream`;
export const LANGGRAPH_CANCEL_RUN = (threadId: string, runId: string) => `${LANGGRAPH_API_BASE}/threads/${threadId}/runs/${runId}/cancel`;

// Chat conversation API endpoints (proxied through backend)
export const PROXY_SCHEMA_MODEL = (projectId: string, schemaId: string) => `${PROXY_BASE}/projects/${projectId}/schemas/${schemaId}/model`;

export const PROXY_CHAT_CONVERSATIONS = `${PROXY_BASE}/chat/conversations`;
export const PROXY_CHAT_CONVERSATION_DETAIL = (conversationId: string) => `${PROXY_CHAT_CONVERSATIONS}/${conversationId}`;
export const PROXY_CHAT_CONVERSATION_MESSAGES = (conversationId: string) => `${PROXY_CHAT_CONVERSATIONS}/${conversationId}/messages`;
export const PROXY_CHAT_CONVERSATION_PROJECT = (conversationId: string) => `${PROXY_CHAT_CONVERSATIONS}/${conversationId}/project`;
export const PROXY_CHAT_PROJECT_CONVERSATIONS = (projectId: string) => `${PROXY_CHAT_CONVERSATIONS}/project/${projectId}`;

// Comments API endpoints
export const PROXY_SCHEMA_COMMENTS = (projectId: string, schemaId: string) => `${PROXY_BASE}/projects/${projectId}/schemas/${schemaId}/comments`;

// Schema version API endpoints
export const PROXY_SCHEMA_VERSIONS = (projectId: string, schemaId: string) => `${PROXY_BASE}/projects/${projectId}/schemas/${schemaId}/versions`;
export const PROXY_SCHEMA_VERSION_DETAIL = (projectId: string, schemaId: string, versionId: string) => `${PROXY_SCHEMA_VERSIONS(projectId, schemaId)}/${versionId}`;

// Shared docs
export const PROXY_SHARE_HTML = `${PROXY_BASE}/projects/shared-docs`;