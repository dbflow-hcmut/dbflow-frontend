import { PROXY_USERS_ME } from "@/api";
import ProjectsMeClient from "@/components/ProjectsMeClient";
import { serverFetchJSON } from "@/lib/serverFetch";

async function fetchMeOnServer() {
    return serverFetchJSON(PROXY_USERS_ME);
}

export default async function ProjectsPage() {
    const serverResult = await fetchMeOnServer();
    return (
        <div className="p-4 space-y-6">
            <h1 className="text-xl font-semibold">Projects</h1>
            <div className="space-y-2">
                <div className="font-medium">Server fetch /users/me</div>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">{JSON.stringify(serverResult, null, 2)}</pre>
            </div>
            <div className="space-y-2">
                <div className="font-medium">Client fetch /users/me</div>
                <ProjectsMeClient />
            </div>
        </div>
    );
}