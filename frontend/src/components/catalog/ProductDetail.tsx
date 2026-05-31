import { useState, useEffect, useMemo } from 'react';
import { X, ShoppingCart, Check, Thermometer, Droplets, Shield, AlertTriangle, Package, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Product } from '@/types/api';
import { formatPrice, typeCodeLabel, positionLabel } from '@/utils/formatters';
import { useCartStore } from '@/stores/cartStore';

interface ProductDetailProps {
  product: Product | null;
  onClose: () => void;
}

export function ProductDetail({ product, onClose }: ProductDetailProps) {
  const [imgError, setImgError] = useState(false);
  const [imgZoomed, setImgZoomed] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  
  // Select cart items and compute inCart with useMemo for stable reference
  const cartItems = useCartStore((s) => s.items);
  const inCart = useMemo(
    () => cartItems.some((i) => i.product.id === product?.id),
    [cartItems, product?.id]
  );

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (product) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [product, onClose]);

  if (!product) return null;

  const stockDot = product.stockStatus > 0 ? 'bg-green-500' : 'bg-amber-500';
  const stockText = product.stockStatus > 0 ? `${product.stockStatus} på lager` : 'Bestillingsvare';

  // Equipment specs for table
  const equipmentRows = [
    { key: 'adas', label: 'ADAS-kompatibel', icon: Shield, value: product.properties?.adas },
    { key: 'heated', label: 'Oppvarmet', icon: Thermometer, value: product.properties?.heated },
    { key: 'rainSensor', label: 'Regnsensor', icon: Droplets, value: product.properties?.rainSensor },
    { key: 'acoustic', label: 'Akustisk', icon: null, value: product.properties?.acoustic },
    { key: 'hud', label: 'HUD', icon: null, value: product.properties?.hud },
    { key: 'antenna', label: 'Antenne', icon: null, value: product.properties?.antenna },
    { key: 'camera', label: 'Kamera', icon: null, value: product.properties?.camera },
    { key: 'solar', label: 'Solar', icon: null, value: product.properties?.solar },
    { key: 'tinted', label: 'Tonet', icon: null, value: product.properties?.tinted },
  ].filter((r) => r.value);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-2xl sm:max-h-[85vh] bg-white sm:rounded-2xl shadow-2xl flex flex-col animate-slide-up max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="font-mono text-xs flex-shrink-0 gap-1">
              <span className="text-[9px] font-medium text-gray-500 uppercase tracking-wider">
                {product.eurocode ? 'Eurokode' : 'Varenr'}
              </span>
              <span className="font-bold text-gray-800">{product.eurocode || product.articleNumber}</span>
            </Badge>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {typeCodeLabel(product.typeCode || product.category)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Lukk"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Image */}
          <div
            className="relative aspect-[16/10] bg-gray-100 rounded-xl overflow-hidden cursor-zoom-in group"
            onClick={() => product.imageUrl && setImgZoomed(true)}
          >
            {!imgError && product.imageUrl ? (
              <>
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2 shadow-lg">
                    <ZoomIn className="h-5 w-5 text-gray-700" />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                <Package className="h-12 w-12" />
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
              {product.title || `${product.brand} ${product.model}`}
            </h2>
            {product.standardDescription && (
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                {product.standardDescription}
              </p>
            )}
          </div>

          {/* Equipment table */}
          {equipmentRows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Utstyrsspesifikasjon</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {equipmentRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-100 px-3 py-2"
                  >
                    {row.icon && <row.icon className="h-4 w-4 text-green-600 flex-shrink-0" />}
                    <span className="text-sm text-green-800">{row.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* List/klips warnings */}
          {(product.properties?.listRequired || product.properties?.klipsRequired) && (
            <div className="space-y-2">
              {product.properties?.listRequired && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">
                      Krever {product.properties?.listType || 'lister'}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Dette glasset krever lister som må bestilles separat.
                    </p>
                  </div>
                </div>
              )}
              {product.properties?.klipsRequired && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">
                      Krever {product.properties?.klipsType || 'klips'}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Dette glasset krever klips som må bestilles separat.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Technical details */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {product.brand && (
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-700 w-1/3">Merke</td>
                    <td className="px-4 py-2.5 text-gray-900">{product.brand}</td>
                  </tr>
                )}
                {product.model && (
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-700">Modell</td>
                    <td className="px-4 py-2.5 text-gray-900">{product.model}</td>
                  </tr>
                )}
                {(product.yearFrom || product.yearTo) && (
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-700">Årsmodell</td>
                    <td className="px-4 py-2.5 text-gray-900">
                      {product.yearFrom && product.yearTo
                        ? `${product.yearFrom}–${product.yearTo}`
                        : product.yearFrom
                          ? `Fra ${product.yearFrom}`
                          : `Til ${product.yearTo}`}
                    </td>
                  </tr>
                )}
                {product.position && (
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-700">Posisjon</td>
                    <td className="px-4 py-2.5 text-gray-900">{positionLabel(product.position)}</td>
                  </tr>
                )}
                {product.nagsCodes && product.nagsCodes.length > 0 && (
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-700">NAGS</td>
                    <td className="px-4 py-2.5 text-gray-900 font-mono">{product.nagsCodes.join(', ')}</td>
                  </tr>
                )}
                {product.properties?.color && (
                  <tr>
                    <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-700">Farge</td>
                    <td className="px-4 py-2.5 text-gray-900">{product.properties.color}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer — price + CTA */}
        <div className="p-4 sm:p-6 border-t bg-gray-50 sm:rounded-b-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-autoglass-blue">
                {formatPrice(product.price)}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                <span className={`inline-block h-2 w-2 rounded-full ${stockDot}`} />
                <span>{stockText}</span>
              </div>
            </div>
            <Button
              size="lg"
              variant={inCart ? 'secondary' : 'default'}
              onClick={() => addItem(product)}
              className="gap-2 min-h-[48px] px-6"
            >
              {inCart ? <Check className="h-5 w-5" /> : <ShoppingCart className="h-5 w-5" />}
              {inCart ? 'Lagt til' : 'Legg i handlekurv'}
            </Button>
          </div>
        </div>
      </div>

      {/* Zoomed image overlay */}
      {imgZoomed && product.imageUrl && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImgZoomed(false)}
        >
          <img
            src={product.imageUrl}
            alt={product.title}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <button
            type="button"
            onClick={() => setImgZoomed(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </div>
  );
}
