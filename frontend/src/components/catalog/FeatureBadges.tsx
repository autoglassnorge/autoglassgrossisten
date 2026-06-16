/**
 * Compact feature badges for product cards.
 * Shows active equipment features as small icon chips.
 * Only renders if product.properties exists (search context).
 */

import {
  Thermometer,
  Droplets,
  Volume2,
  Radio,
  Monitor,
  Sun,
  Eye,
  Car,
  Shield,
  Palette,
  Navigation,
} from 'lucide-react';
import type { Product } from '@/types/api';

interface FeatureDef {
  key: keyof Product['properties'];
  icon: React.ReactNode;
  label: string;
  shortLabel?: string;
  color: string;
}

const FEATURES: FeatureDef[] = [
  {
    key: 'adas',
    icon: <Shield className="h-3 w-3" />,
    label: 'ADAS',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    key: 'camera',
    icon: <Eye className="h-3 w-3" />,
    label: 'Kamera',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    key: 'hud',
    icon: <Monitor className="h-3 w-3" />,
    label: 'HUD',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key: 'heated',
    icon: <Thermometer className="h-3 w-3" />,
    label: 'Varme',
    color: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    key: 'rainSensor',
    icon: <Droplets className="h-3 w-3" />,
    label: 'Regnsensor',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  {
    key: 'acoustic',
    icon: <Volume2 className="h-3 w-3" />,
    label: 'Akustisk',
    color: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  {
    key: 'antenna',
    icon: <Radio className="h-3 w-3" />,
    label: 'Antenne',
    color: 'bg-gray-50 text-gray-600 border-gray-200',
  },
  {
    key: 'solar',
    icon: <Sun className="h-3 w-3" />,
    label: 'Coated / IR-glass / Solfilm',
    shortLabel: 'Coated',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    key: 'tinted',
    icon: <Palette className="h-3 w-3" />,
    label: 'Tonet',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    key: 'laneAssist',
    icon: <Navigation className="h-3 w-3" />,
    label: 'Filskifteass.',
    color: 'bg-lime-50 text-lime-700 border-lime-200',
  },
  {
    key: 'encapsulated',
    icon: <Car className="h-3 w-3" />,
    label: 'Inkapslet',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

interface FeatureBadgesProps {
  product: Product;
  maxVisible?: number;
}

export function FeatureBadges({ product, maxVisible = 4 }: FeatureBadgesProps) {
  // Only show if properties exist (search context has them, browse may not)
  if (!product.properties) return null;

  const active = FEATURES.filter((f) => {
    const val = product.properties[f.key as keyof typeof product.properties];
    return val === true;
  });

  if (active.length === 0) return null;

  const visible = active.slice(0, maxVisible);
  const remaining = active.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {visible.map((f) => (
        <span
          key={f.key}
          className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border ${f.color}`}
          title={f.label}
        >
          {f.icon}
          <span className="hidden sm:inline">{f.label}</span>
          {f.shortLabel && <span className="inline sm:hidden">{f.shortLabel}</span>}
        </span>
      ))}
      {remaining > 0 && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
          +{remaining}
        </span>
      )}
    </div>
  );
}
