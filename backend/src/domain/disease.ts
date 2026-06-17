// Disease Prediction Engine (pre-symptom).
// Predicts disease BEFORE symptoms using crop-disease FAVOURABILITY rules
// (weather + crop stage) plus NEIGHBOUR-FIELD spread within a radius.
// Interpretable epidemiological baseline a GBM refines later (docs/08 §7).
import { withTx, query } from '../db/pool.js';

interface FavRule {
  disease: string;
  crops: string[];
  // favourable weather window
  humidity_min: number;
  tmax_range: [number, number];
  rain_min_mm?: number; // some diseases need wetness
  remedy: string;
}

// Indicative favourability rules (ICAR/regional models in production).
const RULES: FavRule[] = [
  {
    disease: 'rice blast',
    crops: ['paddy', 'rice'],
    humidity_min: 85,
    tmax_range: [24, 30],
    remedy: 'Apply tricyclazole prophylactically; avoid excess nitrogen; drain field.',
  },
  {
    disease: 'late blight',
    crops: ['tomato', 'potato'],
    humidity_min: 80,
    tmax_range: [12, 24],
    rain_min_mm: 5,
    remedy: 'Apply mancozeb/metalaxyl preventively; improve airflow; remove infected debris.',
  },
  {
    disease: 'powdery mildew',
    crops: ['chilli', 'tomato', 'cucurbits', 'wheat'],
    humidity_min: 70,
    tmax_range: [20, 30],
    remedy: 'Apply sulphur/wettable-sulphur or potassium bicarbonate; increase spacing.',
  },
  {
    disease: 'downy mildew',
    crops: ['onion', 'cucurbits', 'maize'],
    humidity_min: 85,
    tmax_range: [10, 25],
    rain_min_mm: 3,
    remedy: 'Apply metalaxyl + mancozeb; avoid overhead irrigation in the evening.',
  },
  {
    disease: 'leaf rust',
    crops: ['wheat', 'maize'],
    humidity_min: 75,
    tmax_range: [15, 25],
    remedy: 'Apply propiconazole; use resistant varieties next cycle.',
  },
];

interface Weather {
  humidity?: number;
  tmax?: number;
  tmin?: number;
  rainfall_mm?: number;
}

function favourability(rule: FavRule, w: Weather): number {
  // 0..1 favourability score from how well weather matches the disease window.
  if (w.humidity == null || w.tmax == null) return 0;
  let score = 0;
  if (w.humidity >= rule.humidity_min) score += 0.5;
  else if (w.humidity >= rule.humidity_min - 10) score += 0.25;
  const [lo, hi] = rule.tmax_range;
  if (w.tmax >= lo && w.tmax <= hi) score += 0.4;
  else if (w.tmax >= lo - 2 && w.tmax <= hi + 2) score += 0.2;
  if (rule.rain_min_mm != null) {
    if ((w.rainfall_mm ?? 0) >= rule.rain_min_mm) score += 0.1;
  } else {
    score += 0.1;
  }
  return Math.min(1, score);
}

async function latestWeather(fieldId: string): Promise<Weather | null> {
  const r = await query<{
    humidity: string | null;
    tmax: string | null;
    tmin: string | null;
    rainfall_mm: string | null;
  }>(
    'SELECT humidity::text, tmax::text, tmin::text, rainfall_mm::text FROM weather_obs WHERE field_id=$1 ORDER BY ts DESC LIMIT 1',
    [fieldId],
  );
  if (r.rowCount === 0) return null;
  const x = r.rows[0];
  return {
    humidity: x.humidity ? Number(x.humidity) : undefined,
    tmax: x.tmax ? Number(x.tmax) : undefined,
    tmin: x.tmin ? Number(x.tmin) : undefined,
    rainfall_mm: x.rainfall_mm ? Number(x.rainfall_mm) : undefined,
  };
}

/** Count recent (≤21d) detections of a disease in neighbour fields within radius_km. */
async function neighbourPressure(fieldId: string, disease: string, radiusKm: number) {
  const r = await query<{ c: string }>(
    `SELECT COUNT(*)::int c
       FROM disease_history dh
       JOIN field nf ON nf.field_id = dh.field_id
       JOIN field me ON me.field_id = $1
      WHERE dh.disease = $2
        AND dh.detected_on >= CURRENT_DATE - INTERVAL '21 days'
        AND dh.field_id <> $1
        AND ST_DWithin(nf.centroid, me.centroid, $3)`,
    [fieldId, disease, radiusKm * 1000],
  );
  return Number(r.rows[0].c);
}

