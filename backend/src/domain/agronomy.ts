// Minimal agronomy knowledge base for the crop-recommendation MVP.
// In production this is sourced from ICAR package-of-practices + Agmarknet
// price history + regional benchmarks. Values here are indicative defaults.

export type Season = 'kharif' | 'rabi' | 'zaid';

export interface CropProfile {
  crop: string;
  seasons: Season[];
  ph: [number, number];          // suitable soil pH range
  water_need: 'low' | 'medium' | 'high';
  expected_yield_kg_ha: number;  // benchmark yield
  price_per_kg: number;          // indicative modal price (₹)
  input_cost_per_ha: number;     // indicative cost of cultivation (₹)
  risk: number;                  // baseline agronomic/market risk 0-100
  market_demand: 'low' | 'medium' | 'high';
}

export const CROP_KB: CropProfile[] = [
  { crop: 'paddy',     seasons: ['kharif'],         ph: [5.0, 7.5], water_need: 'high',   expected_yield_kg_ha: 5000, price_per_kg: 21,  input_cost_per_ha: 45000, risk: 40, market_demand: 'high' },
  { crop: 'maize',     seasons: ['kharif', 'rabi'], ph: [5.5, 7.5], water_need: 'medium', expected_yield_kg_ha: 6000, price_per_kg: 20,  input_cost_per_ha: 38000, risk: 35, market_demand: 'high' },
  { crop: 'tomato',    seasons: ['kharif', 'rabi'], ph: [6.0, 7.0], water_need: 'medium', expected_yield_kg_ha: 35000,price_per_kg: 14,  input_cost_per_ha: 120000,risk: 60, market_demand: 'high' },
  { crop: 'onion',     seasons: ['rabi'],           ph: [6.0, 7.5], water_need: 'medium', expected_yield_kg_ha: 25000,price_per_kg: 16,  input_cost_per_ha: 90000, risk: 55, market_demand: 'high' },
  { crop: 'cotton',    seasons: ['kharif'],         ph: [6.0, 8.0], water_need: 'medium', expected_yield_kg_ha: 2000, price_per_kg: 70,  input_cost_per_ha: 60000, risk: 50, market_demand: 'medium' },
  { crop: 'groundnut', seasons: ['kharif', 'rabi'], ph: [6.0, 7.5], water_need: 'low',    expected_yield_kg_ha: 2500, price_per_kg: 60,  input_cost_per_ha: 42000, risk: 38, market_demand: 'medium' },
  { crop: 'greengram', seasons: ['kharif', 'zaid'], ph: [6.2, 7.5], water_need: 'low',    expected_yield_kg_ha: 900,  price_per_kg: 85,  input_cost_per_ha: 22000, risk: 30, market_demand: 'medium' },
  { crop: 'chilli',    seasons: ['kharif', 'rabi'], ph: [6.0, 7.0], water_need: 'medium', expected_yield_kg_ha: 3000, price_per_kg: 110, input_cost_per_ha: 130000,risk: 62, market_demand: 'high' },
  { crop: 'sugarcane', seasons: ['kharif'],         ph: [6.0, 7.5], water_need: 'high',   expected_yield_kg_ha: 80000,price_per_kg: 3.2, input_cost_per_ha: 120000,risk: 45, market_demand: 'high' },
  { crop: 'wheat',     seasons: ['rabi'],           ph: [6.0, 7.5], water_need: 'medium', expected_yield_kg_ha: 4500, price_per_kg: 24,  input_cost_per_ha: 35000, risk: 32, market_demand: 'high' },
];
