// Farm Risk + Credit scoring engine (MVP, explainable).
//
// This is a transparent, rule-based v1 scorecard — the cold-start baseline the
// docs describe (agro-climatic priors + field signals). It produces 0-100
// sub-scores and human-readable REASON CODES, and is the exact contract a
// GBM/scorecard model will later replace behind the same interface.
// See docs/08-Engines-Spec.md §9 (risk) and §10 (credit).
import { withTx, query } from '../db/pool.js';

export const MODEL_VERSION = 'risk-credit-rules-0.1.0';

interface TwinFeatures {
  area_ha: number;
  has_water: boolean;
  water_depth_m: number | null;
  season_count: number;
  corroborated_seasons: number;
  crop_diversity: number;
  has_soil_test: boolean;
  soil_oc: number | null; // organic carbon
  soil_ph: number | null;
  avg_yield_kg_ha: number | null;
  disease_events: number;
  kyc_verified: boolean;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

async function loadFeatures(fieldId: string): Promise<{ farmer_id: string; f: TwinFeatures }> {
  const field = await query<{ farmer_id: string; area_ha: string | null }>(
    'SELECT farmer_id, area_ha::text FROM field WHERE field_id=$1',
    [fieldId],
  );
  if (field.rowCount === 0) throw Object.assign(new Error('Field not found'), { statusCode: 404 });

  const [water, seasons, soil, yields, disease, farmer] = await Promise.all([
    query<{ c: string; min_depth: string | null }>(
      'SELECT COUNT(*)::int c, MIN(depth_m)::text min_depth FROM water_source WHERE field_id=$1',
      [fieldId],
    ),
    query<{ total: string; corr: string; distinct_crop: string }>(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE satellite_corroborated)::int corr,
              COUNT(DISTINCT crop)::int distinct_crop
         FROM crop_history WHERE field_id=$1`,
      [fieldId],
    ),
    query<{ oc: string | null; ph: string | null }>(
      'SELECT organic_carbon::text oc, ph::text ph FROM soil_history WHERE field_id=$1 ORDER BY sampled_on DESC NULLS LAST LIMIT 1',
      [fieldId],
    ),
    query<{ avg_yield: string | null }>(
      'SELECT AVG(yield_kg_ha)::text avg_yield FROM yield_history WHERE field_id=$1',
      [fieldId],
    ),
    query<{ c: string }>('SELECT COUNT(*)::int c FROM disease_history WHERE field_id=$1', [fieldId]),
    query<{ kyc_status: string }>('SELECT kyc_status FROM farmer WHERE farmer_id=$1', [
      field.rows[0].farmer_id,
    ]),
  ]);

  const f: TwinFeatures = {
    area_ha: Number(field.rows[0].area_ha ?? 0),
    has_water: Number(water.rows[0].c) > 0,
    water_depth_m: water.rows[0].min_depth ? Number(water.rows[0].min_depth) : null,
    season_count: Number(seasons.rows[0].total),
    corroborated_seasons: Number(seasons.rows[0].corr),
    crop_diversity: Number(seasons.rows[0].distinct_crop),
    has_soil_test: soil.rowCount! > 0,
    soil_oc: soil.rows[0]?.oc ? Number(soil.rows[0].oc) : null,
    soil_ph: soil.rows[0]?.ph ? Number(soil.rows[0].ph) : null,
    avg_yield_kg_ha: yields.rows[0]?.avg_yield ? Number(yields.rows[0].avg_yield) : null,
    disease_events: Number(disease.rows[0].c),
    kyc_verified: farmer.rows[0]?.kyc_status === 'verified',
  };
  return { farmer_id: field.rows[0].farmer_id, f };
}

export interface ReasonCode {
  code: string;
  impact: '+' | '-';
  weight: number;
}

// ---------------- FARM RISK (0 = safe, 100 = high risk) ----------------
function computeRisk(f: TwinFeatures) {
  const reasons: ReasonCode[] = [];
  let water_risk = 50;
  if (f.has_water) {
    water_risk -= 25;
    reasons.push({ code: 'IRRIGATION_ACCESS', impact: '-', weight: 0.25 });
    if ((f.water_depth_m ?? 0) > 150) {
      water_risk += 20;
      reasons.push({ code: 'DEEP_WATER_TABLE', impact: '+', weight: 0.2 });
    }
  } else {
    water_risk += 25;
    reasons.push({ code: 'RAINFED_NO_SOURCE', impact: '+', weight: 0.25 });
  }

  let disease_risk = 30 + f.disease_events * 12;
  if (f.disease_events > 0) reasons.push({ code: 'DISEASE_HISTORY', impact: '+', weight: 0.2 });

  let drought_risk = f.has_water ? 30 : 60;
  let market_risk = f.crop_diversity >= 3 ? 30 : 50;
  if (f.crop_diversity >= 3) reasons.push({ code: 'CROP_DIVERSIFIED', impact: '-', weight: 0.15 });

  const sub = {
    water_risk: clamp(water_risk),
    disease_risk: clamp(disease_risk),
    drought_risk: clamp(drought_risk),
    market_risk: clamp(market_risk),
  };
  const overall = clamp(
    0.3 * sub.water_risk + 0.25 * sub.disease_risk + 0.25 * sub.drought_risk + 0.2 * sub.market_risk,
  );
  return { value: overall, sub, reasons };
}

// ---------------- FARM CREDIT (0-100, higher = more creditworthy) ----------------
function computeCredit(f: TwinFeatures, riskValue: number) {
  const reasons: ReasonCode[] = [];

  // Productivity: corroborated cultivation + yield evidence.
  let productivity = 40 + f.corroborated_seasons * 10 + (f.avg_yield_kg_ha ? 15 : 0);
  if (f.corroborated_seasons >= 2)
    reasons.push({ code: 'PROVEN_CULTIVATION', impact: '+', weight: 0.2 });

  // Stability: history depth + crop diversification.
  let stability = 30 + f.season_count * 6 + f.crop_diversity * 5;
  if (f.season_count >= 3) reasons.push({ code: 'STABLE_HISTORY', impact: '+', weight: 0.15 });

  // Repayment capacity proxy: area + irrigation + yield.
  let repayment = 30 + Math.min(f.area_ha, 10) * 4 + (f.has_water ? 15 : 0);
  if (f.area_ha >= 5) reasons.push({ code: 'ADEQUATE_LANDHOLDING', impact: '+', weight: 0.15 });

  // Climate resilience: inverse of farm risk.
  let resilience = 100 - riskValue;
  if (riskValue > 60) reasons.push({ code: 'HIGH_FARM_RISK', impact: '-', weight: 0.2 });

  // Input efficiency: soil test on record + healthy OC.
  let input_efficiency = 40 + (f.has_soil_test ? 20 : 0) + ((f.soil_oc ?? 0) > 0.5 ? 15 : 0);
  if (f.has_soil_test) reasons.push({ code: 'SOIL_MANAGED', impact: '+', weight: 0.1 });

  if (!f.kyc_verified) reasons.push({ code: 'KYC_INCOMPLETE', impact: '-', weight: 0.25 });

  const sub = {
    productivity: clamp(productivity),
    stability: clamp(stability),
    repayment_capacity: clamp(repayment),
    climate_resilience: clamp(resilience),
    input_efficiency: clamp(input_efficiency),
  };
  let overall = clamp(
    0.25 * sub.productivity +
      0.2 * sub.stability +
      0.25 * sub.repayment_capacity +
      0.15 * sub.climate_resilience +
      0.15 * sub.input_efficiency,
  );
  // KYC is a hard gate on creditworthiness.
  if (!f.kyc_verified) overall = clamp(overall * 0.6);

  // Map 0-100 to an indicative band + recommended KCC limit (₹).
  const band = overall >= 75 ? 'A' : overall >= 60 ? 'B' : overall >= 45 ? 'C' : 'D';
  const recommended_kcc_limit = Math.round((overall / 100) * f.area_ha * 60000); // ₹/ha scaled
  return { value: overall, sub, reasons, band, recommended_kcc_limit };
}

async function persist(
  fieldId: string,
  scoreType: string,
  value: number,
  sub: object,
  reasons: ReasonCode[],
  extra: object = {},
) {
  await withTx(async (c) => {
    await c.query(
      `INSERT INTO field_score (field_id, score_type, value, sub_scores, explanation, model_version)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        fieldId,
        scoreType,
        value,
        JSON.stringify(sub),
        JSON.stringify({ reason_codes: reasons, ...extra }),
        MODEL_VERSION,
      ],
    );
  });
}

export async function scoreField(fieldId: string) {
  const { f } = await loadFeatures(fieldId);
  const risk = computeRisk(f);
  const credit = computeCredit(f, risk.value);

  await persist(fieldId, 'farm_risk', risk.value, risk.sub, risk.reasons);
  await persist(fieldId, 'credit', credit.value, credit.sub, credit.reasons, {
    band: credit.band,
    recommended_kcc_limit: credit.recommended_kcc_limit,
  });

  return {
    field_id: fieldId,
    model_version: MODEL_VERSION,
    farm_risk: { value: risk.value, sub_scores: risk.sub, reason_codes: risk.reasons },
    credit: {
      value: credit.value,
      band: credit.band,
      recommended_kcc_limit: credit.recommended_kcc_limit,
      sub_scores: credit.sub,
      reason_codes: credit.reasons,
    },
  };
}
