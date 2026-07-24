import { FolderKanban, FileText } from "lucide-react";
import { AdminProjectAnalytics } from "@/api/admin/client";

interface ProjectAnalyticsCardProps {
  analytics?: AdminProjectAnalytics;
}

export default function ProjectAnalyticsCard({ analytics }: ProjectAnalyticsCardProps) {
  const totalProjects = analytics?.totalProjects ?? 0;
  const totalExports = analytics?.totalExports ?? 0;

  return (
    <div className="rounded-xl bg-[#1A1C24] p-6 shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-200">Projects & Assets Summary</h3>
          </div>
          <span className="text-xs font-semibold text-gray-400">{totalProjects} Projects</span>
        </div>
        <p className="text-xs text-gray-400 mb-5">Real-time overview of database schema projects and exports</p>

        <div className="space-y-4">
          <div className="rounded-lg bg-[#000000]/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">Total Active Projects</span>
              <span className="text-lg font-bold text-white">{totalProjects}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#000000]">
              <div className="h-full bg-primary-500 rounded-full" style={{ width: totalProjects > 0 ? "100%" : "0%" }} />
            </div>
          </div>

          <div className="rounded-lg bg-[#000000]/60 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">Total DDL / Document Exports</span>
              <span className="text-lg font-bold text-white">{totalExports}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#000000]">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: totalExports > 0 ? "100%" : "0%" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-neutral-800/80 pt-4 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <span>System Assets Tracked</span>
        </div>
      </div>
    </div>
  );
}
