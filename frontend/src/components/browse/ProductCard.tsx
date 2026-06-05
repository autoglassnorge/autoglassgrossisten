import { Shield, Square, PanelLeft, PanelRight, GlassWater, Info, Plus, Check, Scale } from 'lucide-react';

export interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

interface ProductCardProps {
  product: BrowseProduct;
  onQuickView: () => void;
  onAddToCart: () => void;
  isInComparison: boolean;
  onToggleComparison: () => void;
}

const typeCodeLabel: Record<string, string> = {
  F: 'Frontrute',
  B: 'Bakrute',
  DV: 'Vindusglass dør venstre',
  DH: 'Vindusglass dør høyre',
  D: 'Dørrute',
  SV: 'Sidevindu venstre',
  SH: 'Sidevindu høyre',
  S: 'Siderute',
};

const getTypeCodeLabel = (code: string | null): string => {
  if (!code) return 'Bilglass';
  return typeCodeLabel[code] || typeCodeLabel[code.charAt(0)] || 'Bilglass';
};

const PlaceholderIcon = ({ typeCode }: { typeCode: string | null }) => {
  const iconClass = "w-16 h-16 text-gray-300";
  
  if (!typeCode) {
    return <GlassWater className={iconClass} />;
  }
  
  const firstChar = typeCode.charAt(0);
  
  switch (firstChar) {
    case 'F':
      return <Shield className={iconClass} />;
    case 'B':
      return <Square className={iconClass} />;
    case 'D':
      return typeCode.endsWith('V') 
        ? <PanelLeft className={iconClass} />
        : <PanelRight className={iconClass} />;
    case 'S':
      return <GlassWater className={iconClass} />;
    default:
      return <GlassWater className={iconClass} />;
  }
};

const formatPrice = (price: number | null) => {
  if (price === null || price === 0) return 'Pris på forespørsel';
  return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK' }).format(price);
};

const PriceLabel = ({ price }: { price: number | null }) => {
  if (price === null || price === 0) {
    return <span className="text-sm text-gray-500 italic">Pris på forespørsel</span>;
  }
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold text-gray-900">
        {formatPrice(price)}
      </span>
      <span className="text-xs text-gray-400">eks. mva</span>
    </div>
  );
};

export function ProductCard({
  product,
  onQuickView,
  onAddToCart,
  isInComparison,
  onToggleComparison,
}: ProductCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow duration-200 flex flex-col">
      {/* Image placeholder */}
      <div className="aspect-square bg-gray-50 rounded-md flex items-center justify-center mb-4">
        <PlaceholderIcon typeCode={product.typeCode} />
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col">
        {/* Type chip */}
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 w-fit mb-2">
          {getTypeCodeLabel(product.typeCode)}
        </span>
        
        {/* Title */}
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 mb-1 flex-1" title={product.title}>
          {product.title}
        </h3>
        
        {/* SKU */}
        {product.sku && (
          <p className="text-xs text-gray-500 mb-3">
            SKU: {product.sku}
          </p>
        )}
        
        {/* Footer: Price and Actions */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <PriceLabel price={product.price} />
          
          <div className="flex items-center gap-2">
            {/* Comparison toggle */}
            <button
              onClick={onToggleComparison}
              className={`p-1.5 rounded-md transition-colors ${
                isInComparison 
                  ? 'bg-blue-100 text-blue-600' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isInComparison ? 'Fjern fra sammenligning' : 'Legg til sammenligning'}
            >
              {isInComparison ? <Check className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
            </button>
            
            {/* Quick view */}
            <button
              onClick={onQuickView}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Hurtigvisning"
            >
              <Info className="w-4 h-4" />
            </button>
            
            {/* Add to cart */}
            <button
              onClick={onAddToCart}
              className="p-1.5 bg-autoglass-blue text-white rounded-md hover:bg-blue-700 transition-colors"
              title="Legg til handlekurv"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
