import { Skeleton } from "antd";

export default function CreateProjectLoading() {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl p-8 bg-white rounded-lg shadow-md mx-4">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
          
          <div className="space-y-6">
            <Skeleton active title paragraph={{ rows: 1 }} />
            <Skeleton active title paragraph={{ rows: 3 }} />
            
            <div className="flex justify-end gap-3 pt-4">
              <div className="h-10 bg-gray-200 rounded animate-pulse" style={{ width: 100 }} />
              <div className="h-10 bg-gray-200 rounded animate-pulse" style={{ width: 120 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
