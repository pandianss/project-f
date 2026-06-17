// Field onboarding + Farm Passport issuance.
import { withTx, query } from '../db/pool.js';
import { awardRp } from './respect.js';

/** GeoJSON Polygon ring: array of [lng, lat] pairs, first == last. */
export type PolygonCoords = number[][][];

export interface CreateFieldInput {
  farmerId: string;
  boundary: PolygonCoords; // GeoJSON Polygon coordinates
  ownership?: string;
  surveyNo?: string;
  ulpin?: string;
  waterSource?: { type: string; depth_m?: number };
}

/** Permanent, human-readable Farm Passport number: FP-<YEAR>-<8 hex>. */
function makePassportNo(): string {
  const year = new Date().getUTCFullYear();
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')
    .toUpperCase();
  return `FP-${year}-${rand}`;
}

export async function createField(input: CreateFieldInput) {
  const geojson = JSON.stringify({ type: 'Polygon', coordinates: input.boundary });
  const passportNo = makePassportNo();

  return withTx(async (client) => {
    // Validate + repair geometry, compute area in hectares (geography → m²).
    const valid = await client.query<{ ok: boolean }>(
      'SELECT ST_IsValid(ST_GeomFromGeoJSON($1)) AS ok',
      [geojson],
    );
    if (!valid.rows[0]?.ok) {
      throw Object.assign(new Error('Invalid polygon geometry'), { statusCode: 400 });
    }

    const inserted = await client.query<{
      field_id: string;
      passport_no: string;
      area_ha: string;
    }>(
      `INSERT INTO field (passport_no, ulpin, farmer_id, ownership, survey_no, boundary, centroid, area_ha)
       VALUES (
         $1, $2, $3, $4, $5,
         ST_GeomFromGeoJSON($6)::geography,
         ST_Centroid(ST_GeomFromGeoJSON($6))::geography,
         ROUND((ST_Area(ST_GeomFromGeoJSON($6)::geography) / 10000.0)::numeric, 4)
       )
       RETURNING field_id, passport_no, area_ha::text`,
      [passportNo, input.ulpin ?? null, input.farmerId, input.ownership ?? null, input.surveyNo ?? null, geojson],
    );
    const field = inserted.rows[0];

    let hasWater = false;
    if (input.waterSource) {
      await client.query(
        `INSERT INTO water_source (field_id, type, depth_m) VALUES ($1,$2,$3)`,
        [field.field_id, input.waterSource.type, input.waterSource.depth_m ?? null],
      );
      hasWater = true;
    }

    // Respect Points: a complete passport (boundary + ownership + water source) earns +50.
    if (input.ownership && hasWater) {
      await awardRp(client, input.farmerId, 'passport_complete', field.field_id);
    }

    return {
      field_id: field.field_id,
      passport_no: field.passport_no,
      area_ha: Number(field.area_ha),
    };
  });
}

export async function getPassport(fieldId: string) {
  const field = await query(
    `SELECT field_id, passport_no, ulpin, farmer_id, ownership, survey_no,
            area_ha, ST_AsGeoJSON(boundary)::json AS boundary,
            ST_AsGeoJSON(centroid)::json AS centroid, created_at
       FROM field WHERE field_id=$1`,
    [fieldId],
  );
  if (field.rowCount === 0) {
    throw Object.assign(new Error('Field not found'), { statusCode: 404 });
  }
  const [water, crops, soil, disease, yields, scores] = await Promise.all([
    query('SELECT type, depth_m FROM water_source WHERE field_id=$1', [fieldId]),
    query('SELECT season, year, crop, variety, sowing_date, harvest_date, satellite_corroborated, source FROM crop_history WHERE field_id=$1 ORDER BY year DESC', [fieldId]),
    query('SELECT sampled_on, n, p, k, ph, ec, organic_carbon, source FROM soil_history WHERE field_id=$1 ORDER BY sampled_on DESC', [fieldId]),
    query('SELECT detected_on, disease, pest, severity, confidence, remedy FROM disease_history WHERE field_id=$1 ORDER BY detected_on DESC', [fieldId]),
    query('SELECT yield_kg_ha, predicted_kg_ha, confidence, revenue FROM yield_history WHERE field_id=$1', [fieldId]),
    query('SELECT score_type, value, sub_scores, explanation, model_version, computed_at FROM field_score WHERE field_id=$1 ORDER BY computed_at DESC', [fieldId]),
  ]);

  return {
    field: field.rows[0],
    water_sources: water.rows,
    crop_history: crops.rows,
    soil_history: soil.rows,
    disease_history: disease.rows,
    yield_history: yields.rows,
    scores: scores.rows,
  };
}

export async function listFieldsByFarmer(farmerId: string) {
  const r = await query(
    `SELECT field_id, passport_no, area_ha, ownership,
            ST_AsGeoJSON(centroid)::json AS centroid, created_at
       FROM field WHERE farmer_id=$1 ORDER BY created_at DESC`,
    [farmerId],
  );
  return r.rows;
}
