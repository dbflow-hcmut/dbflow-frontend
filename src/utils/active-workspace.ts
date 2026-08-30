export const ACTIVE_WORKSPACE_STORAGE_KEY = "active_workspace_id";

export function getActiveWorkspaceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) ?? undefined;
}

export function setActiveWorkspaceId(workspaceId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  window.dispatchEvent(
    new CustomEvent("dbflow:workspace-changed", { detail: { workspaceId } }),
  );
}

export function clearActiveWorkspaceId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("dbflow:workspace-changed", { detail: { workspaceId: undefined } }),
  );
}
