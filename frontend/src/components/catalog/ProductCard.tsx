import { ShoppingCart, Check, Thermometer, Droplets, Shield, Wind, Eye, Radio, Monitor, Sun, Snowflake, Volume2 } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Product } from '@/types/api';
import { formatPrice, formatYearRange, typeCodeShort } from '@/utils/formatters';
import { useCartStore } from '@/stores/cartStore';
import { GlassVisualizer, parseGlassColor, parseSidePosition, parsePosition } from './GlassVisualizer';

interface ProductCardProps {
  product: Product;
}

function useInCart(eurocode: string) {
  return useCartStore((s) => s.items.some((i) => i.product.eurocode === eurocode));
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const inCart = useInCart(product.eurocode);

  // Alltid vis som på lager — +1 indikator
  const stockDot = 'bg-green-500';
  const stockText = '1+ på lager';

  const colorInfo = parseGlassColor(product.description || '');
  const sideInfo = parseSidePosition(product.description || '', product.typeCode || undefined);
  const posInfo = parsePosition(product.typeCode || undefined, product.description || undefined);
  const typeLabel = typeCodeShort(product.typeCode || product.category);

  // Parse features from description
  const desc = (product.description || '').toUpperCase();
  const features: { icon: React.ReactNode; label: string; color: string }[] = [];
  
  if (desc.includes('SOLAR') || desc.includes('SOL')) features.push({ icon: <Sun className="h-4 w-4" />, label: 'Solar', color: 'bg-yellow-50 text-yellow-700' });
  if (desc.includes('ANT') || desc.includes('AG')) features.push({ icon: <Radio className="h-4 w-4" />, label: 'Antenne', color: 'bg-indigo-50 text-indigo-700' });
  if (desc.includes('INNK') || desc.includes('INNKA')) features.push({ icon: <Eye className="h-4 w-4" />, label: 'Innkapslet', color: 'bg-teal-50 text-teal-700' });
  if (desc.includes('EL') || desc.includes('ELM')) features.push({ icon: <Snowflake className="h-4 w-4" />, label: 'Elektrisk', color: 'bg-cyan-50 text-cyan-700' });
  if (desc.includes('RSN') || desc.includes('SENSOR')) features.push({ icon: <Droplets className="h-4 w-4" />, label: 'Sensor', color: 'bg-sky-50 text-sky-700' });
  if (desc.includes('VIN')) features.push({ icon: <Wind className="h-4 w-4" />, label: 'VIN', color: 'bg-violet-50 text-violet-700' });
  if (desc.includes('COATED') || desc.includes('CS')) features.push({ icon: <Shield className="h-4 w-4" />, label: 'Coated', color: 'bg-emerald-50 text-emerald-700' });
  if (desc.includes('AKU') || desc.includes('AKUST')) features.push({ icon: <Volume2 className="h-4 w-4" />, label: 'Akustisk', color: 'bg-gray-100 text-gray-600' });
  if (desc.includes('HUD')) features.push({ icon: <Monitor className="h-4 w-4" />, label: 'HUD', color: 'bg-purple-50 text-purple-700' });
  if (desc.includes('LDW')) features.push({ icon: <Eye className="h-4 w-4" />, label: 'LDW', color: 'bg-rose-50 text-rose-700' });
  if (desc.includes('CITY')) features.push({ icon: <Shield className="h-4 w-4" />, label: 'City Safety', color: 'bg-orange-50 text-orange-700' });

  return (
    <Card className="group flex flex-col h-full overflow-hidden hover:shadow-lg transition-shadow">
      {/* Visualizer instead of image */}
      <div className="relative bg-slate-50 p-3">
        <GlassVisualizer product={product} className="h-32 sm:h-36" />
        
        {/* Type code badge */}
        <div className="absolute top-2 right-2">
          <Badge className="bg-white/90 text-gray-800 text-xs sm:text-sm shadow-sm">
            {typeLabel}
          </Badge>
        </div>
        
        {/* NAGS badge */}
        {product.nagsCodes && product.nagsCodes.length > 0 && (
          <div className="absolute top-2 left-2">
            <Badge variant="outline" className="bg-white/90 text-xs sm:text-sm font-mono text-blue-700 border-blue-200 shadow-sm">
              🇺🇸 {product.nagsCodes[0]}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <CardContent className="flex-1 pt-3 px-4 sm:px-5">
        {/* Title row with color indicator */}
        <div className="flex items-start gap-2 mb-2">
          <span 
            className={`inline-block w-3 h-3 rounded-full mt-1 flex-shrink-0 ${colorInfo.tailwindColor} border border-gray-200`}
            title={colorInfo.label}
          />
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 text-base sm:text-lg leading-snug">
              {product.title || `${product.brand} ${product.model}`}
            </h3>
            {/* Position & side info */}
            {(posInfo.label || sideInfo.label) && (
              <p className="text-sm text-gray-500 mt-0.5">
                {posInfo.label}{posInfo.label && sideInfo.label ? ' · ' : ''}{sideInfo.label}
                {colorInfo.label !== 'Standard' && ` · ${colorInfo.label}`}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 line-clamp-2 mb-2">
          {product.description}
        </p>

        {/* Eurocode + year */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs sm:text-sm font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
            {product.eurocode}
          </span>
          <span className="text-xs text-gray-500">
            {formatYearRange(product.yearFrom, product.yearTo)}
          </span>
        </div>

        {/* Features row */}
        {features.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {features.slice(0, 5).map((f, i) => (
              <span key={i} className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${f.color}`}>
                {f.icon}
                {f.label}
              </span>
            ))}
            {features.length > 5 && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
                +{features.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Properties from DB */}
        <div className="flex flex-wrap gap-1">
          {product.properties?.adas && (
            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              <Shield className="h-4 w-4" /> ADAS
            </span>
          )}
          {product.properties?.heated && (
            <span className="inline-flex items-center gap-0.5 rounded bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700">
              <Thermometer className="h-4 w-4" /> Varme
            </span>
          )}
          {product.properties?.rainSensor && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">
              <Droplets className="h-4 w-4" /> Regn
            </span>
          )}
        </div>
      </CardContent>

      {/* Footer */}
      <CardFooter className="pt-0 px-3 pb-3 sm:px-4 sm:pb-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg sm:text-xl font-bold text-autoglass-blue">
            {formatPrice(product.price)}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className={`inline-block h-2 w-2 rounded-full ${stockDot}`} />
            <span className="truncate">{stockText}</span>
          </div>
          {/* Lagerlokasjon — placeholder for fremtidig integrasjon */}
          <div className="text-xs text-gray-500 mt-0.5">
            Lager: Hovedlager
          </div>
        </div>
        <Button
          size="sm"
          variant={inCart ? 'secondary' : 'default'}
          onClick={() => addItem(product)}
          className="gap-1 min-h-[44px] px-3 sm:px-4 flex-shrink-0"
        >
          {inCart ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
          <span>{inCart ? 'Lagt til' : 'Kjøp'}</span>
        </Button>
      </CardFooter>
    </Card>
  );
}
