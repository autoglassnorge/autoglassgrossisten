import { CarFront, DoorOpen, PanelBottom, Square, Rows3, UserRound, UsersRound, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Product } from '@/types/api';
import {
  GLASS_CATEGORY_OPTIONS,
  countByGlassCategory,
  type DoorPlacement,
  type GlassCategory,
  type GlassPosition,
} from '@/utils/glass-selection';
import { cn } from '@/lib/utils';

interface GlassNeedSelectorProps {
  products: Product[];
  activeCategory: GlassCategory | null;
  activePosition: GlassPosition | null;
  activeDoorPlacement: DoorPlacement | null;
  onCategoryChange: (category: GlassCategory | null) => void;
  onPositionChange: (position: GlassPosition | null) => void;
  onDoorPlacementChange: (placement: DoorPlacement | null) => void;
}

const CATEGORY_ICONS: Record<GlassCategory, ReactNode> = {
  frontrute: <CarFront className="h-4 w-4" />,
  dørglass: <DoorOpen className="h-4 w-4" />,
  sideglass: <Square className="h-4 w-4" />,
  bakrute: <PanelBottom className="h-4 w-4" />,
};

const sideOptions: Array<{ key: GlassPosition; label: string; icon: ReactNode }> = [
  { key: 'driver', label: 'Venstre / fører', icon: <UserRound className="h-4 w-4" /> },
  { key: 'passenger', label: 'Høyre / passasjer', icon: <UsersRound className="h-4 w-4" /> },
];

const doorPlacementOptions: Array<{ key: DoorPlacement; label: string }> = [
  { key: 'front', label: 'Foran' },
  { key: 'rear', label: 'Bak' },
];

export function GlassNeedSelector({
  products,
  activeCategory,
  activePosition,
  activeDoorPlacement,
  onCategoryChange,
  onPositionChange,
  onDoorPlacementChange,
}: GlassNeedSelectorProps) {
  const counts = countByGlassCategory(products);
  const needsSide = activeCategory === 'dørglass' || activeCategory === 'sideglass';
  const needsDoorPlacement = activeCategory === 'dørglass';

  if (products.length === 0) return null;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Velg rute</h2>
          <p className="text-xs text-gray-500">{products.length} kompatible glass før valg</p>
        </div>
        {(activeCategory || activePosition || activeDoorPlacement) && (
          <button
            type="button"
            onClick={() => {
              onCategoryChange(null);
              onPositionChange(null);
              onDoorPlacementChange(null);
            }}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nullstill
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {GLASS_CATEGORY_OPTIONS.map((option) => {
          const isActive = activeCategory === option.key;
          const count = counts[option.key];
          const disabled = count === 0;
          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              onClick={() => {
                onCategoryChange(isActive ? null : option.key);
                onPositionChange(null);
                onDoorPlacementChange(null);
              }}
              className={cn(
                'flex min-h-[54px] items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition',
                isActive
                  ? 'border-autoglass-blue bg-autoglass-blue text-white'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-autoglass-blue/40 hover:bg-autoglass-blue/5',
                disabled && 'cursor-not-allowed opacity-40 hover:border-gray-200 hover:bg-white'
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', isActive ? 'bg-white/15' : 'bg-gray-100')}>
                  {CATEGORY_ICONS[option.key]}
                </span>
                <span className="truncate text-sm font-semibold">{option.label}</span>
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {needsSide && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {sideOptions.map((option) => {
            const isActive = activePosition === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onPositionChange(isActive ? null : option.key)}
                className={cn(
                  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'border-autoglass-blue bg-autoglass-blue text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-autoglass-blue/40 hover:bg-white'
                )}
              >
                {option.icon}
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {needsDoorPlacement && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {doorPlacementOptions.map((option) => {
            const isActive = activeDoorPlacement === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onDoorPlacementChange(isActive ? null : option.key)}
                className={cn(
                  'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-white'
                )}
              >
                <Rows3 className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
