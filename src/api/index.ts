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
export const PROXY_PROJECT_DOCUMENTS = (id: string) => `${PROXY_PROJECT_DETAIL(id)}/documents`;
export const PROXY_PROJECT_DOCUMENT_PRESIGNED_UPLOAD = (id: string) => `${PROXY_PROJECT_DOCUMENTS(id)}/presigned-upload`;
export const PROXY_PROJECT_DOCUMENT_DETAIL = (projectId: string, documentId: string) => `${PROXY_PROJECT_DOCUMENTS(projectId)}/${documentId}`;
export const PROXY_PROJECT_DOCUMENT_DOWNLOAD_URL = (projectId: string, documentId: string) => `${PROXY_PROJECT_DOCUMENT_DETAIL(projectId, documentId)}/download-url`;
export const PROXY_PROJECT_DOCUMENT_RETRY_INGEST = (projectId: string, documentId: string) => `${PROXY_PROJECT_DOCUMENT_DETAIL(projectId, documentId)}/retry-ingest`;
export const PROXY_DELETE_SCHEMA = (projectId: string, schemaId: string) => `${PROXY_PROJECT_DETAIL(projectId)}/schemas/${schemaId}`;
export const PROXY_UPDATE_SCHEMA = (projectId: string, schemaId: string) => `${PROXY_PROJECT_DETAIL(projectId)}/schemas/${schemaId}`;
export const PROXY_SCHEMA_DIAGRAM = (schemaId: string) => `${PROXY_BASE}/schemas/${schemaId}/diagram`;
export const PROXY_S3_AI_ATTACHMENT_PRESIGNED_UPLOAD = `${PROXY_BASE}/s3/presigned-ai-attachment`;

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

// DB Connections
export const PROXY_DB_CONNECTIONS = `${PROXY_BASE}/db-connections`;
export const PROXY_DB_CONNECTION_DETAIL = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}`;
export const PROXY_DB_CONNECTION_TEST = `${PROXY_DB_CONNECTIONS}/test`;
export const PROXY_DB_CONNECTION_TEST_SAVED = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}/test`;
export const PROXY_DB_CONNECTION_PLAIN_PARAMS = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}/plain-params`;
export const PROXY_DB_CONNECTION_SCHEMAS = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}/schemas`;
export const PROXY_DB_CONNECTION_INTROSPECT = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}/introspect`;
export const PROXY_DB_CONNECTION_EXECUTE = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}/execute`;
export const PROXY_PROJECT_DB_CONNECTIONS = (projectId: string) => `${PROXY_BASE}/projects/${projectId}/db-connections`;
export const PROXY_PROJECT_DB_CONNECTION_LINK = (projectId: string) => `${PROXY_PROJECT_DB_CONNECTIONS(projectId)}/link`;
export const PROXY_PROJECT_DB_CONNECTION_UNLINK = (projectId: string, connId: string) => `${PROXY_PROJECT_DB_CONNECTIONS(projectId)}/${connId}/unlink`;
