import { getProjectDetailServer, getProjectSchemasServer } from "@/api/projects/server";
import { getUserMeServer } from "@/api/users/server";
import EditProject from "@/components/EditProject";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
