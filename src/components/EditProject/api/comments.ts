import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/clientFetch";
import { PROXY_SCHEMA_COMMENTS } from "@/api";
import type { CommentData } from "../components/CommentPin";

export async function fetchComments(
    projectId: string,
    schemaId: string,
    includeResolved = false,
): Promise<CommentData[]> {
    const url = `${PROXY_SCHEMA_COMMENTS(projectId, schemaId)}${includeResolved ? "?includeResolved=true" : ""}`;
    const res = await apiGet<CommentData[] | { data: CommentData[] }>(url);
    // Handle both direct array and nested { data: [...] } response
    const arr = Array.isArray(res) ? res : Array.isArray((res as { data: CommentData[] })?.data) ? (res as { data: CommentData[] }).data : [];
    return arr;
}

export async function createComment(
    projectId: string,
    schemaId: string,
    body: { x: number; y: number; content: string; parentId?: string; nodeId?: string },
): Promise<CommentData> {
    const url = PROXY_SCHEMA_COMMENTS(projectId, schemaId);
    const res = await apiPost<CommentData>(url, body);
    return res!;
}

export async function updateComment(
    projectId: string,
    schemaId: string,
    commentId: string,
    body: { content?: string; resolved?: boolean },
): Promise<CommentData> {
    const url = `${PROXY_SCHEMA_COMMENTS(projectId, schemaId)}/${commentId}`;
    const res = await apiPatch<CommentData>(url, body);
    return res!;
}

export async function deleteComment(
    projectId: string,
    schemaId: string,
    commentId: string,
): Promise<void> {
    const url = `${PROXY_SCHEMA_COMMENTS(projectId, schemaId)}/${commentId}`;
    await apiDelete(url);
}