export interface DiseasePrediction {
  disease: string;
  probability: number; // 0..100
  weather_favourability: number;
  neighbour_outbreaks: number;
  preventive_action: string;
}

/** Predict disease risk for a field; persist preventive alerts + predicted history. */
export async function predictDisease(
  fieldId: string,
  weatherOverride?: Weather,
  radiusKm = 10,
) {
  const fld = await query<{ crop: string | null }>(
    `SELECT (SELECT crop FROM crop_history WHERE field_id=$1 ORDER BY year DESC, created_at DESC LIMIT 1) AS crop
       FROM field WHERE field_id=$1`,
    [fieldId],
  );
  if (fld.rowCount === 0) throw Object.assign(new Error('Field not found'), { statusCode: 404 });
  const crop = fld.rows[0].crop;
  const w = weatherOverride ?? (await latestWeather(fieldId));
  if (!w) {
    return {
      field_id: fieldId,
      crop,
      note: 'No weather available — POST /advisory or pass weather to predict.',
      predictions: [] as DiseasePrediction[],
    };
  }

  const applicable = RULES.filter((r) => crop && r.crops.includes(crop));
  const predictions: DiseasePrediction[] = [];
  for (const rule of applicable) {
    const fav = favourability(rule, w);
    if (fav <= 0) continue;
    const neigh = await neighbourPressure(fieldId, rule.disease, radiusKm);
    // probability = weather favourability, boosted by nearby outbreaks (spread).
    const prob = Math.min(100, Math.round(fav * 80 + Math.min(neigh, 5) * 4));
    if (prob < 30) continue;
    predictions.push({
      disease: rule.disease,
      probability: prob,
      weather_favourability: Math.round(fav * 100),
      neighbour_outbreaks: neigh,
      preventive_action: rule.remedy,
    });
  }
  predictions.sort((a, b) => b.probability - a.probability);

  // Persist: a preventive alert + a predicted disease_history row per high risk.
  await withTx(async (c) => {
    for (const p of predictions) {
      const severity = p.probability >= 70 ? 'critical' : p.probability >= 50 ? 'warning' : 'info';
      await c.query(
        `INSERT INTO alert (field_id, type, severity, title, action, rupees_at_risk, valid_until, meta)
         VALUES ($1,'disease_risk',$2,$3,$4,
                 (SELECT ROUND(COALESCE(area_ha,1) * 12000 * ($5/100.0)) FROM field WHERE field_id=$1),
                 now() + interval '10 days', $6)`,
        [
          fieldId,
          severity,
          `${p.disease} risk ${p.probability}% (predicted)`,
          p.preventive_action,
          p.probability,
          JSON.stringify({
            disease: p.disease,
            weather_favourability: p.weather_favourability,
            neighbour_outbreaks: p.neighbour_outbreaks,
          }),
        ],
      );
      await c.query(
        `INSERT INTO disease_history (field_id, detected_on, disease, severity, detection_method, confidence, remedy)
         VALUES ($1, CURRENT_DATE, $2, $3, 'prediction', $4, $5)`,
        [fieldId, p.disease, severity, p.probability, p.preventive_action],
      );
    }
  });

  return { field_id: fieldId, crop, weather: w, radius_km: radiusKm, predictions };
}

/** Regional risk map: predicted disease pressure aggregated by recent predictions. */
export async function regionalRisk(opts: { lng: number; lat: number; radius_km: number }) {
  const r = await query<{ disease: string; fields: string; avg_prob: string }>(
    `SELECT dh.disease,
            COUNT(DISTINCT dh.field_id)::int AS fields,
            ROUND(AVG(dh.confidence))::int AS avg_prob
       FROM disease_history dh
       JOIN field f ON f.field_id = dh.field_id
      WHERE dh.detection_method = 'prediction'
        AND dh.detected_on >= CURRENT_DATE - INTERVAL '14 days'
        AND ST_DWithin(f.centroid,
                       ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
                       $3)
      GROUP BY dh.disease
      ORDER BY fields DESC, avg_prob DESC`,
    [opts.lng, opts.lat, opts.radius_km * 1000],
  );
  return {
    center: { lng: opts.lng, lat: opts.lat },
    radius_km: opts.radius_km,
    hotspots: r.rows.map((x) => ({
      disease: x.disease,
      fields_at_risk: Number(x.fields),
      avg_probability: Number(x.avg_prob),
    })),
  };
}
