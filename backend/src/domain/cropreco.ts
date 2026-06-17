// Crop Recommendation Engine (MVP): suitability filter + profit/risk ranking.
// Hybrid rules baseline the docs describe (docs/08 §4) — feasibility gate first,
// then rank feasible crops by the farmer's risk/return preference. Every result
// is explainable with expected yield, profit, risk, and the reason it ranked.
import { query } from '../db/pool.js';
import { CROP_KB, type CropProfile, type Season } from './agronomy.js';

interface RecoInput {
  field_id: string;
  season: Season;
  water_availability?: 'low' | 'medium' | 'high';
  investment_capacity?: number; // ₹/ha the farmer can spend
  risk_appetite?: 'low' | 'medium' | 'high';
}

const waterRank = { low: 0, medium: 1, high: 2 } as const;

function suitable(c: CropProfile, season: Season, water: 'low' | 'medium' | 'high', ph: number | null) {
  if (!c.seasons.includes(season)) return { ok: false, why: 'season mismatch' };
  if (waterRank[c.water_need] > waterRank[water])
    return { ok: false, why: `needs ${c.water_need} water` };
  if (ph != null && (ph < c.ph[0] || ph > c.ph[1]))
    return { ok: false, why: `pH ${ph} outside ${c.ph[0]}-${c.ph[1]}` };
  return { ok: true, why: 'suitable' };
}

export async function recommendCrops(input: RecoInput) {
  // Pull field context from the twin: latest soil pH + inferred water availability.
  const soil = await query<{ ph: string | null }>(
    'SELECT ph::text FROM soil_history WHERE field_id=$1 ORDER BY sampled_on DESC NULLS LAST LIMIT 1',
    [input.field_id],
  );
  const water = await query<{ type: string; depth_m: string | null }>(
    'SELECT type, depth_m::text FROM water_source WHERE field_id=$1 LIMIT 1',
    [input.field_id],
  );
  const fieldExists = await query('SELECT 1 FROM field WHERE field_id=$1', [input.field_id]);
  if (fieldExists.rowCount === 0)
    throw Object.assign(new Error('Field not found'), { statusCode: 404 });

  const ph = soil.rows[0]?.ph ? Number(soil.rows[0].ph) : null;
  // Infer water availability if not provided: source present => medium, none => low.
  const waterAvail =
    input.water_availability ?? (water.rowCount! > 0 ? 'medium' : 'low');
  const riskAppetite = input.risk_appetite ?? 'medium';
  const riskTolerance = { low: 35, medium: 55, high: 80 }[riskAppetite];

  const feasible = CROP_KB.map((c) => ({ c, s: suitable(c, input.season, waterAvail, ph) })).filter(
    (x) => x.s.ok,
  );

  const ranked = feasible
    .map(({ c }) => {
      const revenue = c.expected_yield_kg_ha * c.price_per_kg;
      const profit = Math.round(revenue - c.input_cost_per_ha);
      const affordable =
        input.investment_capacity == null || c.input_cost_per_ha <= input.investment_capacity;
      // Score: profit normalized, penalized by how far risk exceeds appetite.
      const riskPenalty = Math.max(0, c.risk - riskTolerance) * 1500;
      const affordPenalty = affordable ? 0 : 0.3 * profit;
      const score = Math.round(profit - riskPenalty - affordPenalty);
      const reasons: string[] = [];
      if (c.market_demand === 'high') reasons.push('strong market demand');
      if (c.risk <= riskTolerance) reasons.push('within your risk appetite');
      if (c.water_need !== 'high') reasons.push('moderate water need');
      if (!affordable) reasons.push('above your stated budget');
      return {
        crop: c.crop,
        expected_yield_kg_ha: c.expected_yield_kg_ha,
        expected_revenue: revenue,
        input_cost_per_ha: c.input_cost_per_ha,
        expected_profit_per_ha: profit,
        risk: c.risk,
        market_demand: c.market_demand,
        affordable,
        score,
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    field_id: input.field_id,
    context: { season: input.season, soil_ph: ph, water_availability: waterAvail, risk_appetite: riskAppetite },
    recommendations: ranked,
  };
}
