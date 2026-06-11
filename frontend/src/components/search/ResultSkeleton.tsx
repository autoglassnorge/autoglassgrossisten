/**
 * ResultSkeleton — Lightweight skeleton for lazy-loaded search results.
 * Shows 3-6 product card placeholders while result component loads.
 */

export function ResultSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="h-32 bg-gray-200 dark:bg-carbon-800 animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-20 bg-gray-200 dark:bg-carbon-800 animate-pulse rounded" />
            <div className="h-5 w-full bg-gray-200 dark:bg-carbon-800 animate-pulse rounded" />
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-carbon-800 animate-pulse rounded" />
            <div className="flex justify-between items-center pt-2">
              <div className="h-6 w-24 bg-gray-200 dark:bg-carbon-800 animate-pulse rounded" />
              <div className="h-10 w-28 bg-gray-200 dark:bg-carbon-800 animate-pulse rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
