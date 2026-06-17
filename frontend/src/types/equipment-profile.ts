export interface EquipmentCombination {
  f: string[];
  c: number;
  p: number;
}

export interface EquipmentProfile {
  n: number;
  pos: string[];
  neg: string[];
  p: Record<string, number>;
  comb: EquipmentCombination[];
}

export interface EquipmentProfileResponse {
  found: boolean;
  vehicle: {
    brand: string;
    model: string;
    year: number | null;
  };
  profileKey: string;
  profileLevel: 'exact' | 'brandModel' | 'brand';
  totalProducts: number;
  categories: string[];
  categoryProfiles: Record<string, EquipmentProfile>;
  categoryProfile: {
    category: string;
    total: number;
    possible: string[];
    impossible: string[];
    likely: Record<string, number>;
    combinations: EquipmentCombination[];
  } | null;
}
