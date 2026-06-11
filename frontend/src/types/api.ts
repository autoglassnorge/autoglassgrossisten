// Product / Glass record from backend
export interface Product {
  id: number;
  eurocode: string | null;
  brand: string;
  model: string;
  title: string;
  description: string;
  standardDescription?: string;
  rawDescription?: string;
  category: string;
  yearFrom: number | null;
  yearTo: number | null;
  articleNumber: string;
  price: number;
  stockStatus: number;
  imageUrl: string;
  nagsCodes?: string[];

  // NEW: type code & position fields
  typeCode: string;
  typeCodeDesc: string;
  position: 'driver' | 'passenger' | 'center' | 'both' | null;
  typeDescription?: string;
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
    camera?: boolean;
    green?: boolean;
    blue?: boolean;
    coated?: boolean;
    encapsulated?: boolean;
    laminated?: boolean;
    darkGreen?: boolean;
    laneAssist?: boolean;
    hasList?: boolean;
    listRequired?: boolean;
    listIncluded?: boolean;
    listType?: string | null;
    hasKlips?: boolean;
    klipsRequired?: boolean;
    klipsType?: string | null;
  };
  sourceUrl: string;
  _score?: number; // Matching score from backend (0-100+)
  equipmentMatch?: 'perfect' | 'good' | 'check' | 'mismatch';
  equipmentDiff?: string[];
}

export interface CatalogFilters {
  brand?: string[];
  category?: string[];
  yearFrom?: number;
  yearTo?: number;
  priceMin?: number;
  priceMax?: number;
  query?: string;
  equipment?: string[];
  inStock?: boolean;
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

  // Extended vehicle details from SVV/Biluppgifter
  regno?: string;              // Registration number
  color?: string;              // Farge (f.eks. "Rød", "Sort")
  fuelType?: string;           // Drivstoff (f.eks. "Bensin", "Diesel")
  euroClass?: string;          // Euro-klasse (f.eks. "Euro 6")
  nextEUDate?: string;         // ISO dato for neste EU-kontroll
  registrationStatus?: string; // "Registrert" / "Avregistrert"
  vehicleClass?: string;       // "Personbil", "Varebil", etc.
  seatCount?: number;          // Antall seter
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

export type UserEquipmentAnswers = Partial<
  Pick<EquipmentFlags, 'adas' | 'rainSensor' | 'heated' | 'acoustic' | 'antenna' | 'hud' | 'camera'>
>;

export interface ConfidenceInfo {
  score: number;
  label: string;
  reasons: string[];
  layer: number;
  groundTruth: boolean;
}

export interface CalibrationRequirement {
  sensorType: string;
  sensorLabel: string;
  calibrationTriggers: string[];
  calibrationType: string;
  cscToolSupported: boolean;
  targetPlate: string | null;
  notes: string | null;
}

export interface KtypeInfo {
  ktype: number;
  brand: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  body?: string | null;
  source: string;
}

export interface KtypeLookupResponse {
  success: boolean;
  ktype?: number;
  vehicle?: {
    brand: string;
    model: string;
    year: number;
    yearFrom?: number;
    yearTo?: number;
  };
  error?: string;
}

export interface SearchResult {
  vehicle: VehicleInfo;
  candidates: Product[];
  confidence: 'low' | 'medium' | 'high' | 'exact';
  layer: number;
  equipment?: EquipmentFlags;
  regnr?: string;
  calibrationRequirements?: CalibrationRequirement[];

  // NEW: kType enrichment from Bovsoft/Finn.no
  ktypeInfo?: KtypeInfo;

  // NEW: structured confidence + grouped results
  confidenceInfo?: ConfidenceInfo;
  resultsByType?: Record<string, Product[]>;
  equipmentFilter?: {
    applied: boolean;
    answers?: UserEquipmentAnswers;
    exactCount?: number;
    uncertainCount?: number;
    showingUncertainFallback?: boolean;
    message?: string;
  };
}
