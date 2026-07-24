"use client";

import { acceptWorkspaceInvitation } from "@/api/workspaces/client";
import { notificationProvider } from "@/providers/notification";
import { Button } from "antd";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, UsersRound } from "lucide-react";
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
      const message =
        error instanceof Error ? error.message : "The invitation could not be accepted.";
      notificationProvider.open({
        type: "error",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FCFCFC]">
      <header className="flex h-14 shrink-0 items-center bg-white px-4">
        <Link href="/ai-chat" prefetch className="flex items-center gap-2">
          <Image src="/favicon.ico" alt="DB Flow" width={24} height={24} priority />
          <span className="text-lg font-bold text-primary-500">DB Flow</span>
        </Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
        <div
          aria-hidden="true"
          className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-blue-100/50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-indigo-100/40 blur-3xl"
        />

        <section className="relative w-full max-w-xl rounded-[20px] bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.06)] sm:p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-primary-500">
            <UsersRound className="h-6 w-6" strokeWidth={1.8} />
          </div>

          <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
            Team workspace invitation
          </h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            You&apos;ve been invited to collaborate with a team on DB Flow. Accept the
            invitation to access the workspace and its projects.
          </p>

          {!token && (
            <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              The invitation link is missing a token.
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              size="large"
              icon={<ArrowLeft className="h-3.5 w-3.5" />}
              className="!h-9 w-full !rounded-xl !border-0 !bg-gray-100 !px-4 !text-[13px] !font-semibold !shadow-none hover:!bg-gray-200 sm:w-auto"
              onClick={() => router.push("/projects")}
            >
              Back to projects
            </Button>
            <Button
              type="primary"
              size="large"
              className="!h-9 w-full !rounded-xl !border-0 !px-5 !text-[13px] !font-semibold !shadow-none sm:w-auto"
              disabled={!token}
              loading={loading}
              onClick={handleAccept}
            >
              Accept invitation
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
