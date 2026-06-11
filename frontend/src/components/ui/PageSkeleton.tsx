/**
 * PageSkeleton — Full-page loading skeleton with dark mode support.
 * Mirrors the actual page layout (header, content areas, footer).
 */

import { Skeleton } from './Skeleton';

export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-carbon-950 flex flex-col animate-fade-in">
      {/* TopBar placeholder */}
      <div className="hidden sm:block bg-carbon-900 border-b border-carbon-800 h-8" />

      {/* Header placeholder */}
      <div className="border-b border-carbon-800 bg-carbon-950 h-14 sm:h-16">
        <div className="mx-auto max-w-7xl px-4 h-full flex items-center gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-9 w-64 hidden md:block" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-9 w-20 hidden md:block" />
            <Skeleton className="h-9 w-20 hidden md:block" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>

      {/* Hero placeholder */}
      <div className="bg-gradient-to-b from-carbon-950 via-carbon-900 to-carbon-950 pt-16 pb-12">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <Skeleton className="h-6 w-48 mx-auto mb-6" />
          <Skeleton className="h-12 w-3/4 mx-auto mb-4" />
          <Skeleton className="h-12 w-1/2 mx-auto mb-6" />
          <Skeleton className="h-5 w-2/3 mx-auto mb-8" />
          <div className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
            <Skeleton className="h-14 flex-1" />
            <Skeleton className="h-14 w-32" />
          </div>
          <div className="mt-10 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </div>
      </div>

      {/* Content placeholders */}
      <div className="bg-carbon-950 border-t border-carbon-800 py-8">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-center flex-wrap gap-6">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
      </div>

      <div className="bg-carbon-50 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <Skeleton className="h-8 w-64 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4]" />
            ))}
          </div>
        </div>
      </div>

      {/* Footer placeholder */}
      <div className="mt-auto border-t border-carbon-800 bg-carbon-950 py-12">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    </div>
  );
}
