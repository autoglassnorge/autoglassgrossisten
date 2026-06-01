import { X, ShoppingCart, Scale, Check } from 'lucide-react';

export interface BrowseProduct {
  title: string;
  sku: string | null;
  typeCode: string | null;
  typeCodeRel: string | null;
  price: number | null;
}

interface QuickViewModalProps {
  product: BrowseProduct | null;
  isOpen: boolean;
  onClose: () => void;
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

const formatPrice = (price: number | null) => {
  if (price === null || price === 0) return 'Pris på forespørsel';
  return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK' }).format(price);
};

export function QuickViewModal({
  product,
  isOpen,
  onClose,
  onAddToCart,
  isInComparison,
  onToggleComparison,
}: QuickViewModalProps) {
  if (!isOpen || !product) return null;

  const hasPrice = product.price !== null && product.price > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-10"
          title="Lukk"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="p-6">
          {/* Type chip */}
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 mb-4">
            {getTypeCodeLabel(product.typeCode)}
          </span>
          
          {/* Title */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4 pr-10">
            {product.title}
          </h2>
          
          {/* Details */}
          <div className="space-y-3 mb-6">
            {product.sku && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">SKU</span>
                <span className="font-medium text-gray-900">{product.sku}</span>
              </div>
            )}
            
            {product.typeCode && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Typekode</span>
                <span className="font-medium text-gray-900">{product.typeCode}</span>
              </div>
            )}
            
            {product.typeCodeRel && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500">Relatert typekode</span>
                <span className="font-medium text-gray-900">{product.typeCodeRel}</span>
              </div>
            )}
            
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-500">Pris</span>
              <span className={`font-semibold ${hasPrice ? 'text-gray-900' : 'text-gray-500'}`}>
                {formatPrice(product.price)}
              </span>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-3">
            {/* Add to cart */}
            <button
              onClick={() => {
                onAddToCart();
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-autoglass-blue text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <ShoppingCart className="w-5 h-5" />
              Legg til handlekurv
            </button>
            
            {/* Toggle comparison */}
            <button
              onClick={onToggleComparison}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                isInComparison
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {isInComparison ? (
                <>
                  <Check className="w-5 h-5" />
                  I sammenligning
                </>
              ) : (
                <>
                  <Scale className="w-5 h-5" />
                  Sammenlign
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
