export const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
export const FE_BASE = process.env.NEXT_PUBLIC_APP_URL;
export const LANGGRAPH_API_BASE = process.env.NEXT_PUBLIC_LANGGRAPH_API;

export const API_LOGIN = `${API_BASE}/auth/login`;
export const API_REGISTER = `${API_BASE}/auth/register`;

export const PROXY_BASE = `${FE_BASE}/api/proxy`;

export const PROXY_USERS = `${PROXY_BASE}/users`;
export const PROXY_USERS_ME = `${PROXY_USERS}/me`;
export const PROXY_USERS_PROFILE = `${PROXY_USERS}/profile`;
export const PROXY_USERS_CHANGE_PASSWORD = `${PROXY_USERS}/change-password`;

export const PROXY_WORKSPACES = `${PROXY_BASE}/workspaces`;
export const PROXY_WORKSPACE_DETAIL = (workspaceId: string) =>
  `${PROXY_WORKSPACES}/${workspaceId}`;
export const PROXY_WORKSPACE_MEMBERS = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/members`;
export const PROXY_WORKSPACE_INVITATIONS = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/invitations`;
export const PROXY_WORKSPACE_MEMBER_ROLE = (
  workspaceId: string,
  userId: string,
) => `${PROXY_WORKSPACE_MEMBERS(workspaceId)}/${userId}/role`;
export const PROXY_WORKSPACE_MEMBER = (workspaceId: string, userId: string) =>
  `${PROXY_WORKSPACE_MEMBERS(workspaceId)}/${userId}`;
export const PROXY_WORKSPACE_LEAVE = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/leave`;
export const PROXY_WORKSPACE_TRANSFER_OWNERSHIP = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/transfer-ownership`;
export const PROXY_WORKSPACE_AUDIT_LOGS = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/audit-logs`;
export const PROXY_WORKSPACE_GROUPS = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/groups`;
export const PROXY_WORKSPACE_GROUP = (workspaceId: string, groupId: string) =>
  `${PROXY_WORKSPACE_GROUPS(workspaceId)}/${groupId}`;
export const PROXY_WORKSPACE_GROUP_MEMBER = (
  workspaceId: string,
  groupId: string,
  targetUserId: string,
) => `${PROXY_WORKSPACE_GROUP(workspaceId, groupId)}/members/${targetUserId}`;
export const PROXY_ACCEPT_WORKSPACE_INVITATION = `${PROXY_BASE}/workspace-invitations/accept`;
export const PROXY_PLANS = `${PROXY_BASE}/plans`;
export const PROXY_WORKSPACE_SUBSCRIPTION = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/subscription`;
export const PROXY_WORKSPACE_ENTITLEMENTS = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/entitlements`;
export const PROXY_WORKSPACE_AI_USAGE_BREAKDOWN = (workspaceId: string) =>
  `${PROXY_WORKSPACE_DETAIL(workspaceId)}/usage/ai-requests`;
export const PROXY_BILLING_CHECKOUT = `${PROXY_BASE}/billing/checkout`;
export const PROXY_BILLING_ORDERS = (workspaceId: string) =>
  `${PROXY_BASE}/billing/workspaces/${workspaceId}/orders`;
export const PROXY_BILLING_PORTAL = (workspaceId: string) =>
  `${PROXY_BASE}/billing/workspaces/${workspaceId}/portal`;
export const PROXY_CANCEL_BILLING_ORDER = (
  workspaceId: string,
  orderId: string,
) => `${PROXY_BILLING_ORDERS(workspaceId)}/${orderId}/cancel`;
export const PROXY_ADMIN = `${PROXY_BASE}/admin`;

export const PROXY_PROJECTS = `${PROXY_BASE}/projects`;
export const PROXY_PROJECT_DETAIL = (id: string) => `${PROXY_PROJECTS}/${id}`;
export const PROXY_PROJECT_GROUP = (id: string) => `${PROXY_PROJECT_DETAIL(id)}/group`;
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
export const PROXY_S3_AVATAR_PRESIGNED_UPLOAD = `${PROXY_BASE}/s3/presigned-avatar`;

// LangGraph API endpoints
export const LANGGRAPH_THREADS = `${LANGGRAPH_API_BASE}/threads`;
export const LANGGRAPH_STREAM = (threadId: string) => `${LANGGRAPH_API_BASE}/threads/${threadId}/runs/stream`;
export const LANGGRAPH_CANCEL_RUN = (threadId: string, runId: string) => `${LANGGRAPH_API_BASE}/threads/${threadId}/runs/${runId}/cancel`;

export const PROXY_AI_THREADS = `${PROXY_BASE}/ai-gateway/threads`;
export const PROXY_AI_STREAM = (threadId: string) =>
  `${PROXY_AI_THREADS}/${threadId}/runs/stream`;
export const PROXY_AI_CANCEL_RUN = (threadId: string, runId: string) =>
  `${PROXY_AI_THREADS}/${threadId}/runs/${runId}/cancel`;

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

// Schema sandbox (Query Generator / Seed Data Run target)
export const PROXY_SCHEMA_SANDBOX = (projectId: string, schemaId: string) => `${PROXY_BASE}/projects/${projectId}/schemas/${schemaId}/sandbox`;
export const PROXY_SCHEMA_SANDBOX_EXECUTE = (projectId: string, schemaId: string) => `${PROXY_SCHEMA_SANDBOX(projectId, schemaId)}/execute`;
export const PROXY_SCHEMA_SANDBOX_RESET = (projectId: string, schemaId: string) => `${PROXY_SCHEMA_SANDBOX(projectId, schemaId)}/reset`;
export const PROXY_SCHEMA_SANDBOX_STATUS = (projectId: string, schemaId: string) => `${PROXY_SCHEMA_SANDBOX(projectId, schemaId)}/status`;

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
export const PROXY_DB_CONNECTION_TEXT_TO_SQL = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}/text-to-sql`;
export const PROXY_PROJECT_DB_CONNECTIONS = (projectId: string) => `${PROXY_BASE}/projects/${projectId}/db-connections`;
export const PROXY_PROJECT_DB_CONNECTION_LINK = (projectId: string) => `${PROXY_PROJECT_DB_CONNECTIONS(projectId)}/link`;
export const PROXY_PROJECT_DB_CONNECTION_UNLINK = (projectId: string, connId: string) => `${PROXY_PROJECT_DB_CONNECTIONS(projectId)}/${connId}/unlink`;

// DB Connection — permission check
export const PROXY_DB_CONNECTION_PERMISSIONS = (connId: string) => `${PROXY_DB_CONNECTIONS}/${connId}/permissions`;

// Export Records (per project)
export const PROXY_PROJECT_EXPORT_RECORDS = (projectId: string) => `${PROXY_BASE}/projects/${projectId}/export-records`;
export const PROXY_PROJECT_EXPORT_USAGE = (projectId: string) => `${PROXY_PROJECT_EXPORT_RECORDS(projectId)}/usage`;
export const PROXY_PROJECT_EXPORT_RECORD_DETAIL = (projectId: string, recordId: string) => `${PROXY_PROJECT_EXPORT_RECORDS(projectId)}/${recordId}`;
export const PROXY_PROJECT_EXPORT_RECORD_ROLLBACK = (projectId: string, recordId: string) => `${PROXY_PROJECT_EXPORT_RECORD_DETAIL(projectId, recordId)}/rollback`;
