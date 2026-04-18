import { API_BASE } from "@/api";
import { notFound } from "next/navigation";

interface SharedDocsPageProps {
    params: Promise<{ id: string }>;
}

export default async function SharedDocsPage({ params }: SharedDocsPageProps) {
    const { id } = await params;

    // Validate id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        notFound();
    }

    const res = await fetch(`${API_BASE}/projects/shared-docs/${id}`, {
        cache: "no-store",
    });

    if (!res.ok) {
        notFound();
    }

    const html = await res.text();

    return (
        <iframe
            srcDoc={html}
            title="Shared Documentation"
            className="w-full h-screen border-0"
            sandbox="allow-same-origin"
        />
    );
}
