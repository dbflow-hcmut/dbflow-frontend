"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAcceptInvite } from "./api";
import { notificationProvider } from "@/providers/notification";
import { Button } from "antd";

export default function AcceptInvite() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  
  const { acceptInvite, isLoading } = useAcceptInvite();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "idle">("idle");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      notificationProvider.open({
        type: "error",
        message: "Invalid invitation link",
        description: "The invitation link is missing or invalid.",
      });
      return;
    }
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    
    try {
      setStatus("loading");
      const res = await acceptInvite({ token }) as { projectId?: string } | undefined;
      
      if (res?.projectId) {
        // Show success notification and redirect to project
        notificationProvider.open({
          type: "success",
          message: "Successfully joined project!",
        });
        router.push(`/projects/${res.projectId}`);
      } else {
        // Fallback to projects list if no projectId
        notificationProvider.open({
          type: "success",
          message: "Successfully joined project!",
        });
        router.push("/ai-chat");
      }
    } catch (error: unknown) {
      setStatus("error");
      notificationProvider.open({
        type: "error",
        message: "Failed to accept invitation",
        description: error instanceof Error ? error.message : "Something went wrong while accepting the invitation.",
      });
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="max-w-lg w-full p-8 bg-white shadow-lg rounded-lg text-center">
        <h1 className="text-xl font-bold text-gray-800 mb-10">Project Collaboration Invite</h1>
        
        <div className="pt-2">
          <p className="text-gray-600 mb-10 text-sm">
            You have been invited to collaborate on a DBFlow project. 
            Click the button below to accept the invitation and join the project.
          </p>
          
          <div className="flex gap-4">
            <Button 
              type="primary" 
              size="large" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-sm!"
              loading={isLoading || status === "loading"}
              onClick={handleAccept}
              disabled={!token}
            >
              Accept Invitation
            </Button>
            <Button 
              type="default" 
              size="large" 
              className="w-full h-12 text-sm!"
              onClick={() => router.push("/ai-chat")}
            >
              Back to Dashboard
            </Button>
          </div>      
        </div>
      </div>
    </div>
  );
}
