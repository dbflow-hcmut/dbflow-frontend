import { Skeleton } from "antd";

export default function ProjectDetailLoading() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header Skeleton */}
      <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Skeleton */}
        <div className="w-64 border-r border-gray-200 bg-white p-4">
          <div className="space-y-3">
            <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Center Canvas Area */}
        <div className="flex-1 bg-gray-50 relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-gray-400">
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          </div>
        </div>

        {/* Right Panel Skeleton */}
        <div className="w-80 border-l border-gray-200 bg-white p-4">
          <div className="space-y-4">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Skeleton */}
      <div className="h-10 border-t border-gray-200 bg-white px-4 flex items-center justify-between">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
      </div>
    </div>
  );
}
