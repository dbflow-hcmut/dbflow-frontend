import WorkspaceSettings from "@/components/WorkspaceSettings";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace Settings | DBFlow",
};

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  return <WorkspaceSettings workspaceId={workspaceId} />;
}
