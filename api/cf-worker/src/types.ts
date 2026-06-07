/**
 * Shared types for the Autoglass AS Cloudflare Worker.
 */

export interface Env {
  GLASS_CATALOG: KVNamespace;
  GLASS_CATALOG_D1: D1Database;
  AI: Ai;
  BILUPPGIFTER_API_KEY: string;
  BOVSOFT_CLIENT_ID: string;
  BOVSOFT_SECCODE: string;
  SVV_API_KEY: string;
  RAPIDAPI_KEY?: string; // DEPRECATED
  VINCARIO_API_KEY?: string;
  VINCARIO_SECRET_KEY?: string;
  MACS_VIS_API_KEY?: string;
  AGM_API_KEY?: string;
  GROQ_API_KEY?: string;
  ENVIRONMENT?: "development" | "production";
}

export interface GlassRecord {
  id: number;
  supplier_sku: string;
  eurocode: string | null;
  article_number: string | null;
  scan_number: string | null;
  category: string;
  supplier: string | null;
  brand: string;
  model: string | null;
  submodel: string | null;
  year_from: number | null;
  year_to: number | null;
  prefix4: string;
  adas: number;
  rain_sensor: number;
  heated: number;
  acoustic: number;
  antenna: number;
  hud: number;
  shade: number;
  camera: number;
  lane_assist: number;
  adas_features: string | null;
  price: number | null;
  stock_status: number | null;
  warehouse_location: string | null;
  oem_numbers: string | null;
  cross_references: string | null;
  weight: number | null;
  dimensions: string | null;
  color: string | null;
  solar: number | null;
  tinted: number | null;
  description: string;
  image_url: string | null;
  pdf_url: string | null;
  source: string;
  source_url: string | null;
  nags_codes: string | null;
  brand_original: string | null;
  ktype: number | null;
  created_at: string | null;
  typeCode?: string;
  typeCodeDesc?: string;
  position?: "driver" | "passenger" | "both" | null;
  nagsCodes?: string[];
}

export interface VehicleFingerprint {
  id: number;
  make: string;
  type_code: string;
  year_from: number | null;
  year_to: number | null;
  model_hint: string | null;
  models: string;
  engine_codes: string | null;
  fuel_codes: string | null;
  sample_count: number;
}

export interface FactoryEquipment {
  rainSensor: boolean;
  heated: boolean;
  acoustic: boolean;
  antenna: boolean;
  camera: boolean;
  adas: boolean;
  hud: boolean;
  source: "bovsoft" | "biluppgifter" | "catalog_guess" | "learned" | "learned_vin" | "none";
  guessed?: boolean;
  guessConfidence?: string;
  guessSource?: string;
}

export interface BovsoftVehicle {
  ktype: number;
  vin: string;
  brand: string;
  model: string;
  type: string;
  yearFrom: number;
  yearTo: number;
  body: string;
  source: "bovsoft";
}

export interface SearchHistoryRecord {
  regnr_hash: string;
  make: string;
  model: string;
  year: number;
  generation?: string;
  body?: string;
  chosen_eurocode?: string;
  equipment: {
    adas: boolean;
    rainSensor: boolean;
    heated: boolean;
    acoustic: boolean;
    antenna: boolean;
    hud: boolean;
    camera: boolean;
    shade: boolean;
  };
  layer: number;
  confidence: string;
  source: string;
  vin_prefix?: string;
}

export interface GroundTruthRecord {
  id: number;
  regnr_hash: string;
  vin: string | null;
  vin_prefix: string | null;
  k_type: number | null;
  make: string;
  model: string;
  year: number;
  submodel: string | null;
  frontrute_eurocode: string | null;
  bakrute_eurocode: string | null;
  sideglass_fv_eurocode: string | null;
  sideglass_fh_eurocode: string | null;
  sideglass_bv_eurocode: string | null;
  sideglass_bh_eurocode: string | null;
  dor_fv_eurocode: string | null;
  dor_fh_eurocode: string | null;
  dor_bv_eurocode: string | null;
  dor_bh_eurocode: string | null;
  adas: number;
  rain_sensor: number;
  heated: number;
  acoustic: number;
  antenna: number;
  hud: number;
  camera: number;
  shade: number;
  properties: string | null;
  verified_by: string;
  verified_at: string;
  source_url: string | null;
  confidence: number;
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

export interface KtypeRegistryInfo {
  ktype: number;
  brand: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  body: string | null;
  source: string;
}

export interface AutoGlassMapping {
  make: string;
  model: string;
  year: number;
  typeCodes: Record<string, string>;
}

export interface GuessedEquipment {
  adas: number;
  rainSensor: number;
  heated: number;
  acoustic: number;
  antenna: number;
  camera: number;
  hud: number;
  shade: number;
  confidence: "high" | "medium" | "low" | "none";
  source: "catalog_signature" | "generation_signature" | "none";
}

export type SearchResult = {
  httpStatus: number;
  retryAfter?: number;
  body: unknown;
};

export interface GuideQuestion {
  id: string;
  type: "single_choice" | "boolean" | "multi_choice";
  label: string;
  options?: { value: string; label: string }[];
  reason: string;
}

export interface GuideState {
  step: number;
  question: GuideQuestion | null;
  candidates: number;
  progress: { current: number; total: number };
  recommendation?: GlassRecord[];
  answers?: Record<string, string>;
}

export interface CacheEnvelope<T> {
  version: string;
  cachedAt: string;
  data: T;
}

// ---------------------------------------------------------------------------
// AI Ordremottaker types
// ---------------------------------------------------------------------------

export interface OrdremottakerRequest {
  message: string;
  session_token?: string;
  customer_id?: number;
  channel?: "chat" | "email" | "phone";
  language?: "no" | "sv" | "da" | "en";
}

export interface AccessoryItem {
  sku: string;
  name: string;
  price: number;
  included: boolean;
  removable: boolean;
  notes?: string;
  category?: "required" | "recommended" | "warning";
}

export interface ProactiveSuggestionItem {
  sku: string;
  name: string;
  lastOrdered: string;
  qty: number;
  product?: GlassRecord;
}

export interface ProactiveSuggestion {
  type: "last_order" | "frequent_item" | "reorder_prompt";
  message: string;
  items: ProactiveSuggestionItem[];
}

export interface OrdremottakerResponse {
  status: "question" | "recommendation" | "order_ready" | "escalated" | "clarification";
  ai_response: string;
  session_token: string;
  candidates?: GlassRecord[];
  accessories?: AccessoryItem[];
  cart_url?: string;
  confidence: number;
  next_action?: string;
  proactive_suggestions?: ProactiveSuggestion[];
}

export interface AiSession {
  id: number;
  customer_id: number | null;
  channel: string;
  session_token: string;
  context: string;
  status: "active" | "completed" | "escalated";
  created_at: string;
  updated_at: string;
}
