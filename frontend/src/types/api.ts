// Product / Glass record from backend
export interface Product {
  eurocode: string;
  brand: string;
  model: string;
  title: string;
  description: string;
  category: string;
  yearFrom: number | null;
  yearTo: number | null;
  price: number;
  stockStatus: number;
  imageUrl: string;
  nagsCodes?: string[];

  // NEW: type code & position fields
  typeCode: string;
  typeCodeDesc: string;
  position: 'driver' | 'passenger' | 'center' | null;
  properties: {
    heated: boolean;
    rainSensor: boolean;
    adas: boolean;
    hud: boolean;
    acoustic: boolean;
    antenna: boolean;
    color: string | null;
    solar: boolean;
    tinted: boolean;
  };
  sourceUrl: string;
}

export interface CatalogFilters {
  brand?: string[];
  category?: string[];
  yearFrom?: number;
  yearTo?: number;
  priceMin?: number;
  priceMax?: number;
  query?: string;
}

export interface CatalogResponse {
  products: Product[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  filters: {
    brands: string[];
    categories: string[];
    years: { min: number; max: number };
    prices: { min: number; max: number };
  };
}

export interface VehicleInfo {
  make: string;
  model: string;
  year: number;
  vin: string;
  k_type: number;
  submodel?: string | null;
  effectiveEquipment?: EquipmentFlags | null;
}

export interface EquipmentFlags {
  adas: boolean;
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  hud: boolean;
  camera: boolean;
  laneAssist: boolean;
}

export interface ConfidenceInfo {
  score: number;
  label: string;
  reasons: string[];
  layer: number;
  groundTruth: boolean;
}

export interface SearchResult {
  vehicle: VehicleInfo;
  candidates: Product[];
  confidence: 'low' | 'medium' | 'high' | 'exact';
  layer: number;
  equipment?: EquipmentFlags;
  regnr?: string;

  // NEW: structured confidence + grouped results
  confidenceInfo?: ConfidenceInfo;
  resultsByType?: Record<string, Product[]>;
}
