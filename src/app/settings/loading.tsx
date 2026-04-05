import { Skeleton } from "antd";

export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header Skeleton */}
        <div className="mb-6">
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-5 w-64 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Layout Container Skeleton */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Skeleton */}
          <div className="w-full lg:w-64 flex-shrink-0">
            <div className="space-y-2">
              <div className="h-12 w-full bg-gray-200 rounded animate-pulse" />
              <div className="h-12 w-full bg-gray-200 rounded animate-pulse" />
            </div>
          </div>

          {/* Content Skeleton */}
          <div className="flex-1">
            <div className="space-y-4">
              <Skeleton active title paragraph={{ rows: 4 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
