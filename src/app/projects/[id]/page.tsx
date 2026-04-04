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
  
  // Check permissions first
  const permissions = await getProjectPermissionsServer(id);
  
  // If user has pending invitation, redirect to accept page
  if (permissions?.permission === 'invited' && permissions.invitationId) {
    redirect(`/accept-invite?token=${permissions.invitationId}`);
  }
  
  const projectData = await getProjectDetailServer(id);
  const projectSchemasData = await getProjectSchemasServer(id);
  const currentUser = await getUserMeServer();

  return (
    <EditProject
      projectData={projectData}
      projectSchemasData={projectSchemasData}
      currentUser={currentUser}
    />
  );
}
