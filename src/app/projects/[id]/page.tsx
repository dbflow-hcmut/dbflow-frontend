import { getProjectDetailServer, getProjectSchemasServer, getProjectPermissionsServer } from "@/api/projects/server";
import { getUserMeServer } from "@/api/users/server";
import EditProject from "@/components/EditProject";
import { redirect } from "next/navigation";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // These four are independent of each other — fetch concurrently instead of
  // one after another. In the rare "invited" case below, the latter three
  // results just go unused; that's a fair trade for cutting a 4x sequential
  // round-trip down to 1 for every other request.
  const [permissions, projectData, projectSchemasData, currentUser] = await Promise.all([
    getProjectPermissionsServer(id),
    getProjectDetailServer(id),
    getProjectSchemasServer(id),
    getUserMeServer(),
  ]);

  // If user has pending invitation, redirect to accept page
  if (permissions?.permission === 'invited' && permissions.invitationId) {
    redirect(`/accept-invite?token=${permissions.invitationId}`);
  }

  return (
    <EditProject
      projectData={projectData}
      projectSchemasData={projectSchemasData}
      currentUser={currentUser}
    />
  );
}
