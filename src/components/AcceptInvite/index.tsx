"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAcceptInvite } from "./api";
import { notificationProvider } from "@/providers/notification";
import { Button, Result } from "antd";

export default function AcceptInvite() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  
  const { acceptInvite, isLoading } = useAcceptInvite();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "idle">("idle");
  const [projectId, setProjectId] = useState<string | null>(null);

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
        setProjectId(res.projectId);
        setStatus("success");
      } else {
        setStatus("success");
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

  if (status === "success") {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Result
          status="success"
          title="Successfully Joined Project!"
          subTitle="You have accepted the invitation and are now a member of the project."
          extra={[
            <Button 
              type="primary" 
              key="project" 
              onClick={() => router.push(projectId ? `/projects/${projectId}` : "/projects")}
            >
              Go to Project
            </Button>,
            <Button key="dashboard" onClick={() => router.push("/projects")}>
              Go to Dashboard
            </Button>,
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="max-w-lg w-full p-8 bg-white shadow-xl rounded-lg text-center">
        <h1 className="text-xl font-bold text-gray-800 mb-10">Project Collaboration Invite</h1>
        
        <div className="pt-2">
          <p className="text-gray-600 mb-10">
            You have been invited to collaborate on a DBFlow project. 
            Click the button below to accept the invitation and join the project.
          </p>
          
          <div className="flex gap-4">
            <Button 
              type="primary" 
              size="large" 
              className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg"
              loading={isLoading || status === "loading"}
              onClick={handleAccept}
              disabled={!token}
            >
              Accept Invitation
            </Button>
            <Button 
              type="default" 
              size="large" 
              className="w-full h-12 text-lg"
              onClick={() => router.push("/projects")}
            >
              Back to Dashboard
            </Button>
          </div>      
        </div>
      </div>
    </div>
  );
}
