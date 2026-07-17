import AcceptWorkspaceInvite from "@/components/AcceptWorkspaceInvite";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Accept Team Invitation | DBFlow",
  description: "Join a DBFlow team workspace",
};

export default function AcceptWorkspaceInvitePage() {
  return (
    <Suspense>
      <AcceptWorkspaceInvite />
    </Suspense>
  );
}
