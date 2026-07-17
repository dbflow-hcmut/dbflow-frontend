"use client";

import { acceptWorkspaceInvitation } from "@/api/workspaces/client";
import { notificationProvider } from "@/providers/notification";
import { Button } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function AcceptWorkspaceInvite() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!token) return;
    try {
      setLoading(true);
      await acceptWorkspaceInvitation(token);
      notificationProvider.open({
        type: "success",
        message: "Successfully joined the workspace",
      });
      router.push("/projects");
    } catch (error) {
      notificationProvider.open({
        type: "error",
        message: "Failed to accept workspace invitation",
        description:
          error instanceof Error ? error.message : "The invitation could not be accepted.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-8 text-center shadow-lg">
        <h1 className="mb-6 text-xl font-bold text-gray-900">Team workspace invitation</h1>
        <p className="mb-8 text-sm text-gray-600">
          Accept this invitation to join the DBFlow workspace.
        </p>
        {!token && (
          <p className="mb-6 text-sm text-red-600">The invitation link is missing a token.</p>
        )}
        <div className="flex gap-3">
          <Button
            type="primary"
            size="large"
            className="w-full"
            disabled={!token}
            loading={loading}
            onClick={handleAccept}
          >
            Accept invitation
          </Button>
          <Button size="large" className="w-full" onClick={() => router.push("/projects")}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
