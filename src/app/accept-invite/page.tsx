import AcceptInvite from "@/components/AcceptInvite";
import { Suspense } from "react";
import { Spin } from "antd";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accept Invitation | DBFlow",
  description: "Join a project to collaborate on DBFlow",
};

export default function AcceptInvitePage() {
  return (
    <Suspense 
      fallback={
        <div className="flex justify-center items-center h-screen bg-gray-50">
          <Spin size="large" />
        </div>
      }
    >
      <AcceptInvite />
    </Suspense>
  );
}
