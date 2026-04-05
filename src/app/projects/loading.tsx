import { Skeleton } from "antd";

export default function ProjectsLoading() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="h-10 bg-gray-200 rounded animate-pulse" style={{ width: 200 }} />
            <div className="h-10 bg-gray-200 rounded animate-pulse" style={{ width: 150 }} />
          </div>
          <div className="h-10 bg-gray-200 rounded animate-pulse" style={{ width: 120 }} />
        </div>

        {/* Projects Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
