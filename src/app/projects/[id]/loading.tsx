const Pulse = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />
);

export default function ProjectDetailLoading() {
  return (
    <div
      className="relative h-screen w-full overflow-hidden bg-white"
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(148, 163, 184, 0.3) 1px, transparent 1px)",
        backgroundSize: "16px 16px",
      }}
    >
      <div className="absolute left-4 top-4 z-20 flex h-12 items-center gap-3 rounded-lg bg-white px-4 shadow-md">
        <Pulse className="h-5 w-5 rounded-full" />
        <Pulse className="h-4 w-44" />
        <Pulse className="h-8 w-20 bg-blue-200" />
      </div>

      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <div className="h-12 w-64 rounded-lg bg-white shadow-md" />
        <Pulse className="h-12 w-24 rounded-lg bg-blue-200 shadow-md" />
      </div>

      <aside className="absolute bottom-20 left-4 top-20 z-10 w-64 rounded-lg bg-white p-4 shadow-md">
        <Pulse className="h-5 w-20" />
        <Pulse className="mt-5 h-10 w-full" />
        <Pulse className="mt-3 h-10 w-full" />

        <Pulse className="mt-10 h-5 w-24" />
        <Pulse className="mt-5 h-8 w-8" />

        <Pulse className="mt-10 h-5 w-32" />
        <div className="mt-5 space-y-4">
          <Pulse className="h-3 w-28" />
          <Pulse className="h-3 w-20" />
          <Pulse className="h-3 w-24" />
        </div>
      </aside>

      <aside className="absolute bottom-20 right-4 top-20 z-10 hidden w-64 rounded-lg bg-white p-4 shadow-md md:block">
        <Pulse className="h-5 w-24" />
        <div className="mt-12 flex flex-col items-center gap-3">
          <Pulse className="h-3 w-36" />
          <Pulse className="h-3 w-24" />
        </div>
      </aside>

      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
        <Pulse className="h-14 w-14 rounded-full shadow-md" />
        <div className="h-12 w-72 rounded-lg bg-white shadow-md" />
      </div>

      <div className="absolute bottom-4 right-4 z-20 h-12 w-72 rounded-lg bg-white shadow-md" />
    </div>
  );
}
