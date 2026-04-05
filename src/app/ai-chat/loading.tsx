
export default function AIChatLoading() {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Centered Loading State */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-200 rounded-xl mb-4 animate-pulse" />
            <div className="h-8 bg-gray-200 rounded animate-pulse mx-auto" style={{ width: 150 }} />
          </div>
          
          <div className="h-14 bg-gray-200 rounded-xl animate-pulse" />
          
          <div className="h-4 bg-gray-200 rounded animate-pulse mt-3 mx-auto" style={{ width: 250 }} />
        </div>
      </div>
    </div>
  );
}
