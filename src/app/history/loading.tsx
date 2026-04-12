export default function HistoryLoading() {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header skeleton */}
      <div className="px-8 py-6 shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-4 w-full">
          <div className="h-8 w-36 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex flex-col gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-lg">
                <div className="w-5 h-5 bg-gray-200 rounded animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-gray-200 rounded animate-pulse mb-1.5" style={{ width: `${60 + (i % 3) * 15}%` }} />
                  <div className="h-3 bg-gray-100 rounded animate-pulse" style={{ width: '80px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
