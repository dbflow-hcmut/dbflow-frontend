import { Skeleton } from "antd";

export default function CreateProjectLoading() {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 items-center justify-center bg-[#FCFCFC]">
        <div className="mx-4 w-full max-w-2xl rounded-[20px] bg-white p-7">
          <div className="mb-6 h-7 w-48 animate-pulse rounded-lg bg-gray-200" />
          
          <div className="space-y-6">
            <Skeleton active title paragraph={{ rows: 1 }} />
            <Skeleton active title paragraph={{ rows: 3 }} />
            
            <div className="flex justify-end gap-3 pt-4">
              <div className="h-10 animate-pulse rounded-xl bg-gray-200" style={{ width: 100 }} />
              <div className="h-10 animate-pulse rounded-xl bg-gray-200" style={{ width: 120 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
