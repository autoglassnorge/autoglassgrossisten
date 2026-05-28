import type { KtypeInfo } from '@/types/api';

interface KtypeInfoBadgeProps {
  ktypeInfo: KtypeInfo;
}

export function KtypeInfoBadge({ ktypeInfo }: KtypeInfoBadgeProps) {
  const yearRange =
    ktypeInfo.yearFrom && ktypeInfo.yearTo
      ? `${ktypeInfo.yearFrom}–${ktypeInfo.yearTo}`
      : ktypeInfo.yearFrom
        ? `${ktypeInfo.yearFrom}–`
        : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        <span className="font-medium text-gray-700">
          kType: {ktypeInfo.ktype}
        </span>
        <span className="text-gray-400">·</span>
        <span>
          {ktypeInfo.brand} {ktypeInfo.model}
        </span>
        {ktypeInfo.body && (
          <>
            <span className="text-gray-400">·</span>
            <span>{ktypeInfo.body}</span>
          </>
        )}
        {yearRange && (
          <>
            <span className="text-gray-400">·</span>
            <span>{yearRange}</span>
          </>
        )}
        <span className="ml-auto text-gray-400 italic">
          {ktypeInfo.source}
        </span>
      </div>
    </div>
  );
}
