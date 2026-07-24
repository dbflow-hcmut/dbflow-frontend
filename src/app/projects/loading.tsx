import { Button, Input, Skeleton } from "antd";
import { ChevronDown, Database, Grid3x3, List, Plus, Search } from "lucide-react";

export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <h2 className="mb-5 text-2xl font-bold text-gray-900 sm:mb-6">Projects</h2>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div className="min-w-0 flex-1">
          <Input
            placeholder="Search for a project"
            prefix={<Search className="h-4 w-4 text-gray-400" />}
            className="w-full !rounded-xl !border-0 !bg-gray-100 !shadow-none lg:max-w-md"
            disabled
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 items-center overflow-hidden rounded-xl bg-gray-100 p-1">
            <button className="cursor-default rounded-lg bg-white p-2 text-gray-900" disabled><Grid3x3 className="h-4 w-4" /></button>
            <button className="cursor-default rounded-lg p-2 text-gray-500" disabled><List className="h-4 w-4" /></button>
          </div>
          <Button icon={<Database className="h-4 w-4" />} className="!rounded-xl !border-0 !bg-gray-100 !shadow-none" disabled>
            <span className="hidden sm:inline">Connect to Database</span>
            <span className="sm:hidden">Connect</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button type="primary" icon={<Plus className="h-4 w-4" />} className="!rounded-xl !border-0 !shadow-none" disabled>
            <span className="hidden sm:inline">New project</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((item) => (
          <div key={item} className="rounded-xl bg-gray-100 p-5">
            <Skeleton active title={{ width: "62%" }} paragraph={{ rows: 2, width: ["42%", "48%"] }} />
          </div>
        ))}
      </div>
    </div>
  );
}
