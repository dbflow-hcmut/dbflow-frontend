"use server";

import { revalidatePath } from "next/cache";

export async function revalidateProjects() {
    revalidatePath("/projects");
}

export async function revalidateProjectSchemas(projectId: string) {
    revalidatePath(`/projects/${projectId}`);
}

